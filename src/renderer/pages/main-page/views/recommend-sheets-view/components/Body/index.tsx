import { useEffect, useState } from "react";
import "./index.scss";
import classNames from "@/renderer/utils/classnames";
import useRecommendListTags from "../../hooks/useRecommendListTags";
import TagPanel from "./tag-panel";
import useRecommendSheets from "../../hooks/useRecommendSheets";
import MusicSheetlikeList from "@/renderer/components/MusicSheetlikeList";
import Condition from "@/renderer/components/Condition";
import { RequestStateCode } from "@/common/constant";
import Loading from "@/renderer/components/Loading";
import { useNavigate } from "react-router-dom";
import { i18n } from "@/shared/i18n/renderer";
import { useTranslation } from "react-i18next";
import { setFallbackAlbum } from "@/renderer/utils/img-on-error";
import albumImg from "@/assets/imgs/album-cover.jpg";

export function getDefaultTag(): IMedia.IUnique {
    return {
        title: i18n.t("common.default"),
        id: "",
    };
}

interface IBodyProps {
    plugin: IPlugin.IPluginDelegate;
}

export default function Body(props: IBodyProps) {
    const { plugin } = props;
    // 选中的tag
    const [selectedTag, setSelectedTag] = useState<IMedia.IUnique | null>(null);

    // 第一个tag
    const [firstTag, setFirstTag] = useState<IMedia.IUnique>(getDefaultTag);

    const tags = useRecommendListTags(plugin);
    //   const tags: any[] = [];

    const [showPanel, setShowPanel] = useState(false);

    const [query, sheets, status] = useRecommendSheets(plugin, selectedTag);

    const navigate = useNavigate();
    const { t } = useTranslation();

    function openSheet(sheetItem: IMusic.IMusicSheetItem) {
        navigate(
            `/main/musicsheet/${encodeURIComponent(sheetItem.platform)}/${encodeURIComponent(sheetItem.id)}`,
            {
                state: {
                    sheetItem: sheetItem,
                },
            },
        );
    }

    const featuredSheets = sheets?.slice(0, 5) ?? [];
    const remainingSheets = sheets?.length > 5 ? sheets.slice(5) : sheets;

    useEffect(() => {
        if (tags) {
            const cachedTag = history.state?.usr?.tag;
            if (cachedTag) {
                if (tags.pinned?.findIndex?.((it) => it.id === cachedTag.id) === -1) {
                    setFirstTag(cachedTag);
                }
                setSelectedTag(cachedTag);
            } else {
                setSelectedTag(getDefaultTag);
            }
        }
    }, [tags]);

    return (
        <div className="recommend-sheet-view--body-container">
            <h1 className="recommend-sheet-title">{t("recommend_page.for_you_today")}</h1>
            <div className="tags-container">
                <TagPanel
                    show={showPanel}
                    tagsGroups={tags?.data}
                    onTagClick={(tag) => {
                        setSelectedTag(tag);
                        setFirstTag(tag);
                        const usr = history.state.usr ?? {};

                        navigate("", {
                            replace: true,
                            state: {
                                ...usr,
                                tag: tag,
                            },
                        });
                        setShowPanel(false);
                    }}
                ></TagPanel>
                <div
                    className={classNames({
                        "first-tag": true,
                        highlight: selectedTag?.id === firstTag.id,
                    })}
                    role="button"
                    data-type="normalButton"
                    data-panel-open={showPanel}
                    title={firstTag.title}
                    onClick={() => {
                        setShowPanel((prev) => !prev);
                    }}
                >
                    {firstTag.title}
                </div>
                {tags?.pinned?.map?.((tag) => (
                    <div
                        key={tag.id}
                        className={classNames({
                            "pinned-tag": true,
                            highlight: selectedTag?.id === tag.id,
                        })}
                        role="button"
                        data-type="normalButton"
                        title={tag.title}
                        onClick={() => {
                            setSelectedTag(tag);
                            const usr = history.state.usr ?? {};

                            navigate("", {
                                replace: true,
                                state: {
                                    ...usr,
                                    tag: tag,
                                },
                            });
                        }}
                    >
                        {tag.title}
                    </div>
                ))}
            </div>
            <Condition condition={featuredSheets.length !== 0}>
                <div className="recommend-featured-grid">
                    {featuredSheets.map((sheetItem, index) => {
                        const artwork = sheetItem.artwork || sheetItem.coverImg || albumImg;

                        if (index === 0) {
                            return (
                                <div
                                    key={`${sheetItem.platform}-${sheetItem.id}`}
                                    className="recommend-hero-card"
                                    role="button"
                                    onClick={() => openSheet(sheetItem)}
                                >
                                    <div className="hero-copy">
                                        <span className="hero-eyebrow">
                                            {t("recommend_page.daily_pick")}
                                        </span>
                                        <strong title={sheetItem.title}>{sheetItem.title}</strong>
                                        <span className="hero-description">
                                            {sheetItem.description || sheetItem.artist || sheetItem.platform}
                                        </span>
                                        <span className="hero-open-action">{t("common.open")}</span>
                                    </div>
                                    <div className="hero-artwork-wrap">
                                        <div className="hero-record"></div>
                                        <img
                                            src={artwork}
                                            onError={setFallbackAlbum}
                                            alt={sheetItem.title}
                                        ></img>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div
                                key={`${sheetItem.platform}-${sheetItem.id}`}
                                className="recommend-feature-card"
                                role="button"
                                onClick={() => openSheet(sheetItem)}
                            >
                                <img
                                    src={artwork}
                                    onError={setFallbackAlbum}
                                    alt={sheetItem.title}
                                ></img>
                                <div className="feature-card-shade"></div>
                                <div className="feature-card-copy">
                                    <strong title={sheetItem.title}>{sheetItem.title}</strong>
                                    <span>{sheetItem.artist || sheetItem.platform}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Condition>
            <h2 className="recommend-list-title">{t("recommend_page.playlist_selection")}</h2>
            <div className="list-container">
                <Condition
                    condition={status !== RequestStateCode.PENDING_FIRST_PAGE}
                    falsy={<Loading></Loading>}
                >
                    <MusicSheetlikeList
                        data={remainingSheets}
                        state={status}
                        onLoadMore={() => {
                            query();
                        }}
                        onClick={(sheetItem) => {
                            openSheet(sheetItem);
                        }}
                    ></MusicSheetlikeList>
                </Condition>
            </div>
        </div>
    );
}
