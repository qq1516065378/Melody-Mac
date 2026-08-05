import axios from "axios";
import https from "https";
import logger from "@shared/logger/main";

// 评论排序类型
export type CommentSortType = "hot" | "new";

// 独立的 axios 实例，复用插件系统的网络配置（忽略自签证书、浏览器 UA）
const neteaseAxios = axios.create({
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 12000,
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: "https://music.163.com/",
        Cookie: "uin=",
    },
});

// musicItem 主键 -> 网易云 songId 缓存，避免每页都重新搜索
const songIdCache = new Map<string, number>();
const SONG_ID_CACHE_LIMIT = 500;

function normalize(text?: string): string {
    return (text ?? "").replace(/\s+/g, "").toLowerCase();
}

function musicKey(musicItem: IMusic.IMusicItem): string {
    return `${musicItem.platform ?? ""}|${musicItem.id ?? ""}|${normalize(musicItem.title)}`;
}

interface INeteaseSearchSong {
    id: number;
    name: string;
    artists?: Array<{ id?: number; name?: string }>;
    album?: { id?: number; name?: string };
    duration?: number;
}

interface INeteaseSearchResult {
    result?: {
        songs?: INeteaseSearchSong[];
    };
}

async function searchNeteaseSongId(
    musicItem: IMusic.IMusicItem,
): Promise<number | null> {
    const cacheKey = musicKey(musicItem);
    if (songIdCache.has(cacheKey)) {
        return songIdCache.get(cacheKey)!;
    }

    const query = [musicItem.title, musicItem.artist]
        .filter(Boolean)
        .join(" ");
    if (!query) return null;

    try {
        const resp = await neteaseAxios.get<INeteaseSearchResult>(
            "https://music.163.com/api/search/get",
            { params: { s: query, type: 1, offset: 0, limit: 30 } },
        );
        const songs = resp.data?.result?.songs ?? [];
        if (!songs.length) return null;

        // 优先精确匹配标题 + 艺术家包含；然后标题精确匹配（不管艺术家）；最后取第一条
        const targetTitle = normalize(musicItem.title);
        const targetArtist = normalize(musicItem.artist);
        const exactTitleAndArtist = songs.find(
            (s) =>
                normalize(s.name) === targetTitle &&
                targetArtist &&
                s.artists?.some((a) =>
                    normalize(a.name).includes(targetArtist) ||
                    targetArtist.includes(normalize(a.name)),
                ),
        );
        const exactTitle = songs.find(
            (s) => normalize(s.name) === targetTitle,
        );
        const matched = exactTitleAndArtist ?? exactTitle ?? songs[0];

        if (matched) {
            if (songIdCache.size >= SONG_ID_CACHE_LIMIT) {
                // 简单淘汰：删掉最早的一条
                const firstKey = songIdCache.keys().next().value;
                if (firstKey) songIdCache.delete(firstKey);
            }
            songIdCache.set(cacheKey, matched.id);
            return matched.id;
        }
    } catch (e) {
        logger.logError("内置评论-搜索网易云歌曲失败", e as Error);
    }
    return null;
}

interface INeteaseComment {
    commentId: number;
    content: string;
    time: number;
    likedCount: number;
    user: {
        userId: number;
        nickname: string;
        avatarUrl?: string;
    };
    ipLocation?: { location?: string };
    beReplied?: Array<{
        content: string;
        user: { userId: number; nickname: string; avatarUrl?: string };
    }>;
}

interface INeteaseCommentResult {
    total: number;
    more: boolean;
    moreHot: boolean;
    hotComments?: INeteaseComment[];
    comments?: INeteaseComment[];
}

function mapComment(c: INeteaseComment): IComment.IComment {
    return {
        id: String(c.commentId),
        nickName: c.user?.nickname ?? "匿名用户",
        avatar: c.user?.avatarUrl?.replace(/^http:\/\//, "https://"),
        comment: c.content ?? "",
        like: c.likedCount ?? 0,
        createAt: c.time ?? Date.now(),
        location: c.ipLocation?.location,
        replies: c.beReplied?.map((r) => ({
            nickName: r.user?.nickname ?? "匿名用户",
            avatar: r.user?.avatarUrl?.replace(/^http:\/\//, "https://"),
            comment: r.content ?? "",
        })),
    };
}

const PAGE_LIMIT = 20;

/**
 * 内置评论兜底：基于网易云音乐公开评论接口。
 * @param sortType "hot"=热门(首页含hotComments) | "new"=最新(仅按时间倒序)
 */
export async function getBuiltinComments(
    musicItem: IMusic.IMusicItem,
    page = 1,
    sortType: CommentSortType = "hot",
): Promise<IPlugin.IGetCommentResult> {
    const songId = await searchNeteaseSongId(musicItem);
    if (!songId) {
        return { isEnd: true, data: [] };
    }

    const offset = (page - 1) * PAGE_LIMIT;

    try {
        const resp = await neteaseAxios.get<INeteaseCommentResult>(
            `https://music.163.com/api/v1/resource/comments/R_SO_4_${songId}`,
            { params: { limit: PAGE_LIMIT, offset } },
        );
        const data = resp.data ?? ({} as INeteaseCommentResult);

        const all: IComment.IComment[] = [];

        if (sortType === "hot") {
            // 热门排序：第一页包含热门评论 + 最新评论
            if (page === 1 && data.hotComments?.length) {
                all.push(...data.hotComments.map(mapComment));
            }
            if (data.comments?.length) {
                all.push(...data.comments.map(mapComment));
            }
        } else {
            // 最新排序：仅最新评论（跳过首页的hotComments）
            if (data.comments?.length) {
                all.push(...data.comments.map(mapComment));
            }
        }

        const isEnd = !data.more && offset + PAGE_LIMIT >= (data.total ?? 0);

        return {
            isEnd,
            data: all,
        };
    } catch (e) {
        logger.logError("内置评论-获取评论失败", e as Error, { songId, page, sortType });
        return { isEnd: true, data: [] };
    }
}
