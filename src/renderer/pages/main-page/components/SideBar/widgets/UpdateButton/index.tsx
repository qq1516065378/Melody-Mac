import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import updateStore, {
    setDownloadedPath,
    setDownloadError,
    setDownloadProgress,
    setDownloadStatus,
    clearUpdateInfo } from "@/renderer/core/update/store";
import { appUtil, shellUtil } from "@shared/utils/renderer";
import { setUserPreference } from "@/renderer/utils/user-perference";
import "./index.scss";

export default function UpdateButton() {
    const { t } = useTranslation();
    const updateState = updateStore.useValue();
    const [showTooltip, setShowTooltip] = useState(false);
    const unsubRef = useRef<Array<() => void>>([]);
    const hideTooltipTimer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            unsubRef.current.forEach((unsub) => unsub());
            if (hideTooltipTimer.current) {
                clearTimeout(hideTooltipTimer.current);
            }
        };
    }, []);

    const handleMouseEnter = () => {
        if (hideTooltipTimer.current) {
            clearTimeout(hideTooltipTimer.current);
        }
        setShowTooltip(true);
    };

    const handleMouseLeave = () => {
        hideTooltipTimer.current = setTimeout(() => {
            setShowTooltip(false);
        }, 200);
    };

    const startDownload = () => {
        const update = updateState.updateInfo?.update;
        if (!update?.download?.length) {
            if (update?.download?.[0]) {
                shellUtil.openExternal(update.download[0]);
            }
            return;
        }

        setDownloadStatus("downloading");
        setDownloadProgress(null);

        unsubRef.current.forEach((unsub) => unsub());
        unsubRef.current = [];

        const unsubProgress = appUtil.onUpdateDownloadProgress((p) => {
            setDownloadProgress(p);
        });
        const unsubDownloaded = appUtil.onUpdateDownloaded((filePath) => {
            setDownloadedPath(filePath);
        });
        const unsubError = appUtil.onUpdateDownloadError((err) => {
            setDownloadError(err);
        });

        unsubRef.current = [unsubProgress, unsubDownloaded, unsubError];
        appUtil.startDownloadUpdate(update.download);
    };

    const handleInstall = () => {
        appUtil.installUpdate();
    };

    const handleClick = () => {
        if (updateState.downloadStatus === "idle" || updateState.downloadStatus === "error") {
            startDownload();
        } else if (updateState.downloadStatus === "downloaded") {
            handleInstall();
        }
    };

    const handleSkip = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (updateState.updateInfo?.update?.version) {
            setUserPreference("skipVersion", updateState.updateInfo.update.version);
        }
        clearUpdateInfo();
    };

    const getButtonLabel = () => {
        switch (updateState.downloadStatus) {
            case "downloading":
                if (updateState.downloadProgress?.percent != null && updateState.downloadProgress.percent >= 0) {
                    return `${Math.round(updateState.downloadProgress.percent)}%`;
                }
                return "···";
            case "downloaded":
                return "安装";
            case "error":
                return "重试";
            default:
                return t("common.update");
        }
    };

    const getTooltipTitle = () => {
        switch (updateState.downloadStatus) {
            case "downloading":
                if (updateState.downloadProgress?.percent != null && updateState.downloadProgress.percent >= 0) {
                    return `${t("common.downloading")} ${Math.round(updateState.downloadProgress.percent)}%`;
                }
                return t("common.downloading");
            case "downloaded":
                return t("modal.install_now");
            case "error":
                return t("modal.retry_download");
            default:
                return t("modal.new_version_found");
        }
    };

    const update = updateState.updateInfo?.update;
    if (!updateState.hasUpdate || !update) {
        return null;
    }

    return (
        <div
            className="update-button-wrapper"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <button
                type="button"
                className="update-button"
                title={getTooltipTitle()}
                onClick={handleClick}
                disabled={updateState.downloadStatus === "downloading"}
            >
                {getButtonLabel()}
                {updateState.downloadStatus === "downloading" && updateState.downloadProgress && (
                    <div className="update-progress-bar">
                        <div
                            className="update-progress-fill"
                            style={{
                                width: `${updateState.downloadProgress.percent || 0}%`,
                            }}
                        />
                    </div>
                )}
            </button>

            {showTooltip && (
                <div className="update-tooltip" onClick={(e) => e.stopPropagation()}>
                    <div className="update-tooltip-header">
                        <span>{t("modal.new_version_found")}</span>
                        <span className="update-tooltip-version">v{update.version}</span>
                    </div>
                    {update.changeLog.length > 0 && (
                        <div className="update-tooltip-changelog">
                            {update.changeLog.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="update-tooltip-changelog-item">
                                    • {item}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="update-tooltip-footer">
                        <span
                            className="update-tooltip-skip"
                            onClick={handleSkip}
                        >
                            {t("modal.skip_this_version")}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
