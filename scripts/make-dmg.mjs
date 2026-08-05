#!/usr/bin/env node
/**
 * 使用 macOS 自带 hdiutil 创建 DMG 安装包
 * 替代 @electron-forge/maker-dmg（其依赖 macos-alias 在 Node.js v22+ 无法编译）
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
const platform = process.platform; // darwin
const arch = process.arch; // arm64 / x64
const outDir = path.join(projectRoot, "out");
const appDir = path.join(outDir, `${appName}-${platform}-${arch}`);
const appPath = path.join(appDir, `${appName}.app`);

// 输出路径（与 forge 其他产物保持一致的位置，方便统一查找）
const makeDir = path.join(outDir, "make", "dmg", platform, arch);
fs.mkdirSync(makeDir, { recursive: true });
const dmgPath = path.join(makeDir, `${appName}-${platform}-${arch}-${version}.dmg`);

// 非 macOS 直接退出（postmake 钩子在其他平台不会报错）
if (platform !== "darwin") {
    console.log("[make-dmg] Not macOS, skipping DMG creation.");
    process.exit(0);
}

// 检查 .app 是否存在
if (!fs.existsSync(appPath)) {
    console.error(`[make-dmg] ERROR: ${appName}.app not found at ${appPath}`);
    console.error("[make-dmg] Run 'npm run make' first to build the app bundle.");
    process.exit(1);
}

const stagingDir = path.join(outDir, `__dmg-staging-${Date.now()}`);

function run(cmd, opts = {}) {
    console.log(`[make-dmg] $ ${cmd}`);
    return execSync(cmd, { stdio: "inherit", ...opts });
}

try {
    console.log(`[make-dmg] App: ${appPath}`);
    console.log(`[make-dmg] DMG: ${dmgPath}`);

    // 尝试卸载可能存在的同名挂载卷（避免"目录非空"错误）
    try {
        execSync(`hdiutil detach "/Volumes/${appName}" -force -quiet 2>/dev/null || true`, { stdio: "pipe" });
    } catch (_) {
        // ignore
    }

    // 准备 staging 目录
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    // 复制 .app 到 staging
    run(`cp -R "${appPath}" "${stagingDir}/${appName}.app"`);

    // 创建 Applications 符号链接（拖放安装标准结构）
    fs.symlinkSync("/Applications", path.join(stagingDir, "Applications"));

    // 若已存在同名 DMG 先删除
    if (fs.existsSync(dmgPath)) {
        fs.unlinkSync(dmgPath);
    }

    // 使用 hdiutil 创建 ULFO 压缩 DMG（UDZO = zlib 压缩，ULFO = lzfse 压缩，体积更小速度更快）
    run(
        `hdiutil create -volname "${appName}" -srcfolder "${stagingDir}" -ov -format ULFO "${dmgPath}"`,
    );

    if (fs.existsSync(dmgPath)) {
        const sizeMB = (fs.statSync(dmgPath).size / 1024 / 1024).toFixed(1);
        console.log(`\n[make-dmg] ✅ DMG created successfully (${sizeMB} MB)`);
        console.log(`[make-dmg] ${dmgPath}`);
    } else {
        console.error("[make-dmg] ❌ DMG creation failed (file not found)");
        process.exit(1);
    }
} catch (e) {
    console.error("[make-dmg] ❌ Failed to create DMG:", e.message);
    process.exit(1);
} finally {
    // 清理 staging 目录
    fs.rmSync(stagingDir, { recursive: true, force: true });
}
