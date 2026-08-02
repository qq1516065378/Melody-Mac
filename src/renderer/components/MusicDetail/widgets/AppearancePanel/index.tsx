import SvgAsset from "@renderer/components/SvgAsset";
import {
    musicDetailAppearancePanelStore,
    musicDetailAppearanceStore,
    PlaybackDetailColor,
    PlaybackDetailLayout,
} from "../../store";
import "./index.scss";

const colorChoices: Array<{ value: PlaybackDetailColor; label: string; color: string }> = [
    { value: "neutral", label: "柔白", color: "#eef0f3" },
    { value: "coral", label: "珊瑚红", color: "#f35c68" },
    { value: "orange", label: "暖橙", color: "#fa8758" },
    { value: "amber", label: "琥珀", color: "#f3b64f" },
    { value: "lime", label: "青柠", color: "#aad95c" },
    { value: "green", label: "薄荷绿", color: "#56cd7c" },
    { value: "cyan", label: "湖水青", color: "#35beb6" },
    { value: "blue", label: "晴空蓝", color: "#3b91ed" },
    { value: "indigo", label: "靛蓝", color: "#6f78ed" },
    { value: "violet", label: "紫罗兰", color: "#925be3" },
    { value: "pink", label: "樱粉", color: "#ed57ad" },
    { value: "graphite", label: "石墨灰", color: "#8d9098" },
];

const layoutChoices: Array<{
    value: PlaybackDetailLayout;
    label: string;
    previewClass: string;
}> = [
    { value: "balanced", label: "唱片居左", previewClass: "preview-balanced" },
    { value: "lyric-left", label: "歌词居左", previewClass: "preview-lyric-left" },
    { value: "cover-focus", label: "大唱片", previewClass: "preview-cover-focus" },
    { value: "vertical", label: "上下布局", previewClass: "preview-vertical" },
];

export default function AppearancePanel() {
    const shown = musicDetailAppearancePanelStore.useValue();
    const appearance = musicDetailAppearanceStore.useValue();

    const setAppearance = (patch: Partial<typeof appearance>) => {
        musicDetailAppearanceStore.setValue({ ...appearance, ...patch });
    };

    return (
        <div className="playback-appearance-layer" data-shown={shown}>
            <button
                className="playback-appearance-scrim"
                aria-label="关闭播放页外观设置"
                onClick={() => musicDetailAppearancePanelStore.setValue(false)}
            />
            <aside className="playback-appearance-panel" aria-hidden={!shown}>
                <header>
                    <button
                        className="appearance-back"
                        aria-label="返回播放页"
                        onClick={() => musicDetailAppearancePanelStore.setValue(false)}
                    >
                        <SvgAsset iconName="chevron-left" />
                    </button>
                    <h2>播放页样式</h2>
                </header>

                <section>
                    <h3>强调颜色</h3>
                    <div className="appearance-color-grid">
                        {colorChoices.map((choice) => (
                            <button
                                key={choice.value}
                                className="appearance-color"
                                data-selected={appearance.color === choice.value}
                                aria-label={choice.label}
                                title={choice.label}
                                style={{ "--swatch-color": choice.color } as React.CSSProperties}
                                onClick={() => setAppearance({ color: choice.value })}
                            >
                                {appearance.color === choice.value ? <SvgAsset iconName="check" /> : null}
                            </button>
                        ))}
                    </div>
                </section>

                <section>
                    <h3>封面和歌词版式</h3>
                    <div className="appearance-layout-grid">
                        {layoutChoices.map((choice) => (
                            <button
                                key={choice.value}
                                className="appearance-layout"
                                data-selected={appearance.layout === choice.value}
                                onClick={() => setAppearance({ layout: choice.value })}
                            >
                                <span className={`appearance-preview ${choice.previewClass}`}>
                                    <i className="preview-disc" />
                                    <i className="preview-copy"><b /><b /><b /></i>
                                </span>
                                <span>{choice.label}</span>
                                {appearance.layout === choice.value ? (
                                    <i className="appearance-selected"><SvgAsset iconName="check" /></i>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </section>

                <p className="appearance-hint">设置仅应用于播放详情页，并会自动保存。</p>
            </aside>
        </div>
    );
}
