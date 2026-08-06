import { app, BrowserWindow, dialog, ipcMain, shell, net } from "electron";
import { IWindowManager } from "@/types/main/window-manager";
import fs from "fs/promises";
import { createWriteStream, existsSync } from "fs";
import path from "path";
import { appUpdateSources } from "@/common/constant";
import axios from "axios";
import { compare } from "compare-versions";
import { execSync, spawn } from "child_process";

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
        // 检查是否为Windows平台的安装包（避免darwin误匹配：d-a-r-**w-i-n**）
        const isWindowsPackage = (url: string) => /(win32|win64|windows|-win\b|\/win\b)/i.test(url);

        for (const url of downloadUrls) {
            const lowerUrl = url.toLowerCase();
            if (platform === "darwin") {
                // Mac: dmg, pkg, zip（排除Windows包）
                const isMacCompatible = lowerUrl.endsWith(".dmg") || lowerUrl.endsWith(".pkg") || lowerUrl.endsWith(".zip");
                if (isMacCompatible && !isWindowsPackage(url)) {
                    return url;
                }
            }
            if (platform === "win32") {
                if (lowerUrl.endsWith(".exe") || lowerUrl.includes("setup") || (lowerUrl.endsWith(".zip") && isWindowsPackage(url))) {
                    return url;
                }
            }
            if (platform === "linux") {
                if (lowerUrl.endsWith(".deb") || lowerUrl.endsWith(".appimage") || lowerUrl.endsWith(".rpm")) {
                    return url;
                }
            }
        }
        // 没有找到匹配当前平台的安装包
        return null;
    }

    private async downloadUpdate(downloadUrls: string[]) {
        // Abort any previous download before starting a new one
        if (this.downloadAbortController) {
            this.downloadAbortController.abort();
            this.downloadAbortController = null;
        }

        const url = this.getDownloadUrlForPlatform(downloadUrls);
        if (!url) {
            this.sendUpdateEvent("@shared/utils/update-download-error", "未找到适用于当前平台的安装包");
            return;
        }

        const tempDir = app.getPath("temp");
        const fileName = path.basename(url.split("?")[0]) || `update-${Date.now()}`;
        const savePath = path.join(tempDir, fileName);

        const abortController = new AbortController();
        this.downloadAbortController = abortController;

        try {
            await new Promise<void>((resolve, reject) => {
                const request = net.request({
                    method: "GET",
                    url: url,
                    redirect: "follow",
                });
                request.setHeader("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");

                let totalSize = 0;
                let downloadedSize = 0;
                const startTime = Date.now();
                const writer = createWriteStream(savePath);
                let hasError = false;

                abortController.signal.addEventListener("abort", () => {
                    request.abort();
                    writer.close();
                    reject(new Error("aborted"));
                });

                request.on("response", (response) => {
                    if (response.statusCode >= 400) {
                        hasError = true;
                        reject(new Error(`HTTP ${response.statusCode}`));
                        return;
                    }

                    const contentLength = response.headers["content-length"];
                    totalSize = parseInt(Array.isArray(contentLength) ? contentLength[0] : (contentLength || "0"), 10);

                    response.on("data", (chunk: Buffer) => {
                        if (hasError) return;
                        downloadedSize += chunk.length;
                        writer.write(chunk);
                        const elapsed = (Date.now() - startTime) / 1000;
                        this.sendUpdateEvent("@shared/utils/update-download-progress", {
                            percent: totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : -1,
                            transferred: downloadedSize,
                            total: totalSize,
                            bytesPerSecond: elapsed > 0 ? downloadedSize / elapsed : 0,
                        } as ICommon.IUpdateDownloadProgress);
                    });

                    response.on("end", () => {
                        if (hasError) return;
                        writer.end(() => {
                            resolve();
                        });
                    });

                    response.on("error", (err: Error) => {
                        hasError = true;
                        writer.close();
                        reject(err);
                    });
                });

                request.on("error", (err: Error) => {
                    hasError = true;
                    writer.close();
                    reject(err);
                });

                writer.on("error", (err: Error) => {
                    hasError = true;
                    reject(err);
                });

                request.end();
            });

            this.downloadedUpdatePath = savePath;
            this.sendUpdateEvent("@shared/utils/update-downloaded", savePath);
        } catch (error: any) {
            // Only report error if this is still the active download (not aborted by a retry)
            if (this.downloadAbortController === abortController && error.message !== "aborted") {
                this.sendUpdateEvent("@shared/utils/update-download-error", error.message || "下载失败");
            }
        } finally {
            if (this.downloadAbortController === abortController) {
                this.downloadAbortController = null;
            }
        }
    }

    private async installMacOSUpdate(dmgPath: string): Promise<boolean> {
        const appName = path.basename(app.getPath("exe")).replace(/\.app\/.*/, ".app");
        const targetAppPath = `/Applications/${appName}`;

        try {
            // 1. 挂载 DMG
            const attachOutput = execSync(`hdiutil attach "${dmgPath}" -nobrowse -readonly`, {
                encoding: "utf-8",
                timeout: 30000,
            });

            // 解析挂载点
            const mountMatch = attachOutput.match(/\/Volumes\/[^\n]+/);
            if (!mountMatch) {
                throw new Error("无法挂载DMG镜像");
            }
            const mountPoint = mountMatch[0].trim();

            // 2. 在挂载卷中找到 .app
            const volumeContents = execSync(`ls "${mountPoint}"`, { encoding: "utf-8" });
            const appMatch = volumeContents.match(/[^\n]+\.app/);
            if (!appMatch) {
                execSync(`hdiutil detach "${mountPoint}" -force`, { stdio: "pipe" });
                throw new Error("DMG中未找到应用");
            }
            const sourceAppPath = path.join(mountPoint, appMatch[0].trim());

            // 3. 如果目标位置已有旧版，先删除
            if (existsSync(targetAppPath)) {
                await fs.rm(targetAppPath, { recursive: true, force: true });
            }

            // 4. 使用 ditto 复制新 .app 到 /Applications（保留代码签名）
            execSync(`ditto "${sourceAppPath}" "${targetAppPath}"`, { timeout: 60000 });

            // 5. 卸载 DMG
            execSync(`hdiutil detach "${mountPoint}" -force`, { stdio: "pipe" });

            // 6. 清理下载的 DMG
            await fs.unlink(dmgPath).catch(() => {});

            return true;
        } catch (e: any) {
            console.error("macOS update install failed:", e);
            return false;
        }
    }

    private installUpdate() {
        if (!this.downloadedUpdatePath) {
            return;
        }

        const filePath = this.downloadedUpdatePath;
        const platform = process.platform;

        setTimeout(async () => {
            if (platform === "darwin") {
                const ext = path.extname(filePath).toLowerCase();
                if (ext === ".dmg") {
                    // DMG: 自动挂载、复制到/Applications、重启
                    const success = await this.installMacOSUpdate(filePath);
                    if (success) {
                        // 启动新版本
                        const appName = path.basename(app.getPath("exe")).replace(/\.app\/.*/, ".app");
                        const newAppPath = `/Applications/${appName}`;
                        spawn("open", [newAppPath], {
                            detached: true,
                            stdio: "ignore",
                        });
                        app.quit();
                    } else {
                        // 自动安装失败，退回到打开DMG让用户手动安装
                        shell.openPath(filePath);
                        dialog.showMessageBox({
                            type: "info",
                            title: "更新已下载",
                            message: "请将Melody.app拖拽到Applications文件夹完成安装",
                            detail: "自动安装失败，已为您打开DMG安装包。",
                        });
                        app.quit();
                    }
                } else {
                    // ZIP/PKG等其他格式：打开文件让用户手动处理
                    shell.openPath(filePath);
                    app.quit();
                }
            } else if (platform === "win32") {
                // Windows: run the installer
                shell.openPath(filePath);
                app.quit();
            } else {
                // Linux: open the file
                shell.openPath(filePath);
                app.quit();
            }
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
                        // 检查是否有当前平台的安装包
                        const downloadUrls: string[] = [];
                        if (Array.isArray(rawInfo.download)) {
                            downloadUrls.push(...rawInfo.download);
                        } else if (rawInfo.download) {
                            downloadUrls.push(rawInfo.download);
                        }
                        if (this.getDownloadUrlForPlatform(downloadUrls)) {
                            updateInfo.update = rawInfo;
                            return updateInfo;
                        }
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
