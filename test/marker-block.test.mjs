import { test } from "node:test";
import assert from "node:assert/strict";

import { planRefresh } from "../src/common/refresh-plan.js";

// 说明：这些路径是虚构的（磁盘上不存在），配合下面注入的内存 readText，
// 保证测试完全不碰文件系统；若实现绕过 readText 去读盘，测试会失败。
const TARGET = "C:\\ext\\src\\neovide-cursor\\neovide-cursor.js";

// 与 src/install/cursor-inject.js 中的标记常量逐字节一致（含注释定界符）。
const START = "/* __AUTO_CONFIG_START__ */";
const END = "/* __AUTO_CONFIG_END__ */";

// 目标文件里标记块之外的原文：必须一字不改地保留。
const ORIGINAL = [
  "// 光标拖尾效果（光标拖尾脚本本体，不应被注入逻辑触碰）",
  'const canvas = document.createElement("canvas");',
  "export function mount() {}",
  "",
].join("\n");

// 内存 readText：只认识这里登记的路径，其余一律 null（=文件缺失）。
function memoryReadText(files) {
  const calls = [];
  const readText = (p) => {
    calls.push(p);
    return Object.hasOwn(files, p) ? files[p] : null;
  };
  return { readText, calls };
}

// 描述符：执行层（cursor-inject.js）把配置快照与目标路径摊平成这个纯数据形状。
function cursorEffect({ config, ...overrides } = {}) {
  return {
    key: "cursor",
    targetPath: TARGET,
    enabled: true,
    kind: "marker-block",
    markers: { start: START, end: END },
    variableName: "cursorConfig",
    config: config ?? { tailColor: "#FFC0CB", tailOpacity: 1 },
    ...overrides,
  };
}

// 这里只关心内容生成：changeStates 留空，导入规划不参与，errors 就只剩渲染相关的失败。
function planFor(readText, effect = cursorEffect()) {
  return planRefresh({
    effects: [effect],
    changeStates: {},
    currentImports: [],
    readText,
  });
}

// 期望的配置块文本：手工写出（不由实现推导），锁住块形状与两空格缩进。
const EXPECTED_BLOCK = [
  START,
  "const cursorConfig = {",
  '  "tailColor": "#FFC0CB",',
  '  "tailOpacity": 1',
  "};",
  END,
].join("\n");

test("目标文件无标记时，配置块插入到文件头，原文完整保留", () => {
  const { readText, calls } = memoryReadText({ [TARGET]: ORIGINAL });

  const plan = planFor(readText);

  assert.deepEqual(plan.errors, []);
  assert.deepEqual(calls, [TARGET]);

  // 断言的是完整文件内容：块 → 两个换行 → 原文。
  assert.equal(plan.writes.length, 1);
  assert.equal(plan.writes[0].path, TARGET);
  assert.equal(plan.writes[0].content, `${EXPECTED_BLOCK}\n\n${ORIGINAL}`);
});

test("目标文件已有标记时，整块替换且标记外的内容一字不改", () => {
  // 旧配置块（值与本次不同）+ 前后都有必须保留的原文。
  const before = "// 文件头注释：注入逻辑不得改动这一行";
  const after = "// 文件尾注释：同样不得改动";
  const staleBlock = `${START}\nconst cursorConfig = {\n  "tailColor": "#000000"\n};\n${END}`;
  const original = [before, staleBlock, after, ""].join("\n");

  const { readText } = memoryReadText({ [TARGET]: original });

  const plan = planFor(readText);

  assert.deepEqual(plan.errors, []);

  // 断言的是完整文件内容：块被替换，前后原文与换行结构逐字节保留。
  assert.equal(
    plan.writes[0].content,
    [before, EXPECTED_BLOCK, after, ""].join("\n"),
  );
  // 旧值不再出现（整块替换，不是追加）。
  assert.ok(!plan.writes[0].content.includes("#000000"));
});

test("幂等：以上一次输出作为输入再结算，文件内容不再变化", () => {
  const first = planFor(memoryReadText({ [TARGET]: ORIGINAL }).readText);
  const firstContent = first.writes[0].content;

  const second = planFor(memoryReadText({ [TARGET]: firstContent }).readText);
  const third = planFor(
    memoryReadText({ [TARGET]: second.writes[0].content }).readText,
  );

  assert.equal(second.writes[0].content, firstContent);
  assert.equal(third.writes[0].content, firstContent);
  // 配置块在文件里只出现一次：第二次结算走的是"整块替换"而不是"再插入一次"。
  assert.equal(countOccurrences(firstContent, START), 1);
  assert.equal(countOccurrences(firstContent, END), 1);
  // 原文仍然完整（幂等不等于覆盖掉原文件）。
  assert.ok(firstContent.endsWith(ORIGINAL));
});

test("目标文件缺失时报告 errors、不抛异常、不写盘", () => {
  // 空映射 = readText 对任何路径都返回 null（接缝约定的"文件缺失"）。
  const { readText } = memoryReadText({});

  let plan;
  assert.doesNotThrow(() => {
    plan = planFor(readText);
  });

  // 与迁移前的差异：旧实现 throw `没找到目标文件: <path>`，接缝改为 errors 条目。
  assert.deepEqual(plan.writes, []);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, TARGET);
  assert.match(plan.errors[0].message, /目标文件/);
});

test("异常文件里出现两个标记块时，只替换第一处，第二处原样保留", () => {
  // 明确定义的行为：与迁移前的非全局正则一致——替换第一处，其余原样保留，且不报错。
  const firstBlock = `${START}\nconst cursorConfig = {\n  "tailColor": "#111111"\n};\n${END}`;
  const secondBlock = `${START}\nconst cursorConfig = {\n  "tailColor": "#222222"\n};\n${END}`;
  const middle = "// 两个标记块之间的原文";
  const original = [firstBlock, middle, secondBlock, ""].join("\n");

  const plan = planFor(memoryReadText({ [TARGET]: original }).readText);

  assert.deepEqual(plan.errors, []);
  assert.equal(
    plan.writes[0].content,
    [EXPECTED_BLOCK, middle, secondBlock, ""].join("\n"),
  );

  // 再结算一次仍然稳定：第一处替换成同样的内容，第二处继续保留。
  const again = planFor(
    memoryReadText({ [TARGET]: plan.writes[0].content }).readText,
  );
  assert.equal(again.writes[0].content, plan.writes[0].content);
});

test("描述符缺少 markers 或 variableName 时报告 errors、不写盘、不读文件", () => {
  // 载荷是执行层拼的纯数据，缺字段时不能靠 TypeError 冒泡（接缝约定：不抛异常）。
  const { readText, calls } = memoryReadText({ [TARGET]: ORIGINAL });

  let plan;
  assert.doesNotThrow(() => {
    plan = planFor(readText, cursorEffect({ markers: undefined }));
  });

  assert.deepEqual(plan.writes, []);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, TARGET);
  assert.match(plan.errors[0].message, /marker-block/);
  // 校验先于读取：描述符不完整时不必碰目标文件。
  assert.deepEqual(calls, []);
});

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// 光标拖尾的完整配置快照：字段与顺序与 src/install/cursor-inject.js 的
// getCursorConfig() 一致（20 个设置项 + 3 个由设置项推导出的 transition 语句）。
const FULL_CONFIG = {
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

// 期望的完整配置块：逐字段手工写出（独立于实现的期望值）。
const EXPECTED_FULL_BLOCK = `${START}
const cursorConfig = {
  "tailColor": "#FFC0CB",
  "tailOpacity": 1,
  "useShadow": true,
  "shadowColor": "#FFC0CB",
  "shadowBlurFactor": 0.5,
  "cursorDisappearDelay": 50,
  "cursorFadeOutDuration": 0.075,
  "animationLength": 0.125,
  "shortAnimationLength": 0.05,
  "shortMoveThreshold": 8,
  "rank0TrailFactor": 1,
  "rank1TrailFactor": 0.9,
  "rank2TrailFactor": 0.5,
  "rank3TrailFactor": 0.3,
  "useHardSnap": true,
  "leadingSnapFactor": 0.1,
  "leadingSnapThreshold": 0.5,
  "animationResetThreshold": 0.075,
  "maxTrailDistanceFactor": 100,
  "snapAnimationLength": 0.02,
  "canvasFadeTransitionCss": "opacity 0.075s ease-out",
  "nativeCursorDisappearTransitionCss": "opacity 0s ease-out",
  "nativeCursorRevealTransitionCss": "opacity 0.075s ease-in"
};
${END}`;

test("光标拖尾的全部配置项逐项渲染进配置块", () => {
  const { readText } = memoryReadText({ [TARGET]: ORIGINAL });

  const plan = planFor(readText, cursorEffect({ config: FULL_CONFIG }));

  assert.deepEqual(plan.errors, []);
  // 一条断言覆盖全部字段 + 字段顺序 + 两空格缩进 + 语句形状。
  assert.equal(plan.writes[0].content, `${EXPECTED_FULL_BLOCK}\n\n${ORIGINAL}`);

  // 逐字段再确认一次：避免整块相等掩盖"某个字段被悄悄丢掉"。
  for (const [field, value] of Object.entries(FULL_CONFIG)) {
    assert.ok(
      plan.writes[0].content.includes(`"${field}": ${JSON.stringify(value)}`),
      `配置块缺少字段 ${field}`,
    );
  }
});
