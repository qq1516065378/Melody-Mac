import "./index.scss";
import { memo, useEffect, useRef, useState } from "react";
import trackPlayer from "@renderer/core/track-player";
import Condition, { IfTruthy } from "@/renderer/components/Condition";
import Empty from "@/renderer/components/Empty";
import { getMediaPrimaryKey, isSameMedia } from "@/common/media-util";
import SvgAsset from "@/renderer/components/SvgAsset";
import useVirtualList from "@/hooks/useVirtualList";
import { showMusicContextMenu } from "@/renderer/components/MusicList";
import Base from "../Base";
import hotkeys from "hotkeys-js";
import { Trans, useTranslation } from "react-i18next";
import DragReceiver, { startDrag } from "@/renderer/components/DragReceiver";
import { useCurrentMusic, useMusicQueue } from "@renderer/core/track-player/hooks";
import albumImg from "@/assets/imgs/album-cover.jpg";
import { setFallbackAlbum } from "@/renderer/utils/img-on-error";
import MusicDuration from "@/renderer/components/MusicDuration";

const estimateItemHeight = 62;
const DRAG_TAG = "Playlist";

interface IProps {
    coverHeader?: boolean;
}

export default function PlayList(props: IProps) {
    const { coverHeader } = props;
    const musicQueue = useMusicQueue();
    const currentMusic = useCurrentMusic();
    const scrollElementRef = useRef<HTMLDivElement>();
    const [activeItems, setActiveItems] = useState<Set<number>>(new Set());
    const lastActiveIndexRef = useRef(0);

    const { t } = useTranslation();

    const virtualController = useVirtualList({
        estimateItemHeight: estimateItemHeight,
        data: musicQueue,
        getScrollElement() {
            return scrollElementRef.current;
        },
        fallbackRenderCount: 20,
    });

    useEffect(() => {
        virtualController.setScrollElement(scrollElementRef.current);
        const currentMusic = trackPlayer.currentMusic;
        if (currentMusic) {
            const queue = trackPlayer.musicQueue;
            const index = queue.findIndex((it) => isSameMedia(it, currentMusic));
            if (index > 4) {
                virtualController.scrollToIndex(index - 4);
            }
        }

        const ctrlAHandler = (evt: Event) => {
            evt.preventDefault();
            const queue = trackPlayer.musicQueue;
            setActiveItems(new Set(Array.from({ length: queue.length }, (_, i) => i)));
        };
        hotkeys("Ctrl+A", "play-list", ctrlAHandler);

        return () => {
            hotkeys.unbind("Ctrl+A", ctrlAHandler);
        };
    }, []);

    const onDrop = (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex) {
            // 没有移动
            return;
        }
        const newData = musicQueue
            .slice(0, fromIndex)
            .concat(musicQueue.slice(fromIndex + 1));
        newData.splice(
            fromIndex > toIndex ? toIndex : toIndex - 1,
            0,
            musicQueue[fromIndex],
        );
        trackPlayer.setMusicQueue(newData);
    };

    useEffect(() => {
        setActiveItems(new Set());
    }, [musicQueue]);

    return (
        <Base width={"420px"} scrollable={false} coverHeader={coverHeader}>
            <div className="playlist--header">
                <div className="playlist--title">
                    <Trans
                        i18nKey={"panel.play_list_song_num"}
                        values={{
                            number: musicQueue.length,
                        }}
                    ></Trans>
                </div>
                <div
                    role="button"
                    data-type='normalButton'
                    onClick={() => {
                        trackPlayer.reset();
                    }}
                >
                    {t("common.clear")}
                </div>
            </div>
            <div className="playlist--divider"></div>
            <div className="playlist--music-list-container" ref={scrollElementRef}>
                <Condition condition={musicQueue.length !== 0} falsy={<Empty></Empty>}>
                    <div
                        className="playlist--music-list-scroll"
                        style={{
                            height: virtualController.totalHeight,
                        }}
                        tabIndex={-1}
                        onFocus={() => {
                            hotkeys.setScope("play-list");
                        }}
                        onBlur={() => {
                            hotkeys.setScope("all");
                        }}
                    >
                        {virtualController.virtualItems.map((virtualItem) => {
                            const musicItem = virtualItem.dataItem;
                            const rowIndex = virtualItem.rowIndex;
                            return (
                                <div
                                    key={virtualItem.rowIndex}
                                    style={{
                                        position: "absolute",
                                        left: 0,
                                        right: 0,
                                        top: virtualItem.top,
                                    }}
                                    draggable
                                    onDragStart={(e) => {
                                        startDrag(e, rowIndex, DRAG_TAG);
                                    }}
                                    onDoubleClick={() => {
                                        trackPlayer.playMusic(musicItem);
                                    }}
                                    onContextMenu={(e) => {
                                        if (
                                            activeItems.size > 1
                                        ) {
                                            const selectedItems: IMusic.IMusicItem[] = [];

                                            activeItems.forEach(item => {
                                                selectedItems.push(musicQueue[item]);
                                            });

                                            showMusicContextMenu(
                                                selectedItems,
                                                e.clientX,
                                                e.clientY,
                                                "play-list",
                                            );
                                        } else {
                                            lastActiveIndexRef.current = virtualItem.rowIndex;
                                            setActiveItems(new Set([virtualItem.rowIndex]));
                                            showMusicContextMenu(
                                                musicItem,
                                                e.clientX,
                                                e.clientY,
                                                "play-list",
                                            );
                                        }
                                    }}
                                    onClick={() => {
                                        // 如果点击的时候按下shift
                                        if (hotkeys.shift) {
                                            let start = lastActiveIndexRef.current;
                                            let end = virtualItem.rowIndex;

                                            if (start >= end) {
                                                [start, end] = [end, start];
                                            }

                                            if (end > musicQueue.length) {
                                                end = musicQueue.length - 1;
                                            }
                                            setActiveItems(
                                                new Set(
                                                    Array.from({ length: end - start + 1 }, (_, i) => start + i),
                                                ),
                                            );
                                        } else if (hotkeys.ctrl) {
                                            const newSet = new Set(activeItems);

                                            if (newSet.has(virtualItem.rowIndex)) {
                                                newSet.delete(virtualItem.rowIndex);
                                            } else {
                                                newSet.add(virtualItem.rowIndex);
                                            }
                                            setActiveItems(newSet);
                                        } else {
                                            setActiveItems(new Set([virtualItem.rowIndex]));
                                            lastActiveIndexRef.current = virtualItem.rowIndex;
                                        }
                                    }}
                                >
                                    <PlayListMusicItem
                                        key={getMediaPrimaryKey(musicItem)}
                                        isPlaying={isSameMedia(currentMusic, musicItem)}
                                        isActive={
                                            activeItems.has(virtualItem.rowIndex)
                                        }
                                        musicItem={musicItem}
                                    ></PlayListMusicItem>

                                    <IfTruthy condition={rowIndex === 0}>
                                        <DragReceiver
                                            position="top"
                                            rowIndex={0}
                                            tag={DRAG_TAG}
                                            insideTable
                                            onDrop={onDrop}
                                        ></DragReceiver>
                                    </IfTruthy>
                                    <DragReceiver
                                        position="bottom"
                                        rowIndex={rowIndex + 1}
                                        tag={DRAG_TAG}
                                        onDrop={onDrop}
                                    ></DragReceiver>
                                </div>
                            );
                        })}
                    </div>
                </Condition>
            </div>
        </Base>
    );
}

interface IPlayListMusicItemProps {
    isPlaying: boolean;
    musicItem: IMusic.IMusicItem;
    isActive?: boolean;
}

function _PlayListMusicItem(props: IPlayListMusicItemProps) {
    const { isPlaying, musicItem, isActive } = props;

    if (!musicItem) {
        return null;
    }

    return (
        <div
            className="play-list--music-item-container"
            style={{
                color: `var(--${isPlaying ? "primaryColor" : "textColor"})`,
            }}
            data-active={isActive}
        >
            <img
                className="playlist--artwork"
                src={musicItem.artwork ?? albumImg}
                onError={setFallbackAlbum}
                alt=""
            />
            <div className="playlist--meta">
                <div className="playlist--title" title={musicItem?.title}>
                    <span>{musicItem?.title ?? "-"}</span>
                </div>
                <div
                    className="playlist--subtitle"
                    title={[musicItem.artist, musicItem.album, musicItem.platform]
                        .filter(Boolean)
                        .join(" · ")}
                >
                    {[musicItem.artist, musicItem.album, musicItem.platform]
                        .filter(Boolean)
                        .join(" · ") || "未知歌手"}
                </div>
            </div>
            <div className="playlist--trailing">
                <span className="playlist--duration">
                    <MusicDuration musicItem={musicItem} />
                </span>
            </div>
            <div
                className="playlist--remove"
                role="button"
                onClick={(event) => {
                    event.stopPropagation();
                    trackPlayer.removeMusic(musicItem);
                }}
            >
                <SvgAsset iconName="x-mark" size={16}></SvgAsset>
            </div>
        </div>
    );
}

const PlayListMusicItem = memo(
    _PlayListMusicItem,
    (prev, curr) =>
        prev.isPlaying === curr.isPlaying &&
        prev.musicItem === curr.musicItem &&
        prev.isActive === curr.isActive,
);
