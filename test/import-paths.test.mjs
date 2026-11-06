import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizePathKey, removeOwnedEntries } from "../src/common/import-paths.js";

// 说明：这些 import 列表项的形态与 Custom CSS & JS Loader 配置里的值一致，
// 都是 vscode.Uri.file(p).toString() 的结果（file:///... 形式）。
const toUri = (filePath) => `file:///${filePath.replace(/\\/g, "/")}`;

// 本扩展的安装目录与两个目标文件（`<安装目录>/src/<资产目录>/<资产文件>`）。
const EXT = "C:\\ext";
const CURSOR_TARGET = `${EXT}\\src\\neovide-cursor\\neovide-cursor.js`;
const GRADIENT_TARGET = `${EXT}\\src\\gradient-theme\\gradient-theme.css`;

test("本扩展自己的条目被移除（URI 形态与本地路径能对上）", () => {
  const userEntry = "file:///C:/Users/me/my-own.css";
  const imports = [toUri(CURSOR_TARGET), userEntry];

  const result = removeOwnedEntries(imports, [CURSOR_TARGET]);

  assert.deepEqual(result, [userEntry]);
});

test("用户自建的、与我们的资产同名的条目必须保留", () => {
  // 这是评审 F8 的回归点：只按 basename 匹配会把用户自己的同名文件一起删掉。
  // 下列条目与我们的资产同名，但都不在本扩展的 src/<资产目录>/ 下。
  const userSameName = [
    "file:///C:/Users/me/my-theme/gradient-theme.css",
    "file:///home/me/.config/vscode/neovide-cursor.js",
    "https://example.com/themes/gradient-theme.css",
  ];

  const result = removeOwnedEntries(userSameName, [
    CURSOR_TARGET,
    GRADIENT_TARGET,
  ]);

  assert.deepEqual(result, userSameName);
});

test("判据是规范化后的完整路径段，而不是文件名：同名不同目录一律保留", () => {
  // 与上一条同源，但换成「目录名恰好也像我们的资产目录」的更刁钻形态：
  // 没有 `src` 段，因此不是本扩展的资产路径。
  const userEntry = "file:///C:/Users/me/themes/gradient-theme/gradient-theme.css";

  const result = removeOwnedEntries([userEntry], [GRADIENT_TARGET]);

  assert.deepEqual(result, [userEntry]);
});

test("basename 匹配忽略大小写（历史拼写也能清掉）", () => {
  const imports = ["file:///C:/ext/src/vscode-animations/vscode-animations.css"];

  const result = removeOwnedEntries(imports, [
    "C:\\ext\\src\\vscode-animations\\Vscode-Animations.css",
  ]);

  assert.deepEqual(result, []);
});

test("扩展升级后安装在别的目录里，旧条目仍能被清掉", () => {
  // 安装目录带版本号（VS Code 每次升级都换一个），绝对前缀无法用于匹配；
  // 判据因此只固定到 `src/<资产目录>/<资产文件>` 这一段。
  const previousInstall =
    "file:///C:/Users/me/.vscode/extensions/gentlybeing.vision-smash-code-1.1.3/src/neovide-cursor/neovide-cursor.js";
  const userEntry = "file:///C:/Users/me/my-own.css";

  const result = removeOwnedEntries(
    [previousInstall, userEntry],
    [CURSOR_TARGET],
  );

  assert.deepEqual(result, [userEntry]);
});

test("路径里的百分号转义（含空格的安装目录、编码后的盘符）能归一化到同一条目", () => {
  const spacedExt = "C:\\Study Projects\\my ext";
  const entry = `file:///c%3A/Study%20Projects/my%20ext/src/neovide-cursor/neovide-cursor.js`;

  const result = removeOwnedEntries([entry], [
    `${spacedExt}\\src\\neovide-cursor\\neovide-cursor.js`,
  ]);

  assert.deepEqual(result, []);
});

test("同目录下不同名的条目不受影响", () => {
  const imports = [
    toUri(`${EXT}\\src\\mouse-tail\\mouse-tail.js`),
    toUri(`${EXT}\\src\\mouse-tail\\mouse-tail.css`),
  ];

  const result = removeOwnedEntries(imports, [
    toUri(`${EXT}\\src\\mouse-tail\\mouse-tail.js`),
  ]);

  assert.deepEqual(result, [toUri(`${EXT}\\src\\mouse-tail\\mouse-tail.css`)]);
});

test("没有匹配项时原样保留，且不修改入参", () => {
  const imports = [
    toUri(`${EXT}\\src\\neovide-cursor\\neovide-cursor.js`),
    toUri(`${EXT}\\src\\gradient-theme\\gradient-theme.css`),
  ];
  const snapshot = [...imports];

  const result = removeOwnedEntries(imports, [
    toUri(`${EXT}\\src\\word-exploder\\word-exploder.js`),
  ]);

  assert.deepEqual(result, snapshot);
  assert.notEqual(result, imports);
  assert.deepEqual(imports, snapshot);
});

test("空路径 / 非字符串不参与匹配（不会因空串把列表清空）", () => {
  const imports = ["file:///C:/Users/me/my-own.css", 42];
  const snapshot = [...imports];

  const result = removeOwnedEntries(imports, ["", null, undefined]);

  assert.deepEqual(result, snapshot);
});

test("归一化键：URI 与本地路径同值，且忽略大小写与末尾斜杠", () => {
  assert.equal(
    normalizePathKey("file:///C:/ext/src/a/b.css"),
    normalizePathKey("C:\\EXT\\SRC\\a\\b.css"),
  );
  assert.equal(
    normalizePathKey("C:/ext/src/a/b.css/"),
    normalizePathKey("C:\\ext\\src\\a\\b.css"),
  );
  // 路径里的百分号转义会被解码：否则含空格的安装目录永远匹配不上。
  assert.equal(
    normalizePathKey("file:///C%3A/Program%20Files/ext/src/a/b.css"),
    normalizePathKey("C:\\Program Files\\ext\\src\\a\\b.css"),
  );
});
