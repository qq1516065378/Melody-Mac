import CryptoJs from "crypto-js";
import dayjs from "dayjs";
import axios from "axios";
import bigInt from "big-integer";
import qs from "qs";
import * as cheerio from "cheerio";
import he from "he";
import PluginMethods from "./plugin-methods";
import reactNativeCookies from "./polyfill/react-native-cookies";
import { app } from "electron";
import * as webdav from "webdav";
import AppConfig from "@shared/app-config/main";
import pluginStorage from "@shared/plugin-manager/main/polyfill/storage";
import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";

// Configure axios defaults for plugins: ignore self-signed cert errors and apply proxy
const defaultHttpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

// Request interceptor: fix QQ Music API missing 'comm' parameter issue
axios.interceptors.request.use(config => {
    // Fix QQ Music u.y.qq.com POST requests missing required comm parameters
    if (config.url?.includes("u.y.qq.com/cgi-bin/musicu.fcg") &&
        config.method?.toLowerCase() === "post" &&
        config.data && typeof config.data === "object" &&
        !config.data.comm) {
        config.data = {
            comm: {
                g_tk: 5381,
                uin: 123456,
                format: "json",
                inCharset: "utf-8",
                outCharset: "utf-8",
                notice: 0,
                platform: "h5",
                needNewCode: 1,
                ct: 23,
                cv: 0,
            },
            ...config.data,
        };
    }
    // Ensure basic Cookie header exists
    if (config.headers && !config.headers.Cookie && !config.headers.cookie) {
        config.headers.Cookie = "uin=";
    }
    return config;
});

function applyNoProxyConfig() {
    axios.defaults.timeout = 15000;
    axios.defaults.httpsAgent = defaultHttpsAgent;
    axios.defaults.proxy = undefined;
    // Set common browser headers to avoid being blocked by anti-crawler mechanisms
    axios.defaults.headers.common = {
        ...axios.defaults.headers.common,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    };
}

// Apply default config immediately (ignore self-signed certs)
applyNoProxyConfig();

// Apply proxy configuration if set
export function updateAxiosProxy() {
    try {
        const enabled = AppConfig.getConfig("network.proxy.enabled");
        const host = AppConfig.getConfig("network.proxy.host");
        const port = AppConfig.getConfig("network.proxy.port");
        const username = AppConfig.getConfig("network.proxy.username");
        const password = AppConfig.getConfig("network.proxy.password");

        if (enabled && host) {
            try {
                const proxyUrl = new URL(host);
                proxyUrl.port = port;
                proxyUrl.username = username || "";
                proxyUrl.password = password || "";
                axios.defaults.httpsAgent = new HttpsProxyAgent(proxyUrl);
                axios.defaults.proxy = false; // Let the agent handle proxying
                console.log("Plugin axios configured with proxy");
            } catch (e) {
                console.warn("Failed to configure proxy for plugins, falling back to no proxy:", e);
                applyNoProxyConfig();
            }
        } else {
            applyNoProxyConfig();
        }
    } catch (e) {
        // AppConfig not ready yet, already applied default config at module load
        console.log("AppConfig not ready yet, using default axios config (no proxy)");
    }
}

// Update proxy when config changes
app.whenReady().then(() => {
    AppConfig.onConfigUpdated?.((patch: any) => {
        const proxyKeys = [
            "network.proxy.enabled",
            "network.proxy.host",
            "network.proxy.port",
            "network.proxy.username",
            "network.proxy.password",
        ];
        if (proxyKeys.some(key => key in patch)) {
            updateAxiosProxy();
        }
    });
});

const sha256 = CryptoJs.SHA256;

export enum PluginStateCode {
    /** 版本不匹配 */
    VersionNotMatch = "VERSION NOT MATCH",
    /** 无法解析 */
    CannotParse = "CANNOT PARSE",
}

const packages: Record<string, any> = {
    cheerio,
    "crypto-js": CryptoJs,
    axios,
    dayjs,
    "big-integer": bigInt,
    qs,
    he,
    "@react-native-cookies/cookies": reactNativeCookies,
    webdav,
    "musicfree/storage": pluginStorage,
};

const _require = (packageName: string) => {
    const pkg = packages[packageName];
    if (pkg) {
        pkg.default = pkg;
        return pkg;
    }
    return null;
};

// const _consoleBind = function (
//     method: 'logger' | 'error' | 'info' | 'warn',
//     ...args: any
// ) {
//     const fn = console[method];
//     if (fn) {
//         fn(...args);
//         devLog(method, ...args);
//     }
// };

// const _console = {
//     logger: _consoleBind.bind(null, 'logger'),
//     warn: _consoleBind.bind(null, 'warn'),
//     info: _consoleBind.bind(null, 'info'),
//     error: _consoleBind.bind(null, 'error'),
// };

//#region 插件类
export class Plugin {
    /** 插件名 */
    public name: string;
    /** 插件的hash，作为唯一id */
    public hash: string;
    /** 插件状态信息 */
    public stateCode?: PluginStateCode;
    /** 插件的实例 */
    public instance: IPlugin.IPluginInstance;
    /** 插件路径 */
    public path: string;
    /** 插件方法 */
    public methods: PluginMethods;

    constructor(
        funcCode: string | (() => IPlugin.IPluginInstance),
        pluginPath: string,
    ) {
        let _instance: IPlugin.IPluginInstance;
        const _module: any = { exports: {}, loaded: false };
        let loadResolveCallback: () => void = null;
        const ensurePluginInitialized = new Promise<void>((resolve) => {
            loadResolveCallback = resolve;
        });
        try {
            if (typeof funcCode === "string") {
                // 插件的环境变量
                const env = {
                    getUserVariables: () => {
                        return (
                            AppConfig.getConfig("private.pluginMeta")?.[this.name]
                                ?.userVariables ?? {}
                        );
                    },
                    os: process.platform,
                    appVersion: app.getVersion(),
                    lang: AppConfig.getConfig("normal.language"),
                };
                const _process = {
                    platform: process.platform,
                    version: app.getVersion(),
                    env,
                    ensurePluginInitialized,
                };

                 
                _instance = Function(`
                    'use strict';
                    return function(require, __musicfree_require, module, exports, console, env, process) {
                        ${funcCode}
                    }
                `)()(
                    _require,
                    _require,
                    _module,
                    _module.exports,
                    console,
                    env,
                    _process,
                );
                if (_module.exports.default) {
                    _instance = _module.exports.default as IPlugin.IPluginInstance;
                } else {
                    _instance = _module.exports as IPlugin.IPluginInstance;
                }
                loadResolveCallback?.();


            } else {
                _instance = funcCode();
            }
            // 插件初始化后的一些操作
            if (Array.isArray(_instance.userVariables)) {
                _instance.userVariables = _instance.userVariables.filter(
                    (it) => it?.key,
                );
            }
            this.checkValid(_instance);
        } catch (e: any) {
            this.stateCode = PluginStateCode.CannotParse;
            if (e?.stateCode) {
                this.stateCode = e.stateCode;
            }

            _instance = e?.instance ?? {
                _path: "",
                platform: "",
                appVersion: "",
                async getMediaSource() {
                    return null;
                },
                async search() {
                    return {};
                },
                async getAlbumInfo() {
                    return null;
                },
            };
        }
        this.instance = _instance;
        this.path = pluginPath;
        this.name = _instance.platform;
        if (this.instance.platform === "" || this.instance.platform === undefined) {
            this.hash = "";
        } else {
            if (typeof funcCode === "string") {
                this.hash = sha256(funcCode).toString();
            } else {
                this.hash = sha256(funcCode.toString()).toString();
            }
        }
        _module.loaded = true;

        // 放在最后
        this.methods = new PluginMethods(this);
    }

    private checkValid(_instance: IPlugin.IPluginInstance) {
        /** 版本号校验 */
        // if (
        //     _instance.appVersion &&
        //     !satisfies(DeviceInfo.getVersion(), _instance.appVersion)
        // ) {
        //     throw {
        //         instance: _instance,
        //         stateCode: PluginStateCode.VersionNotMatch,
        //     };
        // }
        return true;
    }
}

//#endregion
