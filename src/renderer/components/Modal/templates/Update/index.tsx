import { setUserPreference } from "@/renderer/utils/user-perference";
import Base from "../Base";
import "./index.scss";
import { hideModal } from "../..";
import { useTranslation } from "react-i18next";
import { appUtil, shellUtil } from "@shared/utils/renderer";
import { useEffect, useRef, useState } from "react";
import { clearUpdateInfo } from "@/renderer/core/update/store";

interface IUpdateProps {
    currentVersion: string;
    update: ICommon.IUpdateInfo["update"];
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

function formatSpeed(bytesPerSecond: number): string {
    return formatSize(bytesPerSecond) + "/s";
}

export default function Update(props: IUpdateProps) {
    const { currentVersion, update = {} as ICommon.IUpdateInfo["update"] } = props;
    const { t } = useTranslation();

    const [status, setStatus] = useState<ICommon.UpdateDownloadStatus>("idle");
    const [progress, setProgress] = useState<ICommon.IUpdateDownloadProgress | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>("");
    const [downloadedPath, setDownloadedPath] = useState<string>("");

    const unsubRef = useRef<Array<() => void>>([]);

    useEffect(() => {
        return () => {
            unsubRef.current.forEach(unsub => unsub());
        };
    }, []);

    const startDownload = () => {
        if (!update?.download?.length) {
            shellUtil.openExternal(update.download[0]);
            return;
        }

        setStatus("downloading");
        setErrorMsg("");
        setProgress(null);
        setDownloadedPath("");

        // Unsubscribe previous listeners
        unsubRef.current.forEach(unsub => unsub());
        unsubRef.current = [];

        const unsubProgress = appUtil.onUpdateDownloadProgress((p) => {
            setProgress(p);
        });
        const unsubDownloaded = appUtil.onUpdateDownloaded((filePath) => {
            setStatus("downloaded");
            setDownloadedPath(filePath);
        });
        const unsubError = appUtil.onUpdateDownloadError((err) => {
            setStatus("error");
            setErrorMsg(err);
        });

        unsubRef.current = [unsubProgress, unsubDownloaded, unsubError];
        appUtil.startDownloadUpdate(update.download);
    };

    const handleInstall = () => {
        appUtil.installUpdate();
    };

    const getButtonContent = () => {
        switch (status) {
            case "idle":
                return t("common.update");
            case "downloading":
                if (progress) {
                    if (progress.percent >= 0) {
                        return `${t("common.downloading")} ${progress.percent}%`;
                    } else {
                        return t("common.downloading");
                    }
                }
                return t("common.downloading");
            case "downloaded":
                return t("modal.install_now");
            case "error":
                return t("modal.retry_download");
            default:
                return t("common.update");
        }
    };

    const handleButtonClick = () => {
        if (status === "idle" || status === "error") {
            startDownload();
        } else if (status === "downloaded") {
            handleInstall();
        }
    };

    const isButtonDisabled = status === "downloading";

    return (
        <Base withBlur defaultClose>
            <div className="modal--update-container shadow backdrop-color">
                <Base.Header>{t("modal.new_version_found")}</Base.Header>
                <div className="modal--body-container">
                    <div className="version highlight">
                        {t("modal.latest_version")}
                        {update.version}
                    </div>
                    <div className="version">
                        {t("modal.current_version")}
                        {currentVersion}
                    </div>
                    <div className="divider"></div>
                    {update.changeLog.map((item, index) => (
                        <p key={index}>{item}</p>
                    ))}

                    {status === "downloading" && (
                        <div className="download-progress">
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{
                                        width: progress && progress.percent >= 0
                                            ? `${progress.percent}%`
                                            : "0%",
                                    }}
                                ></div>
                            </div>
                            <div className="progress-info">
                                {progress ? (
                                    <span>
                                        {formatSize(progress.transferred)} / {formatSize(progress.total)}
                                        {" · "}
                                        {formatSpeed(progress.bytesPerSecond)}
                                    </span>
                                ) : (
                                    <span>{t("modal.preparing_download")}</span>
                                )}
                            </div>
                        </div>
                    )}

                    {status === "downloaded" && (
                        <div className="download-complete">
                            <p>{t("modal.download_complete")}</p>
                        </div>
                    )}

                    {status === "error" && (
                        <div className="download-error">
                            <p>{t("modal.download_failed")}: {errorMsg}</p>
                            <p style={{ fontSize: "12px", opacity: 0.7 }}>
                                {t("modal.or_manual_download")}
                            </p>
                        </div>
                    )}
                </div>
                <div className="divider"></div>
                <div className="footer-options">
                    {status === "error" && (
                        <div
                            role="button"
                            data-type="normalButton"
                            onClick={() => {
                                shellUtil.openExternal(update.download[0]);
                            }}
                        >
                            {t("modal.manual_download")}
                        </div>
                    )}
                    <div
                        role="button"
                        data-type="normalButton"
                        onClick={() => {
                            setUserPreference("skipVersion", update.version);
                            clearUpdateInfo();
                            hideModal();
                        }}
                    >
                        {t("modal.skip_this_version")}
                    </div>
                    <div
                        role="button"
                        data-type="primaryButton"
                        onClick={handleButtonClick}
                        style={{
                            opacity: isButtonDisabled ? 0.6 : 1,
                            cursor: isButtonDisabled ? "not-allowed" : "pointer",
                        }}
                    >
                        {getButtonContent()}
                    </div>
                </div>
            </div>
        </Base>
    );
}
