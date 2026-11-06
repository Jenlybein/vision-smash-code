import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ANIMATIONS_SOURCE_DIR,
  ANIMATIONS_TARGET_FILE,
} from "../src/common/asset-paths.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const srcDir = path.join(repoRoot, "src");

/**
 * 读取目录项的真实大小写名称。
 *
 * 这里刻意不用 fs.existsSync 之类的存在性探测：在 Windows/macOS 上它们按
 * 大小写不敏感的方式匹配，把 vscode-animations.css 当成目录里的
 * Vscode-Animations.css 而返回 true，断言就形同虚设。
 * readdirSync 返回的是文件系统里的原始名称，再交给区分大小写的字符串比较，
 * 因此在大小写不敏感平台上也能真正守住大小写。
 */
function listRealNames(dir) {
  return fs.readdirSync(dir);
}

test("窗口动效目标文件名与仓库资产文件的真实大小写一致", () => {
  const entries = listRealNames(path.join(srcDir, ANIMATIONS_SOURCE_DIR));

  assert.ok(
    entries.includes(ANIMATIONS_TARGET_FILE),
    `目录中不存在名为 "${ANIMATIONS_TARGET_FILE}" 的文件；实际条目：${entries.join(", ")}`,
  );
});

test("窗口动效来源目录名与仓库目录的真实大小写一致", () => {
  const entries = listRealNames(srcDir);

  assert.ok(
    entries.includes(ANIMATIONS_SOURCE_DIR),
    `src 下不存在名为 "${ANIMATIONS_SOURCE_DIR}" 的目录；实际条目：${entries.join(", ")}`,
  );
});

test("目录列表比较区分大小写，因此该断言在大小写不敏感平台同样有效", () => {
  // 这条测试锁住断言手段本身：字符串比较不做任何平台相关的归一化，
  // 所以「目录里有 Vscode-Animations.css」不会让「vscode-animations.css」通过。
  const entries = ["Vscode-Animations.css", "Default-Transitions.css"];

  assert.equal(entries.includes("vscode-animations.css"), false);
  assert.equal(entries.includes("Vscode-Animations.css"), true);
});

test("常量模块是纯的：不 import vscode，也不 import fs", () => {
  // 能被 node --test 直接加载本身就证明它没有 import vscode（vscode 不是可安装的运行时依赖）。
  // 这里再加一道静态检查，把"保持纯模块"写进测试，避免以后为了省事把 fs 拖进来。
  const source = fs.readFileSync(
    path.join(srcDir, "common", "asset-paths.js"),
    "utf8",
  );

  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\brequire\s*\(/);
});

test("动画注入模块从常量模块取文件名，不再自己写死", () => {
  const source = fs.readFileSync(
    path.join(srcDir, "common", "effect-descriptors.js"),
    "utf8",
  );

  assert.match(source, /ANIMATIONS_TARGET_FILE/);
  assert.doesNotMatch(source, /["'][^"']*vscode-animations\.css["']/i);
});
