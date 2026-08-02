import {
    EQ_FREQUENCIES,
    IAudioEffectSettings,
    normalizeAudioEffectSettings,
} from "./audio-effects";

const dbToGain = (db: number) => Math.pow(10, db / 20);

/**
 * A single, persistent Web Audio graph for the shared media element.
 * Nodes stay connected while settings change, avoiding gaps during playback.
 */
export default class AudioEffectProcessor {
    private context: AudioContext;
    private source: MediaElementAudioSourceNode;
    private preamp: GainNode;
    private filters: BiquadFilterNode[];
    private compressor: DynamicsCompressorNode;
    private dryGain: GainNode;
    private spatialDelay: DelayNode;
    private spatialPanner: StereoPannerNode;
    private spatialGain: GainNode;
    private reverb: ConvolverNode;
    private reverbGain: GainNode;
    private master: GainNode;

    constructor(audio: HTMLAudioElement) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.context = new AudioContextClass({ latencyHint: "playback" });
        this.source = this.context.createMediaElementSource(audio);
        this.preamp = this.context.createGain();
        this.filters = EQ_FREQUENCIES.map((frequency, index) => {
            const filter = this.context.createBiquadFilter();
            filter.type = index === 0 ? "lowshelf" : index === EQ_FREQUENCIES.length - 1 ? "highshelf" : "peaking";
            filter.frequency.value = frequency;
            filter.Q.value = index === 0 || index === EQ_FREQUENCIES.length - 1 ? .7 : 1;
            return filter;
        });
        this.compressor = this.context.createDynamicsCompressor();
        this.dryGain = this.context.createGain();
        this.spatialDelay = this.context.createDelay(.05);
        this.spatialDelay.delayTime.value = .012;
        this.spatialPanner = this.context.createStereoPanner();
        this.spatialPanner.pan.value = .72;
        this.spatialGain = this.context.createGain();
        this.reverb = this.context.createConvolver();
        this.reverb.buffer = this.createImpulseResponse(1.65, 2.8);
        this.reverbGain = this.context.createGain();
        this.master = this.context.createGain();

        let previous: AudioNode = this.source;
        [this.preamp, ...this.filters, this.compressor].forEach((node) => {
            previous.connect(node);
            previous = node;
        });

        previous.connect(this.dryGain).connect(this.master);
        previous.connect(this.spatialDelay).connect(this.spatialPanner).connect(this.spatialGain).connect(this.master);
        previous.connect(this.reverb).connect(this.reverbGain).connect(this.master);
        this.master.connect(this.context.destination);
    }

    private createImpulseResponse(seconds: number, decay: number) {
        const sampleRate = this.context.sampleRate;
        const length = Math.floor(sampleRate * seconds);
        const impulse = this.context.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
            const data = impulse.getChannelData(channel);
            for (let index = 0; index < length; index += 1) {
                const envelope = Math.pow(1 - index / length, decay);
                data[index] = (Math.random() * 2 - 1) * envelope;
            }
        }
        return impulse;
    }

    apply(input: IAudioEffectSettings) {
        const settings = normalizeAudioEffectSettings(input);
        const enabled = settings.enabled;
        const now = this.context.currentTime;
        const transition = .025;
        this.preamp.gain.setTargetAtTime(enabled ? dbToGain(settings.preamp) : 1, now, transition);
        this.filters.forEach((filter, index) => {
            filter.gain.setTargetAtTime(enabled ? settings.bands[index] : 0, now, transition);
        });
        this.dryGain.gain.setTargetAtTime(1, now, transition);
        this.spatialGain.gain.setTargetAtTime(enabled ? settings.spatial * .24 : 0, now, transition);
        this.reverbGain.gain.setTargetAtTime(enabled ? settings.reverb * .32 : 0, now, transition);

        if (enabled && settings.compressor) {
            this.compressor.threshold.setTargetAtTime(-18, now, transition);
            this.compressor.knee.setTargetAtTime(18, now, transition);
            this.compressor.ratio.setTargetAtTime(3.5, now, transition);
            this.compressor.attack.setTargetAtTime(.01, now, transition);
            this.compressor.release.setTargetAtTime(.25, now, transition);
        } else {
            // A transparent safety limiter prevents boosted bands from clipping.
            this.compressor.threshold.setTargetAtTime(-1, now, transition);
            this.compressor.knee.setTargetAtTime(0, now, transition);
            this.compressor.ratio.setTargetAtTime(16, now, transition);
            this.compressor.attack.setTargetAtTime(.002, now, transition);
            this.compressor.release.setTargetAtTime(.1, now, transition);
        }
    }

    async resume() {
        if (this.context.state === "suspended") {
            await this.context.resume();
        }
    }

    async setSinkId(deviceId: string) {
        const contextWithSink = this.context as AudioContext & {
            setSinkId?: (sinkId: string) => Promise<void>;
        };
        if (contextWithSink.setSinkId) {
            await contextWithSink.setSinkId(deviceId);
            return true;
        }
        return false;
    }

    destroy() {
        this.source.disconnect();
        void this.context.close();
    }
}
