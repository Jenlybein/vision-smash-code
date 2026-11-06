import { test } from "node:test";
import assert from "node:assert/strict";

import { planRefresh } from "../src/common/refresh-plan.js";

// 说明：目标是虚构路径（磁盘上不存在），内容全部来自内存 readText。
const TARGET = "C:\\ext\\src\\mouse-tail\\mouse-tail.js";

const START = "/* __AUTO_CONFIG_START__ */";
const END = "/* __AUTO_CONFIG_END__ */";

const ORIGINAL = ["// 原文", "const x = 1;", ""].join("\n");

function memoryReadText(files) {
  const calls = [];
  const readText = (p) => {
    calls.push(p);
    return Object.hasOwn(files, p) ? files[p] : null;
  };
  return { readText, calls };
}

// marker-block 的两种载荷：
// - 纯数据：variableName + config（两空格缩进 JSON）；
// - 预渲染正文：body（效果自己排版，例如带分节注释的手工文本）。
function bodyEffect({ body, ...overrides }) {
  return {
    key: "mouse",
    targetPath: TARGET,
    enabled: true,
    kind: "marker-block",
    markers: { start: START, end: END },
    ...(body === undefined ? {} : { body }),
    ...overrides,
  };
}

function planFor(effect, original = ORIGINAL) {
  return planRefresh({
    effects: [effect],
    changeStates: {},
    currentImports: [],
    readText: memoryReadText({ [TARGET]: original }).readText,
  });
}

const BODY = ["const mouseConfig = {", "  mode: \"electric\",", "};"].join("\n");

test("body 载荷：无标记时把「标记 + 正文 + 标记」插入到文件头", () => {
  const plan = planFor(bodyEffect({ body: BODY }));

  assert.deepEqual(plan.errors, []);
  assert.equal(
    plan.writes[0].content,
    `${START}\n${BODY}\n${END}\n\n${ORIGINAL}`,
  );
});

test("body 载荷：有标记时整块替换，且不需要 variableName / config", () => {
  const stale = `${START}\nconst mouseConfig = {\n  mode: "smoke",\n};\n${END}`;
  const original = ["// 头", stale, "// 尾", ""].join("\n");

  const plan = planFor(bodyEffect({ body: BODY }), original);

  assert.deepEqual(plan.errors, []);
  assert.equal(
    plan.writes[0].content,
    ["// 头", `${START}\n${BODY}\n${END}`, "// 尾", ""].join("\n"),
  );
});

test("body 载荷：优先于 config 与 variableName", () => {
  // 同时给三种载荷时，唯一生效的是 body——否则执行层会得到两种互相矛盾的排版。
  const plan = planFor(
    bodyEffect({
      body: BODY,
      variableName: "ignoredConfig",
      config: { ignored: true },
    }),
  );

  assert.deepEqual(plan.errors, []);
  assert.equal(
    plan.writes[0].content,
    `${START}\n${BODY}\n${END}\n\n${ORIGINAL}`,
  );
  assert.ok(!plan.writes[0].content.includes("ignoredConfig"));
  assert.ok(!plan.writes[0].content.includes("ignored"));
});

test("body 载荷：空字符串是合法的空正文", () => {
  const plan = planFor(bodyEffect({ body: "" }));

  assert.deepEqual(plan.errors, []);
  assert.equal(plan.writes[0].content, `${START}\n\n${END}\n\n${ORIGINAL}`);
});

test("body 载荷：body 为 null 时视为未提供，回退到 config 渲染", () => {
  const plan = planFor(
    bodyEffect({ body: null, variableName: "cursorConfig", config: { a: 1 } }),
  );

  assert.deepEqual(plan.errors, []);
  assert.equal(
    plan.writes[0].content,
    `${START}\nconst cursorConfig = {\n  "a": 1\n};\n${END}\n\n${ORIGINAL}`,
  );
});

test("body 载荷：body 不是字符串时报告 errors、不写盘、不读文件", () => {
  const { readText, calls } = memoryReadText({ [TARGET]: ORIGINAL });

  let plan;
  assert.doesNotThrow(() => {
    plan = planRefresh({
      effects: [bodyEffect({ body: 42 })],
      changeStates: {},
      currentImports: [],
      readText,
    });
  });

  assert.deepEqual(plan.writes, []);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].path, TARGET);
  assert.match(plan.errors[0].message, /body/);
  // 校验先于读取：载荷类型不对时不必碰目标文件。
  assert.deepEqual(calls, []);
});

test("body 载荷：缺少 markers 时报告 errors（标记仍归接缝管）", () => {
  const plan = planFor({
    key: "mouse",
    targetPath: TARGET,
    enabled: true,
    kind: "marker-block",
    body: BODY,
  });

  assert.deepEqual(plan.writes, []);
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0].message, /marker-block/);
});

test("body 载荷：目标文件缺失时报告 errors、不抛异常", () => {
  let plan;
  assert.doesNotThrow(() => {
    plan = planRefresh({
      effects: [bodyEffect({ body: BODY })],
      changeStates: {},
      currentImports: [],
      readText: () => null,
    });
  });

  assert.deepEqual(plan.writes, []);
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0].message, /目标文件/);
});
