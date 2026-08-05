import { getInternalData, resetMediaItem } from "@/common/media-util";
import type { Plugin } from "./plugin";
import { localFilePathSymbol } from "@/common/constant";
import fs from "fs/promises";
import { delay } from "@/common/time-util";
import axios from "axios";
import https from "https";
import { addFileScheme, safeStat } from "@/common/file-util";
import path from "path";
import { CommentSortType, getBuiltinComments } from "./internal-plugins/builtin-comments";

// Ensure axios uses the same HTTPS agent configuration (ignore self-signed certs)
axios.defaults.httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});
axios.defaults.timeout = 15000;

interface INeteaseSongDetail {
    id: number;
    name: string;
    dt?: number;
    ar?: Array<{ id?: number; name?: string }>;
    al?: { id?: number; name?: string; picUrl?: string };
    cp?: number;
}

async function restoreNeteaseMusicItems(trackIds: Array<string | number>) {
    const musicList: IMusic.IMusicItem[] = [];
    const uniqueIds = [...new Set(trackIds.filter(Boolean).map(id => Number(id)))];

    for (let offset = 0; offset < uniqueIds.length; offset += 50) {
        const ids = uniqueIds.slice(offset, offset + 50);
        const response = await axios.get("https://interface.music.163.com/api/v3/song/detail", {
            params: {
                c: JSON.stringify(ids.map(id => ({ id }))),
            },
            headers: {
                Referer: "https://music.163.com/",
                "User-Agent": "Mozilla/5.0",
            },
            timeout: 10_000,
        });
        const songs = (response.data?.songs ?? []) as INeteaseSongDetail[];
        const songMap = new Map(songs.map(song => [Number(song.id), song]));

        for (const id of ids) {
            const song = songMap.get(id);
            if (!song) continue;
            const artists = song.ar ?? [];
            musicList.push({
                id: String(song.id),
                platform: "",
                title: song.name,
                artist: artists.map(artist => artist.name).filter(Boolean).join(" / "),
                artistId: artists[0]?.id,
                album: song.al?.name,
                albumId: song.al?.id,
                artwork: song.al?.picUrl,
                duration: song.dt ? song.dt / 1000 : undefined,
                copyrightId: song.cp ?? 0,
                url: `https://share.duanx.cn/url/wy/${song.id}/128k`,
                qualities: {
                    low: {},
                    standard: {},
                    high: {},
                    super: {},
                },
            });
        }
    }

    return musicList;
}

interface IQQSong {
    id?: number;
    mid?: string;
    title?: string;
    name?: string;
    interval?: number;
    singer?: Array<{ id?: number; mid?: string; name?: string }>;
    album?: { id?: number; mid?: string; title?: string; name?: string };
    file?: { media_mid?: string };
    action?: { switch?: number };
}

async function restoreQQMusicSheet(
    sheetItem: IMusic.IMusicSheetItem,
): Promise<IPlugin.ISheetInfoResult | null> {
    const response = await axios.post(
        "https://u.y.qq.com/cgi-bin/musicu.fcg",
        {
            comm: { ct: 24, cv: 0 },
            req_1: {
                module: "music.srfDissInfo.aiDissInfo",
                method: "uniform_get_Dissinfo",
                param: {
                    disstid: Number(sheetItem.id),
                    enc_host_uin: "",
                    tag: 1,
                    userinfo: 1,
                    song_begin: 0,
                    song_num: 500,
                },
            },
        },
        {
            headers: {
                Referer: "https://y.qq.com/",
                "User-Agent": "Mozilla/5.0",
            },
            timeout: 10_000,
        },
    );

    const data = response.data?.req_1?.data;
    const directory = data?.dirinfo;
    const songs = (data?.songlist ?? []) as IQQSong[];
    if (!directory || !songs.length) return null;

    const musicList: IMusic.IMusicItem[] = songs.flatMap((song) => {
        const songmid = song.mid;
        const id = song.id ?? songmid;
        if (!id || !songmid) return [];

        const artists = song.singer ?? [];
        const albumMid = song.album?.mid;
        return [{
            id: String(id),
            platform: "",
            songmid,
            title: song.title || song.name || "",
            artist: artists.map(artist => artist.name).filter(Boolean).join(" / "),
            artistId: artists[0]?.id,
            artistMid: artists[0]?.mid,
            album: song.album?.title || song.album?.name,
            albumId: song.album?.id,
            albummid: albumMid,
            artwork: albumMid
                ? `https://y.qq.com/music/photo_new/T002R500x500M000${albumMid}.jpg`
                : sheetItem.artwork,
            duration: song.interval,
            mediaMid: song.file?.media_mid,
            copyrightId: song.action?.switch ?? 0,
        }];
    });

    if (!musicList.length) return null;

    return {
        sheetItem: {
            ...sheetItem,
            title: directory.title || sheetItem.title,
            artwork: directory.picurl || sheetItem.artwork,
            description: directory.desc || sheetItem.description,
            artist: directory.host_nick || sheetItem.artist,
            playCount: directory.listennum ?? sheetItem.playCount,
            worksNum: directory.songnum ?? musicList.length,
        },
        musicList,
        isEnd: true,
    };
}

export default class PluginMethods implements IPlugin.IPluginInstanceMethods {
    private plugin;
    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }
    /** 搜索 */
    async search<T extends IMedia.SupportMediaType>(
        query: string,
        page: number,
        type: T,
    ): Promise<IPlugin.ISearchResult<T>> {
        if (!this.plugin.instance.search) {
            return {
                isEnd: true,
                data: [],
            };
        }

        try {
            const result = await this.plugin.instance.search(query, page, type);
            console.log(`[Plugin:${this.plugin.name}] Search result:`, result, "query:", query, "page:", page, "type:", type);
            if (result && Array.isArray(result.data)) {
                result.data.forEach((_) => {
                    resetMediaItem(_, this.plugin.name);
                });
                return {
                    isEnd: result.isEnd ?? true,
                    data: result.data,
                };
            }
            console.warn(`[Plugin:${this.plugin.name}] Search returned invalid result format:`, result);
            return {
                isEnd: true,
                data: [],
            };
        } catch (e: any) {
            console.error(`[Plugin:${this.plugin.name}] Search failed for "${query}":`, e?.message || e, e?.stack);
            // Don't throw - return empty result so other plugins can still work
            return {
                isEnd: true,
                data: [],
            };
        }
    }

    /** 获取真实源 */
    async getMediaSource(
        musicItem: IMedia.IMediaBase,
        quality: IMusic.IQualityKey = "standard",
        retryCount = 1,
        notUpdateCache = false,
    ): Promise<IPlugin.IMediaSourceResult | null> {
    // TODO 2. url 缓存策略，先略过

        // 3 插件解析
        if (!this.plugin.instance.getMediaSource) {
            return { url: musicItem?.qualities?.[quality]?.url ?? musicItem.url };
        }
        try {
            const { url, headers } = (await this.plugin.instance.getMediaSource(
                musicItem,
                quality,
            )) ?? { url: musicItem?.qualities?.[quality]?.url };
            if (!url) {
                throw new Error("NOT RETRY");
            }
            const result = {
                url,
                headers,
                userAgent: headers?.["user-agent"],
            } as IPlugin.IMediaSourceResult;

            //   if (pluginCacheControl !== CacheControl.NoStore && !notUpdateCache) {
            //     Cache.update(musicItem, [
            //       ["headers", result.headers],
            //       ["userAgent", result.userAgent],
            //       [`qualities.${quality}.url`, url],
            //     ]);
            //   }

            return result;
        } catch (e: any) {
            console.log(e);
            if (retryCount > 0 && e?.message !== "NOT RETRY") {
                await delay(150);
                return this.plugin.methods.getMediaSource(
                    musicItem,
                    quality,
                    --retryCount,
                );
            }
            // devLog('error', '获取真实源失败', e, e?.message);
            return null;
        }
    }

    /** 获取音乐详情 */
    async getMusicInfo(
        musicItem: IMedia.IMediaBase,
    ): Promise<Partial<IMusic.IMusicItem> | null> {
        if (!this.plugin.instance.getMusicInfo) {
            return null;
        }
        try {
            return (
                this.plugin.instance.getMusicInfo(
                    resetMediaItem(musicItem, undefined, true),
                ) ?? null
            );
        } catch (e: any) {
            // devLog('error', '获取音乐详情失败', e, e?.message);
            return null;
        }
    }

    /** 获取歌词 */
    async getLyric(
        musicItem: IMusic.IMusicItem,
    ): Promise<ILyric.ILyricSource | null> {
        let rawLrc = musicItem.rawLrc;
        let lrcUrl = musicItem.lrc;
        let translation: string;
        // 如果存在文本
        if (rawLrc) {
            return {
                rawLrc,
                lrc: lrcUrl,
            };
        }
        // 2. 读取路径下的同名lrc文件
        const localPath =
      getInternalData<IMusic.IMusicItemInternalData>(musicItem, "downloadData")
          ?.path || musicItem.$$localPath;
        if (localPath) {
            const fileName = path.parse(localPath).name;
            const lrcPathWithoutExt = path.resolve(localPath, `../${fileName}`);
            const lrcTranslationPathWithoutExt = path.resolve(
                localPath,
                `../${fileName}-tr`,
            );
            const exts = [".lrc", ".LRC", ".txt"];

            for (const ext of exts) {
                const lrcFilePath = lrcPathWithoutExt + ext;
                if ((await safeStat(lrcFilePath))?.isFile()) {
                    rawLrc = await fs.readFile(lrcFilePath, "utf8");

                    if ((await safeStat(lrcTranslationPathWithoutExt + ext))?.isFile()) {
                        translation = await fs.readFile(
                            lrcTranslationPathWithoutExt + ext,
                            "utf8",
                        );
                    }

                    if (rawLrc) {
                        return {
                            rawLrc,
                            translation,
                            lrc: lrcUrl,
                        };
                    }
                }
            }
        }
        // // 2.本地缓存
        // const localLrc =
        //     meta?.[internalSerializeKey]?.local?.localLrc ||
        //     cache?.[internalSerializeKey]?.local?.localLrc;
        // if (localLrc && (await exists(localLrc))) {
        //     rawLrc = await readFile(localLrc, 'utf8');
        //     return {
        //         rawLrc,
        //         lrc: lrcUrl,
        //     };
        // }
        // 3.优先使用url

        try {
            const lrcSource = await this.plugin.instance?.getLyric?.(
                resetMediaItem(musicItem, undefined, true),
            );

            rawLrc = lrcSource?.rawLrc;
            lrcUrl = lrcSource?.lrc || lrcUrl;
            translation = lrcSource?.translation;

            if (rawLrc || translation) {
                if (!rawLrc) {
                    rawLrc = translation;
                    translation = undefined;
                }

                return {
                    rawLrc,
                    translation,
                };
            }
        } catch (e: any) {
            // trace('插件获取歌词失败', e?.message, 'error');
            // devLog('error', '插件获取歌词失败', e, e?.message);
        }

        if (lrcUrl) {
            try {
                rawLrc = (await axios.get(lrcUrl, { timeout: 5000 })).data;
                return {
                    rawLrc,
                    lrc: lrcUrl,
                    translation,
                };
            } catch {
                lrcUrl = undefined;
            }
        }
        // // 6. 如果是本地文件
        // const isDownloaded = LocalMusicSheet.isLocalMusic(musicItem);
        // if (musicItem.platform !== localPluginPlatform && isDownloaded) {
        //     const res = await localFilePlugin.instance!.getLyric!(isDownloaded);
        //     if (res) {
        //         return res;
        //     }
        // }
        // devLog('warn', '无歌词');

        return null;
    }

    /** 获取专辑信息 */
    async getAlbumInfo(
        albumItem: IAlbum.IAlbumItem,
        page = 1,
    ): Promise<IPlugin.IAlbumInfoResult | null> {
        if (!this.plugin.instance.getAlbumInfo) {
            return {
                albumItem,
                musicList: (albumItem?.musicList ?? []).map((it) =>
                    resetMediaItem(it, this.plugin.name),
                ),
                isEnd: true,
            };
        }
        try {
            const result = await this.plugin.instance.getAlbumInfo(
                resetMediaItem(albumItem, undefined, true),
                page,
            );
            if (!result) {
                throw new Error();
            }
            result?.musicList?.forEach((_) => {
                resetMediaItem(_, this.plugin.name);
                _.album = albumItem.title;
            });

            if (page <= 1) {
                // 合并信息
                return {
                    albumItem: { ...albumItem, ...(result?.albumItem ?? {}) },
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            } else {
                return {
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            }
        } catch (e: any) {
            // trace('获取专辑信息失败', e?.message);
            // devLog('error', '获取专辑信息失败', e, e?.message);

            return null;
        }
    }

    /** 获取歌单信息 */
    async getMusicSheetInfo(
        sheetItem: IMusic.IMusicSheetItem,
        page = 1,
    ): Promise<IPlugin.ISheetInfoResult | null> {
        if (!this.plugin.instance.getMusicSheetInfo) {
            return {
                sheetItem,
                musicList: sheetItem?.musicList ?? [],
                isEnd: true,
            };
        }
        try {
            const result = await this.plugin.instance?.getMusicSheetInfo?.(
                resetMediaItem(sheetItem, undefined, true),
                page,
            );
            if (!result) {
                throw new Error();
            }
            if (
                this.plugin.name.includes("QQ") &&
                page <= 1 &&
                !result.musicList?.length
            ) {
                const restored = await restoreQQMusicSheet(sheetItem);
                if (restored) {
                    restored.musicList.forEach((_) => {
                        resetMediaItem(_, this.plugin.name);
                    });
                    return restored;
                }
            }
            const trackIds = (result as any)._trackIds;
            if (
                this.plugin.name.includes("WY") &&
                !result.musicList?.length &&
                Array.isArray(trackIds) &&
                trackIds.length
            ) {
                result.musicList = await restoreNeteaseMusicItems(trackIds);
                if (result.musicList.length) {
                    // _trackIds 是歌单的完整歌曲集合，已一次性恢复，不再请求空分页。
                    result.isEnd = true;
                }
            }
            result?.musicList?.forEach((_) => {
                resetMediaItem(_, this.plugin.name);
            });

            if (page <= 1) {
                // 合并信息
                return {
                    sheetItem: { ...sheetItem, ...(result?.sheetItem ?? {}) },
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            } else {
                return {
                    isEnd: result.isEnd === false ? false : true,
                    musicList: result.musicList,
                };
            }
        } catch (e: any) {
            // trace('获取歌单信息失败', e, e?.message);
            // devLog('error', '获取歌单信息失败', e, e?.message);

            if (this.plugin.name.includes("QQ") && page <= 1) {
                try {
                    const restored = await restoreQQMusicSheet(sheetItem);
                    if (restored) {
                        restored.musicList.forEach((_) => {
                            resetMediaItem(_, this.plugin.name);
                        });
                        return restored;
                    }
                } catch {
                    // 保持原有失败语义，由页面展示空状态。
                }
            }

            return null;
        }
    }

    /** 查询作者信息 */
    async getArtistWorks<T extends IArtist.ArtistMediaType>(
        artistItem: IArtist.IArtistItem,
        page: number,
        type: T,
    ): Promise<IPlugin.ISearchResult<T>> {
        if (!this.plugin.instance.getArtistWorks) {
            return {
                isEnd: true,
                data: [],
            };
        }
        try {
            const result = await this.plugin.instance.getArtistWorks(
                artistItem,
                page,
                type,
            );
            if (!result || !result.data) {
                return {
                    isEnd: true,
                    data: [],
                };
            }
            result.data?.forEach((_) => resetMediaItem(_, this.plugin.name));
            return {
                isEnd: result.isEnd ?? true,
                data: result.data,
            };
        } catch (e: any) {
            // trace('查询作者信息失败', e?.message);
            // devLog('error', '查询作者信息失败', e, e?.message);
            console.error(`[Plugin:${this.plugin.name}] getArtistWorks failed:`, e?.message || e);
            return {
                isEnd: true,
                data: [],
            };
        }
    }

    /** 导入歌单 */
    async importMusicSheet(urlLike: string): Promise<IMusic.IMusicItem[]> {
        try {
            const result =
        (await this.plugin.instance?.importMusicSheet?.(urlLike)) ?? [];
            result.forEach((_) => resetMediaItem(_, this.plugin.name));
            return result;
        } catch (e: any) {
            console.log(e);
            // devLog('error', '导入歌单失败', e, e?.message);

            return [];
        }
    }
    /** 导入单曲 */
    async importMusicItem(urlLike: string): Promise<IMusic.IMusicItem | null> {
        try {
            const result = await this.plugin.instance?.importMusicItem?.(urlLike);
            if (!result) {
                throw new Error();
            }
            resetMediaItem(result, this.plugin.name);
            return result;
        } catch (e: any) {
            // devLog('error', '导入单曲失败', e, e?.message);

            return null;
        }
    }
    /** 获取榜单 */
    async getTopLists(): Promise<IMusic.IMusicSheetGroupItem[]> {
        try {
            const result = await this.plugin.instance?.getTopLists?.();
            if (!result) {
                throw new Error();
            }
            return result;
        } catch (e: any) {
            // devLog('error', '获取榜单失败', e, e?.message);
            return [];
        }
    }
    /** 获取榜单详情 */
    async getTopListDetail(
        topListItem: IMusic.IMusicSheetItem,
        page: number,
    ): Promise<IPlugin.ITopListInfoResult> {
        try {
            const result = await this.plugin.instance?.getTopListDetail?.(
                topListItem,
                page,
            );
            if (!result) {
                throw new Error();
            }
            if (result.musicList) {
                result.musicList.forEach((_) => resetMediaItem(_, this.plugin.name));
            }
            if (result.isEnd !== false) {
                result.isEnd = true;
            }
            return result;
        } catch (e: any) {
            // devLog('error', '获取榜单详情失败', e, e?.message);
            return {
                isEnd: true,
                topListItem,
                musicList: [],
            };
        }
    }

    /** 获取推荐歌单的tag */
    async getRecommendSheetTags(): Promise<IPlugin.IGetRecommendSheetTagsResult> {
        try {
            const result = await this.plugin.instance?.getRecommendSheetTags?.();
            if (!result) {
                throw new Error();
            }
            return result;
        } catch (e: any) {
            // devLog('error', '获取推荐歌单失败', e, e?.message);
            return {
                data: [],
            };
        }
    }
    /** 获取某个tag的推荐歌单 */
    async getRecommendSheetsByTag(
        tagItem: IMedia.IUnique,
        page?: number,
    ): Promise<ICommon.PaginationResponse<IMusic.IMusicSheetItem>> {
        try {
            const result = await this.plugin.instance?.getRecommendSheetsByTag?.(
                tagItem,
                page ?? 1,
            );
            if (!result) {
                throw new Error();
            }
            if (result.isEnd !== false) {
                result.isEnd = true;
            }
            if (!result.data) {
                result.data = [];
            }
            result.data.forEach((item) => resetMediaItem(item, this.plugin.name));

            return result;
        } catch (e: any) {
            // devLog('error', '获取推荐歌单详情失败', e, e?.message);
            return {
                isEnd: true,
                data: [],
            };
        }
    }

    async getMusicComments(musicItem: IMusic.IMusicItem, page = 1, sortType: CommentSortType = "hot"): Promise<IPlugin.IGetCommentResult> {
        // 1. 优先尝试插件自身的评论接口（只传 musicItem 和 page，保持向后兼容）
        try {
            const result = await this.plugin.instance?.getMusicComments?.(
                musicItem,
                page,
            );
            if (result && result.data && result.data.length > 0) {
                return result;
            }
        } catch (e: any) {
            // 插件自身失败，继续走兜底
        }

        // 2. 插件无评论时，使用内置网易云音乐评论兜底（支持排序类型）
        try {
            return await getBuiltinComments(musicItem, page, sortType);
        } catch (e: any) {
            return {
                isEnd: true,
                data: [],
            };
        }
    }
}
