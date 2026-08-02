import PluginManager from "@shared/plugin-manager/renderer";

export function getLyricSearchablePlugins(sorted = false) {
    const plugins = sorted
        ? PluginManager.getSortedSupportedPlugin("search")
        : PluginManager.getSupportedPlugin("search");

    return plugins.filter(plugin =>
        plugin.supportedMethod.includes("getLyric") &&
        (!plugin.supportedSearchType ||
            plugin.supportedSearchType.includes("lyric") ||
            plugin.supportedSearchType.includes("music")),
    );
}

/**
 * 部分音源虽然能获取歌词，却没有实现 lyric 类型搜索；还有一些音源声明了
 * lyric 搜索但接口会返回空数据或直接失败。因此先尝试专用搜索，再用歌曲搜索兜底。
 */
export async function searchLyricCandidates(
    plugin: IPlugin.IPluginDelegate,
    query: string,
    page = 1,
): Promise<IPlugin.ISearchResult<"lyric">> {
    const supports = plugin.supportedSearchType;
    const searchTypes: Array<"lyric" | "music"> = [];

    if (!supports || supports.includes("lyric")) {
        searchTypes.push("lyric");
    }
    if (!supports || supports.includes("music")) {
        searchTypes.push("music");
    }

    let lastResult: IPlugin.ISearchResult<"lyric"> | null = null;
    let lastError: unknown;

    for (const type of searchTypes) {
        try {
            const result = await PluginManager.callPluginDelegateMethod(
                plugin,
                "search",
                query,
                page,
                type,
            ) as IPlugin.ISearchResult<"lyric">;
            lastResult = result;
            if (result?.data?.length) {
                return result;
            }
        } catch (error) {
            lastError = error;
        }
    }

    if (lastResult) {
        return lastResult;
    }
    if (lastError) {
        throw lastError;
    }
    return { isEnd: true, data: [] };
}
