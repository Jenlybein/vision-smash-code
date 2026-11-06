import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { planRefresh } from "../src/common/refresh-plan.js";
import { renderWordConfigBody } from "../src/common/marker-bodies.js";

// 说明：目标是虚构路径（磁盘上不存在），内容全部来自内存 readText，
// 因此本文件只在"资产文件对照"那一条测试里真正读盘。
const TARGET = "C:\\ext\\src\\word-exploder\\word-exploder.js";

// 与 src/install/word-inject.js 的标记常量逐字节一致（含注释定界符）。
const START = "/* __AUTO_CONFIG_START__ */";
const END = "/* __AUTO_CONFIG_END__ */";

// 目标文件里标记块之外的原文：必须一字不改地保留。
const ORIGINAL = [
  "// 文字爆炸脚本本体（不应被注入逻辑触碰）",
  "const canvas = document.createElement(\"canvas\");",
  "export function mount() {}",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// golden reference：迁移前 src/install/word-inject.js 的排版与替换逻辑
//
// 逐字节抄自迁移前的实现（git show 1dfff87:src/install/word-inject.js）。
// 保留一份旧实现作为**独立参照**：新路径若改了任何一个空格、注释、字段顺序、
// 嵌套对象的缩进或颜色数组的排布，这里的等值断言就会失败。
// 注意：注释里有中文，仓库文件是 UTF-8；本文件与生成内容都按同一编码处理。
// ---------------------------------------------------------------------------
function legacyWordBlock(config) {
  const configLines = [
    `${START}`,
    "const explosionConfig = {",
    "  /* ========= 基础设置 ========= */",
    `  fontFamily: "${config.fontFamily}",`,
    `  fontSize: ${config.fontSize},`,
    `  fontWeight: "${config.fontWeight}",`,
    `  mode: "${config.mode}", // 'random', 'gravity', 'zoom', 'drift'`,
    "",
    "  /* ========= 特效位置偏移 ========= */",
    `  offsetX: ${config.offsetX},`,
    `  offsetY: ${config.offsetY},`,
    "",
    "  /* ========= 旋转设置 ========= */",
    `  fixedTilt: ${config.fixedTilt}, // 固定起始角度 (单位：度)`,
    `  randomTilt: ${config.randomTilt}, // 随机范围角度 (单位：度, 0代表不随机)`,
    "",
    "  /* ========= 1. 重力效果参数 (gravity) ========= */",
    "  gravityConfig: {",
    `    gravity: ${config.gravityConfig.gravity}, // 重力加速度`,
    `    initialVelocityY: ${config.gravityConfig.initialVelocityY}, // 向上弹射力度`,
    `    initialVelocityX: ${config.gravityConfig.initialVelocityX}, // 横向扩散范围`,
    `    lifeDecay: ${config.gravityConfig.lifeDecay}, // 消失速度`,
    "  },",
    "",
    "  /* ========= 2. 缩放效果参数 (zoom) ========= */",
    "  zoomConfig: {",
    `    initialScale: ${config.zoomConfig.initialScale}, // 初始大小倍数`,
    `    maxScale: ${config.zoomConfig.maxScale}, // 最大扩张倍数`,
    `    minScale: ${config.zoomConfig.minScale}, // 缩小后的最终大小`,
    `    zoomSpeed: ${config.zoomConfig.zoomSpeed}, // 变大速率`,
    `    shrinkSpeed: ${config.zoomConfig.shrinkSpeed}, // 最大后的缩小速率`,
    `    lifeDecay: ${config.zoomConfig.lifeDecay}, // 透明度消失速度`,
    "  },",
    "",
    "  /* ========= 3. 漂浮效果参数 (drift) ========= */",
    "  driftConfig: {",
    `    upwardSpeed: ${config.driftConfig.upwardSpeed}, // 向上漂浮速度`,
    `    swingRange: ${config.driftConfig.swingRange}, // 左右摆动幅度`,
    `    swingSpeed: ${config.driftConfig.swingSpeed}, // 摆动频率`,
    `    lifeDecay: ${config.driftConfig.lifeDecay}, // 消失速度`,
    "  },",
    "",
    "  /* ========= 颜色列表 ========= */",
    "  colors: [",
    ...config.colors.map((c) => `    "${c}",`),
    "  ],",
    "};",
    `${END}`,
  ];

  return configLines.join("\n");
}

function legacyUpdate(originalCode, configBlock) {
  const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markerRegex = new RegExp(
    `${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`,
    "m",
  );

  if (markerRegex.test(originalCode)) {
    return originalCode.replace(markerRegex, configBlock);
  }
  return `${configBlock}\n\n${originalCode}`;
}

// ---------------------------------------------------------------------------
// 新路径：描述符 + 接缝
// ---------------------------------------------------------------------------

// 与迁移前 getWordConfig() 的默认值一致（读 vscode 配置的那一步留在执行层）。
const DEFAULT_CONFIG = {
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  fontSize: 25,
  fontWeight: "bold",
  mode: "zoom",
  offsetX: -10,
  offsetY: -20,
  fixedTilt: 0,
  randomTilt: 30,
  gravityConfig: {
    gravity: 0.08,
    initialVelocityY: -3.5,
    initialVelocityX: 1.0,
    lifeDecay: 0.015,
  },
  zoomConfig: {
    initialScale: 0.8,
    maxScale: 1.5,
    minScale: 0.5,
    zoomSpeed: 0.15,
    shrinkSpeed: 0.05,
    lifeDecay: 0.015,
  },
  driftConfig: {
    upwardSpeed: 1.2,
    swingRange: 15,
    swingSpeed: 0.06,
    lifeDecay: 0.02,
  },
  colors: [
    "#FFD700",
    "#FF6347",
    "#00BFFF",
    "#32CD32",
    "#FF69B4",
    "#8A2BE2",
    "#FFA500",
    "#00FA9A",
    "#FF00FF",
  ],
};

// 迁移前 word-exploder 模式的全集（与 package.json 的 enum 一致）。
const MODES = ["random", "gravity", "zoom", "drift"];

function wordEffect(config) {
  return {
    key: "word",
    kind: "marker-block",
    targetPath: TARGET,
    enabled: true,
    markers: { start: START, end: END },
    // 正文由效果自己排版，交给接缝的只有"预先渲染好的正文"。
    body: renderWordConfigBody(config),
  };
}

function planWord(original, config) {
  return planRefresh({
    effects: [wordEffect(config)],
    changeStates: {},
    currentImports: [],
    readText: (p) => (p === TARGET ? original : null),
  });
}

// ---------------------------------------------------------------------------
// 逐字节等价
// ---------------------------------------------------------------------------

test("文字爆炸：默认配置（含嵌套配置与颜色数组）生成的内容与迁移前逐字节相同", () => {
  const plan = planWord(ORIGINAL, DEFAULT_CONFIG);

  assert.deepEqual(plan.errors, []);
  assert.equal(plan.writes.length, 1);
  assert.equal(plan.writes[0].path, TARGET);
  assert.equal(
    plan.writes[0].content,
    legacyUpdate(ORIGINAL, legacyWordBlock(DEFAULT_CONFIG)),
  );
});

test("文字爆炸：嵌套配置对象与颜色数组逐项渲染，缩进与迁移前一致", () => {
  const body = renderWordConfigBody(DEFAULT_CONFIG);

  // 这些是独立于 legacy 抄本的定点断言：让失败信息直接指出是哪一类排版坏了。
  for (const [field, value] of Object.entries(DEFAULT_CONFIG.gravityConfig)) {
    assert.ok(
      body.includes(`    ${field}: ${value}, //`),
      `gravityConfig.${field} 的缩进或行内说明变了`,
    );
  }
  for (const [field, value] of Object.entries(DEFAULT_CONFIG.zoomConfig)) {
    assert.ok(
      body.includes(`    ${field}: ${value}, //`),
      `zoomConfig.${field} 的缩进或行内说明变了`,
    );
  }
  for (const [field, value] of Object.entries(DEFAULT_CONFIG.driftConfig)) {
    assert.ok(
      body.includes(`    ${field}: ${value}, //`),
      `driftConfig.${field} 的缩进或行内说明变了`,
    );
  }
  // 颜色数组：每项一行、四空格缩进、带尾逗号。
  for (const color of DEFAULT_CONFIG.colors) {
    assert.ok(
      body.includes(`\n    "${color}",\n`),
      `颜色 ${color} 的排布变了`,
    );
  }
});

test("文字爆炸：mode 的其余每个枚举值都与迁移前逐字节相同", () => {
  for (const mode of MODES) {
    const config = { ...DEFAULT_CONFIG, mode };

    const plan = planWord(ORIGINAL, config);

    assert.deepEqual(plan.errors, []);

    assert.ok(
      plan.writes[0].content.includes(
        `  mode: "${mode}", // 'random', 'gravity', 'zoom', 'drift'`,
      ),
      `mode=${mode} 未按迁移前的格式渲染`,
    );
    assert.equal(
      plan.writes[0].content,
      legacyUpdate(ORIGINAL, legacyWordBlock(config)),
      `mode=${mode} 的整块内容与迁移前不一致`,
    );
  }
});

test("文字爆炸：colors 改为单色数组时与迁移前逐字节相同", () => {
  const config = { ...DEFAULT_CONFIG, colors: ["#FF0000"] };

  const plan = planWord(ORIGINAL, config);

  assert.deepEqual(plan.errors, []);
  // 单色数组也要保持"每项一行"的形状，而不是被压成一行。
  assert.ok(plan.writes[0].content.includes('  colors: [\n    "#FF0000",\n  ],'));
  assert.equal(
    plan.writes[0].content,
    legacyUpdate(ORIGINAL, legacyWordBlock(config)),
  );
});

test("文字爆炸：目标文件已有标记块时，整块替换结果与迁移前逐字节相同", () => {
  const before = "// 文件头注释：注入逻辑不得改动这一行";
  const after = "// 文件尾注释：同样不得改动";
  const staleBlock = [
    START,
    "const explosionConfig = {",
    '  mode: "random",',
    "};",
    END,
  ].join("\n");
  const original = [before, staleBlock, after, ""].join("\n");

  const plan = planWord(original, DEFAULT_CONFIG);

  assert.deepEqual(plan.errors, []);
  assert.equal(
    plan.writes[0].content,
    legacyUpdate(original, legacyWordBlock(DEFAULT_CONFIG)),
  );
  assert.ok(!plan.writes[0].content.includes('mode: "random"'));
});

// ---------------------------------------------------------------------------
// 插入 / 幂等 / 失败
// ---------------------------------------------------------------------------

test("文字爆炸：无标记时插入到文件头，原文完整保留", () => {
  const plan = planWord(ORIGINAL, DEFAULT_CONFIG);

  assert.deepEqual(plan.errors, []);
  assert.equal(
    plan.writes[0].content,
    `${legacyWordBlock(DEFAULT_CONFIG)}\n\n${ORIGINAL}`,
  );
});

test("文字爆炸：幂等，两次结算后文件内容不再变化", () => {
  const first = planWord(ORIGINAL, DEFAULT_CONFIG).writes[0].content;
  const second = planWord(first, DEFAULT_CONFIG).writes[0].content;
  const third = planWord(second, DEFAULT_CONFIG).writes[0].content;

  assert.equal(second, first);
  assert.equal(third, first);
  assert.equal(first.split(START).length - 1, 1);
  assert.equal(first.split(END).length - 1, 1);
  assert.ok(first.endsWith(ORIGINAL));
});

test("文字爆炸：目标文件缺失时报告 errors、不抛异常、不写盘", () => {
  let plan;
  assert.doesNotThrow(() => {
    plan = planRefresh({
      effects: [wordEffect(DEFAULT_CONFIG)],
      changeStates: {},
      currentImports: [],
      readText: () => null,
    });
  });

  assert.deepEqual(plan.writes, []);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, TARGET);
  assert.match(plan.errors[0].message, /目标文件/);
});

// ---------------------------------------------------------------------------
// 独立参照：迁移前就已经在仓库里的资产文件
// ---------------------------------------------------------------------------

test("文字爆炸：按资产文件里的取值渲染，前段与该资产已有的配置块逐字节相同", () => {
  // 拿仓库里**迁移前就存在**的运行时资产当参照物：src/word-exploder/word-exploder.js
  // 的配置块本来就是旧格式化器的产物。
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  // 工作区检出可能是 CRLF（core.autocrlf），比对前统一归一化为 LF；
  // 生成侧本身固定 LF，这一点由鼠标尾迹那边的 CRLF 用例锁住。
  const toLf = (text) => text.replace(/\r\n/g, "\n");
  const asset = toLf(
    fs.readFileSync(
      path.join(repoRoot, "src", "word-exploder", "word-exploder.js"),
      "utf8",
    ),
  );

  const blockStartIndex = asset.indexOf(START);
  const blockEndIndex = asset.indexOf(END);
  assert.ok(blockStartIndex === 0, "资产的配置块应位于文件头");
  assert.ok(blockEndIndex > blockStartIndex);

  const assetBody = asset.slice(
    blockStartIndex + START.length + 1,
    blockEndIndex - 1,
  );

  // 资产里的取值（原样抄自资产，不是从默认值推导出来的）。
  const assetConfig = {
    fontFamily: "Menlo, Monaco, 'Courier New', monospace",
    fontSize: 25,
    fontWeight: "bold",
    mode: "zoom",
    offsetX: -10,
    offsetY: -20,
    fixedTilt: 10,
    randomTilt: 0,
    gravityConfig: {
      gravity: 0.08,
      initialVelocityY: -3.5,
      initialVelocityX: 1,
      lifeDecay: 0.015,
    },
    zoomConfig: {
      initialScale: 1.5,
      maxScale: 2,
      minScale: 0.5,
      zoomSpeed: 0.1,
      shrinkSpeed: 0.01,
      lifeDecay: 0.01,
    },
    driftConfig: {
      upwardSpeed: 1.2,
      swingRange: 15,
      swingSpeed: 0.06,
      lifeDecay: 0.02,
    },
    colors: [
      "#FFD700",
      "#FF6347",
      "#00BFFF",
      "#32CD32",
      "#FF69B4",
      "#8A2BE2",
      "#FFA500",
      "#00FA9A",
      "#FF00FF",
    ],
  };

  const renderedBody = renderWordConfigBody(assetConfig);
  const renderedLines = renderedBody.split("\n");
  const assetLines = assetBody.split("\n");

  // 资产里的配置块比格式化器的产物多一段 `bannedKeys: [...]`：这是迁移前就存在的
  // 手写差异（旧格式化器整块替换时会把它丢掉），本工单只保证行为不变，不改变它。
  // 因此这里只对照渲染器会产出的那一部分——去掉渲染器最后一行 `};`。
  assert.equal(assetLines[renderedLines.length - 1], "");
  assert.equal(assetLines[renderedLines.length], "  bannedKeys: [");

  assert.deepEqual(
    assetLines.slice(0, renderedLines.length - 1),
    renderedLines.slice(0, -1),
  );
});
