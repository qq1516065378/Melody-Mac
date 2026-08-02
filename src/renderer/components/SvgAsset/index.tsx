import { memo } from "react";

export type SvgAssetIconNames =
    | "album"
    | "bar-comment"
    | "bar-heart-filled"
    | "bar-heart-outline"
    | "bar-more-circle"
    | "bar-muted"
    | "bar-next"
    | "bar-pause"
    | "bar-play"
    | "bar-playlist"
    | "bar-prev"
    | "bar-repeat"
    | "bar-repeat-one"
    | "bar-shuffle"
    | "bar-theme"
    | "bar-volume"
    | "bar-wave-speed"
    | "bar-equalizer"
    | "bar-lyric"
    | "array-download-tray"
    | "arrow-left-end-on-rectangle"
    | "cd"
    | "chat-bubble-left-ellipsis"
    | "check"
    | "check-circle"
    | "collapse-circle-left"
    | "collapse-circle-right"
    | "chevron-double-down"
    | "chevron-double-up"
    | "chevron-down"
    | "chevron-left"
    | "chevron-right"
    | "clock"
    | "code-bracket-square"
    | "contract-corners"
    | "cog-8-tooth"
    | "dashboard-speed"
    | "document-plus"
    | "ellipsis-horizontal"
    | "fire"
    | "folder-open"
    | "font-size-larger"
    | "font-size-smaller"
    | "hand-thumb-up"
    | "headphone"
    | "heart-outline"
    | "heart"
    | "identification"
    | "language"
    | "list-bullet"
    | "lock-closed"
    | "lock-open"
    | "logo"
    | "lyric"
    | "lyric-en"
    | "magnifying-glass"
    | "minus"
    | "motion-play"
    | "musical-note"
    | "pause"
    | "pencil-square"
    | "picture-in-picture-line"
    | "play"
    | "playlist"
    | "plus"
    | "plus-circle"
    | "question-mark-circle"
    | "repeat-song-1"
    | "repeat-song"
    | "rolling-1s"
    | "shuffle"
    | "skip-left"
    | "skip-right"
    | "sort"
    | "sort-asc"
    | "sort-desc"
    | "sparkles"
    | "speaker-wave"
    | "speaker-x-mark"
    | "square"
    | "trash"
    | "trophy"
    | "t-shirt-line"
    | "user"
    | "lq"
    | "sd"
    | "settings-hex"
    | "hq"
    | "sq"
    | "x-mark"
    | "arrow-down-to-line";

interface IProps {
    iconName: SvgAssetIconNames;
    size?: number;
    title?: string;
    color?: string;
}
/**
 *
 * @param props
 * @returns
 */
function SvgAsset(props: IProps) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const Svg = require(`@/assets/icons/${props.iconName}.svg`);

    return (
        <Svg.default
            title={props.title}
            style={{
                width: props.size,
                height: props.size,
                color: props.color,
            }}
        ></Svg.default>
    );
}

export default memo(SvgAsset, (prev, curr) => prev.iconName === curr.iconName);
