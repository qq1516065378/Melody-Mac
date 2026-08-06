#!/usr/bin/env node
/**
 * 使用 macOS 自带 hdiutil 创建 DMG 安装包
 * - 使用 ditto 复制 .app 以保留代码签名和扩展属性
 * - 配置 Finder 视图为标准拖拽安装布局（应用图标 + Applications 快捷方式并排）
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// 读取 package.json 获取版本和应用名
const pkg = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"),
);
const appName = pkg.productName || pkg.name;
const version = pkg.version;

// 平台目录
const platform = process.platform;
const arch = process.arch;
const outDir = path.join(projectRoot, "out");
const appDir = path.join(outDir, `${appName}-${platform}-${arch}`);
const appPath = path.join(appDir, `${appName}.app`);

// 输出路径
const makeDir = path.join(outDir, "make", "dmg", platform, arch);
fs.mkdirSync(makeDir, { recursive: true });
const dmgPath = path.join(makeDir, `${appName}-${version}.dmg`);

// 非 macOS 直接退出
if (platform !== "darwin") {
    console.log("[make-dmg] Not macOS, skipping DMG creation.");
    process.exit(0);
}

// 检查 .app 是否存在
if (!fs.existsSync(appPath)) {
    console.error(`[make-dmg] ERROR: ${appName}.app not found at ${appPath}`);
    process.exit(1);
}

const stagingDir = path.join(outDir, `__dmg-staging-${Date.now()}`);
const volumeName = appName;

function run(cmd, opts = {}) {
    console.log(`[make-dmg] $ ${cmd}`);
    return execSync(cmd, { stdio: "inherit", ...opts });
}

function runQuiet(cmd) {
    return execSync(cmd, { stdio: "pipe" });
}

try {
    console.log(`[make-dmg] App: ${appPath}`);
    console.log(`[make-dmg] DMG: ${dmgPath}`);

    // 尝试卸载可能存在的同名挂载卷
    try {
        runQuiet(`hdiutil detach "/Volumes/${volumeName}" -force`);
    } catch (_) {
        // ignore
    }

    // 准备 staging 目录
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    // 使用 ditto 复制 .app（保留代码签名、扩展属性、资源分支等 macOS 元数据）
    console.log("[make-dmg] Copying app with ditto (preserving code signature)...");
    run(`ditto "${appPath}" "${stagingDir}/${appName}.app"`);

    // 创建 Applications 符号链接
    fs.symlinkSync("/Applications", path.join(stagingDir, "Applications"));

    // 创建一个临时的读写 DMG
    const tempDmg = path.join(outDir, `__temp-${Date.now()}.dmg`);
    const tempMount = path.join("/Volumes", volumeName);

    // 计算 staging 目录大小，给 DMG 留足够空间
    const stagingSize = parseInt(runQuiet(`du -sk "${stagingDir}"`).toString().trim().split("\t")[0]);
    const dmgSize = Math.ceil(stagingSize * 1.3 / 1024) + 10; // MB，留30%余量

    console.log(`[make-dmg] Creating temp DMG (${dmgSize}MB)...`);
    run(`hdiutil create -megabytes ${dmgSize} -fs HFS+ -volname "${volumeName}" -ov "${tempDmg}"`);

    // 挂载临时 DMG（不指定mountpoint，让Finder自动识别为/Volumes/{volumeName}）
    console.log("[make-dmg] Mounting temp DMG...");
    const mountOutput = runQuiet(`hdiutil attach "${tempDmg}" -nobrowse -readwrite`).toString();
    console.log(mountOutput);

    // 等待挂载完成
    let attempts = 0;
    while (!fs.existsSync(tempMount) && attempts < 10) {
        execSync("sleep 0.5");
        attempts++;
    }

    // 复制 staging 内容到挂载的 DMG
    console.log("[make-dmg] Copying files to DMG volume...");
    run(`ditto "${stagingDir}/." "${tempMount}/"`);

    // 使用 AppleScript 配置 Finder 视图：图标模式，应用和Applications并排
    console.log("[make-dmg] Configuring Finder view...");
    const applescript = `
tell application "Finder"
    tell disk "${volumeName}"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set bounds of container window to {100, 100, 560, 380}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 110
        set text size of viewOptions to 12
        set position of item "${appName}.app" of container window to {140, 130}
        set position of item "Applications" of container window to {400, 130}
        close
        open
        update without registering applications
        delay 2
    end tell
end tell
`;
    // 将 AppleScript 写入临时文件执行（避免转义问题）
    const scriptPath = path.join(outDir, "__set_view.scpt");
    fs.writeFileSync(scriptPath, applescript);
    try {
        run(`osascript "${scriptPath}"`);
        console.log("[make-dmg] Finder view configured.");
    } catch (e) {
        console.log("[make-dmg] Warning: Finder view configuration failed, continuing...");
    }
    try { fs.unlinkSync(scriptPath); } catch (_) {}

    // 同步确保所有写入完成
    runQuiet("sync");

    // 弹出临时 DMG
    console.log("[make-dmg] Ejecting temp DMG...");
    run(`hdiutil detach "${tempMount}" -force`);

    // 若已存在最终 DMG 先删除
    if (fs.existsSync(dmgPath)) {
        fs.unlinkSync(dmgPath);
    }

    // 转换为压缩只读 DMG（UDZO = zlib 压缩，兼容性最好）
    console.log("[make-dmg] Converting to compressed DMG...");
    run(`hdiutil convert "${tempDmg}" -format UDZO -imagekey zlib-level=9 -o "${dmgPath}"`);

    // 清理临时文件
    fs.unlinkSync(tempDmg);

    if (fs.existsSync(dmgPath)) {
        const sizeMB = (fs.statSync(dmgPath).size / 1024 / 1024).toFixed(1);
        console.log(`\n[make-dmg] ✅ DMG created successfully (${sizeMB} MB)`);
        console.log(`[make-dmg] ${dmgPath}`);
    } else {
        console.error("[make-dmg] ❌ DMG creation failed");
        process.exit(1);
    }

    // 同时复制ZIP为简单文件名
    const zipMakeDir = path.join(outDir, "make", "zip", platform, arch);
    const zipSourceName = `${appName}-${platform}-${arch}-${version}.zip`;
    const zipSourcePath = path.join(zipMakeDir, zipSourceName);
    const zipTargetPath = path.join(zipMakeDir, `${appName}-${version}.zip`);
    if (fs.existsSync(zipSourcePath)) {
        fs.copyFileSync(zipSourcePath, zipTargetPath);
        const sizeMB = (fs.statSync(zipTargetPath).size / 1024 / 1024).toFixed(1);
        console.log(`[make-dmg] ✅ ZIP copied: ${zipTargetPath} (${sizeMB} MB)`);
    }
} catch (e) {
    console.error("[make-dmg] ❌ Failed to create DMG:", e.message);
    // 清理临时挂载
    try { runQuiet(`hdiutil detach "/Volumes/${volumeName}" -force`); } catch (_) {}
    try {
        const mountPath = path.join("/Volumes", `__temp_mount_*`);
        execSync(`hdiutil detach ${mountPath} -force 2>/dev/null`, { stdio: "pipe" });
    } catch (_) {}
    process.exit(1);
} finally {
    // 清理 staging 目录
    fs.rmSync(stagingDir, { recursive: true, force: true });
}
