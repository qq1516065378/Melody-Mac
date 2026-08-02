function parsePopularity(value: unknown): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value !== "string") return 0;
    const normalized = value.trim().toLocaleLowerCase();
    const number = Number.parseFloat(normalized.replace(/,/g, ""));
    if (!Number.isFinite(number)) return 0;
    if (normalized.includes("亿")) return number * 100_000_000;
    if (normalized.includes("万")) return number * 10_000;
    if (normalized.endsWith("m")) return number * 1_000_000;
    if (normalized.endsWith("k")) return number * 1_000;
    return number;
}

export function getArtistPopularity(artist: IArtist.IArtistItem): number {
    const raw = artist as any;
    const candidates = [
        artist.fans,
        raw.followers,
        raw.followerCount,
        raw.fansCount,
        raw.heat,
        raw.hot,
        raw.hotScore,
        raw.popularity,
        raw.score,
        raw.playCount,
        raw.$?.fans,
        raw.$?.followers,
        raw.$?.heat,
        raw.$?.hot,
        raw.$?.score,
    ];
    return Math.max(0, ...candidates.map(parsePopularity));
}

export function sortArtistsByPopularity(artists: IArtist.IArtistItem[]) {
    return artists
        .map((artist, index) => ({
            artist,
            index,
            rank: parsePopularity((artist as any).hotRank),
            popularity: getArtistPopularity(artist),
        }))
        .sort((left, right) => {
            if (left.rank && right.rank) return left.rank - right.rank;
            if (left.rank) return -1;
            if (right.rank) return 1;
            return right.popularity - left.popularity || left.index - right.index;
        })
        .map(({ artist }) => artist);
}
