import { test } from "node:test";
import assert from "node:assert/strict";

import { planRefresh } from "../src/common/refresh-plan.js";

/**
 * 导入规划（#12）的接缝测试。
 *
 * 只经 `planRefresh` 这一个接缝断言可观察结果：下一份导入列表、错误项、下一轮状态表。
 * 不碰文件系统、不碰 vscode：存在性与 URI 形式都以内存实现注入。
 *
 * 路径是虚构的（磁盘上并不存在），若实现绕过注入的能力去读盘，断言与实际会立刻对不上。
 */
const CURSOR_TARGET = "C:\\ext\\src\\neovide-cursor\\neovide-cursor.js";
const MOUSE_TARGET = "C:\\ext\\src\\mouse-tail\\mouse-tail.js";
const ANIMATIONS_TARGET =
  "C:\\ext\\src\\vscode-animations\\Vscode-Animations.css";
const GRADIENT_TARGET = "C:\\ext\\src\\gradient-theme\\gradient-theme.css";

// 与 Custom CSS & JS Loader 配置里的形态一致：vscode.Uri.file(p).toString()。
const toUri = (filePath) => `file:///${filePath.replace(/\\/g, "/")}`;

const GRADIENT_URI = "file:///c%3A/ext/src/gradient-theme/gradient-theme.css";

/** 效果描述符的最小形态（导入规划只需要 key / targetPath / enabled）。 */
function effect(key, targetPath, enabled) {
  return { key, targetPath, enabled };
}

/** 注入的能力：文件是否存在 + 本地路径 → 注入用的 URI 形式。 */
function capabilities(existingPaths) {
  const existing = new Set(existingPaths);
  return {
    fileExists: (p) => existing.has(p),
    toImportUri: toUri,
  };
}

test("切换关闭：按 basename 从导入列表移除该效果的条目", () => {
  const { fileExists, toImportUri } = capabilities([]);

  const plan = planRefresh({
    effects: [effect("cursor", CURSOR_TARGET, false)],
    changeStates: { cursor: "switch" },
    currentImports: [toUri(CURSOR_TARGET), GRADIENT_URI],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, [GRADIENT_URI]);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.nextChangeStates, { cursor: "none" });
});

test("移除按归一化路径匹配且忽略大小写", () => {
  // 列表里残留的是历史拼写（全小写），目标路径是仓库里的真实大小写。
  // 忽略大小写是重构前就有的语义，这里把它锁在接缝上。
  const legacyUri = "file:///ext/src/vscode-animations/vscode-animations.css";
  const { fileExists, toImportUri } = capabilities([]);

  const plan = planRefresh({
    effects: [effect("animations", ANIMATIONS_TARGET, false)],
    changeStates: { animations: "switch" },
    currentImports: [legacyUri, GRADIENT_URI],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, [GRADIENT_URI]);
});

test("关闭效果时，用户自建的、与本扩展资产同名的条目必须保留", () => {
  // 评审 F8 的回归点：只按 basename 匹配会把用户自己的同名文件一起删掉。
  const userSameName = "file:///C:/Users/me/my-theme/gradient-theme.css";
  const { fileExists, toImportUri } = capabilities([]);

  const plan = planRefresh({
    effects: [effect("gradient", GRADIENT_TARGET, false)],
    changeStates: { gradient: "switch" },
    currentImports: [toUri(GRADIENT_TARGET), userSameName],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, [userSameName]);
});

test("去重按归一化路径：用户的同名文件不会顶掉本扩展的条目", () => {
  // 与上一条同源：去重若也按 basename，本扩展的条目会被"已存在"判定挡住而永远加不进去。
  const userSameName = "file:///C:/Users/me/my-theme/gradient-theme.css";
  const { fileExists, toImportUri } = capabilities([GRADIENT_TARGET]);

  const plan = planRefresh({
    effects: [effect("gradient", GRADIENT_TARGET, true)],
    changeStates: { gradient: "switch" },
    currentImports: [userSameName],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.imports, [userSameName, toUri(GRADIENT_TARGET)]);
});

test("变更状态为 none 时不改动导入列表，状态仍结算为 none", () => {
  const currentImports = [GRADIENT_URI];
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET]);

  const plan = planRefresh({
    effects: [effect("cursor", CURSOR_TARGET, true)],
    changeStates: { cursor: "none" },
    currentImports,
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, [GRADIENT_URI]);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.nextChangeStates, { cursor: "none" });
  // 纯函数：不修改入参。
  assert.deepEqual(currentImports, [GRADIENT_URI]);
});

test("重载：先把已有条目移除再追加到列表末尾（重加，不重复）", () => {
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET]);

  const plan = planRefresh({
    effects: [effect("cursor", CURSOR_TARGET, true)],
    changeStates: { cursor: "reload" },
    currentImports: [toUri(CURSOR_TARGET), GRADIENT_URI],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  // 移除在前、追加在后：列表里仍只有一条，且被重新追加到末尾（触发重载的关键顺序）。
  assert.deepEqual(plan.imports, [GRADIENT_URI, toUri(CURSOR_TARGET)]);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.nextChangeStates, { cursor: "none" });
});

test("重载但效果未启用：既不新增也不移除", () => {
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET]);

  const plan = planRefresh({
    effects: [effect("cursor", CURSOR_TARGET, false)],
    changeStates: { cursor: "reload" },
    currentImports: [toUri(CURSOR_TARGET), GRADIENT_URI],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, [toUri(CURSOR_TARGET), GRADIENT_URI]);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.nextChangeStates, { cursor: "none" });
});

test("同一轮既有新增又有移除：分别作用于各自的效果", () => {
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET, MOUSE_TARGET]);

  const plan = planRefresh({
    effects: [
      effect("cursor", CURSOR_TARGET, true),
      effect("mouse", MOUSE_TARGET, false),
    ],
    changeStates: { cursor: "switch", mouse: "switch" },
    currentImports: [toUri(MOUSE_TARGET), GRADIENT_URI],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, [GRADIENT_URI, toUri(CURSOR_TARGET)]);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.nextChangeStates, { cursor: "none", mouse: "none" });
});

test("两个效果指向同一个目标文件时只保留一条导入项", () => {
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET]);

  const plan = planRefresh({
    effects: [
      effect("cursor", CURSOR_TARGET, true),
      effect("cursor-shadow", CURSOR_TARGET, true),
    ],
    changeStates: { cursor: "switch", "cursor-shadow": "switch" },
    currentImports: [],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, [toUri(CURSOR_TARGET)]);
});

// --- 缺陷回归：目标文件缺失不得把无效值写进全局导入配置 -------------------

test("回归：目标文件缺失时报告错误，且导入列表仍是合法字符串数组", () => {
  const { fileExists, toImportUri } = capabilities([]); // 目标文件并不存在

  let plan;
  assert.doesNotThrow(() => {
    plan = planRefresh({
      effects: [effect("cursor", CURSOR_TARGET, true)],
      changeStates: { cursor: "switch" },
      currentImports: [GRADIENT_URI],
      readText: () => null,
      fileExists,
      toImportUri,
    });
  });

  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, CURSOR_TARGET);
  // 文案与重构前 AddPaths 一致，使用者看到的提示不变。
  assert.match(plan.errors[0].message, /找不到配置文件/);

  // 关键回归点：绝不出现 undefined / 非字符串元素（重构前 AddPaths 会 return undefined，
  // 调用方把 undefined 直接写进底层加载器的注入列表）。
  assert.deepEqual(plan.imports, [GRADIENT_URI]);
  assert.ok(plan.imports.every((p) => typeof p === "string" && p.length > 0));
  assert.equal(plan.imports.includes(undefined), false);
  assert.ok(Array.isArray(plan.imports));
});

test("一个效果的文件缺失不影响同轮其他效果被正确加入", () => {
  const { fileExists, toImportUri } = capabilities([MOUSE_TARGET]); // cursor 缺失

  const plan = planRefresh({
    effects: [
      effect("cursor", CURSOR_TARGET, true),
      effect("mouse", MOUSE_TARGET, true),
    ],
    changeStates: { cursor: "switch", mouse: "switch" },
    currentImports: [],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, [toUri(MOUSE_TARGET)]);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, CURSOR_TARGET);
});

test("URI 转换返回非字符串时报告错误，绝不把无效值放进导入列表", () => {
  const { fileExists } = capabilities([CURSOR_TARGET]);

  const plan = planRefresh({
    effects: [effect("cursor", CURSOR_TARGET, true)],
    changeStates: { cursor: "switch" },
    currentImports: [GRADIENT_URI],
    readText: () => null,
    fileExists,
    toImportUri: () => undefined,
  });

  assert.deepEqual(plan.imports, [GRADIENT_URI]);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, CURSOR_TARGET);
  assert.ok(plan.imports.every((p) => typeof p === "string"));
});

test("缺少注入能力时不抛异常、不加入任何路径，并报告错误", () => {
  let plan;
  assert.doesNotThrow(() => {
    plan = planRefresh({
      effects: [effect("cursor", CURSOR_TARGET, true)],
      changeStates: { cursor: "switch" },
      currentImports: [GRADIENT_URI],
      readText: () => null,
      // fileExists / toImportUri 都没有提供
    });
  });

  assert.deepEqual(plan.imports, [GRADIENT_URI]);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, CURSOR_TARGET);
});

// --- 状态结算 / 跳过规则 / 纯性 -------------------------------------------

test("三种变更状态混合时，下一轮状态全部结算为 none", () => {
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET, MOUSE_TARGET]);

  const plan = planRefresh({
    effects: [
      effect("cursor", CURSOR_TARGET, true),
      effect("mouse", MOUSE_TARGET, false),
    ],
    // animations 没有对应的效果描述符：状态表依然是"每个键都结算为 none"。
    changeStates: { cursor: "reload", mouse: "switch", animations: "none" },
    currentImports: [toUri(MOUSE_TARGET)],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.nextChangeStates, {
    cursor: "none",
    mouse: "none",
    animations: "none",
  });
  assert.deepEqual(plan.imports, [toUri(CURSOR_TARGET)]);
});

test("目标路径为空的效果被跳过：不增不删、不报错，状态仍归 none", () => {
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET]);

  const plan = planRefresh({
    effects: [effect("cursor", "", true)],
    changeStates: { cursor: "switch" },
    currentImports: [GRADIENT_URI],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, [GRADIENT_URI]);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.nextChangeStates, { cursor: "none" });
});

test("enabled 缺省（配置未设置）按未启用处理：不新增导入项", () => {
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET]);

  const plan = planRefresh({
    effects: [{ key: "cursor", targetPath: CURSOR_TARGET }], // 没有 enabled 字段
    changeStates: { cursor: "switch" },
    currentImports: [],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, []);
  assert.deepEqual(plan.errors, []);
});

test("省略 kind 的描述符只参与导入规划：不产生写入，也不报错", () => {
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET]);

  const plan = planRefresh({
    effects: [effect("cursor", CURSOR_TARGET, true)],
    changeStates: { cursor: "switch" },
    currentImports: [],
    readText: () => {
      throw new Error("描述符省略 kind，不应读取任何文件");
    },
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.imports, [toUri(CURSOR_TARGET)]);
});

test("相同输入两次调用得到相同结果，且不修改任何入参", () => {
  const effects = [
    effect("cursor", CURSOR_TARGET, true),
    effect("mouse", MOUSE_TARGET, false),
  ];
  const changeStates = { cursor: "reload", mouse: "switch" };
  const currentImports = [toUri(CURSOR_TARGET), toUri(MOUSE_TARGET)];
  const before = JSON.stringify({ effects, changeStates, currentImports });
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET, MOUSE_TARGET]);

  const input = {
    effects,
    changeStates,
    currentImports,
    readText: () => null,
    fileExists,
    toImportUri,
  };
  const first = planRefresh(input);
  const second = planRefresh(input);

  assert.deepEqual(first, second);
  assert.notEqual(first.imports, second.imports);
  assert.notEqual(first.nextChangeStates, second.nextChangeStates);
  assert.deepEqual(JSON.parse(before), {
    effects,
    changeStates,
    currentImports,
  });
  // 重载把 cursor 挪到末尾，mouse 被移除。
  assert.deepEqual(first.imports, [toUri(CURSOR_TARGET)]);
});

test("端到端：开启 → 改设置（reload）→ 关闭，导入列表最终回到原样", () => {
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET]);
  const plan = (state, enabled, imports) =>
    planRefresh({
      effects: [effect("cursor", CURSOR_TARGET, enabled)],
      changeStates: { cursor: state },
      currentImports: imports,
      readText: () => null,
      fileExists,
      toImportUri,
    });

  // 开启开关（switch）
  const enabled = plan("switch", true, [GRADIENT_URI]);
  assert.deepEqual(enabled.imports, [GRADIENT_URI, toUri(CURSOR_TARGET)]);
  assert.deepEqual(enabled.nextChangeStates, { cursor: "none" });

  // 改效果内的设置（reload）：列表不变，条目被重加到末尾以触发重载
  const reloaded = plan("reload", true, enabled.imports);
  assert.deepEqual(reloaded.imports, [GRADIENT_URI, toUri(CURSOR_TARGET)]);
  assert.deepEqual(reloaded.nextChangeStates, { cursor: "none" });

  // 关闭开关（switch）：条目被移除，回到初始状态
  const disabled = plan("switch", false, reloaded.imports);
  assert.deepEqual(disabled.imports, [GRADIENT_URI]);
  assert.deepEqual(disabled.errors, []);
  assert.deepEqual(disabled.nextChangeStates, { cursor: "none" });
});

test("切换开启：把已启用的效果目标文件追加到导入列表", () => {
  const { fileExists, toImportUri } = capabilities([CURSOR_TARGET]);

  const plan = planRefresh({
    effects: [effect("cursor", CURSOR_TARGET, true)],
    changeStates: { cursor: "switch" },
    currentImports: [GRADIENT_URI],
    readText: () => null,
    fileExists,
    toImportUri,
  });

  assert.deepEqual(plan.imports, [GRADIENT_URI, toUri(CURSOR_TARGET)]);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.notices, []);
  assert.deepEqual(plan.nextChangeStates, { cursor: "none" });
});
