import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { planRefresh } from "../src/common/refresh-plan.js";
import { buildAnimationSegments } from "../src/common/animation-segments.js";
import {
  ANIMATIONS_SOURCE_DIR,
  ANIMATIONS_TARGET_FILE,
} from "../src/common/asset-paths.js";

// 仓库根目录：只用于断言资产文件名的大小写与仓库里真实存在的一致。
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// 虚构的扩展安装目录：磁盘上并不存在，所有读取都由内存 readText 提供。
// 若实现绕过 readText 去读盘，内容一定对不上（或直接抛异常）。
const CSS_ROOT = path.join("C:", "ext", "src", ANIMATIONS_SOURCE_DIR);
const TARGET = path.join(CSS_ROOT, ANIMATIONS_TARGET_FILE);

// 与仓库真实资产同形的占位符：`/*<Duration>*/ 300ms; /*</Duration>*/`。
const PLACEHOLDER = "/*<Duration>*/ 300ms; /*</Duration>*/";

const asset = (...parts) => path.join(CSS_ROOT, ...parts);

// 与真实资产同名同时长变量：Command-Palette → --command-palette-duration。
const durationVar = (type) => `--${type.toLowerCase()}-duration`;

const TYPES = ["Command-Palette", "Tabs", "Active", "Scrolling"];
const VALUES = ["Scale", "Slide", "Fade", "Flip", "Indent"];

// 内存资产表。每个文件的"内容"都以它的相对路径标记开头（括起来的方括号），
// 拼接结果因此能直接暴露顺序错误；`_Duration.css` 与 Misc 片段带上真实的占位符形态，
// 使"时长占位是否被替换"成为可观察的行为，而不是内部实现细节。
function makeFiles(overrides = {}) {
  const files = {
    [asset("Default-Transitions.css")]: "[Default-Transitions]",
    [asset("Custom-Animations.css")]: "[Custom-Animations]",
    [asset("Scrolling", "_Animate.css")]: "[Scrolling/_Animate]",
    [asset("Misc", "Smooth-Mode.css")]: `[Misc/Smooth-Mode] --smooth-windows-duration: ${PLACEHOLDER}`,
    [asset("Misc", "Tokens.css")]: `[Misc/Tokens] --tokens-duration: ${PLACEHOLDER}`,
  };

  for (const type of TYPES) {
    files[asset(type, "_Duration.css")] =
      `[${type}/_Duration] ${durationVar(type)}: ${PLACEHOLDER}`;
    for (const value of VALUES) {
      files[asset(type, `${value}.css`)] = `[${type}/${value}]`;
    }
  }

  return { ...files, ...overrides };
}

// 全部关闭的配置快照：枚举类型取 "None"，两个布尔开关取 false。
function allOff() {
  return {
    "Command-Palette": "None",
    Tabs: "None",
    Active: "None",
    Scrolling: "None",
    "Smooth-Mode": false,
    Tokens: false,
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

function animationEffect({ settings, durations, defaultDuration }) {
  return {
    key: "animations",
    kind: "css-concat",
    targetPath: TARGET,
    settings,
    durations,
    defaultDuration,
    segments: buildAnimationSegments(CSS_ROOT),
  };
}

// 只走接缝：给配置快照 + 内存资产，断言"要写什么"。
function planAnimation({
  settings,
  durations,
  defaultDuration,
  files = makeFiles(),
}) {
  const { readText, calls } = memoryReadText(files);
  const plan = planRefresh({
    effects: [animationEffect({ settings, durations, defaultDuration })],
    changeStates: {},
    currentImports: [],
    readText,
  });
  return { plan, calls };
}

const writtenContent = (plan) => {
  assert.equal(plan.writes.length, 1, "期望恰好写入一个目标文件");
  assert.equal(plan.writes[0].path, TARGET);
  return plan.writes[0].content;
};

test("所有类型都选“无”时，只拼接固定前缀两段", () => {
  const { plan, calls } = planAnimation({ settings: allOff() });

  assert.deepEqual(plan.errors, []);
  assert.equal(writtenContent(plan), "[Default-Transitions][Custom-Animations]");
  // 没有被选中的类型不产生任何读取。
  assert.deepEqual(calls, [
    asset("Default-Transitions.css"),
    asset("Custom-Animations.css"),
  ]);
});

test("只启用一种类型时，拼接前缀 + _Duration.css + 该类型片段，顺序正确", () => {
  const { plan } = planAnimation({
    settings: { ...allOff(), Tabs: "Slide" },
  });

  assert.deepEqual(plan.errors, []);
  assert.equal(
    writtenContent(plan),
    `[Default-Transitions][Custom-Animations][Tabs/_Duration] --tabs-duration: ${PLACEHOLDER}[Tabs/Slide]`,
  );
});

test("启用 Scrolling 时在 _Duration.css 与动画片段之间额外拼接 _Animate.css", () => {
  const { plan } = planAnimation({
    settings: { ...allOff(), Scrolling: "Scale" },
  });

  assert.deepEqual(plan.errors, []);
  const content = writtenContent(plan);

  // 位置精确到字节：_Duration → _Animate → Scale。
  assert.equal(
    content,
    `[Default-Transitions][Custom-Animations][Scrolling/_Duration] --scrolling-duration: ${PLACEHOLDER}[Scrolling/_Animate][Scrolling/Scale]`,
  );
  assert.ok(
    content.indexOf("[Scrolling/_Animate]") < content.indexOf("[Scrolling/Scale]"),
  );
});

test("Smooth-Mode 与 Tokens 都走 Misc/，且只在开关为真时拼接", () => {
  // 两个开关都是"真值"语义：未设置（undefined）等于关闭，与枚举类型的 `!== "None"` 不同。
  const off = planAnimation({
    settings: { ...allOff(), "Smooth-Mode": undefined, Tokens: undefined },
  });

  assert.deepEqual(off.plan.errors, []);
  assert.equal(
    writtenContent(off.plan),
    "[Default-Transitions][Custom-Animations]",
  );
  assert.ok(!off.calls.some((p) => p.includes(`${path.sep}Misc${path.sep}`)));

  const on = planAnimation({
    settings: { ...allOff(), "Smooth-Mode": true, Tokens: true },
  });

  assert.deepEqual(on.plan.errors, []);
  const content = writtenContent(on.plan);
  const smoothAt = content.indexOf("[Misc/Smooth-Mode]");
  const tokensAt = content.indexOf("[Misc/Tokens]");

  // 位置而非全文：时长占位替换是另一条切片，不应该让这条断言跟着改。
  assert.ok(smoothAt > content.indexOf("[Custom-Animations]"));
  assert.ok(tokensAt > smoothAt);
});

// 时长占位：重构前 `updateDuration` 只作用于 `<枚举值>.css`，而占位符实际写在
// `_Duration.css` 里，因此四类枚举动画的时长配置**从未生效**，样式表里始终是资产
// 写死的 300ms。按「行为不变」硬约束，本次保留这一既有缺陷（见 ADR-0001「仍未达成」）。
test("Durations 不影响 _Duration.css：四类枚举动画的时长配置从未生效（既有缺陷）", () => {
  const { plan } = planAnimation({
    settings: { ...allOff(), Tabs: "Slide" },
    durations: { Tabs: 500 },
    defaultDuration: 300,
  });

  assert.deepEqual(plan.errors, []);
  const content = writtenContent(plan);

  assert.equal(
    content,
    `[Default-Transitions][Custom-Animations][Tabs/_Duration] --tabs-duration: ${PLACEHOLDER}[Tabs/Slide]`,
  );
  assert.equal(content.includes("500ms"), false);
});

test("Default-Duration 也不作用于 _Duration.css（沿用重构前的替换范围）", () => {
  const { plan } = planAnimation({
    settings: { ...allOff(), Tabs: "Slide" },
    // 配了别的类型，但没配 Tabs。
    durations: { Active: 900 },
    defaultDuration: 420,
  });

  assert.deepEqual(plan.errors, []);
  const content = writtenContent(plan);

  assert.equal(
    content,
    `[Default-Transitions][Custom-Animations][Tabs/_Duration] --tabs-duration: ${PLACEHOLDER}[Tabs/Slide]`,
  );
  assert.equal(content.includes("420ms"), false);
});

test("Durations 整项缺失时 _Duration.css 的占位同样保持原样", () => {
  const { plan } = planAnimation({
    settings: { ...allOff(), Tabs: "Slide" },
    defaultDuration: 250,
  });

  assert.deepEqual(plan.errors, []);
  const content = writtenContent(plan);

  assert.equal(
    content,
    `[Default-Transitions][Custom-Animations][Tabs/_Duration] --tabs-duration: ${PLACEHOLDER}[Tabs/Slide]`,
  );
  assert.equal(content.includes("250ms"), false);
});

test("两者都没有配置时，占位符保持原样", () => {
  const { plan } = planAnimation({
    settings: { ...allOff(), Tabs: "Slide" },
  });

  assert.deepEqual(plan.errors, []);
  assert.equal(
    writtenContent(plan),
    `[Default-Transitions][Custom-Animations][Tabs/_Duration] --tabs-duration: ${PLACEHOLDER}[Tabs/Slide]`,
  );
});

test("单类型时长越界、回退到的默认时长同样不作用于 _Duration.css", () => {
  const { plan } = planAnimation({
    settings: { ...allOff(), Tabs: "Slide" },
    durations: { Tabs: 20000 },
    defaultDuration: 300,
  });

  assert.deepEqual(plan.errors, []);
  const content = writtenContent(plan);

  assert.equal(
    content,
    `[Default-Transitions][Custom-Animations][Tabs/_Duration] --tabs-duration: ${PLACEHOLDER}[Tabs/Slide]`,
  );
  // 占位文案里的 `*/ 300ms;` 不算替换：真正替换后形如 `--tabs-duration: 300ms`。
  assert.equal(content.includes("--tabs-duration: 300ms"), false);
});

test("单类型时长与默认时长都越界时，占位符保持原样", () => {
  const { plan } = planAnimation({
    settings: { ...allOff(), Tabs: "Slide" },
    durations: { Tabs: 12000 },
    defaultDuration: 20000,
  });

  assert.deepEqual(plan.errors, []);
  assert.equal(
    writtenContent(plan),
    `[Default-Transitions][Custom-Animations][Tabs/_Duration] --tabs-duration: ${PLACEHOLDER}[Tabs/Slide]`,
  );
});

test("枚举动画片段本身仍按重构前的范围参与时长替换", () => {
  const files = makeFiles({
    [asset("Tabs", "Slide.css")]: `[Tabs/Slide] ${PLACEHOLDER}`,
  });

  const { plan } = planAnimation({
    settings: { ...allOff(), Tabs: "Slide" },
    durations: { Tabs: 600 },
    defaultDuration: 300,
    files,
  });

  assert.deepEqual(plan.errors, []);
  // `_Duration.css` 原样，`<枚举值>.css` 才被替换——与重构前的调用点一致。
  assert.equal(
    writtenContent(plan),
    `[Default-Transitions][Custom-Animations][Tabs/_Duration] --tabs-duration: ${PLACEHOLDER}[Tabs/Slide] 600ms`,
  );
});

test("时长回退链（Durations → Default-Duration）在枚举片段上仍然有效", () => {
  const files = makeFiles({
    [asset("Tabs", "Slide.css")]: `[Tabs/Slide] ${PLACEHOLDER}`,
  });

  const { plan } = planAnimation({
    settings: { ...allOff(), Tabs: "Slide" },
    // 配了别的类型：Tabs 走 Default-Duration 回退。
    durations: { Active: 900 },
    defaultDuration: 420,
    files,
  });

  assert.deepEqual(plan.errors, []);
  assert.equal(
    writtenContent(plan),
    `[Default-Transitions][Custom-Animations][Tabs/_Duration] --tabs-duration: ${PLACEHOLDER}[Tabs/Slide] 420ms`,
  );
});

test("Smooth-Mode 参与时长替换，Tokens 不参与时长替换", () => {
  const { plan } = planAnimation({
    settings: { ...allOff(), "Smooth-Mode": true, Tokens: true },
    durations: { "Smooth-Mode": 800 },
    defaultDuration: 400,
  });

  const content = writtenContent(plan);

  assert.equal(
    content.includes("[Misc/Smooth-Mode] --smooth-windows-duration: 800ms"),
    true,
  );
  // Tokens 的占位符原样保留：它不参与时长替换。
  assert.equal(
    content.includes(`[Misc/Tokens] --tokens-duration: ${PLACEHOLDER}`),
    true,
  );
});

test("资产缺失时报告错误、不抛异常、不写盘", () => {
  const files = makeFiles();
  delete files[asset("Tabs", "Slide.css")];

  let plan;
  assert.doesNotThrow(() => {
    plan = planAnimation({
      settings: { ...allOff(), Tabs: "Slide" },
      durations: { Tabs: 500 },
      files,
    }).plan;
  });

  // 宁可什么都不写，也不写出残缺样式表。
  assert.deepEqual(plan.writes, []);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, asset("Tabs", "Slide.css"));
  assert.match(plan.errors[0].message, /无法读取/);
});

test("缺少 readText 能力时报告错误而不是抛异常", () => {
  let plan;
  assert.doesNotThrow(() => {
    plan = planRefresh({
      effects: [animationEffect({ settings: allOff() })],
      changeStates: {},
      currentImports: [],
      // 故意不提供 readText：接缝的 Interface 保证"缺失以 errors 体现"，而不是抛异常。
    });
  });

  assert.deepEqual(plan.writes, []);
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0].message, /readText/);
});

test("写入的目标文件名与仓库资产文件严格同大小写", () => {
  const entries = fs.readdirSync(
    path.join(repoRoot, "src", ANIMATIONS_SOURCE_DIR),
  );

  // 字符串比较不做平台归一化：磁盘上只有 Vscode-Animations.css 这一种拼法。
  assert.equal(entries.includes("Vscode-Animations.css"), true);
  assert.equal(entries.includes("vscode-animations.css"), false);

  const { plan } = planAnimation({ settings: allOff() });
  const written = path.basename(plan.writes[0].path);

  assert.equal(written, "Vscode-Animations.css");
  assert.notEqual(written, "vscode-animations.css");
  assert.equal(written, ANIMATIONS_TARGET_FILE);
});
