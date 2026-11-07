// 设置界面分组守卫。
//
// 背景：VS Code 的设置界面按 `contributes.configuration` 里每个分组的 `title` 归类、
// 按 `order` 排序。某个分组若缺 `title`，它就不会成组，在设置界面里会以散落条目的
// 形式漂到最前面，把本该排第一的「Base Settings」挤下去——这正是 1.2.0 里实际发生的
// 回归：gradient 那一组既没有 title 也没有 order。
//
// 注意：这是对 manifest 的静态断言，不是界面渲染验证。真实设置界面长什么样，
// 需要在 VS Code 里实际打开「设置 → 扩展 → Vision Smash Code」才能确认。

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const sections = pkg.contributes.configuration;

test("每个设置分组都必须有 title，否则不会成组并会漂到设置界面最前面", () => {
  sections.forEach((section, index) => {
    assert.ok(
      typeof section.title === "string" && section.title.trim().length > 0,
      `contributes.configuration[${index}] 缺少 title；键为 ${Object.keys(section.properties ?? {})[0] ?? "(空)"}`,
    );
  });
});

test("每个设置分组都必须有 order，且互不重复", () => {
  const orders = sections.map((section, index) => {
    assert.equal(
      typeof section.order,
      "number",
      `contributes.configuration[${index}]（${section.title}）缺少数值型 order`,
    );
    return section.order;
  });

  assert.equal(
    new Set(orders).size,
    orders.length,
    `order 出现重复：${orders.join(", ")}；重复会让分组顺序不确定`,
  );
});

test("Base Settings 必须排在最前，总开关优先于子开关出现在设置界面", () => {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  assert.match(
    sorted[0].title,
    /^Base Settings/,
    `排第一的分组应是 Base Settings，实际是「${sorted[0].title}」`,
  );
  // Base Settings 里必须真的是那五个总开关 + loader，而不是被塞进别的键
  const baseKeys = Object.keys(sorted[0].properties ?? {});
  for (const key of ["cursor", "animations", "word", "gradient", "mouse"]) {
    assert.ok(
      baseKeys.includes(`visionSmashCode.base.${key}`),
      `Base Settings 缺少总开关 visionSmashCode.base.${key}`,
    );
  }
});

test("五个总开关的默认值必须都是 false（初次安装不应自动开启任何效果）", () => {
  const base = sections.find((section) => /^Base Settings/.test(section.title ?? ""));
  assert.ok(base, "找不到 Base Settings 分组");
  for (const key of ["cursor", "animations", "word", "gradient", "mouse"]) {
    assert.equal(
      base.properties[`visionSmashCode.base.${key}`].default,
      false,
      `visionSmashCode.base.${key} 的默认值应为 false`,
    );
  }
});
