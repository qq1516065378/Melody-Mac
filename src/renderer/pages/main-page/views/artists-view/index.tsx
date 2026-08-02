import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PluginManager, { useSortedSupportedPlugin } from "@shared/plugin-manager/renderer";
import ArtistItem from "@/renderer/components/ArtistItem";
import Empty from "@/renderer/components/Empty";
import Loading from "@/renderer/components/Loading";
import SvgAsset from "@/renderer/components/SvgAsset";
import "./index.scss";
import { sortArtistsByPopularity } from "@/common/artist-util";
import axios from "axios";

const areas = ["全部", "内地", "港台", "欧美", "日本", "韩国"];
const genders = ["全部", "男歌手", "女歌手", "组合"];
const initials = ["全部", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), "#"];

const areaMap: Record<string, number> = {
    "全部": -100,
    "内地": 200,
    "港台": 2,
    "欧美": 5,
    "日本": 4,
    "韩国": 3,
};

const genderMap: Record<string, number> = {
    "全部": -100,
    "男歌手": 0,
    "女歌手": 1,
    "组合": 2,
};

interface IHotSinger {
    singer_id: number;
    singer_mid: string;
    singer_name: string;
    singer_pic: string;
}

function normalizeArtistName(name?: string) {
    return (name ?? "")
        .normalize("NFKC")
        .toLocaleLowerCase()
        .replace(/[\s·・._()（）\-—/\\]+/g, "");
}

function getInitialIndex(initial: string) {
    if (initial === "全部") return -100;
    if (initial === "#") return 27;
    return initial.charCodeAt(0) - 64;
}

async function getHotSingerRanking(area: string, gender: string, initial: string) {
    const response = await axios.post("https://u.y.qq.com/cgi-bin/musicu.fcg", {
        comm: { ct: 24, cv: 0 },
        singerList: {
            module: "Music.SingerListServer",
            method: "get_singer_list",
            param: {
                area: areaMap[area] ?? -100,
                sex: genderMap[gender] ?? -100,
                genre: -100,
                index: getInitialIndex(initial),
                sin: 0,
                cur_page: 1,
            },
        },
    }, {
        headers: {
            Referer: "https://y.qq.com/",
            "User-Agent": "Mozilla/5.0",
        },
        timeout: 10_000,
    });

    return (response.data?.singerList?.data?.singerlist ?? []) as IHotSinger[];
}

function deduplicateArtists(artists: IArtist.IArtistItem[]) {
    const seen = new Set<string>();
    return artists.filter((artist) => {
        const key = `${artist.platform}:${artist.id || artist.name}`;
        if (!artist?.name || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function searchArtists(
    plugin: IPlugin.IPluginDelegate,
    query: string,
    page: number,
) {
    return PluginManager.callPluginDelegateMethod(
        plugin,
        "search",
        query,
        page,
        "artist",
    ) as Promise<IPlugin.ISearchResult<"artist">>;
}

function findMatchingArtist(
    rankedSinger: IHotSinger,
    candidates: IArtist.IArtistItem[],
) {
    const rankedName = normalizeArtistName(rankedSinger.singer_name);
    return candidates.find((candidate) => {
        const candidateName = normalizeArtistName(candidate.name);
        if (!candidateName || !rankedName) return false;
        return candidateName === rankedName ||
            (candidateName.length >= 2 && rankedName.includes(candidateName)) ||
            (rankedName.length >= 2 && candidateName.includes(rankedName));
    });
}

async function resolveHotSingers(
    plugin: IPlugin.IPluginDelegate,
    rankedSingers: IHotSinger[],
) {
    const visibleRanking = rankedSingers.slice(0, plugin.platform.includes("QQ") ? 30 : 18);
    if (plugin.platform.includes("QQ")) {
        return visibleRanking.map((singer, index) => ({
            id: String(singer.singer_id),
            singerMID: singer.singer_mid,
            name: singer.singer_name,
            avatar: singer.singer_pic?.replace(/^http:/, "https:"),
            platform: plugin.platform,
            hotRank: index + 1,
        } as IArtist.IArtistItem));
    }

    const results = await Promise.allSettled(visibleRanking.map((singer) =>
        searchArtists(plugin, singer.singer_name, 1),
    ));
    return results.flatMap((result, index) => {
        if (result.status !== "fulfilled") return [];
        const match = findMatchingArtist(
            visibleRanking[index],
            result.value?.data ?? [],
        );
        return match ? [{ ...match, hotRank: index + 1 }] : [];
    });
}

export default function ArtistsView() {
    const navigate = useNavigate();
    const searchPlugins = useSortedSupportedPlugin("search");
    const plugins = useMemo(
        () => searchPlugins.filter((plugin) =>
            (!plugin.supportedSearchType || plugin.supportedSearchType.includes("artist")) &&
            plugin.supportedMethod.includes("getArtistWorks"),
        ),
        [searchPlugins],
    );
    const [selectedPluginHash, setSelectedPluginHash] = useState("");
    const defaultPlugin = plugins.find((plugin) => plugin.platform.includes("QQ")) ?? plugins[0];
    const selectedPlugin = plugins.find((plugin) =>
        plugin.hash === selectedPluginHash,
    ) ?? defaultPlugin;
    const [inputQuery, setInputQuery] = useState("");
    const [committedQuery, setCommittedQuery] = useState("");
    const [selectedArea, setSelectedArea] = useState("全部");
    const [selectedGender, setSelectedGender] = useState("全部");
    const [selectedInitial, setSelectedInitial] = useState("全部");
    const [artists, setArtists] = useState<IArtist.IArtistItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [canLoadMore, setCanLoadMore] = useState(false);
    const [page, setPage] = useState(1);
    const requestIdRef = useRef(0);

    const filterQuery = committedQuery.trim();
    const showingRanking = !filterQuery;

    useEffect(() => {
        if (selectedPlugin && selectedPlugin.hash !== selectedPluginHash) {
            setSelectedPluginHash(selectedPlugin.hash);
        }
    }, [selectedPlugin, selectedPluginHash]);

    useEffect(() => {
        if (!selectedPlugin) {
            setArtists([]);
            return;
        }

        const requestId = ++requestIdRef.current;
        setLoading(true);
        setPage(1);

        const load = async () => {
            try {
                if (showingRanking) {
                    const ranking = await getHotSingerRanking(
                        selectedArea,
                        selectedGender,
                        selectedInitial,
                    );
                    const featured = await resolveHotSingers(selectedPlugin, ranking);
                    if (requestId === requestIdRef.current) {
                        setArtists(sortArtistsByPopularity(deduplicateArtists(featured)));
                        setCanLoadMore(false);
                    }
                } else {
                    const result = await searchArtists(selectedPlugin, filterQuery, 1);
                    if (requestId === requestIdRef.current) {
                        setArtists(deduplicateArtists(result?.data ?? []));
                        setCanLoadMore(result?.isEnd === false && !!result?.data?.length);
                    }
                }
            } catch {
                if (requestId === requestIdRef.current) {
                    setArtists([]);
                    setCanLoadMore(false);
                }
            } finally {
                if (requestId === requestIdRef.current) setLoading(false);
            }
        };

        load();
    }, [
        selectedPlugin?.hash,
        filterQuery,
        showingRanking,
        selectedArea,
        selectedGender,
        selectedInitial,
    ]);

    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        setCommittedQuery(inputQuery.trim());
    };

    const chooseFilter = (setter: (value: string) => void, value: string) => {
        setCommittedQuery("");
        setInputQuery("");
        setter(value);
    };

    const loadMore = async () => {
        if (!selectedPlugin || loading || !canLoadMore) return;
        const nextPage = page + 1;
        setLoading(true);
        try {
            const result = await searchArtists(selectedPlugin, filterQuery, nextPage);
            setArtists((current) =>
                deduplicateArtists(current.concat(result?.data ?? [])),
            );
            setPage(nextPage);
            setCanLoadMore(result?.isEnd === false && !!result?.data?.length);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div id="page-container" className="page-container artists-view--container">
            <header className="artists-view--header">
                <div>
                    <span className="artists-view--eyebrow">MUSIC ARTISTS</span>
                    <h1>歌手歌单</h1>
                    <p>搜索歌手，查看真实单曲与专辑作品</p>
                </div>
                <form className="artists-view--search" onSubmit={submitSearch}>
                    <SvgAsset iconName="magnifying-glass"></SvgAsset>
                    <input
                        value={inputQuery}
                        onChange={(event) => setInputQuery(event.target.value)}
                        placeholder="搜索歌手"
                        spellCheck={false}
                    />
                    <button type="submit">搜索</button>
                </form>
            </header>

            <div className="artists-view--sources">
                {plugins.map((plugin) => (
                    <button
                        type="button"
                        key={plugin.hash}
                        data-selected={selectedPlugin?.hash === plugin.hash}
                        onClick={() => setSelectedPluginHash(plugin.hash)}
                    >
                        {plugin.platform}
                    </button>
                ))}
            </div>

            <section className="artists-view--filters">
                <div className="artists-filter-row">
                    <span>地区</span>
                    <div>{areas.map((area) => (
                        <button type="button" key={area} data-selected={selectedArea === area}
                            onClick={() => chooseFilter(setSelectedArea, area)}>{area}</button>
                    ))}</div>
                </div>
                <div className="artists-filter-row">
                    <span>类型</span>
                    <div>{genders.map((gender) => (
                        <button type="button" key={gender} data-selected={selectedGender === gender}
                            onClick={() => chooseFilter(setSelectedGender, gender)}>{gender}</button>
                    ))}</div>
                </div>
                <div className="artists-filter-row artists-filter-row--initials">
                    <span>索引</span>
                    <div>{initials.map((initial) => (
                        <button type="button" key={initial} data-selected={selectedInitial === initial}
                            onClick={() => chooseFilter(setSelectedInitial, initial)}>{initial}</button>
                    ))}</div>
                </div>
            </section>

            <section className="artists-view--results">
                <div className="artists-results-title">
                    <h2>{showingRanking ? "热门歌手" : `“${filterQuery}”的歌手`}</h2>
                    <span>{artists.length} 位</span>
                </div>
                {!plugins.length ? (
                    <div className="artists-view--notice">当前没有同时支持歌手搜索和歌手作品的音源插件</div>
                ) : loading && !artists.length ? (
                    <Loading text="正在获取歌手" />
                ) : artists.length ? (
                    <>
                        <div className="artists-result-grid">
                            {artists.map((artist) => (
                                <ArtistItem
                                    key={`${artist.platform}:${artist.id}`}
                                    artistItem={artist}
                                    onClick={() => navigate(
                                        `/main/artist/${encodeURIComponent(artist.platform)}/${encodeURIComponent(artist.id)}`,
                                        { state: { artistItem: artist } },
                                    )}
                                />
                            ))}
                        </div>
                        {canLoadMore ? (
                            <button className="artists-load-more" type="button" onClick={loadMore} disabled={loading}>
                                {loading ? "加载中…" : "加载更多"}
                            </button>
                        ) : null}
                    </>
                ) : (
                    <Empty />
                )}
            </section>
        </div>
    );
}
