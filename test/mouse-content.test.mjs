import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { planRefresh } from "../src/common/refresh-plan.js";
import { renderMouseConfigBody } from "../src/common/marker-bodies.js";

// 说明：目标是虚构路径（磁盘上不存在），内容全部来自内存 readText，
// 因此本文件只在"资产文件对照"那一条测试里真正读盘。
const TARGET = "C:\\ext\\src\\mouse-tail\\mouse-tail.js";

// 与 src/install/mouse-inject.js 的标记常量逐字节一致（含注释定界符）。
const START = "/* __AUTO_CONFIG_START__ */";
const END = "/* __AUTO_CONFIG_END__ */";

// 目标文件里标记块之外的原文：必须一字不改地保留。
const ORIGINAL = [
  "// 鼠标尾迹脚本本体（不应被注入逻辑触碰）",
  "const canvas = document.createElement(\"canvas\");",
  "export function mount() {}",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// golden reference：迁移前 src/install/mouse-inject.js 的排版与替换逻辑
//
// 逐字节抄自迁移前的实现（git show 1dfff87:src/install/mouse-inject.js）。
// 保留一份旧实现作为**独立参照**：新路径若改了任何一个空格、注释、字段顺序，
// 这里的等值断言就会失败。不要"顺手美化"这个函数——它的价值就在于它是旧的。
// ---------------------------------------------------------------------------
function legacyMouseBlock(config) {
  const configLines = [
    `${START}`,
    "const mouseConfig = {",
    `  mode: "${config.mode}", // dots | ribbon | beam | electric | smoke`,
    "",
    "  /* ========= 颜色 / 透明度 ========= */",
    `  tailColor: "${config.tailColor}", // 尾迹主颜色（HEX）`,
    `  tailOpacity: ${config.tailOpacity}, // 全局透明度倍率（0 ~ 1）`,
    "",
    "  /* ========= 阴影 / 发光 ========= */",
    `  useShadow: ${config.useShadow}, // 是否启用发光阴影`,
    `  shadowColor: "${config.shadowColor}", // 阴影颜色（HEX）`,
    `  shadowBlurFactor: ${config.shadowBlurFactor}, // 阴影模糊强度（乘以 startWidth）`,
    "",
    "  /* ========= 尾迹长度 / 生命周期 ========= */",
    `  pointLife: ${config.pointLife}, // 点的生命衰减速度`,
    `  maxPoints: ${config.maxPoints}, // 最大点数量`,
    "",
    "  /* ========= 宽度控制 ========= */",
    `  startWidth: ${config.startWidth}, // 鼠标头部最大宽度`,
    `  widthPower: ${config.widthPower}, // 宽度衰减指数`,
    `  widthDecay: ${config.widthDecay}, // 宽度整体缩放系数`,
    "",
    "  /* ========= 亮度 / 能量 ========= */",
    `  energyCompensation: ${config.energyCompensation}, // 细线时的亮度补偿`,
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

// 与迁移前 getMouseConfig() 的默认值一致（读 vscode 配置的那一步留在执行层，这里只给它快照）。
const DEFAULT_CONFIG = {
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
};

// 迁移前 mouse-tail 模式的全集（与 package.json 的 enum 一致）。
const MODES = ["dots", "ribbon", "beam", "electric", "smoke"];

function mouseEffect(config) {
  return {
    key: "mouse",
    kind: "marker-block",
    targetPath: TARGET,
    enabled: true,
    markers: { start: START, end: END },
    // 正文由效果自己排版，交给接缝的只有"预先渲染好的正文"。
    body: renderMouseConfigBody(config),
  };
}

function planMouse(original, config) {
  return planRefresh({
    effects: [mouseEffect(config)],
    // 这里只关心内容生成：变更状态与导入列表不参与。
    changeStates: {},
    currentImports: [],
    readText: (p) => (p === TARGET ? original : null),
  });
}

// ---------------------------------------------------------------------------
// 逐字节等价
// ---------------------------------------------------------------------------

test("鼠标尾迹：默认配置生成的内容与迁移前逐字节相同", () => {
  const plan = planMouse(ORIGINAL, DEFAULT_CONFIG);

  assert.deepEqual(plan.errors, []);
  assert.equal(plan.writes.length, 1);
  assert.equal(plan.writes[0].path, TARGET);
  assert.equal(
    plan.writes[0].content,
    legacyUpdate(ORIGINAL, legacyMouseBlock(DEFAULT_CONFIG)),
  );
});

test("鼠标尾迹：mode 的其余每个枚举值都与迁移前逐字节相同", () => {
  for (const mode of MODES) {
    const config = { ...DEFAULT_CONFIG, mode };

    const plan = planMouse(ORIGINAL, config);

    assert.deepEqual(plan.errors, []);

    // 先锁住 mode 这一行本身（失败信息比整块比对更可读）。
    assert.ok(
      plan.writes[0].content.includes(
        `  mode: "${mode}", // dots | ribbon | beam | electric | smoke`,
      ),
      `mode=${mode} 未按迁移前的格式渲染`,
    );
    assert.equal(
      plan.writes[0].content,
      legacyUpdate(ORIGINAL, legacyMouseBlock(config)),
      `mode=${mode} 的整块内容与迁移前不一致`,
    );
  }
});

test("鼠标尾迹：useShadow 改为 false 与迁移前逐字节相同", () => {
  const config = { ...DEFAULT_CONFIG, useShadow: false };

  const plan = planMouse(ORIGINAL, config);

  assert.deepEqual(plan.errors, []);
  assert.ok(
    plan.writes[0].content.includes("  useShadow: false, // 是否启用发光阴影"),
  );
  assert.equal(
    plan.writes[0].content,
    legacyUpdate(ORIGINAL, legacyMouseBlock(config)),
  );
});

test("鼠标尾迹：目标文件已有标记块时，整块替换结果与迁移前逐字节相同", () => {
  const before = "// 文件头注释：注入逻辑不得改动这一行";
  const after = "// 文件尾注释：同样不得改动";
  const staleBlock = [
    START,
    "const mouseConfig = {",
    '  mode: "smoke",',
    "};",
    END,
  ].join("\n");
  const original = [before, staleBlock, after, ""].join("\n");

  const plan = planMouse(original, DEFAULT_CONFIG);

  assert.deepEqual(plan.errors, []);
  assert.equal(
    plan.writes[0].content,
    legacyUpdate(original, legacyMouseBlock(DEFAULT_CONFIG)),
  );
  // 旧值不再出现：是整块替换，不是追加。
  assert.ok(!plan.writes[0].content.includes('mode: "smoke"'));
});

test("鼠标尾迹：原文用 CRLF 时，注入块自身仍是 LF，原文的 CRLF 一字不改（与迁移前一致）", () => {
  // 仓库工作区因 core.autocrlf=true 被检出为 CRLF（仓库内容实际是 LF）。旧实现的
  // configBlock 由 join("\n") 得到，永远是 LF；而插入 / 替换只在块上发生，
  // 原文的换行符原样保留。新路径必须完全一致，不做任何换行归一化。
  const originalCrlf = ORIGINAL.replace(/\n/g, "\r\n");

  const plan = planMouse(originalCrlf, DEFAULT_CONFIG);

  assert.deepEqual(plan.errors, []);

  const content = plan.writes[0].content;
  const block = legacyMouseBlock(DEFAULT_CONFIG);

  assert.equal(content, legacyUpdate(originalCrlf, block));
  // 块内没有 CR：生成侧固定 LF。
  assert.ok(!block.includes("\r"));
  assert.equal(content.slice(0, block.length + 2), `${block}\n\n`);
  // 原文（含其 CRLF）一字未改。
  assert.equal(content.slice(block.length + 2), originalCrlf);
});

// ---------------------------------------------------------------------------
// 插入 / 幂等 / 失败
// ---------------------------------------------------------------------------

test("鼠标尾迹：无标记时插入到文件头，原文完整保留", () => {
  const plan = planMouse(ORIGINAL, DEFAULT_CONFIG);

  assert.deepEqual(plan.errors, []);
  assert.equal(
    plan.writes[0].content,
    `${legacyMouseBlock(DEFAULT_CONFIG)}\n\n${ORIGINAL}`,
  );
});

test("鼠标尾迹：幂等，两次结算后文件内容不再变化", () => {
  const first = planMouse(ORIGINAL, DEFAULT_CONFIG).writes[0].content;
  const second = planMouse(first, DEFAULT_CONFIG).writes[0].content;
  const third = planMouse(second, DEFAULT_CONFIG).writes[0].content;

  assert.equal(second, first);
  assert.equal(third, first);
  // 配置块在文件里只出现一次：第二次结算走的是整块替换。
  assert.equal(first.split(START).length - 1, 1);
  assert.equal(first.split(END).length - 1, 1);
  assert.ok(first.endsWith(ORIGINAL));
});

test("鼠标尾迹：目标文件缺失时报告 errors、不抛异常、不写盘", () => {
  let plan;
  assert.doesNotThrow(() => {
    plan = planRefresh({
      effects: [mouseEffect(DEFAULT_CONFIG)],
      changeStates: {},
      currentImports: [],
      // 空映射：任何路径都读不到。
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

test("鼠标尾迹：按资产文件里的取值渲染，结果与该资产已有的配置块逐字节相同", () => {
  // 这条断言不依赖上面的 legacy 抄本，而是拿仓库里**迁移前就存在**的运行时资产当参照物：
  // src/mouse-tail/mouse-tail.js 的配置块本来就是旧格式化器的产物。
  const assetPath = path.join(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    "src",
    "mouse-tail",
    "mouse-tail.js",
  );
  // 工作区检出可能是 CRLF（core.autocrlf），比对前统一归一化为 LF；
  // 生成侧本身固定 LF，这一点由上面的 CRLF 用例锁住。
  const toLf = (text) => text.replace(/\r\n/g, "\n");
  const asset = toLf(fs.readFileSync(assetPath, "utf8"));

  const blockStartIndex = asset.indexOf(START);
  const blockEndIndex = asset.indexOf(END);
  assert.ok(blockStartIndex === 0, "资产的配置块应位于文件头");
  assert.ok(blockEndIndex > blockStartIndex);

  // 块 = START + LF + 正文 + LF + END
  const assetBody = asset.slice(blockStartIndex + START.length + 1, blockEndIndex - 1);

  // 资产里的取值（原样抄自资产，不是从默认值推导出来的）。
  const assetConfig = {
    mode: "ribbon",
    tailColor: "#FFD700",
    tailOpacity: 0.9,
    useShadow: true,
    shadowColor: "#FF0000",
    shadowBlurFactor: 2,
    pointLife: 0.03,
    maxPoints: 24,
    startWidth: 4,
    widthPower: 0.8,
    widthDecay: 0.8,
    energyCompensation: 0.75,
  };

  assert.equal(renderMouseConfigBody(assetConfig), assetBody);
});
