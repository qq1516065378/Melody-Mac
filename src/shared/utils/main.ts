import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { IWindowManager } from "@/types/main/window-manager";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { appUpdateSources } from "@/common/constant";
import axios from "axios";
import { compare } from "compare-versions";

class Utils {
    private windowManager: IWindowManager;
    private downloadedUpdatePath: string | null = null;
    private downloadAbortController: AbortController | null = null;

    public setup(windowManager: IWindowManager) {
        this.windowManager = windowManager;

        this.setupAppUtil();
        this.setupWindowUtil();
        this.setupShellUtil();
        this.setupDialogUtil();
    }

    private sendUpdateEvent(channel: string, ...args: any[]) {
        const mainWindow = this.windowManager.mainWindow;
        if (mainWindow) {
            mainWindow.webContents.send(channel, ...args);
        }
    }

    private getDownloadUrlForPlatform(downloadUrls: string[]): string | null {
        const platform = process.platform;
        // Try to find a matching URL for current platform
        for (const url of downloadUrls) {
            const lowerUrl = url.toLowerCase();
            if (platform === "darwin" && (lowerUrl.endsWith(".dmg") || lowerUrl.endsWith(".zip"))) {
                return url;
            }
            if (platform === "win32" && (lowerUrl.endsWith(".exe") || lowerUrl.includes("setup"))) {
                return url;
            }
            if (platform === "linux" && (lowerUrl.endsWith(".deb") || lowerUrl.endsWith(".appimage") || lowerUrl.endsWith(".rpm"))) {
                return url;
            }
        }
        // Fallback: return first URL
        return downloadUrls[0] || null;
    }

    private async downloadUpdate(downloadUrls: string[]) {
        const url = this.getDownloadUrlForPlatform(downloadUrls);
        if (!url) {
            this.sendUpdateEvent("@shared/utils/update-download-error", "未找到适用于当前平台的安装包");
            return;
        }

        const tempDir = app.getPath("temp");
        const fileName = path.basename(url.split("?")[0]) || `update-${Date.now()}`;
        const savePath = path.join(tempDir, fileName);

        this.downloadAbortController = new AbortController();

        try {
            const response = await axios.get(url, {
                responseType: "stream",
                signal: this.downloadAbortController.signal,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                },
            });

            const totalSize = parseInt(response.headers["content-length"] || "0", 10);
            let downloadedSize = 0;
            const startTime = Date.now();
            const writer = createWriteStream(savePath);

            response.data.on("data", (chunk: Buffer) => {
                downloadedSize += chunk.length;
                const elapsed = (Date.now() - startTime) / 1000;
                this.sendUpdateEvent("@shared/utils/update-download-progress", {
                    percent: totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : -1,
                    transferred: downloadedSize,
                    total: totalSize,
                    bytesPerSecond: elapsed > 0 ? downloadedSize / elapsed : 0,
                } as ICommon.IUpdateDownloadProgress);
            });

            response.data.pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on("finish", resolve);
                writer.on("error", reject);
                response.data.on("error", reject);
            });

            this.downloadedUpdatePath = savePath;
            this.sendUpdateEvent("@shared/utils/update-downloaded", savePath);
        } catch (error: any) {
            if (error.name !== "CanceledError") {
                this.sendUpdateEvent("@shared/utils/update-download-error", error.message || "下载失败");
            }
        } finally {
            this.downloadAbortController = null;
        }
    }

    private installUpdate() {
        if (!this.downloadedUpdatePath) {
            return;
        }

        const filePath = this.downloadedUpdatePath;
        const platform = process.platform;

        setTimeout(() => {
            if (platform === "darwin") {
                // macOS: open DMG to mount it
                shell.openPath(filePath);
            } else if (platform === "win32") {
                // Windows: run the installer
                shell.openPath(filePath);
            } else {
                // Linux: open the file
                shell.openPath(filePath);
            }
            app.quit();
        }, 500);
    }

    private setupAppUtil() {
        ipcMain.on("@shared/utils/exit-app", () => {
            app.quit();
        });

        ipcMain.handle("@shared/utils/app-get-path", (_, pathName) => {
            return app.getPath(pathName);
        });

        ipcMain.handle("@shared/utils/get-app-version", () => {
            return app.getVersion();
        });

        ipcMain.handle("@shared/utils/check-update", async () => {
            const currentVersion = app.getVersion();
            const updateInfo: ICommon.IUpdateInfo = {
                version: currentVersion,
            };
            for (let i = 0; i < appUpdateSources.length; ++i) {
                try {
                    const rawInfo = (await axios.get(appUpdateSources[i], {
                        timeout: 10000,
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                        },
                    })).data;
                    if (compare(rawInfo.version, currentVersion, ">")) {
                        updateInfo.update = rawInfo;
                        return updateInfo;
                    }
                } catch {
                    // pass
                }
            }
            return updateInfo;
        });

        ipcMain.handle("@shared/utils/start-download-update", async (_, downloadUrls: string[]) => {
            this.downloadedUpdatePath = null;
            // Start download in background
            this.downloadUpdate(downloadUrls);
            return true;
        });

        ipcMain.on("@shared/utils/install-update", () => {
            this.installUpdate();
        });

        ipcMain.on("@shared/utils/clear-cache", () => {
            const mainWindow = this.windowManager.mainWindow;
            if (mainWindow) {
                mainWindow.webContents.session.clearCache?.();
            }
        });

        ipcMain.handle("@shared/utils/get-cache-size", async () => {
            const mainWindow = this.windowManager.mainWindow;
            if (mainWindow) {
                return mainWindow.webContents.session.getCacheSize?.();
            }
            return NaN;
        });
    }

    private setupWindowUtil() {
        ipcMain.on("@shared/utils/min-main-window", (_, { skipTaskBar }) => {
            const mainWindow = this.windowManager.mainWindow;
            if (mainWindow) {
                if (skipTaskBar) {
                    mainWindow.hide();
                    mainWindow.setSkipTaskbar(true);
                } else {
                    mainWindow.minimize();
                }
            }
        });

        ipcMain.on("@shared/utils/show-main-window", () => {
            this.windowManager.showMainWindow();
        });

        ipcMain.on("@shared/utils/set-lyric-window", (_, enabled) => {
            if (enabled) {
                this.windowManager.showLyricWindow();
            } else {
                this.windowManager.closeLyricWindow();
            }
        });

        ipcMain.on("@shared/utils/set-minimode-window", (_, enabled) => {
            if (enabled) {
                this.windowManager.showMiniModeWindow();
            } else {
                this.windowManager.closeMiniModeWindow();
            }
        });


        ipcMain.on("@shared/utils/ignore-mouse-event", (evt, ignore) => {
            const targetWindow = BrowserWindow.fromWebContents(evt.sender);
            if (!targetWindow) {
                return;
            }
            targetWindow.setIgnoreMouseEvents(ignore, {
                forward: true,
            });
        });

        ipcMain.on("@shared/utils/toggle-maximize-main-window", () => {
            const mainWindow = this.windowManager.mainWindow;

            if (mainWindow) {
                if (mainWindow.isMaximized()) {
                    mainWindow.unmaximize();
                } else {
                    mainWindow.maximize();
                }
            }
        });

        ipcMain.on("@shared/utils/toggle-main-window-visible", () => {
            const mainWindow = this.windowManager.mainWindow;

            if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
                mainWindow.show();
            } else {
                mainWindow.hide();
                mainWindow.setSkipTaskbar(true);
            }
        });

    }

    private setupShellUtil() {
        ipcMain.on("@shared/utils/open-url", (_, url) => {
            shell.openExternal(url);
        });

        ipcMain.on("@shared/utils/open-path", (_, path) => {
            shell.openPath(path);
        });

        ipcMain.handle("@shared/utils/show-item-in-folder", async (_, path) => {
            try {
                await fs.stat(path);
                shell.showItemInFolder(path);
                return true;
            } catch {
                return false;
            }
        });
    }

    private setupDialogUtil() {
        ipcMain.handle("@shared/utils/show-open-dialog", async (_, options) => {
            const mainWindow = this.windowManager.mainWindow;
            if (!mainWindow) {
                throw new Error("Invalid Window");
            }
            return dialog.showOpenDialog(options);
        });

        ipcMain.handle("@shared/utils/show-save-dialog", async (_, options) => {
            const mainWindow = this.windowManager.mainWindow;
            if (!mainWindow) {
                throw new Error("Invalid Window");
            }
            return dialog.showSaveDialog(options);
        });
    }

}


export default new Utils();
