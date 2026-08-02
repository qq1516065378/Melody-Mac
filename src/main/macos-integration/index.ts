import { app, Menu, MenuItemConstructorOptions } from "electron";
import { PlayerState } from "@/common/constant";
import { t } from "@shared/i18n/main";
import messageBus from "@shared/message-bus/main";
import windowManager from "@main/window-manager";
import AppConfig from "@shared/app-config/main";

/**
 * Native macOS integration for the application menu and Dock menu.
 * Playback actions stay on the message bus so the renderer remains the single
 * owner of the audio player state.
 */
class MacOSIntegration {
    setup() {
        if (process.platform !== "darwin") {
            return;
        }

        this.rebuildMenus();
        messageBus.onAppStateChange((_, patch) => {
            if ("musicItem" in patch || "playerState" in patch) {
                this.rebuildMenus();
            }
        });
        AppConfig.onConfigUpdated((patch) => {
            if ("normal.language" in patch) {
                this.rebuildMenus();
            }
        });
    }

    private playbackItems(): MenuItemConstructorOptions[] {
        const { musicItem, playerState } = messageBus.getAppState();
        const hasMusic = !!musicItem;

        return [
            {
                label: playerState === PlayerState.Playing
                    ? t("media.music_state_pause")
                    : t("media.music_state_play"),
                enabled: hasMusic,
                click: () => messageBus.sendCommand("TogglePlayerState"),
            },
            {
                label: t("main.previous_music"),
                accelerator: "Command+Left",
                enabled: hasMusic,
                click: () => messageBus.sendCommand("SkipToPrevious"),
            },
            {
                label: t("main.next_music"),
                accelerator: "Command+Right",
                enabled: hasMusic,
                click: () => messageBus.sendCommand("SkipToNext"),
            },
        ];
    }

    private rebuildMenus() {
        const template: MenuItemConstructorOptions[] = [
            {
                label: app.name,
                submenu: [
                    { role: "about" },
                    { type: "separator" },
                    {
                        label: t("app_header.settings"),
                        accelerator: "Command+,",
                        click: () => {
                            windowManager.showMainWindow();
                            messageBus.sendCommand("Navigate", "/main/setting");
                        },
                    },
                    { type: "separator" },
                    { role: "services" },
                    { type: "separator" },
                    { role: "hide" },
                    { role: "hideOthers" },
                    { role: "unhide" },
                    { type: "separator" },
                    { role: "quit", accelerator: "Command+Q" },
                ],
            },
            { role: "editMenu" },
            {
                label: t("native_menu.playback"),
                submenu: this.playbackItems(),
            },
            { role: "viewMenu" },
            { role: "windowMenu" },
        ];

        Menu.setApplicationMenu(Menu.buildFromTemplate(template));
        app.dock.setMenu(Menu.buildFromTemplate([
            ...this.playbackItems(),
            { type: "separator" },
            {
                label: t("native_menu.show_main_window"),
                click: () => windowManager.showMainWindow(),
            },
        ]));
    }
}

export default new MacOSIntegration();
