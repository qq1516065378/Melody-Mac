import SvgAsset from "@/renderer/components/SvgAsset";
import "./index.scss";
import SwitchCase from "@/renderer/components/SwitchCase";
import trackPlayer from "@renderer/core/track-player";
import { useEffect, useRef, useState } from "react";
import Condition from "@/renderer/components/Condition";
import Slider from "rc-slider";
import classNames from "@/renderer/utils/classnames";
import { getCurrentPanel, hidePanel, showPanel } from "@/renderer/components/Panel";
import { useTranslation } from "react-i18next";
import AppConfig from "@shared/app-config/renderer";
import { isCN } from "@/shared/i18n/renderer";
import useAppConfig from "@/hooks/useAppConfig";
import { useQuality, useSpeed } from "@renderer/core/track-player/hooks";
import { appWindowUtil } from "@shared/utils/renderer";
import { musicDetailShownStore , musicDetailAppearancePanelStore } from "@renderer/components/MusicDetail/store";
import { useUserPreference } from "@renderer/utils/user-perference";
import {
    AUDIO_EFFECT_PRESETS,
    DEFAULT_AUDIO_EFFECT_SETTINGS,
    EQ_FREQUENCIES,
    getAudioEffectPreset,
    IAudioEffectSettings,
    normalizeAudioEffectSettings,
} from "@renderer/core/track-player/audio-effects";

const POPOVER_EVENT = "musicbar-popover-open";

function announcePopover(id: string) {
    window.dispatchEvent(new CustomEvent(POPOVER_EVENT, { detail: id }));
}

function usePopoverDismiss(
    shown: boolean,
    setShown: (shown: boolean) => void,
    id: string,
) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!shown) return;

        const dismiss = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setShown(false);
            }
        };

        document.addEventListener("pointerdown", dismiss);
        const dismissOther = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== id) setShown(false);
        };
        window.addEventListener(POPOVER_EVENT, dismissOther);
        return () => {
            document.removeEventListener("pointerdown", dismiss);
            window.removeEventListener(POPOVER_EVENT, dismissOther);
        };
    }, [id, shown, setShown]);

    return containerRef;
}

export default function Extra() {
    const { t } = useTranslation();

    return (
        <div className="music-extra">
            <ThemeBtn></ThemeBtn>
            <QualityBtn></QualityBtn>
            <SpeedBtn></SpeedBtn>
            <EffectsBtn></EffectsBtn>
            <LyricBtn></LyricBtn>
            <div
                className="extra-btn extra-btn--playlist"
                title={t("media.playlist")}
                role="button"
                onClick={() => {
                    if (getCurrentPanel()?.type === "PlayList") {
                        hidePanel();
                    } else {
                        showPanel("PlayList", {
                            coverHeader: musicDetailShownStore.getValue(),
                        });
                    }
                }}
            >
                <SvgAsset iconName="bar-playlist"></SvgAsset>
            </div>
        </div>
    );
}

function ThemeBtn() {
    return (
        <div
            className="extra-btn extra-btn--theme"
            role="button"
            title="播放页样式"
            onClick={() => {
                musicDetailAppearancePanelStore.setValue((shown) => !shown);
            }}
        >
            <SvgAsset iconName="bar-theme"></SvgAsset>
        </div>
    );
}

function SpeedBtn() {
    const speed = useSpeed();
    const [showSpeedBubble, setShowSpeedBubble] = useState(false);
    const containerRef = usePopoverDismiss(showSpeedBubble, setShowSpeedBubble, "speed");
    const { t } = useTranslation();

    return (
        <div
            className="extra-btn extra-btn--speed"
            role="button"
            ref={containerRef}
            data-popover-open={showSpeedBubble}
            onClick={(event) => {
                event.stopPropagation();
                const nextShown = !showSpeedBubble;
                if (nextShown) {
                    hidePanel();
                    announcePopover("speed");
                }
                setShowSpeedBubble(nextShown);
            }}
        >
            <Condition condition={showSpeedBubble}>
                <div
                    className="speed-bubble-container shadow backdrop-color"
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <div className="speed-bubble-title">
                        <span>{t("music_bar.playback_speed")}</span>
                        <strong>{speed.toFixed(2)}x</strong>
                    </div>
                    <div className="speed-presets">
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
                            <button
                                type="button"
                                key={value}
                                data-selected={Math.abs(speed - value) < .01}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    trackPlayer.setSpeed(value);
                                    setShowSpeedBubble(false);
                                }}
                            >
                                {value === 1 ? "正常" : `${value}x`}
                            </button>
                        ))}
                    </div>
                </div>
            </Condition>
            <SvgAsset
                title={t("music_bar.playback_speed")}
                iconName="bar-wave-speed"
            ></SvgAsset>
            <span className="bar-speed-label">
                {speed === 1 ? "1x" : `${speed.toFixed(1)}x`}
            </span>
        </div>
    );
}

function QualityBtn() {
    const quality = useQuality();
    const [showQualityBubble, setShowQualityBubble] = useState(false);
    const [onlyCurrentMusic, setOnlyCurrentMusic] = useState(true);
    const containerRef = usePopoverDismiss(showQualityBubble, setShowQualityBubble, "quality");
    const { t } = useTranslation();

    const qualityChoices: Array<{
        value: IMusic.IQualityKey;
        short: string;
        label: string;
    }> = [
        { value: "low", short: "LQ", label: t("media.music_quality_low") },
        { value: "standard", short: "SD", label: t("media.music_quality_standard") },
        { value: "high", short: "HQ", label: t("media.music_quality_high") },
        { value: "super", short: "SQ", label: t("media.music_quality_super") },
    ];

    return (
        <div
            className="extra-btn extra-btn--quality"
            role="button"
            ref={containerRef}
            data-popover-open={showQualityBubble}
            onClick={(event) => {
                event.stopPropagation();
                const nextShown = !showQualityBubble;
                if (nextShown) {
                    hidePanel();
                    announcePopover("quality");
                }
                setShowQualityBubble(nextShown);
            }}
        >
            <Condition condition={showQualityBubble}>
                <div
                    className="quality-bubble-container shadow backdrop-color"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="quality-bubble-title">
                        {t("music_bar.choose_music_quality")}
                    </div>
                    <div className="quality-options">
                        {qualityChoices.map((choice) => (
                            <button
                                type="button"
                                key={choice.value}
                                data-selected={quality === choice.value}
                                onClick={() => {
                                    trackPlayer.setQuality(choice.value);
                                    if (!onlyCurrentMusic) {
                                        AppConfig.setConfig({
                                            "playMusic.defaultQuality": choice.value,
                                        });
                                    }
                                    setShowQualityBubble(false);
                                }}
                            >
                                <span className="quality-option-code">{choice.short}</span>
                                <span>{choice.label}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="quality-current-toggle"
                        data-checked={onlyCurrentMusic}
                        onClick={() => setOnlyCurrentMusic((checked) => !checked)}
                    >
                        <span className="quality-toggle-box">
                            {onlyCurrentMusic ? "✓" : ""}
                        </span>
                        {t("music_bar.only_set_for_current_music")}
                    </button>
                </div>
            </Condition>
            <SwitchCase.Switch switch={quality}>
                <SwitchCase.Case case={"low"}><span className="quality-label">LQ</span></SwitchCase.Case>
                <SwitchCase.Case case={"standard"}><span className="quality-label">SD</span></SwitchCase.Case>
                <SwitchCase.Case case={"high"}><span className="quality-label">HQ</span></SwitchCase.Case>
                <SwitchCase.Case case={"super"}><span className="quality-label">SQ</span></SwitchCase.Case>
            </SwitchCase.Switch>
        </div>
    );
}

function formatFrequency(frequency: number) {
    return frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`;
}

function EffectsBtn() {
    const [storedSettings] = useUserPreference("audioEffects");
    const [storedCustomPresets, setStoredCustomPresets] = useUserPreference("audioEffectCustomPresets");
    const settings = normalizeAudioEffectSettings(storedSettings ?? DEFAULT_AUDIO_EFFECT_SETTINGS);
    const customPresets = [0, 1].map((index) => {
        const item = storedCustomPresets?.[index];
        return item ? normalizeAudioEffectSettings(item) : null;
    });
    const [shown, setShown] = useState(false);
    const containerRef = usePopoverDismiss(shown, setShown, "effects");

    const update = (next: IAudioEffectSettings) => {
        trackPlayer.setAudioEffects(next);
        const slotIndex = next.preset === "custom-1" ? 0 : next.preset === "custom-2" ? 1 : -1;
        if (slotIndex >= 0) {
            const nextSlots = [...customPresets];
            nextSlots[slotIndex] = next;
            setStoredCustomPresets(nextSlots);
        }
    };

    const selectCustomPreset = (index: number) => {
        const presetId = index === 0 ? "custom-1" : "custom-2";
        const next = normalizeAudioEffectSettings({
            ...(customPresets[index] ?? settings),
            enabled: true,
            preset: presetId,
        });
        const nextSlots = [...customPresets];
        nextSlots[index] = next;
        setStoredCustomPresets(nextSlots);
        trackPlayer.setAudioEffects(next);
    };

    const editingPreset = settings.preset === "custom-1" || settings.preset === "custom-2"
        ? settings.preset
        : "custom";

    return (
        <div
            className={classNames({
                "extra-btn": true,
                "extra-btn--effects": true,
                highlight: settings.enabled,
            })}
            role="button"
            ref={containerRef}
            data-popover-open={shown}
            title="均衡器与音效"
            onClick={(event) => {
                event.stopPropagation();
                const nextShown = !shown;
                if (nextShown) {
                    hidePanel();
                    announcePopover("effects");
                }
                setShown(nextShown);
            }}
        >
            <Condition condition={shown}>
                <div
                    className="effects-bubble-container shadow backdrop-color"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="effects-header">
                        <div>
                            <strong>均衡器与音效</strong>
                            <span>实时音频处理</span>
                        </div>
                        <button
                            type="button"
                            className="effects-master-switch"
                            data-checked={settings.enabled}
                            aria-label={settings.enabled ? "关闭音效" : "开启音效"}
                            onClick={() => update({ ...settings, enabled: !settings.enabled })}
                        ><i /></button>
                    </div>

                    <div className="effects-presets">
                        {AUDIO_EFFECT_PRESETS.map((item) => (
                            <button
                                type="button"
                                key={item.id}
                                title={item.description}
                                data-selected={settings.enabled && settings.preset === item.id}
                                onClick={() => update(getAudioEffectPreset(item.id))}
                            >{item.name}</button>
                        ))}
                        {[0, 1].map((index) => (
                            <button
                                type="button"
                                className="effects-custom-preset"
                                key={index}
                                data-saved={!!customPresets[index]}
                                data-selected={settings.enabled && settings.preset === `custom-${index + 1}`}
                                title={customPresets[index]
                                    ? "点击使用；选中后调整参数会自动保存"
                                    : "点击将当前参数保存到此槽位"}
                                onClick={() => selectCustomPreset(index)}
                            >
                                自定义{index + 1}
                            </button>
                        ))}
                    </div>

                    <div className="effects-section-title">
                        <span>均衡器</span>
                        <small>±12 dB</small>
                    </div>
                    <div className="effects-eq">
                        {EQ_FREQUENCIES.map((frequency, index) => (
                            <div className="effects-eq-band" key={frequency}>
                                <span>{settings.bands[index] > 0 ? "+" : ""}{settings.bands[index]}</span>
                                <Slider
                                    vertical
                                    min={-12}
                                    max={12}
                                    step={1}
                                    value={settings.bands[index]}
                                    onChange={(value) => {
                                        const bands = [...settings.bands];
                                        bands[index] = value as number;
                                        update({ ...settings, enabled: true, preset: editingPreset, bands });
                                    }}
                                />
                                <small>{formatFrequency(frequency)}</small>
                            </div>
                        ))}
                    </div>

                    <div className="effects-controls">
                        <EffectRange
                            label="空间感"
                            value={settings.spatial}
                            onChange={(spatial) => update({ ...settings, enabled: true, preset: editingPreset, spatial })}
                        />
                        <EffectRange
                            label="混响"
                            value={settings.reverb}
                            onChange={(reverb) => update({ ...settings, enabled: true, preset: editingPreset, reverb })}
                        />
                        <button
                            type="button"
                            className="effects-compressor"
                            data-selected={settings.enabled && settings.compressor}
                            onClick={() => update({
                                ...settings,
                                enabled: true,
                                preset: editingPreset,
                                compressor: !settings.compressor,
                            })}
                        >动态均衡</button>
                    </div>
                </div>
            </Condition>
            <SvgAsset iconName="bar-equalizer" />
        </div>
    );
}

function EffectRange({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="effects-range">
            <span>{label}</span>
            <Slider
                min={0}
                max={1}
                step={.01}
                value={value}
                onChange={(next) => onChange(next as number)}
            />
            <small>{Math.round(value * 100)}%</small>
        </label>
    );
}

function LyricBtn() {
    const enableDesktopLyric = useAppConfig("lyric.enableDesktopLyric");
    const { t } = useTranslation();

    return (
        <div
            className={classNames({
                "extra-btn": true,
                "extra-btn--lyric": true,
                highlight: enableDesktopLyric,
            })}
            role="button"
            onClick={async () => {
                appWindowUtil.setLyricWindow(!enableDesktopLyric);
            }}
        >
            {isCN() ? (
                <span className="bar-lyric-label">词</span>
            ) : (
                <SvgAsset
                    iconName={isCN() ? "lyric" : "lyric-en"}
                    title={t("music_bar.desktop_lyric")}
                ></SvgAsset>
            )}
        </div>
    );
}
