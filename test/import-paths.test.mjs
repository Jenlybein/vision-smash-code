import { test } from "node:test";
import assert from "node:assert/strict";

import { removeByBasename } from "../src/common/import-paths.js";

// 说明：这些 import 列表项的形态与 Custom CSS & JS Loader 配置里的值一致，
// 都是 vscode.Uri.file(p).toString() 的结果（file:///... 形式）。
const toUri = (filePath) => `file:///${filePath.replace(/\\/g, "/")}`;

test("同名文件即使位于不同目录也会被移除", () => {
  const imports = [
    toUri("/home/u/extensions/a/neovide-cursor.js"),
    toUri("/home/u/extensions/a/gradient-theme.css"),
  ];

  const result = removeByBasename(imports, [
    "C:\\tmp\\another-place\\neovide-cursor.js",
  ]);

  assert.deepEqual(result, [toUri("/home/u/extensions/a/gradient-theme.css")]);
});

test("basename 匹配忽略大小写", () => {
  const imports = [toUri("/ext/vscode-animations/Vscode-Animations.css")];

  const result = removeByBasename(imports, [
    "/elsewhere/vscode-animations.css",
  ]);

  assert.deepEqual(result, []);
});

test("同目录下不同名的条目不受影响", () => {
  const imports = [
    toUri("/ext/mouse/mouse-tail.js"),
    toUri("/ext/mouse/mouse-tail.css"),
  ];

  const result = removeByBasename(imports, [toUri("/ext/mouse/mouse-tail.js")]);

  assert.deepEqual(result, [toUri("/ext/mouse/mouse-tail.css")]);
});

test("没有匹配项时原样保留，且不修改入参", () => {
  const imports = [
    toUri("/ext/a/cursor.js"),
    toUri("/ext/b/theme.css"),
  ];
  const snapshot = [...imports];

  const result = removeByBasename(imports, [toUri("/ext/c/word-exploder.js")]);

  assert.deepEqual(result, snapshot);
  assert.notEqual(result, imports);
  assert.deepEqual(imports, snapshot);
});
