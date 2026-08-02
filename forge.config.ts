import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";

import { mainConfig } from "./config/webpack.main.config";
import { rendererConfig } from "./config/webpack.renderer.config";
import path from "path";

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "fun.upup.musicfree",
    icon: path.resolve(__dirname, "res/melody-icon-v3"),
    executableName: "Melody",
    extraResource: [path.resolve(__dirname, "res")],
    protocols: [
      {
        name: "Melody",
        schemes: ["musicfree"],
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: "Melody",
      setupExe: "Melody-Setup-${version}.exe",
    }, ["win32"]),
    new MakerZIP({}, ["darwin"]),
    new MakerDMG(
      {
        format: "ULFO",
      },
      ["darwin"]
    ),
    new MakerDeb({
      options: {
        name: "melody",
        bin: "melody",
        mimeType: ["x-scheme-handler/musicfree"],
      },
    }),
  ],
  plugins: [
    new WebpackPlugin({
      devContentSecurityPolicy: `default-src * self blob: data: gap: file:; style-src * self 'unsafe-inline' blob: data: gap: file:; script-src * 'self' 'unsafe-eval' 'unsafe-inline' blob: data: gap: file:; object-src * 'self' blob: data: gap:; img-src * self 'unsafe-inline' blob: data: gap: file:; connect-src self * 'unsafe-inline' blob: data: gap:; frame-src * self blob: data: gap:;`,
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: "./src/renderer/document/index.html",
            js: "./src/renderer/document/index.tsx",
            name: "main_window",
            preload: {
              js: "./src/preload/index.ts",
            },
          },
          {
            html: "./src/renderer-lrc/document/index.html",
            js: "./src/renderer-lrc/document/index.tsx",
            name: "lrc_window",
            preload: {
              js: "./src/preload/extension.ts",
            },
          },
          {
            html: "./src/renderer-minimode/document/index.html",
            js: "./src/renderer-minimode/document/index.tsx",
            name: "minimode_window",
            preload: {
              js: "./src/preload/extension.ts",
            },
          },
          /** webworkers */
          {
            js: "./src/webworkers/downloader.ts",
            name: "worker_downloader",
            nodeIntegration: true,
          },
          {
            js: "./src/webworkers/local-file-watcher.ts",
            name: "local_file_watcher",
            nodeIntegration: true,
          },
          {
            js: "./src/webworkers/db-worker.ts",
            name: "db",
            nodeIntegration: true,
          }
        ],
      },
    }),
    {
      name: "@timfish/forge-externals-plugin",
      config: {
        externals: ["sharp"],
        includeDeps: true,
      },
    },
  ],
};

export default config;
