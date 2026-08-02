import SvgAsset from "@/renderer/components/SvgAsset";
import "./index.scss";
import trackPlayer from "@renderer/core/track-player";
import { useTranslation } from "react-i18next";
import { PlayerState , RepeatMode } from "@/common/constant";
import { usePlayerState, useRepeatMode, useVolume } from "@renderer/core/track-player/hooks";
import SwitchCase from "@/renderer/components/SwitchCase";
import Condition from "@/renderer/components/Condition";
import Slider from "rc-slider";
import { useRef, useState } from "react";

export default function Controller() {
    const playerState = usePlayerState();
    const { t } = useTranslation();


    return (
        <div className="music-controller">
            <RepeatBtn />
            <div className="skip controller-btn" title={t("music_bar.previous_music")} onClick={() => {
                trackPlayer.skipToPrev();

            }}>
                <SvgAsset iconName="bar-prev"></SvgAsset>
            </div>
            <div
                className="play-or-pause controller-btn primary-btn"
                onClick={() => {
                    if(playerState === PlayerState.Playing) {
                        trackPlayer.pause();
                    } else {
                        trackPlayer.resume();
                    }
                }}
            >
                <SvgAsset
                    iconName={
                        playerState !== PlayerState.Playing
                            ? "bar-play"
                            : "bar-pause"
                    }
                ></SvgAsset>
            </div>
            <div
                className="skip controller-btn"
                title={t("music_bar.next_music")}
                onClick={() => {

                    trackPlayer.skipToNext();
                }}
            >
                <SvgAsset iconName="bar-next"></SvgAsset>
            </div>
            <VolumeBtn />
        </div>
    );
}

function RepeatBtn() {
    const repeatMode = useRepeatMode();
    const { t } = useTranslation();
    return (
        <div
            className="controller-btn controller-aux-btn"
            role="button"
            onClick={() => trackPlayer.toggleRepeatMode()}
            title={repeatMode === RepeatMode.Loop
                ? t("media.music_repeat_mode_loop")
                : repeatMode === RepeatMode.Queue
                    ? t("media.music_repeat_mode_queue")
                    : t("media.music_repeat_mode_shuffle")}
        >
            <SwitchCase.Switch switch={repeatMode}>
                <SwitchCase.Case case={RepeatMode.Loop}><SvgAsset iconName="bar-repeat-one" /></SwitchCase.Case>
                <SwitchCase.Case case={RepeatMode.Queue}><SvgAsset iconName="bar-repeat" /></SwitchCase.Case>
                <SwitchCase.Case case={RepeatMode.Shuffle}><SvgAsset iconName="bar-shuffle" /></SwitchCase.Case>
            </SwitchCase.Switch>
        </div>
    );
}

function VolumeBtn() {
    const volume = useVolume();
    const previousVolume = useRef(volume || 1);
    const [shown, setShown] = useState(false);
    const { t } = useTranslation();

    return (
        <div
            className="controller-btn controller-aux-btn controller-volume-btn"
            role="button"
            onMouseEnter={() => setShown(true)}
            onMouseLeave={() => setShown(false)}
            onClick={() => {
                if (volume > 0) {
                    previousVolume.current = volume;
                    trackPlayer.setVolume(0);
                } else {
                    trackPlayer.setVolume(previousVolume.current || 1);
                }
            }}
        >
            <Condition condition={shown}>
                <div className="controller-volume-popover" onClick={(event) => event.stopPropagation()}>
                    <Slider
                        vertical
                        min={0}
                        max={1}
                        step={.01}
                        value={volume}
                        onChange={(value) => trackPlayer.setVolume(value as number)}
                    />
                    <span>{Math.round(volume * 100)}%</span>
                </div>
            </Condition>
            <SvgAsset
                title={volume === 0 ? t("music_bar.unmute") : t("music_bar.mute")}
                iconName={volume === 0 ? "bar-muted" : "bar-volume"}
            />
        </div>
    );
}
