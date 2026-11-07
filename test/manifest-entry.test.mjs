import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * manifest 与打包产物的硬约束（评审 F4 / ADR-0002 决策 5 与 ADR-0001）。
 *
 * 这几条都是「不许顺手改」的对外承诺，写成测试而不是只写在文档里：
 * - `engines.vscode` 固定 `^1.100.0`：阶段 4 以 CJS 产出后**仍不下调**（ADR-0002 决策 5）；
 * - `main` / `exports` 指向 `dist/extension.cjs`：阶段 4 的落地形态（#17）；
 * - 五个资产目录必须原样分发：`.vscodeignore` 只许排除被内联的 `src/install`、`src/common`。
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);

const ASSET_DIRS = [
  "vscode-animations",
  "gradient-theme",
  "neovide-cursor",
  "mouse-tail",
  "word-exploder",
];

test("manifest：engines.vscode 仍为 ^1.100.0（阶段 4 落地不下调，决策 5 未变）", () => {
  assert.equal(manifest.engines?.vscode, "^1.100.0");
});

test("manifest：main 与 exports 都指向阶段 4 的 CJS 产物", () => {
  assert.equal(manifest.main, "./dist/extension.cjs");
  assert.equal(manifest.exports?.["."], "./dist/extension.cjs");
  // 产物是 CJS：仓库仍声明 "type": "module"，所以扩展名必须是 .cjs。
  assert.equal(manifest.type, "module");
});

test(".vscodeignore 只排除被内联的宿主代码，五个资产目录必须原样分发", () => {
  const lines = fs
    .readFileSync(path.join(repoRoot, ".vscodeignore"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  // 运行时按 `context.extensionPath + src/<资产目录>/...` 解析这些文件，
  // 它们被 esbuild 内联会破坏路径语义，被 .vscodeignore 排除则会让扩展直接失效。
  for (const dir of ASSET_DIRS) {
    assert.equal(
      lines.some((line) => line === `src/${dir}` || line === `src/${dir}/**`),
      false,
      `.vscodeignore 不得排除资产目录 src/${dir}`,
    );
    assert.ok(
      fs.existsSync(path.join(repoRoot, "src", dir)),
      `资产目录 src/${dir} 应当存在于仓库里`,
    );
  }

  // 整个 src/ 更不能被排除（那会连带把五个资产目录一起踢出发布包）。
  assert.equal(lines.includes("src"), false);
  assert.equal(lines.includes("src/**"), false);

  // 被内联进 dist/extension.cjs 的宿主代码则应当排除。
  assert.ok(lines.includes("src/install/**"));
  assert.ok(lines.includes("src/common/**"));
});
