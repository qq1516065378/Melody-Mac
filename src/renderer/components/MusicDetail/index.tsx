import AnimatedDiv from "../AnimatedDiv";
import "./index.scss";
import albumImg from "@/assets/imgs/album-cover.jpg";
import Tag from "../Tag";
import { setFallbackAlbum } from "@/renderer/utils/img-on-error";
import Header from "./widgets/Header";
import Lyric from "./widgets/Lyric";
import Condition from "../Condition";
import { useTranslation } from "react-i18next";
import { useCurrentMusic, usePlayerState } from "@renderer/core/track-player/hooks";
import { useEffect, useState, type CSSProperties, type SyntheticEvent } from "react";
import {
    musicDetailAppearancePanelStore,
    musicDetailAppearanceStore,
    musicDetailShownStore,
} from "@renderer/components/MusicDetail/store";
import { PlayerState } from "@/common/constant";
import AppearancePanel from "./widgets/AppearancePanel";
import trackPlayer from "@renderer/core/track-player";

export const isMusicDetailShown = musicDetailShownStore.getValue;
export const useMusicDetailShown = musicDetailShownStore.useValue;

function MusicDetail() {
    const musicItem = useCurrentMusic();
    const musicDetailShown = musicDetailShownStore.useValue();
    const playerState = usePlayerState();
    const appearance = musicDetailAppearanceStore.useValue();
    const [vinylColor, setVinylColor] = useState("rgb(126, 139, 158)");

    const { t } = useTranslation();

    useEffect(() => {
        const escHandler = (evt: KeyboardEvent) => {
            if (evt.code === "Escape") {
                evt.preventDefault();
                musicDetailShownStore.setValue(false);
            }
        };
        window.addEventListener("keydown", escHandler);

        return () => {
            window.removeEventListener("keydown", escHandler);
        };
    }, []);

    useEffect(() => {
        if (!musicDetailShown) {
            musicDetailAppearancePanelStore.setValue(false);
        }
    }, [musicDetailShown]);

    const updateVinylColor = (event: SyntheticEvent<HTMLImageElement>) => {
        const image = event.currentTarget;
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;

        try {
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let red = 0;
            let green = 0;
            let blue = 0;
            let totalWeight = 0;

            for (let index = 0; index < pixels.length; index += 4) {
                if (pixels[index + 3] < 180) continue;
                const r = pixels[index];
                const g = pixels[index + 1];
                const b = pixels[index + 2];
                const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
                if (lightness < 24 || lightness > 238) continue;
                const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
                const weight = .35 + saturation * 1.5;
                red += r * weight;
                green += g * weight;
                blue += b * weight;
                totalWeight += weight;
            }

            if (totalWeight > 0) {
                const soften = (channel: number) => Math.round(channel / totalWeight * .82 + 255 * .18);
                setVinylColor(`rgb(${soften(red)}, ${soften(green)}, ${soften(blue)})`);
            }
        } catch {
            // Keep the neutral fallback when an artwork URL cannot be sampled.
        }
    };


    return (
        <AnimatedDiv
            showIf={musicDetailShown}
            className="music-detail--container animate__animated background-color"
            data-playback-layout={appearance.layout}
            data-playback-color={appearance.color}
            mountClassName="animate__slideInUp"
            unmountClassName="animate__slideOutDown"
            onAnimationEnd={() => {
                // hack logic: https://github.com/electron/electron/issues/32341
                // force reflow to refresh drag region
                setTimeout(() => {
                    document.body.style.width = "0";
                    document.body.getBoundingClientRect();
                    document.body.style.width = "";
                }, 200);
            }}
        >
            <div
                className="music-detail-background"
                style={{
                    backgroundImage: `url(${musicItem?.artwork ?? albumImg})`,
                }}
            ></div>
            <Header></Header>
            <div className="music-detail-content">
                <section className="music-visual-column">
                    <div className="music-turntable">
                        <div
                            className="vinyl-glow"
                            style={{
                                backgroundImage: `url(${musicItem?.artwork ?? albumImg})`,
                            }}
                        ></div>
                        <div
                            className="music-vinyl"
                            data-playing={playerState === PlayerState.Playing}
                            style={{
                                "--vinyl-color": vinylColor,
                            } as CSSProperties}
                        >
                            <div
                                className="vinyl-color"
                                style={{
                                    backgroundImage: `url(${musicItem?.artwork ?? albumImg})`,
                                }}
                            ></div>
                            <div className="vinyl-material"></div>
                            <div className="vinyl-grooves"></div>
                            <img
                                className="music-album"
                                onLoad={updateVinylColor}
                                onError={(event) => {
                                    setFallbackAlbum(event);
                                    if (musicItem) void trackPlayer.recoverCurrentArtwork(musicItem, true);
                                }}
                                src={musicItem?.artwork ?? albumImg}
                            ></img>
                        </div>
                        {appearance.layout !== "cover-focus" ? (
                            <svg className="vinyl-tonearm" viewBox="0 0 220 400" aria-hidden="true">
                                <defs>
                                    <linearGradient id="tonearm-metal" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0" stopColor="#ffffff" />
                                        <stop offset="1" stopColor="#dfe3e8" />
                                    </linearGradient>
                                </defs>
                                <circle className="tonearm-shadow" cx="165" cy="42" r="29" />
                                <circle className="tonearm-base" cx="165" cy="42" r="24" />
                                <path className="tonearm-rod-shadow" d="M158 62 C151 145 129 231 69 315" />
                                <path className="tonearm-rod" d="M158 62 C151 145 129 231 69 315" />
                                <path className="tonearm-head" d="M70 302 L91 316 Q96 320 92 326 L82 339 Q78 344 72 340 L52 326 Z" />
                                <circle className="tonearm-needle" cx="55" cy="326" r="3.2" />
                            </svg>
                        ) : null}
                    </div>
                </section>
                <section className="music-lyric-column">
                    <div className="music-lyric-header">
                        <div className="music-title" title={musicItem?.title}>
                            {musicItem?.title || t("media.unknown_title")}
                        </div>
                        <div className="music-info">
                            <span>
                                <Condition condition={musicItem?.artist}>
                                    {musicItem?.artist}
                                </Condition>
                                <Condition condition={musicItem?.album}>
                                    {" · "}{musicItem?.album}
                                </Condition>
                            </span>
                            {musicItem?.platform ? (
                                <Tag
                                    fill
                                    style={{
                                        backgroundColor: "var(--playback-accent)",
                                        borderColor: "var(--playback-accent)",
                                        color: "white",
                                    }}
                                >
                                    {musicItem.platform}
                                </Tag>
                            ) : null}
                        </div>
                    </div>
                    <div className="music-lyric-scroll">
                        <Lyric></Lyric>
                    </div>
                </section>
            </div>
            <AppearancePanel />
        </AnimatedDiv>
    );
}

MusicDetail.show = () => {
    musicDetailShownStore.setValue(true);
};

MusicDetail.hide = () => {
    musicDetailShownStore.setValue(false);
};

export default MusicDetail;
