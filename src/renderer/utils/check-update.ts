import { compare } from "compare-versions";
import { showModal } from "../components/Modal";
import { getUserPreference } from "./user-perference";
import { appUtil } from "@shared/utils/renderer";
import { setUpdateInfo } from "../core/update/store";

export function showUpdateModal(updateInfo: ICommon.IUpdateInfo) {
    showModal("Update", {
        currentVersion: updateInfo.version,
        update: updateInfo.update,
    });
}

export default async function checkUpdate(forceCheck?: boolean, showModalDirectly?: boolean) {
    /** checkupdate */
    const updateInfo = await appUtil.checkUpdate();
    if (updateInfo.update) {
        const skipVersion = getUserPreference("skipVersion");
        if (
            !forceCheck &&
      skipVersion &&
      compare(updateInfo.version, skipVersion, "<=")
        ) {
            setUpdateInfo(null);
            return false;
        }
        setUpdateInfo(updateInfo);
        if (showModalDirectly) {
            showUpdateModal(updateInfo);
        }
        return true;
    }
    setUpdateInfo(null);
    return false;
}
