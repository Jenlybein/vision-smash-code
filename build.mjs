// @ts-check
/**
 * 打包脚本：把扩展宿主代码（extension.js + src/common + src/install）打成 CJS 单文件。
 *
 * 为什么是 CommonJS + `.cjs` 扩展名：
 * - 仓库的 package.json 声明了 `"type": "module"`，`.js` 会被 Node 当作 ESM 解析；
 * - 产物如果仍叫 `.js`，CJS 里的 `require` 会在 ESM 语义下变成 `require is not defined`；
 * - 因此产物固定为 `dist/extension.cjs`，manifest 的 `main` / `exports` 同步指向它。
 *
 * 为什么资产目录不参与打包：
 * - 运行时的注入目标与 CSS 片段由 `context.extensionPath` + `src/...` 相对路径解析，
 *   它们必须作为独立文件原样留在安装目录里，被 esbuild 内联反而会破坏路径语义。
 * - 所以本脚本只有唯一入口 extension.js，`src/**` 下的资产文件不会被当作 entry 或 loader 处理。
 *
 * 用法：
 *   node build.mjs               # 开发构建（含 sourcemap、不压缩）
 *   node build.mjs --watch       # 开发增量重建
 *   node build.mjs --production  # 发布构建（压缩、无 sourcemap）
 */

import { rmSync } from "node:fs";
import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const outfile = "dist/extension.cjs";

/** @type {import("esbuild").BuildOptions} */
const options = {
  // 唯一入口：宿主逻辑从这里可达的部分全部内联，资产文件不可达因而不会被带进产物。
  entryPoints: ["extension.js"],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  // engines.vscode 为 ^1.100.0，对应 VS Code 1.100 的 Node 20 运行时。
  target: "node20",
  // vscode 由扩展宿主提供，不能被打进产物。
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log(`[watch] ${outfile} 已开始增量重建（Ctrl+C 退出）`);
} else {
  // 每次全量构建前清空产物目录，避免旧文件残留造成"看起来构建成功"的假象。
  rmSync("dist", { recursive: true, force: true });
  await esbuild.build(options);
}
