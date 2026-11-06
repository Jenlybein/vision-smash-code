import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * CSS 资产的编码约束（评审 F1）。
 *
 * 这些片段不是独立文件：`renderCssConcat` 按顺序把它们**首尾相接**拼成一张样式表，
 * 文件之间不插入任何分隔符。因此单个文件开头的 UTF-8 BOM（`EF BB BF` = U+FEFF）
 * 会落在拼接结果的中段，而不是文件的第一个字符——那是 CSS 语法里没有任何意义的位置，
 * 紧邻它的选择器（例如下一段的 `:root`）可能整条失效，而且只在"被拼接进去"时才出现，
 * 单独打开文件完全看不出来。
 *
 * 判据取"整份文件不含 U+FEFF"，而不是只看开头三字节：拆成多次改写、或在文件中间
 * 粘贴进一个带 BOM 的片段，同样会把 U+FEFF 送进拼接结果。
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// 会被 `css-concat` 拼接的全部资产目录（见 effect-descriptors.js 的两处 segments）。
const CONCATENATED_ASSET_DIRS = [
  ["src", "vscode-animations"],
  ["src", "gradient-theme", "css", "adaptive"],
];

const BOM = Buffer.from([0xff, 0xbb, 0xbf]);
const FEFF = "\uFEFF";

/** 递归列出某个目录下的所有 .css 文件（返回相对仓库根的路径，便于报错时定位）。 */
function listCssFiles(parts) {
  const absolute = path.join(repoRoot, ...parts);
  return fs
    .readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
    .sort();
}

const ASSET_FILES = CONCATENATED_ASSET_DIRS.flatMap(listCssFiles);

test("拼接用的 CSS 资产都不带 UTF-8 BOM，也不含游离的 U+FEFF", () => {
  // 扫描本身必须有效：目录里确实有文件，否则下面的空结果是假象。
  assert.ok(
    ASSET_FILES.length >= 10,
    `期望扫描到多个 CSS 资产，实际只有 ${ASSET_FILES.length} 个`,
  );

  const offenders = [];
  for (const file of ASSET_FILES) {
    const buffer = fs.readFileSync(file);
    const relative = path.relative(repoRoot, file).split(path.sep).join("/");

    if (buffer.subarray(0, 3).equals(BOM)) {
      offenders.push(`${relative}: 文件以 UTF-8 BOM 开头`);
    }
    if (buffer.includes(BOM)) {
      offenders.push(`${relative}: 文件内部含 UTF-8 BOM 字节序列`);
    }
    if (buffer.toString("utf8").includes(FEFF)) {
      offenders.push(`${relative}: 解码后含 U+FEFF`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `拼接进样式表的中段片段不得带 BOM：\n${offenders.join("\n")}`,
  );
});

test("Smooth-Mode.css 作为拼接中段（前面还有两段）必须无 BOM", () => {
  // 这条单独锁住 F1 的具体回归点：`Misc/Smooth-Mode.css` 拼接在
  // Default-Transitions.css 与 Custom-Animations.css **之后**，BOM 因此落在表中段，
  // 紧邻的 `:root { --smooth-windows-duration: ... }` 首当其冲。
  const smoothMode = path.join(repoRoot, "src", "vscode-animations", "Misc", "Smooth-Mode.css");
  const buffer = fs.readFileSync(smoothMode);

  assert.equal(
    buffer.subarray(0, 3).equals(BOM),
    false,
    "src/vscode-animations/Misc/Smooth-Mode.css 不得以 UTF-8 BOM 开头",
  );
  assert.equal(buffer.toString("utf8").includes(FEFF), false);

  // 时长占位必须原样留在文件里（BOM 修复不得顺手改动内容）。
  const text = buffer.toString("utf8");
  assert.ok(
    text.includes("--smooth-windows-duration: /*<Duration>*/ 300ms; /*</Duration>*/"),
    "Smooth-Mode.css 的时长占位被改动了",
  );
});
