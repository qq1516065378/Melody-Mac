import SvgAsset from "@/renderer/components/SvgAsset";
import "./index.scss";

import MusicFavorite from "@/renderer/components/MusicFavorite";
import MusicDetail, { useMusicDetailShown } from "@/renderer/components/MusicDetail";
import { useTranslation } from "react-i18next";
import { useCurrentMusic } from "@renderer/core/track-player/hooks";
import { getCurrentPanel, hidePanel, showPanel } from "@renderer/components/Panel";
import { showMusicContextMenu } from "@/renderer/components/MusicList";
import MusicDownloaded from "@/renderer/components/MusicDownloaded";
import { setFallbackAlbum } from "@/renderer/utils/img-on-error";
import albumImg from "@/assets/imgs/album-cover.jpg";
import trackPlayer from "@renderer/core/track-player";

export default function MusicInfo() {
    const musicItem = useCurrentMusic();
    const musicDetailShown = useMusicDetailShown();

    const { t } = useTranslation();

    function toggleMusicDetail() {
        if (musicDetailShown) {
            MusicDetail.hide();
        } else {
            MusicDetail.show();
            hidePanel();
        }
    }

    function openMusicComments() {
        if (!musicItem) return;
        if (getCurrentPanel()?.type === "MusicComment") {
            hidePanel();
        } else {
            showPanel("MusicComment", { musicItem, coverHeader: true });
        }
    }

    return (
        <div className="music-info-outer-container" data-detail-shown={musicDetailShown}>
            {!musicDetailShown ? (
                <div className="normal-music-info-container">
                    {musicItem ? (
                        <>
                            <img
                                className="music-cover"
                                role="button"
                                src={musicItem.artwork ?? albumImg}
                                crossOrigin="anonymous"
                                onError={(event) => {
                                    setFallbackAlbum(event);
                                    void trackPlayer.recoverCurrentArtwork(musicItem, true);
                                }}
                                onClick={toggleMusicDetail}
                            />
                            <div className="normal-track-group">
                                <strong
                                    role="button"
                                    title={`${musicItem.title} - ${musicItem.artist ?? ""}`}
                                    onClick={toggleMusicDetail}
                                >
                                    {musicItem.title}
                                </strong>
                                <span>{musicItem.artist}</span>
                                <div className="normal-track-actions">
                                    <MusicFavorite musicItem={musicItem} size={18}></MusicFavorite>
                                    <MusicDownloaded musicItem={musicItem} size={18}></MusicDownloaded>
                                    <div
                                        role="button"
                                        onClick={openMusicComments}
                                    >
                                        <SvgAsset iconName="chat-bubble-left-ellipsis" size={18}></SvgAsset>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>
            ) : (
                <div className="music-info-operations-container">
                    <div
                        className="open-detail"
                        role="button"
                        title={musicDetailShown ? t("music_bar.close_music_detail_page") : t("music_bar.open_music_detail_page")}
                        onClick={toggleMusicDetail}
                    >
                        <SvgAsset iconName="contract-corners"></SvgAsset>
                    </div>
                    <div className="detail-track-group">
                        <div className="detail-track-label">
                            <strong title={`${musicItem?.title ?? ""} - ${musicItem?.artist ?? ""}`}>
                                {musicItem?.title}
                                {musicItem?.artist ? <span> - {musicItem.artist}</span> : null}
                            </strong>
                        </div>
                        <div className="detail-track-actions">
                            {musicItem ? (
                                <>
                                    <MusicFavorite musicItem={musicItem} size={17} variant="music-bar"></MusicFavorite>
                                    <div role="button"
                                        onClick={openMusicComments}>
                                        <SvgAsset iconName="bar-comment" size={18}></SvgAsset>
                                    </div>
                                    <div role="button"
                                        title="更多"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            const rect = event.currentTarget.getBoundingClientRect();
                                            showMusicContextMenu(musicItem, rect.left, rect.top);
                                        }}>
                                        <SvgAsset iconName="bar-more-circle" size={18}></SvgAsset>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
