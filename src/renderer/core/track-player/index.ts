import { CurrentTime, ICurrentLyric, PlayerEvents } from "./enum";
import shuffle from "lodash.shuffle";
import {
    addSortProperty,
    getInternalData,
    getQualityOrder,
    isSameMedia,
    sortByTimestampAndIndex,
} from "@/common/media-util";
import { PlayerState, RepeatMode, sortIndexSymbol, timeStampSymbol } from "@/common/constant";
import LyricParser, { IParsedLrcItem } from "@/renderer/utils/lyric-parser";
import {
    getUserPreference,
    getUserPreferenceIDB,
    removeUserPreference,
    setUserPreference,
    setUserPreferenceIDB,
} from "@/renderer/utils/user-perference";
import AppConfig from "@shared/app-config/renderer";
import { createIndexMap, IIndexMap } from "@/common/index-map";
import _trackPlayerStore from "./store";
import EventEmitter from "eventemitter3";
import { IAudioController } from "@/types/audio-controller";
import AudioController from "@renderer/core/track-player/controller/audio-controller";
import logger from "@shared/logger/renderer";
import voidCallback from "@/common/void-callback";
import { delay } from "@/common/time-util";
import { createUniqueMap } from "@/common/unique-map";
import { getLinkedLyric } from "@renderer/core/link-lyric";
import {
    getLyricSearchablePlugins,
    searchLyricCandidates,
} from "@renderer/utils/search-lyric-candidates";
import { fsUtil } from "@shared/utils/renderer";
import PluginManager from "@shared/plugin-manager/renderer";
import albumImg from "@/assets/imgs/album-cover.jpg";
import {
    DEFAULT_AUDIO_EFFECT_SETTINGS,
    IAudioEffectSettings,
    normalizeAudioEffectSettings,
} from "@renderer/core/track-player/audio-effects";

const {
    musicQueueStore,
    currentMusicStore,
    currentLyricStore,
    repeatModeStore,
    progressStore,
    playerStateStore,
    currentVolumeStore,
    currentSpeedStore,
    currentQualityStore,
    resetProgress,
} = _trackPlayerStore;


interface InternalPlayerEvents {
    [PlayerEvents.RepeatModeChanged]: (repeatMode: RepeatMode) => void;
    [PlayerEvents.MusicChanged]: (musicItem: IMusic.IMusicItem | null) => void;
    [PlayerEvents.LyricChanged]: (parser: LyricParser | null) => void;
    [PlayerEvents.CurrentLyricChanged]: (lyric: IParsedLrcItem | null) => void;
    [PlayerEvents.Error]: (errorMusicItem: IMusic.IMusicItem | null, reason: any) => void;
    [PlayerEvents.ProgressChanged]: (progress: CurrentTime) => void;
    [PlayerEvents.StateChanged]: (state: PlayerState) => void;
}

interface IPlayOptions {
    refreshSource?: boolean;
    restartOnSameMedia?: boolean;
    seekTo?: number;
    quality?: IMusic.IQualityKey;
}

interface ITrackOptions {
    seekTo?: number;
    // 自动播放
    autoPlay?: boolean;
}

class TrackPlayer {
    get currentMusic() {
        return currentMusicStore.getValue();
    }

    // 只有基础信息
    get currentMusicBasicInfo() {
        const currentMusic = this.currentMusic;
        if (!currentMusic) {
            return null;
        }

        return {
            platform: currentMusic.platform,
            title: currentMusic.title,
            artist: currentMusic.artist,
            id: currentMusic.id,
            album: currentMusic.album,
            artwork: currentMusic.artwork,
        } as IMusic.IMusicItem;
    }

    get progress() {
        return progressStore.getValue();
    }

    get playerState() {
        return playerStateStore.getValue();
    }

    get repeatMode() {
        return repeatModeStore.getValue();
    }

    get currentQuality() {
        return currentQualityStore.getValue();
    }

    get speed() {
        return currentSpeedStore.getValue();
    }

    get volume() {
        return currentVolumeStore.getValue();
    }

    get lyric() {
        return currentLyricStore.getValue();
    }

    get musicQueue() {
        return musicQueueStore.getValue();
    }

    get isEmpty() {
        return this.musicQueue.length <= 0;
    }

    private indexMap: IIndexMap;

    private currentIndex = -1;

    private audioController: IAudioController;

    private ee: EventEmitter<InternalPlayerEvents>;

    private artworkRecoveryAttempts = new Set<string>();

    constructor() {
        this.indexMap = createIndexMap();
        this.ee = new EventEmitter();
        this.audioController = new AudioController();
    }

    on<T extends keyof InternalPlayerEvents>(event: T, callback: InternalPlayerEvents[T]) {
        this.ee.on(event, callback as any);
    }

    private setupEvents() {
        this.ee.on(PlayerEvents.Error, async (errorMusicItem) => {
            // config
            const needSkip = AppConfig.getConfig("playMusic.playError") === "skip";

            this.resetProgress();
            if (this.musicQueue.length > 1 && needSkip) {
                await delay(500);
                if (this.isCurrentMusic(errorMusicItem)) {
                    this.skipToNext();
                }
            }
        });

        if (!("mediaSession" in navigator)) {
            return;
        }

        const registerMediaAction = <T extends MediaSessionAction>(
            action: T,
            handler: MediaSessionActionHandler,
        ) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch {
                // Older Chromium versions may expose Media Session without
                // implementing every action.
            }
        };

        registerMediaAction("play", () => this.resume());
        registerMediaAction("pause", () => this.pause());
        registerMediaAction("stop", () => {
            this.pause();
            this.seekTo(0);
        });
        registerMediaAction("nexttrack", () => this.skipToNext());
        registerMediaAction("previoustrack", () => this.skipToPrev());
        registerMediaAction("seekbackward", (details) => {
            this.seekTo(Math.max(0, (this.progress.currentTime ?? 0) - (details.seekOffset ?? 10)));
        });
        registerMediaAction("seekforward", (details) => {
            const duration = this.progress.duration;
            const intendedPosition = (this.progress.currentTime ?? 0) + (details.seekOffset ?? 10);
            this.seekTo(Number.isFinite(duration) ? Math.min(duration, intendedPosition) : intendedPosition);
        });
        registerMediaAction("seekto", (details) => {
            if (typeof details.seekTime === "number") {
                this.seekTo(Math.max(0, details.seekTime));
            }
        });
    }


    private createAudioController() {
        const audioController = new AudioController();
        // 播放结束
        audioController.onEnded = () => {
            this.resetProgress();

            switch (this.repeatMode) {
                case RepeatMode.Queue:
                case RepeatMode.Shuffle: {
                    this.skipToNext();
                    break;
                }
                case RepeatMode.Loop: {
                    this.playIndex(this.currentIndex, {
                        restartOnSameMedia: true,
                    });
                }
            }
        };
        // 进度更新
        audioController.onProgressUpdate = ((progress) => {
            this.setProgress(progress);
            // 检查歌词
            if (this.lyric?.parser) {
                const lyricItem = this.lyric.parser.getPosition(progress.currentTime);
                if (this.lyric.currentLrc?.lrc !== lyricItem?.lrc) {
                    this.setCurrentLyric({
                        parser: this.lyric.parser,
                        currentLrc: lyricItem,
                    });
                }
            }
        });

        audioController.onVolumeChange = (volume) => {
            currentVolumeStore.setValue(volume);
            setUserPreference("volume", volume);
        };

        audioController.onSpeedChange = (speed) => {
            currentSpeedStore.setValue(speed);
            setUserPreference("speed", speed);
        };

        audioController.onPlayerStateChanged = (state) => {
            this.setPlayerState(state);
        };

        audioController.onError = async (type, reason) => {
            this.ee.emit(PlayerEvents.Error, audioController.musicItem, reason);
        };


        this.audioController = audioController;
    }

    public async setup() {
        // 1. Config
        const [repeatMode, currentMusic, currentProgress, volume, speed, defaultQuality, audioEffects] = [
            getUserPreference("repeatMode"),
            getUserPreference("currentMusic"),
            getUserPreference("currentProgress"),
            getUserPreference("volume"),
            getUserPreference("speed"),
            getUserPreference("currentQuality") || AppConfig.getConfig("playMusic.defaultQuality"),
            getUserPreference("audioEffects"),
        ];
        const playList = ((await getUserPreferenceIDB("playList")) ?? []).filter(it => !!it);
        addSortProperty(playList);
        const deviceId = AppConfig.getConfig("playMusic.audioOutputDevice")?.deviceId;

        // 2. init audio controller
        this.createAudioController();
        this.setupEvents();

        // 3. resume state
        musicQueueStore.setValue(playList);
        this.indexMap.update(playList);

        if (repeatMode) {
            this.setRepeatMode(repeatMode as RepeatMode);
        }

        this.setCurrentMusic(currentMusic);
        this.currentIndex = this.findMusicIndex(currentMusic);

        if (deviceId) {
            this.setAudioOutputDevice(deviceId);
        }

        if (volume !== null && volume !== undefined) {
            this.setVolume(volume);
        }

        if (speed) {
            this.setSpeed(speed);
        }

        this.setAudioEffects(audioEffects ?? DEFAULT_AUDIO_EFFECT_SETTINGS);

        // 4. reload lyric
        this.fetchCurrentLyric();

        // 5. fetch music source
        this.fetchMediaSource(currentMusic, defaultQuality).then(({ mediaSource, quality }) => {
            if (this.isCurrentMusic(currentMusic)) {
                this.setTrack(mediaSource, currentMusic, {
                    seekTo: currentProgress,
                    autoPlay: false,
                });
                this.setCurrentQuality(quality);
            }
        }).catch(voidCallback);
    }


    // 切换播放模式
    public toggleRepeatMode() {
        let nextRepeatMode = this.repeatMode;
        switch (nextRepeatMode) {
            case RepeatMode.Shuffle:
                nextRepeatMode = RepeatMode.Loop;
                break;
            case RepeatMode.Loop:
                nextRepeatMode = RepeatMode.Queue;
                break;
            case RepeatMode.Queue:
                nextRepeatMode = RepeatMode.Shuffle;
                break;
        }

        this.setRepeatMode(nextRepeatMode);
    }

    public async playIndex(index: number, options: IPlayOptions = {}) {
        const { refreshSource, restartOnSameMedia = true, seekTo, quality: intendedQuality } = options;
        if (index === -1 && this.musicQueue.length === 0) {
            // 播放列表为空
            return;
        }
        // 1. normalize index
        index = (index + this.musicQueue.length) % this.musicQueue.length;

        // 2. same media
        if (this.currentIndex === index && this.isCurrentMusic(this.musicQueue[index]) && !refreshSource) {
            if (restartOnSameMedia) {
                this.seekTo(0);
            }
            this.audioController.play();

            return;
        }

        // update music
        const nextMusicItem = this.musicQueue[index];
        this.setCurrentMusic(nextMusicItem);
        this.currentIndex = index;

        this.setPlayerState(PlayerState.Buffering);
        this.audioController.prepareTrack?.(nextMusicItem);

        try {
            const { mediaSource, quality } = await this.fetchMediaSource(nextMusicItem, intendedQuality);

            if (!mediaSource.url) {
                throw new Error("mediaSource.url is empty");
            }

            if (!this.isCurrentMusic(nextMusicItem)) {
                // should be aborted
                return;
            }

            this.setCurrentQuality(quality);
            this.setTrack(mediaSource, nextMusicItem, {
                seekTo,
                autoPlay: true,
            });

            // extra information
            const musicInfo = await PluginManager.callPluginDelegateMethod(
                {
                    platform: nextMusicItem.platform,
                },
                "getMusicInfo",
                nextMusicItem,
            ).catch(voidCallback);

            if (!(musicInfo && this.isCurrentMusic(nextMusicItem) && typeof musicInfo === "object")) {
                return;
            }

            this.setCurrentMusic({
                ...nextMusicItem,
                ...musicInfo,
                platform: nextMusicItem.platform,
                id: nextMusicItem.id,
            });

        } catch (e) {
            // 播放失败
            this.setCurrentQuality(AppConfig.getConfig("playMusic.defaultQuality"));
            this.audioController.reset();
            this.ee.emit(PlayerEvents.Error, nextMusicItem, e);
        }


    }

    public async playMusic(musicItem: IMusic.IMusicItem, options: IPlayOptions = {}) {
        if (!musicItem) {
            return;
        }
        const queueIndex = this.findMusicIndex(musicItem);
        if (queueIndex === -1) {
            // TODO: 用add代替
            const newQueue = [
                ...this.musicQueue,
                {
                    ...musicItem,
                    [timeStampSymbol]: Date.now(),
                    [sortIndexSymbol]: 0,
                },
            ];
            this.setMusicQueue(newQueue);
            await this.playIndex(newQueue.length - 1, options);
        } else {
            await this.playIndex(queueIndex, options);
        }
    }

    public async playMusicWithReplaceQueue(musicList: IMusic.IMusicItem[], musicItem?: IMusic.IMusicItem) {
        if (!musicList.length && !musicItem) {
            return;
        }
        addSortProperty(musicList);
        if (this.repeatMode === RepeatMode.Shuffle) {
            musicList = shuffle(musicList);
        }
        musicItem = musicItem ?? musicList[0];
        this.setMusicQueue(musicList);
        await this.playMusic(musicItem);
    }

    public skipToPrev() {
        if (this.isEmpty) {
            this.setCurrentMusic(null);
            this.currentIndex = -1;
            return;
        }
        this.playIndex(this.currentIndex - 1);
    }

    public skipToNext() {
        if (this.isEmpty) {
            this.setCurrentMusic(null);
            this.currentIndex = -1;
            return;
        }
        this.playIndex(this.currentIndex + 1);
    }


    // 重置播放状态
    public reset() {
        this.audioController.reset();
        this.setMusicQueue([]);
        this.setCurrentMusic(null);
        this.resetProgress();
        this.currentIndex = -1;

    }

    public seekTo(seconds: number) {
        this.audioController.seekTo(seconds);
    }

    public pause() {
        this.audioController.pause();
        if (this.playerState !== this.audioController.playerState) {
            this.setPlayerState(this.audioController.playerState);
        }
    }

    public resume() {
        this.audioController.play();

        if (this.playerState !== this.audioController.playerState) {
            this.setPlayerState(this.audioController.playerState);
        }
    }

    public setVolume(volume: number) {
        this.audioController.setVolume(volume);
    }

    public setSpeed(speed: number) {
        this.audioController.setSpeed(speed);
    }

    public setAudioEffects(settings: IAudioEffectSettings) {
        const normalized = normalizeAudioEffectSettings(settings);
        this.audioController.setAudioEffects(normalized);
        setUserPreference("audioEffects", normalized);
    }

    public addNext(musicItems: IMusic.IMusicItem | IMusic.IMusicItem[]) {
        let _musicItems: IMusic.IMusicItem[];
        if (Array.isArray(musicItems)) {
            _musicItems = musicItems;
        } else {
            _musicItems = [musicItems];
        }

        const now = Date.now();

        let duplicateIndex = -1;
        _musicItems.forEach((item, index) => {
            _musicItems[index] = {
                ...item,
                [timeStampSymbol]: now,
                [sortIndexSymbol]: index,
            };
            if (duplicateIndex === -1 && this.isCurrentMusic(item)) {
                duplicateIndex = index;
            }
        });

        if (duplicateIndex !== -1) {
            _musicItems = [
                _musicItems[duplicateIndex],
                ..._musicItems.slice(0, duplicateIndex),
                ..._musicItems.slice(duplicateIndex + 1),
            ];
        }


        const startPart = [];
        const tailPart = [];

        const oldQueue = this.musicQueue;
        const uniqueMap = createUniqueMap(_musicItems);

        for (let i = 0; i < oldQueue.length; ++i) {
            if (i <= this.currentIndex) {
                if (!uniqueMap.has(oldQueue[i])) {
                    startPart.push(oldQueue[i]);
                }
            } else {
                if (!uniqueMap.has(oldQueue[i])) {
                    tailPart.push(oldQueue[i]);
                }
            }
        }


        const newQueue = [
            ...startPart,
            ..._musicItems,
            ...tailPart,
        ];

        this.setMusicQueue(newQueue);
    }


    public removeMusic(musicItems: IMusic.IMusicItem | IMusic.IMusicItem[] | number) {
        if (Array.isArray(musicItems)) {
            const uniqueMap = createUniqueMap(musicItems);

            const newQueue = [];
            const oldQueue = this.musicQueue;

            for (let i = 0; i < oldQueue.length; i++) {
                const musicItem = oldQueue[i];
                if (uniqueMap.has(musicItem)) {
                    if (this.currentIndex === i) {
                        this.audioController.reset();
                        this.currentIndex = -1;
                        resetProgress();
                        this.setCurrentMusic(null);
                    }
                } else {
                    newQueue.push(musicItem);
                    if (this.currentIndex === i) {
                        this.currentIndex = newQueue.length - 1;
                    }
                }
            }
            this.setMusicQueue(newQueue);
        } else {

            const musicIndex = typeof musicItems === "number" ? musicItems : this.findMusicIndex(musicItems);
            if (musicIndex === -1) {
                return;
            }
            if (musicIndex === this.currentIndex) {
                this.audioController.reset();
                this.currentIndex = -1;
                resetProgress();
                this.setCurrentMusic(null);
            }

            const newQueue = [...this.musicQueue];
            newQueue.splice(musicIndex, 1);
            this.setMusicQueue(newQueue);
        }
    }


    public async setQuality(quality: IMusic.IQualityKey) {
        const currentMusic = this.currentMusic;
        if (currentMusic && quality !== this.currentQuality) {
            const { mediaSource, quality: realQuality } = await this.fetchMediaSource(currentMusic, quality);
            if (this.isCurrentMusic(currentMusic)) {
                this.setTrack(mediaSource, currentMusic, {
                    seekTo: this.progress.currentTime ?? 0,
                    autoPlay: this.playerState === PlayerState.Playing,
                });
                this.setCurrentQuality(realQuality);
            }
        }
    }

    public setRepeatMode(repeatMode: RepeatMode) {
        if (repeatMode === RepeatMode.Shuffle) {
            this.setMusicQueue(shuffle(this.musicQueue));
        } else if (this.repeatMode === RepeatMode.Shuffle) {
            this.setMusicQueue(sortByTimestampAndIndex(this.musicQueue, true));
        }
        repeatModeStore.setValue(repeatMode);
        setUserPreference("repeatMode", repeatMode);
        this.ee.emit(PlayerEvents.RepeatModeChanged, repeatMode);
    }

    public async setAudioOutputDevice(deviceId?: string) {
        try {
            await this.audioController.setSinkId(deviceId ?? "");
        } catch (e) {
            logger.logError("设置音频输出设备失败", e);
        }
    }

    public setMusicQueue(musicQueue: IMusic.IMusicItem[]) {
        musicQueueStore.setValue(musicQueue);
        setUserPreferenceIDB("playList", musicQueue);
        this.indexMap.update(musicQueue);
        this.currentIndex = this.findMusicIndex(this.currentMusic);
    }


    public async fetchCurrentLyric(forceLoad = false) {
        const currentMusic = this.currentMusic;

        if (!currentMusic) {
            this.setCurrentLyric(null);
            return;
        }

        const currentLyric = this.lyric;
        if (!forceLoad && currentLyric && this.isCurrentMusic(currentLyric?.parser?.musicItem)) {
            return;
        }
        try {
            // 获取被关联的歌词
            const linkedLyricItem = await getLinkedLyric(currentMusic);
            let lyricSource: ILyric.ILyricSource | null;

            if (linkedLyricItem) {
                try {
                    lyricSource = await PluginManager.callPluginDelegateMethod(
                        linkedLyricItem,
                        "getLyric",
                        linkedLyricItem,
                    );
                } catch (e) {
                    logger.logError("获取已关联歌词失败", e);
                }
            }
            if (!lyricSource && this.isCurrentMusic(currentMusic)) {
                try {
                    lyricSource = await PluginManager.callPluginDelegateMethod(
                        currentMusic,
                        "getLyric",
                        currentMusic,
                    );
                } catch (e) {
                    logger.logError("从当前音源获取歌词失败", e);
                }
            }

            if (
                !lyricSource?.rawLrc &&
                !lyricSource?.translation &&
                this.isCurrentMusic(currentMusic)
            ) {
                lyricSource = await this.fetchLyricFromOtherSources(currentMusic);
            }

            if (!this.isCurrentMusic(currentMusic)) {
                return;
            }

            if (!lyricSource?.rawLrc && !lyricSource?.translation) {
                this.setCurrentLyric({});
                return;
            }
            const parser = new LyricParser(lyricSource.rawLrc, {
                musicItem: currentMusic,
                translation: lyricSource.translation,
            });

            this.setCurrentLyric({
                parser,
                currentLrc: parser.getPosition(this.progress.currentTime || 0),
            });
        } catch (e) {
            logger.logError("歌词解析失败", e);
            this.setCurrentLyric({});
        }


    }

    /**
     * 当前音源没有歌词时，按插件顺序从其他音源搜索同名歌曲。
     * 只接受标题高度匹配且歌手相符的结果，避免把错误歌词自动套到当前歌曲。
     */
    private async fetchLyricFromOtherSources(
        musicItem: IMusic.IMusicItem,
    ): Promise<ILyric.ILyricSource | null> {
        const normalize = (value?: string) =>
            (value ?? "")
                .toLocaleLowerCase()
                .replace(/[\s·•・_\-—–()[\]（）【】《》<>]/g, "");
        const targetTitle = normalize(musicItem.title);
        const targetArtist = normalize(musicItem.artist);
        const query = musicItem.title;
        const minimumScore = targetArtist ? 102 : 100;
        const plugins = getLyricSearchablePlugins(true).filter(
            plugin => plugin.platform !== musicItem.platform,
        );

        for (const plugin of plugins) {
            try {
                const result = await searchLyricCandidates(plugin, query, 1);
                const candidates = (result?.data ?? []) as ILyric.ILyricItem[];
                const matched = candidates
                    .map(candidate => {
                        const title = normalize(candidate.title);
                        const artist = normalize(candidate.artist);
                        let score = title === targetTitle ? 100 : 0;
                        if (
                            title &&
                            targetTitle &&
                            (title.includes(targetTitle) || targetTitle.includes(title))
                        ) {
                            score = Math.max(score, 72);
                        }
                        if (
                            artist &&
                            targetArtist &&
                            (artist.includes(targetArtist) || targetArtist.includes(artist))
                        ) {
                            score += 30;
                        }
                        return { candidate, score };
                    })
                    .filter(item => item.score >= minimumScore)
                    .sort((a, b) => b.score - a.score)[0]?.candidate;

                if (!matched || !this.isCurrentMusic(musicItem)) {
                    continue;
                }

                const lyricSource = await PluginManager.callPluginDelegateMethod(
                    matched,
                    "getLyric",
                    matched,
                );
                if (lyricSource?.rawLrc || lyricSource?.translation) {
                    return lyricSource;
                }
            } catch (e) {
                logger.logError(`从 ${plugin.platform} 获取备用歌词失败`, e);
            }
        }

        return null;
    }

    private isArtworkMissing(artwork?: string) {
        const value = artwork?.trim();
        return !value || value === albumImg || value.includes("album-cover.jpg");
    }

    private canLoadArtwork(url: string): Promise<boolean> {
        return new Promise((resolve) => {
            const image = new Image();
            const timeout = window.setTimeout(() => {
                image.src = "";
                resolve(false);
            }, 5000);
            image.onload = () => {
                window.clearTimeout(timeout);
                resolve(image.naturalWidth > 0 && image.naturalHeight > 0);
            };
            image.onerror = () => {
                window.clearTimeout(timeout);
                resolve(false);
            };
            image.src = url;
        });
    }

    /**
     * 当前音源缺少封面或封面失效时，从其他音源搜索同一首歌并补全封面。
     * 结果会同步到当前歌曲和播放队列，避免重启后再次丢失。
     */
    public async recoverCurrentArtwork(
        musicItem: IMusic.IMusicItem = this.currentMusic,
        force = false,
    ) {
        if (!musicItem || (!force && !this.isArtworkMissing(musicItem.artwork))) return;

        const normalize = (value?: string) => (value ?? "")
            .toLocaleLowerCase()
            .replace(/[\s·•・_\-—–()[\]（）【】《》<>]/g, "");
        const targetTitle = normalize(musicItem.title);
        const targetArtist = normalize(musicItem.artist);
        const targetAlbum = normalize(musicItem.album);
        const requestKey = `${musicItem.platform}:${musicItem.id}:${musicItem.artwork ?? "missing"}`;
        if (this.artworkRecoveryAttempts.has(requestKey)) return;
        this.artworkRecoveryAttempts.add(requestKey);

        const plugins = PluginManager.getSortedSearchablePlugins("music")
            .filter(plugin => plugin.platform !== musicItem.platform);
        const queries = [
            [musicItem.title, musicItem.artist].filter(Boolean).join(" "),
            musicItem.title,
        ].filter((query, index, list) => !!query && list.indexOf(query) === index);

        for (const plugin of plugins) {
            try {
                let candidates: IMusic.IMusicItem[] = [];
                for (const query of queries) {
                    const result = await PluginManager.callPluginDelegateMethod(
                        plugin,
                        "search",
                        query,
                        1,
                        "music",
                    ) as IPlugin.ISearchResult<"music">;
                    candidates = result?.data ?? [];
                    if (candidates.length) break;
                }

                const ranked = candidates.map((candidate) => {
                    const title = normalize(candidate.title);
                    const artist = normalize(candidate.artist);
                    const album = normalize(candidate.album);
                    let score = title === targetTitle
                        ? 100
                        : title.includes(targetTitle) || targetTitle.includes(title)
                            ? 68
                            : 0;
                    if (targetArtist && artist) {
                        score += artist === targetArtist
                            ? 42
                            : artist.includes(targetArtist) || targetArtist.includes(artist)
                                ? 32
                                : -45;
                    }
                    if (targetAlbum && album === targetAlbum) score += 12;
                    return { candidate, score };
                }).filter(item => item.score >= (targetArtist ? 118 : 95))
                    .sort((a, b) => b.score - a.score);

                for (const { candidate } of ranked.slice(0, 5)) {
                    let artwork = candidate.artwork;
                    if (!artwork && plugin.supportedMethod.includes("getMusicInfo")) {
                        const info = await PluginManager.callPluginDelegateMethod(
                            candidate,
                            "getMusicInfo",
                            candidate,
                        ).catch(() => null);
                        artwork = info?.artwork;
                    }
                    if (!artwork || artwork === musicItem.artwork || !await this.canLoadArtwork(artwork)) {
                        continue;
                    }
                    if (!this.isCurrentMusic(musicItem)) return;
                    if (!force && !this.isArtworkMissing(this.currentMusic?.artwork)) return;

                    const updatedMusic = { ...this.currentMusic, artwork } as IMusic.IMusicItem;
                    currentMusicStore.setValue(updatedMusic);
                    this.audioController.musicItem = updatedMusic;
                    setUserPreference("currentMusic", updatedMusic);
                    this.ee.emit(PlayerEvents.MusicChanged, updatedMusic);

                    const updatedQueue = this.musicQueue.map(item =>
                        isSameMedia(item, updatedMusic) ? { ...item, artwork } : item,
                    );
                    musicQueueStore.setValue(updatedQueue);
                    this.indexMap.update(updatedQueue);
                    setUserPreferenceIDB("playList", updatedQueue);

                    if ("mediaSession" in navigator) {
                        navigator.mediaSession.metadata = new MediaMetadata({
                            title: updatedMusic.title,
                            artist: updatedMusic.artist,
                            album: updatedMusic.album,
                            artwork: [{ src: artwork }],
                        });
                    }
                    return;
                }
            } catch (error) {
                logger.logError(`从 ${plugin.platform} 获取备用封面失败`, error);
            }
        }
    }


    private async fetchMediaSource(musicItem: IMusic.IMusicItem, quality?: IMusic.IQualityKey) {
        const defaultQuality = AppConfig.getConfig("playMusic.defaultQuality");
        const whenQualityMissing = AppConfig.getConfig("playMusic.whenQualityMissing");

        const qualityOrder = getQualityOrder(quality ?? defaultQuality, whenQualityMissing);

        let mediaSource: IPlugin.IMediaSourceResult | null = null;
        let realQuality: IMusic.IQualityKey = qualityOrder[0];

        // 1. 判断是否已下载
        const downloadedData = getInternalData<IMusic.IMusicItemInternalData>(
            musicItem,
            "downloadData",
        );
        if (downloadedData) {
            const { quality, path: _path } = downloadedData;
            if (await fsUtil.isFile(_path)) {
                return {
                    quality,
                    mediaSource: {
                        url: fsUtil.addFileScheme(_path),
                    },
                };
            } else {
                // TODO 删除
            }
        }

        // 2. 如果没有下载
        for (const quality of qualityOrder) {
            try {
                mediaSource = await PluginManager.callPluginDelegateMethod(
                    {
                        platform: musicItem.platform,
                    },
                    "getMediaSource",
                    musicItem,
                    quality,
                );
                if (!mediaSource?.url) {
                    continue;
                }
                realQuality = quality;
                break;
            } catch {
                // pass
            }
        }
        return {
            quality: realQuality,
            mediaSource: mediaSource,
        };
    }


    // 只读数据的设置
    private setCurrentMusic(musicItem: IMusic.IMusicItem | null) {
        if (!this.isCurrentMusic(musicItem)) {
            currentMusicStore.setValue(musicItem);
            this.ee.emit(PlayerEvents.MusicChanged, musicItem);
            this.fetchCurrentLyric();
            this.setCurrentLyric(null);

            if (musicItem) {
                setUserPreference("currentMusic", musicItem);
                if (this.isArtworkMissing(musicItem.artwork)) {
                    void this.recoverCurrentArtwork(musicItem);
                }
            } else {
                removeUserPreference("currentMusic");
            }
        } else {
            // 相同的歌曲，不需要额外触发事件
            currentMusicStore.setValue(musicItem);
        }
    }

    private setProgress(progress: CurrentTime) {
        progressStore.setValue(progress);
        setUserPreference("currentProgress", progress.currentTime);
        this.ee.emit(PlayerEvents.ProgressChanged, progress);

        if (
            "mediaSession" in navigator
            && Number.isFinite(progress.duration)
            && progress.duration > 0
            && Number.isFinite(progress.currentTime)
        ) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: progress.duration,
                    playbackRate: this.speed || 1,
                    position: Math.min(Math.max(progress.currentTime, 0), progress.duration),
                });
            } catch {
                // Ignore transient invalid position data while changing tracks.
            }
        }
    }

    private setCurrentQuality(quality: IMusic.IQualityKey) {
        setUserPreference("currentQuality", quality);
        currentQualityStore.setValue(quality);
    }

    private setCurrentLyric(lyric?: ICurrentLyric) {
        const prev = this.lyric;
        currentLyricStore.setValue(lyric);

        if (lyric?.parser !== prev?.parser) {
            this.ee.emit(PlayerEvents.LyricChanged, lyric?.parser ?? null);
        } else if (lyric?.currentLrc !== prev?.currentLrc) {
            this.ee.emit(PlayerEvents.CurrentLyricChanged, lyric?.currentLrc ?? null);
        }
    }

    private setPlayerState(playerState: PlayerState) {
        playerStateStore.setValue(playerState);
        this.ee.emit(PlayerEvents.StateChanged, playerState);
    }

    // 获取音乐在播放列表中的下标
    private findMusicIndex(musicItem?: IMusic.IMusicItem | null) {
        if (!musicItem) {
            return -1;
        }
        return this.indexMap.indexOf(musicItem);
    }


    private resetProgress() {
        resetProgress();
        removeUserPreference("currentProgress");
    }

    private setTrack(mediaSource: IPlugin.IMediaSourceResult, musicItem: IMusic.IMusicItem, options: ITrackOptions = {
        autoPlay: true,
    }) {
        this.resetProgress();
        this.audioController.setTrackSource(mediaSource, musicItem);

        if (options.seekTo >= 0) {
            this.audioController.seekTo(options.seekTo);
        }

        if (options.autoPlay) {
            this.audioController.play();
        }
    }


    // 判断某首歌是否是当前播放的歌曲
    public isCurrentMusic(musicItem: IMusic.IMusicItem) {
        return isSameMedia(musicItem, this.currentMusic);
    }

}


export default new TrackPlayer();
