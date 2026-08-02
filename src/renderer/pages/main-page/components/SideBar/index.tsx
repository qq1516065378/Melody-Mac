import ListItem from "./widgets/ListItem";
import "./index.scss";
import MySheets from "./widgets/MySheets";
import { useMatch, useNavigate } from "react-router";
import StarredSheets from "./widgets/StarredSheets";
import { useTranslation } from "react-i18next";
import MusicDetail from "@/renderer/components/MusicDetail";
import SvgAsset from "@/renderer/components/SvgAsset";
import { createPortal } from "react-dom";
import UpdateButton from "./widgets/UpdateButton";

interface IProps {
    collapsed: boolean;
    onToggleCollapsed: () => void;
}

export default function SideBar(props: IProps) {
    const { collapsed, onToggleCollapsed } = props;
    const navigate = useNavigate();
    const routePathMatch = useMatch("/main/:routePath");
    const { t } = useTranslation();

    const featuredOptions = [
        {
            iconName: "fire",
            title: t("side_bar.recommend_sheets"),
            route: "recommend-sheets",
        },
        {
            iconName: "trophy",
            title: t("side_bar.toplist"),
            route: "toplist",
        },
        {
            iconName: "user",
            title: "歌手歌单",
            route: "artists",
        },
        {
            iconName: "folder-open",
            title: t("side_bar.local_music"),
            route: "local-music",
        },
    ] as const;

    const options = [
        {
            iconName: "clock",
            title: t("side_bar.recently_play"),
            route: "recently_play",
        },
        {
            iconName: "array-download-tray",
            title: t("side_bar.download_management"),
            route: "download",
        },
        {
            iconName: "code-bracket-square",
            title: t("side_bar.plugin_management"),
            route: "plugin-manager-view",
        },
    ] as const;

    const bottomActions = (
        <div className="side-bar-bottom-actions" data-collapsed={collapsed}>
            <div className="side-bar-bottom-actions-left">
                <button
                    type="button"
                    className="side-bar-collapse-button"
                    title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
                    aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
                    onClick={onToggleCollapsed}
                >
                    <SvgAsset
                        iconName={collapsed ? "collapse-circle-right" : "collapse-circle-left"}
                    ></SvgAsset>
                </button>
                <button
                    type="button"
                    title={t("app_header.settings")}
                    aria-label={t("app_header.settings")}
                    data-selected={routePathMatch?.params?.routePath === "setting"}
                    onClick={() => {
                        navigate("/main/setting");
                        MusicDetail.hide();
                    }}
                >
                    <SvgAsset iconName="settings-hex"></SvgAsset>
                </button>
                <button
                    type="button"
                    title={t("app_header.theme")}
                    aria-label={t("app_header.theme")}
                    data-selected={routePathMatch?.params?.routePath === "theme"}
                    onClick={() => {
                        navigate("/main/theme");
                        MusicDetail.hide();
                    }}
                >
                    <SvgAsset iconName="t-shirt-line"></SvgAsset>
                </button>
            </div>
            <div className="side-bar-bottom-spacer"></div>
            <UpdateButton></UpdateButton>
            <div className="side-bar-bottom-spacer"></div>
        </div>
    );

    return (
        <>
            <div className="side-bar-container" data-collapsed={collapsed}>
                <div className="side-bar-scroll-content">
                    <div className="side-bar-feature-grid">
                        {featuredOptions.map((item) => (
                            <ListItem
                                key={item.route}
                                variant="tile"
                                iconName={item.iconName}
                                title={item.title}
                                selected={routePathMatch?.params?.routePath === item.route}
                                onClick={() => {
                                    navigate(`/main/${item.route}`);
                                }}
                            ></ListItem>
                        ))}
                    </div>
                    <div className="side-bar-secondary-nav">
                        {options.map((item) => (
                            <ListItem
                                key={item.route}
                                iconName={item.iconName}
                                title={item.title}
                                selected={routePathMatch?.params?.routePath === item.route}
                                onClick={() => {
                                    navigate(`/main/${item.route}`);
                                }}
                            ></ListItem>
                        ))}
                    </div>
                    <MySheets></MySheets>
                    <StarredSheets></StarredSheets>
                </div>
            </div>
            {createPortal(bottomActions, document.body)}
        </>
    );
}
