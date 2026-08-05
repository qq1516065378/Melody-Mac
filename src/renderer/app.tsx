import AppHeader from "./components/Header";

import "./app.scss";
import MusicBar from "./components/MusicBar";
import { Outlet, useLocation } from "react-router";
import PanelComponent, { hidePanel } from "./components/Panel";
import MusicDetail from "@renderer/components/MusicDetail";
import { useEffect } from "react";

export default function App() {
    const location = useLocation();

    // 路由切换时自动关闭面板
    useEffect(() => {
        hidePanel();
    }, [location.pathname]);

    return (
        <div className="app-container">
            <AppHeader></AppHeader>
            <div className="body-container">
                <Outlet></Outlet>
                <PanelComponent></PanelComponent>
            </div>
            <MusicDetail></MusicDetail>
            <MusicBar></MusicBar>
        </div>
    );
}
