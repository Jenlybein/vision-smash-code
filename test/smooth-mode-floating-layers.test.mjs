// 注意：本文件是「存在性」守卫，不是视觉验证。
//
// 平滑模式是否真的让命令面板干净消失、是否真的让侧边栏拖拽有平滑过渡，
// 只能靠人工在 VS Code 里观察（见 #19 的验证步骤）。本文件只做两件事：
//   1. 断言排除浮动层的选择器片段仍在 Smooth-Mode.css 里；
//   2. 断言布局面板的过渡仍在，且时长占位没有被写坏。
// 也就是说：它能挡住「有人把排除链删掉」或「有人直接注释掉整条规则」这类
// 误删型回归，但选择器在真实 DOM 上是否命中、命中多少个元素，它一概不知。
// 因此这里刻意不引入无头浏览器之类的依赖——那会是"看起来在测视觉"的假象。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const smoothModePath = path.join(
  repoRoot,
  "src",
  "vscode-animations",
  "Misc",
  "Smooth-Mode.css",
);

const css = fs.readFileSync(smoothModePath, "utf8");

// 触发过 issue #4 的浮动层容器：命令面板 / 快速选择 / Ctrl+Tab 浮层都落在
// .quick-input-widget 下；其余是同类需要排除的浮动层。
const floatingLayerContainers = [
  ".quick-input-widget",
  ".monaco-quick-open-widget",
  ".monaco-dialog-box",
  ".notifications-toasts",
  ".context-view",
  ".monaco-hover",
  ".suggest-widget",
];

// 布局面板：平滑模式真正想作用的对象，拖拽侧边栏 / 分屏时靠它们变化。
const layoutPanels = ["split-view-view", "monaco-workbench"];

// 每条过渡规则都以「内联样式里出现某个几何属性」为触发条件。
const geometryAttributeSelectors = [
  '[style*="top"]',
  '[style*="left"]',
  '[style*="width"]',
  '[style*="height"]',
];

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test("平滑模式：浮动层容器及其内部元素被排除在布局过渡之外", () => {
  // 该断言只证明「排除链还在」，不证明它在真实 DOM 上排掉了浮动层。
  for (const container of floatingLayerContainers) {
    assert.ok(
      css.includes(`${container} *`),
      `Smooth-Mode.css 里缺少对 ${container} 及其后代的排除（${container} *），` +
        "浮动层关闭时可能再次被过渡动画拉回去",
    );
  }
});

test("平滑模式：每个几何属性子句都带同样的排除链", () => {
  const propertyClauses = geometryAttributeSelectors.reduce(
    (sum, selector) => sum + countOccurrences(css, selector),
    0,
  );

  assert.ok(
    propertyClauses > 0,
    "Smooth-Mode.css 里找不到任何 [style*=\"几何属性\"] 触发条件，平滑模式已被整体关掉",
  );

  for (const container of floatingLayerContainers) {
    const excluded = countOccurrences(css, `${container} *`);

    assert.equal(
      excluded,
      propertyClauses,
      `${container} 的排除只出现在 ${excluded} 个子句里，但共有 ${propertyClauses} 个` +
        "几何属性子句；漏掉的那个子句仍会把过渡施加到浮动层上",
    );
  }
});

test("平滑模式：布局面板仍保留过渡，功能没有被关掉", () => {
  for (const panel of layoutPanels) {
    assert.ok(
      css.includes(`.${panel}`),
      `Smooth-Mode.css 里找不到 .${panel}；收窄选择器时把布局面板一起删掉了`,
    );
  }

  assert.match(css, /transition-property:\s*top,\s*left,\s*width,\s*height;/);
  assert.match(
    css,
    /transition-duration:\s*var\(--smooth-windows-duration\);/,
  );
  assert.match(css, /--smooth-windows-duration:/);
});

test("平滑模式：时长占位保持单行，仍能被 updateDuration 的替换规则命中", () => {
  // 与 src/install/animation-inject.js 中 updateDuration 用的是同一条正则。
  // 那一条正则不含 s 标志，占位一旦被换行拆开就永远替换不掉。
  const replaced = css.replace(
    /\/\*<Duration>\*\/.*\/\*<\/Duration>\*\//g,
    "123ms",
  );

  assert.doesNotMatch(
    replaced,
    /\/\*<Duration>\*\//,
    "/*<Duration>*/ … /*</Duration>*/ 占位没有被一条单行正则整体替换掉",
  );
  // 占位连同它的 300ms 与分号一起被整段替换，因此替换结果里没有分号——
  // 它此时是 :root 块里最后一条声明，缺分号仍然是合法 CSS，这里如实断言。
  assert.match(
    replaced,
    /--smooth-windows-duration:\s*123ms/,
    "替换后 --smooth-windows-duration 的值不是注入的时长",
  );
});
