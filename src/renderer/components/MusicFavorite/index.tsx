import SvgAsset from "../SvgAsset";
import MusicSheet from "@/renderer/core/music-sheet";

interface IMusicFavoriteProps {
    musicItem: IMusic.IMusicItem;
    size: number;
    variant?: "default" | "music-bar";
}

export default function MusicFavorite(props: IMusicFavoriteProps) {
    const { musicItem, size, variant = "default" } = props;
    const isFav = MusicSheet.frontend.useMusicIsFavorite(musicItem);

    return (
        <div
            role="button"
            onClick={(e) => {
                e.stopPropagation();
                if (isFav) {
                    MusicSheet.frontend.removeMusicFromFavorite(musicItem);
                } else {
                    MusicSheet.frontend.addMusicToFavorite(musicItem);
                }
            }}
            onDoubleClick={(e) => {
                e.stopPropagation();
            }}
            style={{
                color: isFav ? "var(--primaryColor)" : "var(--textColor)",
                width: size,
                height: size,
            }}
        >
            <SvgAsset
                iconName={
                    variant === "music-bar"
                        ? isFav
                            ? "bar-heart-filled"
                            : "bar-heart-outline"
                        : isFav
                            ? "heart"
                            : "heart-outline"
                }
                size={size}
            ></SvgAsset>
        </div>
    );
}
