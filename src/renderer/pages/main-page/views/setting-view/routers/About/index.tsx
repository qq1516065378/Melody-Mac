import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import checkUpdate from "@/renderer/utils/check-update";
import { appUtil } from "@shared/utils/renderer";
import "./index.scss";

export default function About() {
    const { t } = useTranslation();
    const [checking, setChecking] = useState(false);
    const [appVersion, setAppVersion] = useState("");

    useEffect(() => {
        appUtil.getAppVersion().then((v) => setAppVersion(v));
    }, []);

    const handleCheckUpdate = async () => {
        if (checking) return;
        setChecking(true);
        try {
            const hasUpdate = await checkUpdate(true, false);
            if (hasUpdate) {
                toast.success(t("modal.new_version_found"));
            } else {
                toast.success(t("settings.about.already_latest"));
            }
        } catch (e: any) {
            toast.error(t("settings.about.check_failed"));
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="setting-view--about-container">
            <div className="about-brand">Melody</div>
            <div className="about-version">v{appVersion}</div>
            <div className="about-copy">
                基于 MusicFree 开发，软件基于 AGPL-3.0 协议开源
            </div>
            <div className="about-copy">
                音源使用"元力菌"MusicFree 音源
            </div>
            <div className="about-copy about-notice">
                仅做学习交流使用，禁止商业用途，侵权与开发者无关
            </div>
            <div
                role="button"
                data-type="primaryButton"
                className="about-check-update-btn"
                onClick={handleCheckUpdate}
                style={{
                    opacity: checking ? 0.6 : 1,
                    cursor: checking ? "not-allowed" : "pointer",
                    pointerEvents: checking ? "none" : "auto",
                }}
            >
                {checking ? t("common.loading") : t("settings.about.check_update")}
            </div>
        </div>
    );
}
