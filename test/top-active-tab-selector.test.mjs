// 注意：本文件是「选择器形状」守卫，不是视觉验证。
//
// 它断言的是 CSS 文本里出现/不出现哪些类名，而不是渐变条在真实 VS Code 上有没有画出来。
// 选择器是否命中、命中几个标签、渐变颜色对不对，只能靠人工在 VS Code 里看（见工单 #20
// 汇报里的验证步骤）。因此这里刻意不引入无头浏览器——那会是「看起来在测视觉」的假象。
//
// 背景（见 docs/diagnosis/loader-and-effect-failures.md 的证据 E、已确证第 10 条）：
// 原选择器是 6 个类名的硬与：.tab.tab-actions-right.sizing-fit.has-icon.tab-border-top.active。
// 其中 has-icon、tab-border-top 在 VS Code 源码里是条件性添加的，sizing-fit /
// tab-actions-right 取决于用户设置——任一不成立整条规则静默失效（CSS 不报错）。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const fragmentPath = path.join(
  repoRoot,
  "src",
  "gradient-theme",
  "css",
  "adaptive",
  "top-active-tab.css",
);
// 运行期实际被加载的是聚合产物（由 gradient-inject 拼接片段后写入），
// 因此这里也要盯住它，避免「片段修好了、装到用户机器上的那份还是旧的」。
const aggregatePath = path.join(
  repoRoot,
  "src",
  "gradient-theme",
  "gradient-theme.css",
);

// VS Code 里「是否添加」取决于设置或主题的类名。它们不能作为必需条件出现。
const conditionalClasses = [
  "has-icon",
  "tab-border-top",
  "sizing-fit",
  "tab-actions-right",
  "tab-actions-left",
  "tab-actions-off",
];

// 只取顶层选择器（跳过 @keyframes 内部与规则体）。
function topLevelSelectors(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [];
  let depth = 0;
  let buffer = "";

  for (const char of withoutComments) {
    if (char === "{") {
      if (depth === 0) {
        selectors.push(buffer.trim());
        buffer = "";
      }
      depth += 1;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
      buffer = "";
    } else if (depth === 0) {
      buffer += char;
    }
  }

  return selectors
    .flatMap((selector) => selector.split(","))
    .map((selector) => selector.trim())
    .filter((selector) => selector && !selector.startsWith("@"));
}

function classNames(selector) {
  return [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
}

const fragmentCss = fs.readFileSync(fragmentPath, "utf8");
const aggregateCss = fs.readFileSync(aggregatePath, "utf8");
const fragmentSelectors = topLevelSelectors(fragmentCss);
const aggregateSelectors = topLevelSelectors(aggregateCss);

test("顶部标签页渐变：不把条件性类名当作必需条件", () => {
  assert.ok(fragmentSelectors.length > 0, "top-active-tab.css 里找不到任何规则");

  for (const selector of fragmentSelectors) {
    const classes = classNames(selector);

    for (const conditional of conditionalClasses) {
      assert.ok(
        !classes.includes(conditional),
        `选择器仍然要求 .${conditional}（${selector}）：` +
          "该类名由设置或主题决定是否存在，一旦不成立整条规则会静默失效",
      );
    }
  }
});

test("顶部标签页渐变：锚定在 .tab 与 .active 这两个稳定类名上", () => {
  for (const selector of fragmentSelectors) {
    const classes = classNames(selector);

    assert.ok(
      classes.includes("tab") && classes.includes("active"),
      `选择器 ${selector} 没有同时依赖 .tab 与 .active；` +
        "放宽或收紧时都会波及非活动标签",
    );
  }
});

test("顶部标签页渐变：聚合产物里的选择器与片段一致（不是只改了源片段）", () => {
  const aggregateSet = new Set(aggregateSelectors);

  for (const selector of fragmentSelectors) {
    assert.ok(
      aggregateSet.has(selector),
      `聚合产物 src/gradient-theme/gradient-theme.css 里没有 ${selector}；` +
        "用户实际加载的是聚合产物，片段改了但产物没改等于没修",
    );
  }
});

test("顶部标签页渐变：视觉细节没有被一起改掉", () => {
  // 放宽选择器只应改变「命中条件」，不应改变画出来的东西。
  assert.match(fragmentCss, /--tab-border-top-color:\s*transparent\s*!important/);
  assert.match(fragmentCss, /position:\s*relative/);
  assert.match(fragmentCss, /height:\s*2px/);
  assert.match(
    fragmentCss,
    /background-image:\s*linear-gradient\(\s*to right,\s*#eacd61,\s*#ea618e,\s*#3cec85,\s*#61afea\s*\)/,
  );
  assert.match(fragmentCss, /animation:\s*tabHueShift 3s infinite linear/);
  assert.match(fragmentCss, /@keyframes\s+tabHueShift/);
});

test("顶部标签页渐变：文件里写清了依赖的结构与失效现象", () => {
  // 规格要求「若必须依赖 VS Code 的 DOM 结构，需在注释里写清依赖了什么、变化时什么现象」。
  // 这条只挡住注释被整段删掉的回归，不评价措辞。
  const comments = fragmentCss.match(/\/\*[\s\S]*?\*\//g) ?? [];
  const note = comments.find(
    (comment) =>
      comment.includes("依赖") &&
      (comment.includes("失效") || comment.includes("不生效")),
  );

  assert.ok(
    note,
    "top-active-tab.css 缺少「依赖了哪个结构 / 该结构变化时的现象」的注释",
  );
});
