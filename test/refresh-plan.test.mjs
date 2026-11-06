import { test } from "node:test";
import assert from "node:assert/strict";

import { planRefresh } from "../src/common/refresh-plan.js";

// 说明：这些路径是虚构的（磁盘上不存在），配合下面注入的内存 readText，
// 保证测试完全不碰文件系统；若实现绕过 readText 去读盘，测试会失败。
const TARGET = "C:\\ext\\src\\gradient-theme\\gradient-theme.css";
const CSS_ROOT = "C:\\ext\\src\\gradient-theme\\css\\adaptive";

// 与重构前 src/install/gradient-inject.js 的循环顺序逐项一致。
const SETTINGS = [
  "editor-hover",
  "git-num-icon",
  "linenumber-rainbow-glow",
  "quick-input",
  "text-glowing",
  "text-gradient",
  "top-active-tab",
  "horizontal",
];

const fileOf = (key) => `${CSS_ROOT}\\${key}.css`;

// 每个片段的内容都不同，且不含分隔符：拼接结果能直接暴露顺序错误。
const contentOf = (key) => `/*${key}*/`;

function gradientEffect(settings) {
  return {
    key: "gradient",
    kind: "css-concat",
    targetPath: TARGET,
    settings,
    segments: SETTINGS.map((key) => ({
      setting: key,
      path: fileOf(key),
    })),
  };
}

function memoryReadText(files) {
  const calls = [];
  const readText = (p) => {
    calls.push(p);
    return Object.hasOwn(files, p) ? files[p] : null;
  };
  return { readText, calls };
}

const allFiles = Object.fromEntries(
  SETTINGS.map((key) => [fileOf(key), contentOf(key)]),
);

test("渐变全部开关开启时，按既有顺序拼接全部片段", () => {
  const { readText } = memoryReadText(allFiles);

  const plan = planRefresh({
    effects: [
      gradientEffect(Object.fromEntries(SETTINGS.map((key) => [key, true]))),
    ],
    changeStates: { gradient: "reload" },
    currentImports: [],
    readText,
  });

  assert.deepEqual(plan.writes, [
    {
      path: TARGET,
      content:
        "/*editor-hover*//*git-num-icon*//*linenumber-rainbow-glow*//*quick-input*//*text-glowing*//*text-gradient*//*top-active-tab*//*horizontal*/",
    },
  ]);
  assert.deepEqual(plan.errors, []);
});

test("渐变全部开关显式关闭时，写入空内容且不读取任何资产", () => {
  const { readText, calls } = memoryReadText(allFiles);

  const plan = planRefresh({
    effects: [
      gradientEffect(Object.fromEntries(SETTINGS.map((key) => [key, false]))),
    ],
    changeStates: { gradient: "reload" },
    currentImports: [],
    readText,
  });

  assert.deepEqual(plan.writes, [{ path: TARGET, content: "" }]);
  assert.deepEqual(calls, []);
  assert.deepEqual(plan.errors, []);
});

test("部分开启时只含开启的片段，顺序不变", () => {
  const settings = Object.fromEntries(SETTINGS.map((key) => [key, false]));
  settings["quick-input"] = true;
  settings["horizontal"] = true;

  const { readText } = memoryReadText(allFiles);

  const plan = planRefresh({
    effects: [gradientEffect(settings)],
    changeStates: { gradient: "reload" },
    currentImports: [],
    readText,
  });

  assert.deepEqual(plan.writes, [
    { path: TARGET, content: "/*quick-input*//*horizontal*/" },
  ]);
});

test("未设置的开关视为开启，只有显式 false 才排除", () => {
  // 只写出两个显式 false，其余键完全缺失（即 undefined）。
  const settings = { "text-glowing": false, horizontal: false };

  const { readText, calls } = memoryReadText(allFiles);

  const plan = planRefresh({
    effects: [gradientEffect(settings)],
    changeStates: { gradient: "switch" },
    currentImports: [],
    readText,
  });

  assert.deepEqual(plan.writes, [
    {
      path: TARGET,
      // 顺序仍是既有顺序：top-active-tab 在 horizontal 之前。
      content:
        "/*editor-hover*//*git-num-icon*//*linenumber-rainbow-glow*//*quick-input*//*text-gradient*//*top-active-tab*/",
    },
  ]);
  assert.deepEqual(calls, [
    fileOf("editor-hover"),
    fileOf("git-num-icon"),
    fileOf("linenumber-rainbow-glow"),
    fileOf("quick-input"),
    fileOf("text-gradient"),
    fileOf("top-active-tab"),
  ]);
});

test("资产文件缺失时报告错误、不抛异常，且整条效果不写盘", () => {
  const files = { ...allFiles };
  delete files[fileOf("text-gradient")];
  const { readText } = memoryReadText(files);

  let plan;
  assert.doesNotThrow(() => {
    plan = planRefresh({
      effects: [
        gradientEffect(Object.fromEntries(SETTINGS.map((key) => [key, true]))),
      ],
      changeStates: { gradient: "reload" },
      currentImports: [],
      readText,
    });
  });

  // 明确的写盘行为：缺片段就不写，避免把残缺样式表写进目标文件。
  assert.deepEqual(plan.writes, []);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, fileOf("text-gradient"));
  assert.equal(typeof plan.errors[0].message, "string");
  assert.ok(plan.errors[0].message.length > 0);
});

test("imports 直通：原样返回传入的 currentImports", () => {
  const currentImports = [
    "file:///c%3A/ext/neovide-cursor/neovide-cursor.js",
    "file:///c%3A/ext/gradient-theme/gradient-theme.css",
  ];
  const snapshot = [...currentImports];
  const { readText } = memoryReadText(allFiles);

  const plan = planRefresh({
    effects: [gradientEffect({})],
    changeStates: { gradient: "reload" },
    currentImports,
    readText,
  });

  // #12 之后 imports 不再是无条件直通；这里之所以原样返回，是因为该效果描述符没有
  // `enabled` 字段（配置未设置 = 未启用），reload 对未启用的效果不产生任何导入意图。
  // 断言保持不变，只是原因换了：见 test/import-planning.test.mjs 的导入规划用例。
  assert.deepEqual(plan.imports, currentImports);
  assert.deepEqual(currentImports, snapshot);
});

test("只通过注入的 readText 读取资产，不接触真实文件系统", () => {
  // 这些路径在磁盘上并不存在；实现若绕过 readText 去读盘，内容或调用记录都会对不上。
  const { readText, calls } = memoryReadText(allFiles);

  planRefresh({
    effects: [gradientEffect({})], // 所有键缺失 → 全部视为开启
    changeStates: { gradient: "none" },
    currentImports: [],
    readText,
  });

  assert.deepEqual(calls, SETTINGS.map(fileOf));
  assert.ok(calls.every((p) => p.startsWith(CSS_ROOT)));
});

test("空输入也返回结构完整的结果，绝不返回 undefined", () => {
  const plan = planRefresh({ readText: () => null });

  assert.deepEqual(plan, {
    writes: [],
    imports: [],
    notices: [],
    errors: [],
    // #12 新增的结算结果字段：输入没有变更状态表，输出也没有。
    nextChangeStates: {},
  });
  assert.ok(Array.isArray(plan.writes));
  assert.ok(Array.isArray(plan.imports));
  assert.ok(Array.isArray(plan.notices));
  assert.ok(Array.isArray(plan.errors));
  assert.equal(typeof plan.nextChangeStates, "object");
});

test("尚未实现的 marker-block 渲染方式报告错误且不写盘", () => {
  const targetPath = "C:\\ext\\src\\neovide-cursor\\neovide-cursor.js";

  const plan = planRefresh({
    effects: [
      {
        key: "cursor",
        kind: "marker-block",
        targetPath,
        markers: { start: "__AUTO_CONFIG_START__", end: "__AUTO_CONFIG_END__" },
      },
    ],
    changeStates: { cursor: "reload" },
    currentImports: [],
    readText: () => {
      throw new Error("不应读取任何文件");
    },
  });

  assert.deepEqual(plan.writes, []);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, targetPath);
  assert.match(plan.errors[0].message, /marker-block/);
});

test("相同输入产生相同输出，且不修改入参", () => {
  const effects = [
    gradientEffect({ "text-glowing": true, "text-gradient": false }),
  ];
  const currentImports = ["file:///c%3A/ext/neovide-cursor/neovide-cursor.js"];
  const before = JSON.stringify({ effects, currentImports });
  const readText = (p) => (Object.hasOwn(allFiles, p) ? allFiles[p] : null);

  const first = planRefresh({
    effects,
    changeStates: { gradient: "switch" },
    currentImports,
    readText,
  });
  const second = planRefresh({
    effects,
    changeStates: { gradient: "switch" },
    currentImports,
    readText,
  });

  assert.deepEqual(first, second);
  assert.notEqual(first.writes, second.writes);
  assert.deepEqual(first.writes, [
    {
      path: TARGET,
      content:
        "/*editor-hover*//*git-num-icon*//*linenumber-rainbow-glow*//*quick-input*//*text-glowing*//*top-active-tab*//*horizontal*/",
    },
  ]);
  assert.equal(JSON.stringify({ effects, currentImports }), before);
});
