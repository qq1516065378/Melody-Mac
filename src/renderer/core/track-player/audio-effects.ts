export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export type BuiltinAudioEffectPresetId =
    | "flat"
    | "pop"
    | "rock"
    | "vocal"
    | "bass"
    | "cinema"
    | "night";

export type AudioEffectPresetId = BuiltinAudioEffectPresetId
    | "custom"
    | "custom-1"
    | "custom-2";

export interface IAudioEffectSettings {
    enabled: boolean;
    preset: AudioEffectPresetId;
    preamp: number;
    bands: number[];
    spatial: number;
    reverb: number;
    compressor: boolean;
}

export interface IAudioEffectPreset {
    id: BuiltinAudioEffectPresetId;
    name: string;
    description: string;
    settings: Omit<IAudioEffectSettings, "enabled" | "preset">;
}

const preset = (
    id: IAudioEffectPreset["id"],
    name: string,
    description: string,
    bands: number[],
    options: Partial<Pick<IAudioEffectSettings, "preamp" | "spatial" | "reverb" | "compressor">> = {},
): IAudioEffectPreset => ({
    id,
    name,
    description,
    settings: {
        bands,
        preamp: options.preamp ?? 0,
        spatial: options.spatial ?? 0,
        reverb: options.reverb ?? 0,
        compressor: options.compressor ?? false,
    },
});

export const AUDIO_EFFECT_PRESETS: IAudioEffectPreset[] = [
    preset("flat", "原声", "不改变声音", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    preset("pop", "流行", "清晰而有弹性", [-1, 1, 2, 1, 0, -1, 1, 2, 2, 1], { preamp: -2 }),
    preset("rock", "摇滚", "强化鼓点与吉他", [3, 2, 1, -1, -2, 0, 2, 3, 3, 2], { preamp: -3 }),
    preset("vocal", "人声", "突出歌声细节", [-2, -1, 0, 1, 2, 3, 3, 2, 0, -1], { preamp: -2 }),
    preset("bass", "低音", "下潜更深厚", [5, 4, 3, 1, 0, -1, 0, 1, 1, 0], { preamp: -4 }),
    preset("cinema", "影院", "更宽阔的空间感", [3, 2, 1, 0, -1, 0, 2, 3, 2, 1], {
        preamp: -4,
        spatial: .42,
        reverb: .16,
        compressor: true,
    }),
    preset("night", "深夜", "压低突发音量", [2, 2, 1, 0, 0, 1, 1, 0, -1, -2], {
        preamp: -5,
        compressor: true,
    }),
];

export const DEFAULT_AUDIO_EFFECT_SETTINGS: IAudioEffectSettings = {
    enabled: false,
    preset: "flat",
    ...AUDIO_EFFECT_PRESETS[0].settings,
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

export function normalizeAudioEffectSettings(
    settings?: Partial<IAudioEffectSettings> | null,
): IAudioEffectSettings {
    const source = settings ?? DEFAULT_AUDIO_EFFECT_SETTINGS;
    return {
        enabled: source.enabled === true,
        preset: AUDIO_EFFECT_PRESETS.some((item) => item.id === source.preset)
            || source.preset === "custom"
            || source.preset === "custom-1"
            || source.preset === "custom-2"
            ? source.preset
            : "flat",
        preamp: clamp(source.preamp, -12, 6, 0),
        bands: EQ_FREQUENCIES.map((_, index) => clamp(source.bands?.[index], -12, 12, 0)),
        spatial: clamp(source.spatial, 0, 1, 0),
        reverb: clamp(source.reverb, 0, 1, 0),
        compressor: source.compressor === true,
    };
}

export function getAudioEffectPreset(id: BuiltinAudioEffectPresetId): IAudioEffectSettings {
    const selected = AUDIO_EFFECT_PRESETS.find((item) => item.id === id) ?? AUDIO_EFFECT_PRESETS[0];
    return normalizeAudioEffectSettings({
        enabled: true,
        preset: selected.id,
        ...selected.settings,
    });
}
