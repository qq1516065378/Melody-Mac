import type fs from "fs/promises";
import type rimraf from "rimraf";

interface IMod {
    fs: {
        writeFile(...args: Parameters<typeof fs.writeFile>): ReturnType<typeof fs.writeFile>;
        readFile(...args: Parameters<typeof fs.readFile>): ReturnType<typeof fs.readFile>;
        isFile: (path: string) => Promise<boolean>;
        isFolder: (path: string) => Promise<boolean>;
        rimraf: typeof rimraf.rimraf;
        addFileScheme: (filePath: string) => string;
    },
    app: {
        exitApp: () => void;
        getPath: (pathName: "home" | "appData" | "userData" | "sessionData" | "temp" | "exe" | "module" | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos" | "recent" | "logs" | "crashDumps") => Promise<string>;
        getAppVersion: () => Promise<string>;
        checkUpdate: () => Promise<ICommon.IUpdateInfo>;
        startDownloadUpdate: (downloadUrls: string[]) => Promise<boolean>;
        installUpdate: () => void;
        onUpdateDownloadProgress: (callback: (progress: ICommon.IUpdateDownloadProgress) => void) => () => void;
        onUpdateDownloaded: (callback: (filePath: string) => void) => () => void;
        onUpdateDownloadError: (callback: (error: string) => void) => () => void;
        clearCache: () => void;
        getCacheSize: () => Promise<number>;
    }
    appWindow: {
        minMainWindow: (skipTaskBar?: boolean) => void;
        showMainWindow: () => void;
        setLyricWindow: (enabled: boolean) => void;
        setMinimodeWindow: (enabled: boolean) => void;
        setLyricWindowLock: (lockState: boolean) => void;
        ignoreMouseEvent: (ignore: boolean) => void;
        toggleMainWindowVisible: () => void;
        toggleMainWindowMaximize: () => void;
    },
    shell: {
        openExternal: (url: string) => void;
        openPath: (path: string) => void;
        showItemInFolder: (path: string) => Promise<boolean>;
    },
    dialog: {
        showOpenDialog(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue>;
        showSaveDialog(options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue>;
    }

}

const utils = window["@shared/utils" as any] as unknown as IMod;


export default utils;
export const { fs: fsUtil, app: appUtil, appWindow: appWindowUtil, shell: shellUtil, dialog: dialogUtil } = utils;
