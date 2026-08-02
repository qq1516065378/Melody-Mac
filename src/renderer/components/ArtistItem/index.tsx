import { setFallbackAlbum } from "@/renderer/utils/img-on-error";
import "./index.scss";
import albumImg from "@/assets/imgs/album-cover.jpg";
import { memo } from "react";
import Condition from "../Condition";
import { normalizeNumber } from "@/common/normalize-util";
import { getArtistPopularity } from "@/common/artist-util";

interface IArtistItemProps {
    artistItem: IArtist.IArtistItem;
    onClick?: (artistItem: IArtist.IArtistItem) => void;
}

function ArtistItem(props: IArtistItemProps) {
    const { artistItem, onClick } = props;
    const popularity = getArtistPopularity(artistItem);
    const hotRank = Number((artistItem as any).hotRank) || 0;

    return (
        <div
            className="components--artist-item-container"
            role="button"
            onClick={() => {
                onClick?.(artistItem);
            }}
        >
            <div className="artist-img-wrapper">
                <img
                    src={artistItem?.avatar || albumImg}
                    onError={setFallbackAlbum}
                ></img>
                {/* <Condition
          condition={
            mediaItem?.playCount || mediaItem?.worksNum || mediaItem?.createAt
          }
        >
          <div className="album-play-info">
            {mediaItem?.createAt ? (
              dayjs(mediaItem.createAt).format("YYYY-MM-DD")
            ) : (
              <div></div>
            )}
            <div className="play-count">
              <Condition condition={mediaItem?.playCount}>
                <SvgAsset iconName={"headphone"} size={14}></SvgAsset>
                {normalizeNumber(mediaItem?.playCount)}
              </Condition>
            </div>
          </div>
        </Condition> */}
            </div>
            <div className="media-info">
                <div className="title" title={artistItem?.name}>
                    {artistItem?.name}
                </div>
                <Condition condition={hotRank > 0 || popularity > 0}>
                    <div className="popularity">
                        {hotRank > 0 ? `热度榜 第 ${hotRank} 名` : `热度 ${normalizeNumber(popularity)}`}
                    </div>
                </Condition>
                <div className="desc" title={artistItem?.description?.replace?.("\\n", "\n")}>
                    {(artistItem?.description ?? "").split("\\n").map((item, index) => (
                        <div key={index}>{item}</div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default memo(
    ArtistItem,
    (prev, curr) =>
        prev.artistItem === curr.artistItem && prev.onClick === curr.onClick,
);
