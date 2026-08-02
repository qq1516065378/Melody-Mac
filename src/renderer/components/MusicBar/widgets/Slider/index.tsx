import { useEffect, useRef, useState } from "react";
import "./index.scss";
import trackPlayer from "@renderer/core/track-player";
import { useProgress } from "@renderer/core/track-player/hooks";
import { secondsToDuration } from "@/common/time-util";

export default function Slider() {
    const [seekPercent, _setSeekPercent] = useState<number | null>(null);
    const seekPercentRef = useRef<number | null>(null);
    const { currentTime, duration } = useProgress();
    const isPressedRef = useRef(false);
    const sliderRef = useRef<HTMLDivElement>();

    function percentFromClientX(clientX: number) {
        const rect = sliderRef.current?.getBoundingClientRect();
        if (!rect?.width) {
            return 0;
        }
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }

    function setSeekPercent(value: number | null) {
        _setSeekPercent(value);
        seekPercentRef.current = value;
    }

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (isPressedRef.current) {
                setSeekPercent(percentFromClientX(e.clientX));
            }
        };
        const onMouseUp = (_e: MouseEvent) => {
            if (isPressedRef.current) {
                isPressedRef.current = false;
                const realProgress = trackPlayer.progress;
                trackPlayer.seekTo(realProgress.duration * (seekPercentRef.current ?? 0));
                setSeekPercent(null);
            }
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, []);
    return (
        <div
            className="music-bar--slider-container"
        >
            <span className="slider-time current-time">{secondsToDuration(currentTime || 0)}</span>
            <div
                ref={sliderRef}
                className="slider-track"
                onMouseDown={(e) => {
                    if (isFinite(duration) && duration) {
                        isPressedRef.current = true;
                        setSeekPercent(percentFromClientX(e.clientX));
                    }
                }}
                onClick={(e) => {
                    if (isFinite(duration) && duration) {
                        trackPlayer.seekTo(duration * percentFromClientX(e.clientX));
                    }
                }}
            >
                <div className="bar"></div>
                <div
                    className="active-bar"
                    style={{
                        width: `${
                            seekPercent !== null
                                ? seekPercent * 100
                                : duration === 0
                                    ? 0
                                    : !isFinite(duration) || isNaN(duration)
                                        ? 0
                                        : (currentTime / duration) * 100
                        }%`,
                    }}
                ></div>
            </div>
            <span className="slider-time duration-time">
                {isFinite(duration) ? secondsToDuration(duration || 0) : "--:--"}
            </span>
        </div>
    );
}
