import Store from "@/common/store";

export const musicDetailShownStore = new Store(false);

export type PlaybackDetailLayout = "balanced" | "lyric-left" | "cover-focus" | "vertical";
export type PlaybackDetailColor =
    | "neutral"
    | "coral"
    | "orange"
    | "amber"
    | "lime"
    | "green"
    | "cyan"
    | "blue"
    | "indigo"
    | "violet"
    | "pink"
    | "graphite";

export interface PlaybackDetailAppearance {
    layout: PlaybackDetailLayout;
    color: PlaybackDetailColor;
}

const appearanceStorageKey = "musicfree.playback-detail-appearance";
const defaultAppearance: PlaybackDetailAppearance = {
    layout: "balanced",
    color: "blue",
};

const playbackAccentColors: Record<PlaybackDetailColor, string> = {
    neutral: "#7b8290",
    coral: "#f15b68",
    orange: "#f58654",
    amber: "#eeb34f",
    lime: "#91c646",
    green: "#45bd6e",
    cyan: "#2eb0aa",
    blue: "#3b91ed",
    indigo: "#6f78ed",
    violet: "#925be3",
    pink: "#ed57ad",
    graphite: "#666b74",
};

function syncApplicationAccent(color: PlaybackDetailColor) {
    if (typeof document === "undefined") {
        return;
    }

    const accent = playbackAccentColors[color] ?? playbackAccentColors.blue;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--primaryColor", accent);
    rootStyle.setProperty("--primaryHoverColor", `color-mix(in srgb, ${accent} 88%, black)`);
    rootStyle.setProperty("--listActiveColor", `color-mix(in srgb, ${accent} 13%, transparent)`);
}

function getStoredAppearance(): PlaybackDetailAppearance {
    try {
        const stored = JSON.parse(localStorage.getItem(appearanceStorageKey) ?? "null");
        return {
            layout: stored?.layout ?? defaultAppearance.layout,
            color: stored?.color ?? defaultAppearance.color,
        };
    } catch {
        return defaultAppearance;
    }
}

export const musicDetailAppearanceStore = new Store<PlaybackDetailAppearance>(
    getStoredAppearance(),
);
export const musicDetailAppearancePanelStore = new Store(false);

syncApplicationAccent(musicDetailAppearanceStore.getValue().color);

musicDetailAppearanceStore.onValueChange((appearance) => {
    localStorage.setItem(appearanceStorageKey, JSON.stringify(appearance));
    syncApplicationAccent(appearance.color);
});
