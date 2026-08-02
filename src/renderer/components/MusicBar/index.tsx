import Slider from "./widgets/Slider";
import MusicInfo from "./widgets/MusicInfo";
import Controller from "./widgets/Controller";
import Extra from "./widgets/Extra";
import { useMusicDetailShown } from "../MusicDetail";
import { musicDetailAppearanceStore } from "../MusicDetail/store";

import "./index.scss";

export default function MusicBar() {
    const musicDetailShown = useMusicDetailShown();
    const appearance = musicDetailAppearanceStore.useValue();

    return (
        <div
            className="music-bar-container background-color"
            data-detail-shown={musicDetailShown}
            data-playback-color={appearance.color}
        >
            <MusicInfo></MusicInfo>
            <div className="music-bar-center">
                <Controller></Controller>
                <Slider></Slider>
            </div>
            <Extra></Extra>
        </div>
    );
}
