import { useEffect, useMemo, useState } from "react";
import { secondsToDuration } from "@/common/time-util";
import { getMediaPrimaryKey } from "@/common/media-util";
import PluginManager from "@shared/plugin-manager/renderer";
import ServiceManager from "@shared/service-manager/renderer";
import { encodeUrlHeaders } from "@/common/normalize-util";

const durationCache = new Map<string, number | string>();
const durationPromiseCache = new Map<string, Promise<number | string | undefined>>();
const durationProbeQueue: Array<() => void> = [];
let activeDurationProbes = 0;
const MAX_DURATION_PROBES = 3;

function normalizeDurationValue(value: unknown): number | string | undefined {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(trimmed)) return trimmed;
        const numeric = Number(trimmed);
        if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
        return numeric > 10_000 ? numeric / 1000 : numeric;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
    return value > 10_000 ? value / 1000 : value;
}

export function getMusicDuration(musicItem: IMusic.IMusicItem) {
    const raw = musicItem as any;
    const candidates = [
        musicItem.duration,
        raw.interval,
        raw.durationSeconds,
        raw.durationMs,
        raw.time,
        raw.length,
        raw.songTime,
        raw.$?.duration,
        raw.$?.interval,
        raw.$?.time,
        raw.$?.length,
    ];
    return candidates.map(normalizeDurationValue).find(Boolean);
}

function runNextDurationProbe() {
    while (activeDurationProbes < MAX_DURATION_PROBES && durationProbeQueue.length) {
        activeDurationProbes += 1;
        durationProbeQueue.shift()?.();
    }
}

function enqueueDurationProbe<T>(task: () => Promise<T>) {
    return new Promise<T>((resolve, reject) => {
        durationProbeQueue.push(() => {
            task()
                .then(resolve, reject)
                .finally(() => {
                    activeDurationProbes -= 1;
                    runNextDurationProbe();
                });
        });
        runNextDurationProbe();
    });
}

function prepareAudioUrl(source: IMusic.IMusicSource) {
    if (!source?.url) return undefined;

    let url = source.url;
    const urlObject = new URL(url);
    let headers = source.headers ? { ...source.headers } : undefined;
    if (source.userAgent) {
        headers = { ...(headers ?? {}), "user-agent": source.userAgent };
    }
    if (urlObject.username && urlObject.password) {
        const authorization = `Basic ${btoa(
            `${decodeURIComponent(urlObject.username)}:${decodeURIComponent(urlObject.password)}`,
        )}`;
        urlObject.username = "";
        urlObject.password = "";
        url = urlObject.toString();
        headers = { ...(headers ?? {}), Authorization: authorization };
    }
    if (headers) {
        url = ServiceManager.RequestForwarderService.forwardRequest(url, "GET", headers) ??
            encodeUrlHeaders(url, headers);
    }
    return url;
}

function readAudioDuration(source: IMusic.IMusicSource) {
    return new Promise<number | undefined>((resolve) => {
        const url = prepareAudioUrl(source);
        if (!url || /\.m3u8(?:$|[?#])/i.test(source.url)) {
            resolve(undefined);
            return;
        }

        const audio = new Audio();
        let settled = false;
        const finish = (value?: number) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            audio.removeAttribute("src");
            audio.load();
            resolve(value);
        };
        const timeout = window.setTimeout(() => finish(), 12_000);
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
            const value = normalizeDurationValue(audio.duration);
            finish(typeof value === "number" ? value : undefined);
        };
        audio.onerror = () => finish();
        audio.src = url;
        audio.load();
    });
}

async function resolveMissingDuration(musicItem: IMusic.IMusicItem) {
    if (PluginManager.isSupportFeatureMethod(musicItem.platform, "getMusicInfo")) {
        try {
            const musicInfo = await PluginManager.callPluginDelegateMethod(
                musicItem,
                "getMusicInfo",
                musicItem,
            );
            const duration = musicInfo && getMusicDuration({ ...musicItem, ...musicInfo });
            if (duration) return duration;
        } catch {
            // 继续通过音频元数据兜底。
        }
    }

    try {
        const source = await PluginManager.callPluginDelegateMethod(
            musicItem,
            "getMediaSource",
            musicItem,
            "standard",
        );
        return source ? await readAudioDuration(source) : undefined;
    } catch {
        return undefined;
    }
}

export default function MusicDuration({ musicItem }: { musicItem: IMusic.IMusicItem }) {
    const cacheKey = useMemo(() => getMediaPrimaryKey(musicItem), [musicItem]);
    const [duration, setDuration] = useState<number | string | undefined>(
        () => getMusicDuration(musicItem) ?? durationCache.get(cacheKey),
    );

    useEffect(() => {
        const directDuration = getMusicDuration(musicItem) ?? durationCache.get(cacheKey);
        setDuration(directDuration);
        if (directDuration) return;

        let active = true;
        let pending = durationPromiseCache.get(cacheKey);
        if (!pending) {
            pending = enqueueDurationProbe(() => resolveMissingDuration(musicItem));
            durationPromiseCache.set(cacheKey, pending);
        }
        pending
            .then((resolved) => {
                if (!active) return;
                if (resolved) {
                    durationCache.set(cacheKey, resolved);
                    setDuration(resolved);
                }
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [cacheKey, musicItem]);

    return <>{duration ? secondsToDuration(duration) : "--:--"}</>;
}
