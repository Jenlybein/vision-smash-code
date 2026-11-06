import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import {
  EFFECTS,
  buildEffectDescriptor,
  resolveEffectTargetPath,
} from "../src/common/effect-descriptors.js";
import { ANIMATION_SETTING_KEYS } from "../src/common/animation-segments.js";
import {
  renderMouseConfigBody,
  renderWordConfigBody,
} from "../src/common/marker-bodies.js";
import { planRefresh } from "../src/common/refresh-plan.js";

// 说明：扩展安装目录是虚构路径（磁盘上不存在）。本文件只构造描述符，不碰真实文件系统；
// 需要读文件的地方一律用内存 readText。若实现绕过注入能力去读盘，这些断言必然失败。

const EXT = path.join("C:", "ext");

const START = "/* __AUTO_CONFIG_START__ */";
const END = "/* __AUTO_CONFIG_END__ */";
const MARKERS = { start: START, end: END };

const CURSOR_TARGET = path.join(EXT, "src", "neovide-cursor", "neovide-cursor.js");
const ANIMATION_CSS_ROOT = path.join(EXT, "src", "vscode-animations");
const ANIMATION_TARGET = path.join(ANIMATION_CSS_ROOT, "Vscode-Animations.css");
const GRADIENT_BASE_ROOT = path.join(EXT, "src", "gradient-theme");
const GRADIENT_CSS_ROOT = path.join(GRADIENT_BASE_ROOT, "css", "adaptive");
const GRADIENT_TARGET = path.join(GRADIENT_BASE_ROOT, "gradient-theme.css");
const MOUSE_TARGET = path.join(EXT, "src", "mouse-tail", "mouse-tail.js");
const WORD_TARGET = path.join(EXT, "src", "word-exploder", "word-exploder.js");

// ---------------------------------------------------------------------------
// 配置快照（普通对象）
//
// 这些快照就是执行层从 WorkspaceConfiguration 摊平出来的东西：数据表的 describe
// 只该看到快照与路径，不该看到 vscode。
// ---------------------------------------------------------------------------

// 迁移前 getCursorConfig() 的完整默认快照：20 个设置项 + 3 条由设置项推导的
// transition 语句。键顺序就是配置块里 JSON 的键顺序，因此逐字节有意义。
const CURSOR_DEFAULT_SNAPSHOT = {
  tailColor: "#FFC0CB",
  tailOpacity: 1,
  useShadow: true,
  shadowColor: "#FFC0CB",
  shadowBlurFactor: 0.5,
  cursorDisappearDelay: 50,
  cursorFadeOutDuration: 0.075,
  animationLength: 0.125,
  shortAnimationLength: 0.05,
  shortMoveThreshold: 8,
  rank0TrailFactor: 1,
  rank1TrailFactor: 0.9,
  rank2TrailFactor: 0.5,
  rank3TrailFactor: 0.3,
  useHardSnap: true,
  leadingSnapFactor: 0.1,
  leadingSnapThreshold: 0.5,
  animationResetThreshold: 0.075,
  maxTrailDistanceFactor: 100,
  snapAnimationLength: 0.02,
  canvasFadeTransitionCss: "opacity 0.075s ease-out",
  nativeCursorDisappearTransitionCss: "opacity 0s ease-out",
  nativeCursorRevealTransitionCss: "opacity 0.075s ease-in",
};

const CURSOR_SNAPSHOT = {
  tailColor: "#ABCDEF",
  tailOpacity: 0.5,
  useShadow: false,
  shadowColor: "#123456",
  shadowBlurFactor: 0.25,
  cursorDisappearDelay: 10,
  cursorFadeOutDuration: 0.2,
  animationLength: 0.3,
  shortAnimationLength: 0.1,
  shortMoveThreshold: 4,
  rank0TrailFactor: 1,
  rank1TrailFactor: 0.8,
  rank2TrailFactor: 0.4,
  rank3TrailFactor: 0.2,
  useHardSnap: false,
  leadingSnapFactor: 0.2,
  leadingSnapThreshold: 0.4,
  animationResetThreshold: 0.1,
  maxTrailDistanceFactor: 20,
  snapAnimationLength: 0.03,
  canvasFadeTransitionCss: "opacity 0.2s ease-out",
  nativeCursorDisappearTransitionCss: "opacity 0s ease-out",
  nativeCursorRevealTransitionCss: "opacity 0.2s ease-in",
};

const ANIMATION_SETTINGS = {
  "Command-Palette": "Scale",
  Tabs: "Slide",
  Active: "Indent",
  Scrolling: "Fade",
  "Smooth-Mode": true,
  Tokens: true,
};

const ANIMATION_SNAPSHOT = {
  settings: ANIMATION_SETTINGS,
  durations: { "Command-Palette": 120, Tabs: 0 },
  defaultDuration: 300,
};

const GRADIENT_CSS_KEYS = [
  "editor-hover",
  "git-num-icon",
  "linenumber-rainbow-glow",
  "quick-input",
  "text-glowing",
  "text-gradient",
  "top-active-tab",
  "horizontal",
];

const GRADIENT_SNAPSHOT = {
  "editor-hover": true,
  "git-num-icon": false,
  "linenumber-rainbow-glow": true,
  "quick-input": true,
  "text-glowing": false,
  "text-gradient": true,
  "top-active-tab": true,
  horizontal: false,
};

const MOUSE_SNAPSHOT = {
  mode: "ribbon",
  tailColor: "#112233",
  tailOpacity: 0.4,
  useShadow: true,
  shadowColor: "#445566",
  shadowBlurFactor: 2.5,
  pointLife: 0.05,
  maxPoints: 32,
  startWidth: 6,
  widthPower: 1.1,
  widthDecay: 0.9,
  energyCompensation: 0.6,
};

const WORD_SNAPSHOT = {
  fontFamily: "Fira Code",
  fontSize: 30,
  fontWeight: "600",
  mode: "drift",
  offsetX: -5,
  offsetY: -10,
  fixedTilt: 5,
  randomTilt: 20,
  gravityConfig: {
    gravity: 0.1,
    initialVelocityY: -4,
    initialVelocityX: 1.5,
    lifeDecay: 0.02,
  },
  zoomConfig: {
    initialScale: 1,
    maxScale: 2,
    minScale: 0.4,
    zoomSpeed: 0.2,
    shrinkSpeed: 0.06,
    lifeDecay: 0.02,
  },
  driftConfig: {
    upwardSpeed: 1.5,
    swingRange: 10,
    swingSpeed: 0.08,
    lifeDecay: 0.03,
  },
  colors: ["#010203", "#0A0B0C"],
};

const SNAPSHOTS = {
  cursor: CURSOR_SNAPSHOT,
  animations: ANIMATION_SNAPSHOT,
  gradient: GRADIENT_SNAPSHOT,
  mouse: MOUSE_SNAPSHOT,
  word: WORD_SNAPSHOT,
};

const TARGETS = {
  cursor: CURSOR_TARGET,
  animations: ANIMATION_TARGET,
  gradient: GRADIENT_TARGET,
  mouse: MOUSE_TARGET,
  word: WORD_TARGET,
};

// 假的配置读取能力：`get(name, fallback)`——未登记的值返回 fallback，
// 与 vscode 的 WorkspaceConfiguration.get 同语义。同时记录被问过的键。
function fakeGet(values = {}) {
  const asked = [];
  const get = (name, fallback) => {
    asked.push(name);
    return Object.hasOwn(values, name) ? values[name] : fallback;
  };
  return { get, asked };
}

function descriptorFor(key) {
  return buildEffectDescriptor(key, {
    extensionPath: EXT,
    snapshot: SNAPSHOTS[key],
  });
}

// ---------------------------------------------------------------------------
// 数据表本身
// ---------------------------------------------------------------------------

test("效果数据表：恰好 5 类效果，键与顺序固定", () => {
  assert.deepEqual(Object.keys(EFFECTS), [
    "cursor",
    "animations",
    "gradient",
    "mouse",
    "word",
  ]);
});

test("效果数据表：每条都声明作用域、总开关键、路径解析、配置快照与描述符映射", () => {
  for (const [key, effect] of Object.entries(EFFECTS)) {
    assert.equal(effect.scope, `visionSmashCode.${key}`, key);
    assert.equal(effect.baseKey, key, key);
    assert.equal(typeof effect.label, "string", key);
    assert.equal(typeof effect.paths, "function", key);
    assert.equal(typeof effect.readSettings, "function", key);
    assert.equal(typeof effect.describe, "function", key);
  }
});

test("效果数据表：错误提示前缀就是各效果的展示名称", () => {
  assert.deepEqual(
    Object.values(EFFECTS).map((effect) => effect.label),
    ["光标拖尾", "窗口动效", "渐变主题", "鼠标尾迹", "文字爆炸"],
  );
});

test("路径解析：5 个效果的目标文件与仓库中的资产严格同名（含大小写）", () => {
  for (const [key, target] of Object.entries(TARGETS)) {
    assert.equal(resolveEffectTargetPath(key, EXT), target, key);
    assert.equal(descriptorFor(key).targetPath, target, key);
  }
});

// ---------------------------------------------------------------------------
// 光标拖尾（marker-block + 纯数据正文）
// ---------------------------------------------------------------------------

test("光标拖尾：描述符是 marker-block，正文用变量名 + 配置对象渲染", () => {
  const descriptor = descriptorFor("cursor");

  assert.equal(descriptor.kind, "marker-block");
  assert.equal(descriptor.targetPath, CURSOR_TARGET);
  assert.deepEqual(descriptor.markers, MARKERS);
  assert.equal(descriptor.variableName, "cursorConfig");
  assert.deepEqual(descriptor.config, CURSOR_SNAPSHOT);
  // 纯数据载荷：没有预渲染正文。
  assert.equal("body" in descriptor, false);
});

test("光标拖尾：描述符不带 enabled（内容生成与总开关无关）", () => {
  for (const key of Object.keys(SNAPSHOTS)) {
    assert.equal("enabled" in descriptorFor(key), false, key);
  }
});

test("光标拖尾：默认快照与迁移前的完整配置快照逐字段一致（含键顺序）", () => {
  const { get, asked } = fakeGet();
  const snapshot = EFFECTS.cursor.readSettings(get);

  // 一条断言覆盖全部 23 个字段的值。
  assert.deepEqual(snapshot, CURSOR_DEFAULT_SNAPSHOT);
  // 键顺序决定配置块里 JSON 的顺序，必须与迁移前一致（deepEqual 不比较顺序）。
  assert.deepEqual(Object.keys(snapshot), Object.keys(CURSOR_DEFAULT_SNAPSHOT));

  // 单独点名几条容易写错的推导值：默认 transition 用的是「秒」，不是毫秒。
  assert.equal(snapshot.canvasFadeTransitionCss, "opacity 0.075s ease-out");
  assert.equal(snapshot.nativeCursorDisappearTransitionCss, "opacity 0s ease-out");
  assert.equal(snapshot.nativeCursorRevealTransitionCss, "opacity 0.075s ease-in");
  assert.ok(asked.includes("tailColor"));
  assert.ok(asked.includes("cursorFadeOutDuration"));
});

test("光标拖尾：配置快照尊重用户已设置的值（含 shadowColor 跟随自定义 tailColor）", () => {
  const { get } = fakeGet({ tailColor: "#00FF00", cursorFadeOutDuration: 0.5 });
  const snapshot = EFFECTS.cursor.readSettings(get);

  assert.equal(snapshot.tailColor, "#00FF00");
  assert.equal(snapshot.shadowColor, "#00FF00");
  assert.equal(snapshot.cursorFadeOutDuration, 0.5);
  assert.equal(snapshot.canvasFadeTransitionCss, "opacity 0.5s ease-out");
});

// ---------------------------------------------------------------------------
// 窗口动效（css-concat + 枚举选取 + 时长占位）
// ---------------------------------------------------------------------------

test("窗口动效：配置快照 = 6 个设置项 + Durations + Default-Duration", () => {
  const { get, asked } = fakeGet();

  const snapshot = EFFECTS.animations.readSettings(get);

  assert.deepEqual(asked, [
    ...ANIMATION_SETTING_KEYS,
    "Durations",
    "Default-Duration",
  ]);
  assert.deepEqual(Object.keys(snapshot.settings), ANIMATION_SETTING_KEYS);
  assert.equal(snapshot.durations, undefined);
  assert.equal(snapshot.defaultDuration, undefined);
});

test("窗口动效：描述符是 css-concat，片段布局来自 animation-segments（不在这里重写规则）", () => {
  const descriptor = descriptorFor("animations");

  assert.equal(descriptor.kind, "css-concat");
  assert.equal(descriptor.targetPath, ANIMATION_TARGET);
  assert.deepEqual(descriptor.settings, ANIMATION_SETTINGS);
  assert.deepEqual(descriptor.durations, ANIMATION_SNAPSHOT.durations);
  assert.equal(descriptor.defaultDuration, 300);

  const { segments } = descriptor;
  assert.equal(segments.length, 13);
  // 固定前缀：无 setting = 无条件拼入。
  assert.deepEqual(
    segments.slice(0, 2).map((segment) => path.basename(segment.path)),
    ["Default-Transitions.css", "Custom-Animations.css"],
  );
  assert.deepEqual(
    segments.slice(0, 2).map((segment) => segment.setting),
    [undefined, undefined],
  );
  // Scrolling 额外拼一段 _Animate.css：_Duration → _Animate → {value}。
  assert.deepEqual(
    segments
      .filter((segment) => segment.setting === "Scrolling")
      .map((segment) => path.relative(ANIMATION_CSS_ROOT, segment.path)),
    [
      path.join("Scrolling", "_Duration.css"),
      path.join("Scrolling", "_Animate.css"),
      path.join("Scrolling", "{value}.css"),
    ],
  );
  // 两个 Misc 开关走真值规则；Tokens 不参与时长占位替换。
  const tokens = segments.at(-1);
  assert.equal(tokens.setting, "Tokens");
  assert.equal(tokens.rule, "truthy");
  assert.equal(tokens.duration, undefined);
  assert.equal(segments.at(-2).setting, "Smooth-Mode");
  assert.equal(segments.at(-2).duration, true);
});

// ---------------------------------------------------------------------------
// 渐变主题（css-concat + 布尔开关）
// ---------------------------------------------------------------------------

test("渐变主题：配置快照只含 8 个片段开关", () => {
  const { get, asked } = fakeGet();

  const snapshot = EFFECTS.gradient.readSettings(get);

  assert.deepEqual(asked, GRADIENT_CSS_KEYS);
  assert.deepEqual(Object.keys(snapshot), GRADIENT_CSS_KEYS);
  // 未设置 ≠ false：缺省规则是 `!== false`，因此这里保留 undefined（视为开启）。
  assert.ok(Object.values(snapshot).every((value) => value === undefined));
});

test("渐变主题：描述符是 css-concat，片段顺序固定且路径在 adaptive 目录下", () => {
  const descriptor = descriptorFor("gradient");

  assert.equal(descriptor.kind, "css-concat");
  assert.equal(descriptor.targetPath, GRADIENT_TARGET);
  assert.deepEqual(descriptor.settings, GRADIENT_SNAPSHOT);
  assert.deepEqual(
    descriptor.segments.map((segment) => segment.setting),
    GRADIENT_CSS_KEYS,
  );
  assert.deepEqual(
    descriptor.segments.map((segment) => segment.path),
    GRADIENT_CSS_KEYS.map((key) => path.join(GRADIENT_CSS_ROOT, `${key}.css`)),
  );
  // 渐变没有枚举值与时长：片段上只有 setting + path。
  assert.ok(
    descriptor.segments.every(
      (segment) => Object.keys(segment).sort().join(",") === "path,setting",
    ),
  );
});

// ---------------------------------------------------------------------------
// 鼠标尾迹 / 文字爆炸（marker-block + 预渲染正文）
// ---------------------------------------------------------------------------

test("鼠标尾迹：描述符是 marker-block，正文是 marker-bodies 的手工排版", () => {
  const descriptor = descriptorFor("mouse");

  assert.equal(descriptor.kind, "marker-block");
  assert.equal(descriptor.targetPath, MOUSE_TARGET);
  assert.deepEqual(descriptor.markers, MARKERS);
  assert.equal(descriptor.body, renderMouseConfigBody(MOUSE_SNAPSHOT));
  // 预渲染正文优先：不再提供 variableName / config，避免两种排版互相矛盾。
  assert.equal("variableName" in descriptor, false);
  assert.equal("config" in descriptor, false);
});

test("鼠标尾迹：配置快照折叠默认值，键顺序与迁移前一致", () => {
  const { get } = fakeGet();
  const snapshot = EFFECTS.mouse.readSettings(get);

  assert.deepEqual(snapshot, {
    mode: "electric",
    tailColor: "#FFC0CB",
    tailOpacity: 0.9,
    useShadow: true,
    shadowColor: "#FFC0CB",
    shadowBlurFactor: 1.8,
    pointLife: 0.03,
    maxPoints: 50,
    startWidth: 5,
    widthPower: 1.4,
    widthDecay: 1.0,
    energyCompensation: 0.75,
  });
  // 键顺序决定手工排版正文里的字段顺序。
  assert.deepEqual(Object.keys(snapshot), [
    "mode",
    "tailColor",
    "tailOpacity",
    "useShadow",
    "shadowColor",
    "shadowBlurFactor",
    "pointLife",
    "maxPoints",
    "startWidth",
    "widthPower",
    "widthDecay",
    "energyCompensation",
  ]);
});

test("文字爆炸：描述符是 marker-block，正文是 marker-bodies 的手工排版", () => {
  const descriptor = descriptorFor("word");

  assert.equal(descriptor.kind, "marker-block");
  assert.equal(descriptor.targetPath, WORD_TARGET);
  assert.deepEqual(descriptor.markers, MARKERS);
  assert.equal(descriptor.body, renderWordConfigBody(WORD_SNAPSHOT));
  assert.equal("variableName" in descriptor, false);
  assert.equal("config" in descriptor, false);
});

test("文字爆炸：配置快照折叠默认值（含嵌套对象与颜色数组）", () => {
  const { get } = fakeGet();
  const snapshot = EFFECTS.word.readSettings(get);

  assert.deepEqual(Object.keys(snapshot), [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "mode",
    "offsetX",
    "offsetY",
    "fixedTilt",
    "randomTilt",
    "gravityConfig",
    "zoomConfig",
    "driftConfig",
    "colors",
  ]);
  assert.equal(snapshot.fontFamily, "Menlo, Monaco, 'Courier New', monospace");
  assert.equal(snapshot.fontSize, 25);
  assert.equal(snapshot.fontWeight, "bold");
  assert.equal(snapshot.mode, "zoom");
  assert.equal(snapshot.offsetX, -10);
  assert.equal(snapshot.offsetY, -20);
  assert.equal(snapshot.fixedTilt, 0);
  assert.equal(snapshot.randomTilt, 30);
  assert.deepEqual(snapshot.gravityConfig, {
    gravity: 0.08,
    initialVelocityY: -3.5,
    initialVelocityX: 1.0,
    lifeDecay: 0.015,
  });
  assert.deepEqual(snapshot.zoomConfig, {
    initialScale: 0.8,
    maxScale: 1.5,
    minScale: 0.5,
    zoomSpeed: 0.15,
    shrinkSpeed: 0.05,
    lifeDecay: 0.015,
  });
  assert.deepEqual(snapshot.driftConfig, {
    upwardSpeed: 1.2,
    swingRange: 15,
    swingSpeed: 0.06,
    lifeDecay: 0.02,
  });
  assert.equal(snapshot.colors.length, 9);
  assert.equal(snapshot.colors[0], "#FFD700");
  // 嵌套对象的键顺序同样会写进配置块。
  assert.deepEqual(Object.keys(snapshot.gravityConfig), [
    "gravity",
    "initialVelocityY",
    "initialVelocityX",
    "lifeDecay",
  ]);
  assert.deepEqual(Object.keys(snapshot.zoomConfig), [
    "initialScale",
    "maxScale",
    "minScale",
    "zoomSpeed",
    "shrinkSpeed",
    "lifeDecay",
  ]);
  assert.deepEqual(Object.keys(snapshot.driftConfig), [
    "upwardSpeed",
    "swingRange",
    "swingSpeed",
    "lifeDecay",
  ]);
});

// ---------------------------------------------------------------------------
// 映射本身的性质
// ---------------------------------------------------------------------------

test("描述符映射是纯的：同快照同路径必得同输出，且不修改快照", () => {
  for (const [key, snapshot] of Object.entries(SNAPSHOTS)) {
    const before = structuredClone(snapshot);
    const first = buildEffectDescriptor(key, {
      extensionPath: EXT,
      snapshot,
    });
    const second = buildEffectDescriptor(key, {
      extensionPath: EXT,
      snapshot,
    });

    assert.deepEqual(first, second, key);
    assert.deepEqual(snapshot, before, key);
  }
});

test("接缝可用性：5 个描述符都能直接交给 planRefresh 产出写入", () => {
  const ORIGINAL = ["// 原文", "const keep = 1;", ""].join("\n");

  for (const key of Object.keys(SNAPSHOTS)) {
    const descriptor = descriptorFor(key);
    const reads = [];
    const plan = planRefresh({
      effects: [descriptor],
      changeStates: {},
      currentImports: [],
      readText: (filePath) => {
        reads.push(filePath);
        return ORIGINAL;
      },
    });

    assert.deepEqual(plan.errors, [], key);
    assert.equal(plan.writes.length, 1, key);
    assert.equal(plan.writes[0].path, TARGETS[key], key);

    if (descriptor.kind === "css-concat") {
      // 拼接式：每个被选中的片段读一次，内容首尾相接、无分隔符。
      assert.ok(reads.length > 0, key);
      assert.equal(plan.writes[0].content, ORIGINAL.repeat(reads.length), key);
    } else {
      // 标记块式：正文被写进「起始标记 / 结束标记」之间，并插到文件头。
      const body =
        descriptor.body ??
        `const ${descriptor.variableName} = ${JSON.stringify(descriptor.config, null, 2)};`;
      assert.equal(reads[0], TARGETS[key], key);
      assert.equal(
        plan.writes[0].content,
        `${START}\n${body}\n${END}\n\n${ORIGINAL}`,
        key,
      );
    }
  }
});
