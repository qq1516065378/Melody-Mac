import Store from "@/common/store";

interface IUpdateState {
    hasUpdate: boolean;
    updateInfo: ICommon.IUpdateInfo | null;
    downloadStatus: ICommon.UpdateDownloadStatus;
    downloadProgress: ICommon.IUpdateDownloadProgress | null;
    errorMsg: string;
    downloadedPath: string;
}

const initialState: IUpdateState = {
    hasUpdate: false,
    updateInfo: null,
    downloadStatus: "idle",
    downloadProgress: null,
    errorMsg: "",
    downloadedPath: "",
};

const updateStore = new Store<IUpdateState>(initialState);

export function setUpdateInfo(info: ICommon.IUpdateInfo | null) {
    updateStore.setValue({
        ...initialState,
        hasUpdate: !!info?.update,
        updateInfo: info,
    });
}

export function clearUpdateInfo() {
    updateStore.setValue(initialState);
}

export function setDownloadStatus(status: ICommon.UpdateDownloadStatus) {
    updateStore.setValue((prev) => ({
        ...prev,
        downloadStatus: status,
    }));
}

export function setDownloadProgress(progress: ICommon.IUpdateDownloadProgress | null) {
    updateStore.setValue((prev) => ({
        ...prev,
        downloadProgress: progress,
    }));
}

export function setDownloadError(msg: string) {
    updateStore.setValue((prev) => ({
        ...prev,
        errorMsg: msg,
        downloadStatus: "error",
    }));
}

export function setDownloadedPath(path: string) {
    updateStore.setValue((prev) => ({
        ...prev,
        downloadedPath: path,
        downloadStatus: "downloaded",
    }));
}

export default updateStore;
