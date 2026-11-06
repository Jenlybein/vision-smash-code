import * as path from "node:path";

/**
 * 窗口动效的**资产布局**：把"配置项 → 要读哪些 CSS 片段、按什么顺序"写成声明式数据。
 *
 * 纯模块：不 import vscode，不 import fs，不读配置，不做任何 I/O。
 * 它唯一的产品是给 `planRefresh` 的 `css-concat` 载荷用的片段清单（`segments`），
 * 因此可以在纯 Node 环境里直接拿来构造描述符、断言拼接结果。
 *
 * ## 为什么单独一个模块
 *
 * 拼接式渲染（`refresh-plan.js` 里的 `renderCssConcat`）只认"片段清单"，
 * 但清单的**形状**是每个效果自己的知识：
 *
 * - 渐变：路径固定，开关用 `!== false` 判定；
 * - 窗口动效：路径随枚举值变化、个别类型额外拼一段、部分片段要做时长占位替换。
 *
 * 把这份知识留在 `animation-inject.js`（那个文件 import vscode，测试加载不了）里，
 * "启用 Scrolling 时 _Animate.css 的位置"就只能靠人工核对；放在这里，
 * 测试可以用**真实布局**构造描述符，再断言接缝拼出来的内容。
 *
 * ## 声明出来的事实（逐条对应重构前的循环）
 *
 * 1. 固定前缀：`Default-Transitions.css`、`Custom-Animations.css`，永远拼在最前。
 * 2. 四种枚举类型，顺序固定为 `Command-Palette`、`Tabs`、`Active`、`Scrolling`；
 *    每种都是 `_Duration.css` →（仅 Scrolling：`_Animate.css`）→ `<枚举值>.css`。
 * 3. 选取规则是枚举：`settings[key] !== "None"` 才拼——不是 `!== false`。
 *    未设置（`undefined`）按"启用"处理，与重构前逐字节一致（会去读 `undefined.css` 并报错）。
 * 4. `Smooth-Mode` / `Tokens` 走 `Misc/`，开关语义是"真值"（未设置 = 关闭）。
 * 5. 时长占位替换只发生在标了 `duration: true` 的片段上，键就是该片段的 `setting`：
 *    - `_Duration.css`：**占位符实际所在的位置**（`--<type>-duration` 那一段的定义行）。
 *      重构前只在 `<枚举值>.css` 上做替换，而那些文件里没有占位符，
 *      所以四类枚举动画的时长配置从来没有生效过；这里把它修掉。
 *    - `<枚举值>.css`：沿用重构前的替换范围（今天这些文件里没有占位符，替换是空操作）。
 *    - `Misc/Smooth-Mode.css`：本来就有占位符，重构前已生效，保持。
 *    - `Misc/Tokens.css`：**不**参与时长替换（重构前也没有替换过它）。
 */

// 枚举类型的顺序即拼接顺序，必须与重构前的 for 循环一致，不要按字母序重排。
const ANIMATION_TYPES = [
  { setting: "Command-Palette", animate: false },
  { setting: "Tabs", animate: false },
  { setting: "Active", animate: false },
  // Scrolling 的动画应用片段：紧跟在 _Duration.css 之后、<枚举值>.css 之前。
  { setting: "Scrolling", animate: true },
];

// 永远拼在最前面的两段。
const PREFIX_FILES = ["Default-Transitions.css", "Custom-Animations.css"];

/** 需要从配置里取快照的设置键（顺序无关，只用于摊平成普通对象）。 */
export const ANIMATION_SETTING_KEYS = [
  ...ANIMATION_TYPES.map((type) => type.setting),
  "Smooth-Mode",
  "Tokens",
];

/**
 * 构造窗口动效的片段清单。
 *
 * @param {string} cssRoot 资产目录（`<扩展安装目录>/src/vscode-animations`）。
 * @returns {Array<object>} 可直接作为 `css-concat` 载荷的 `segments`
 *   （每段的 `path` / `setting` / `rule` / `duration` 见 `refresh-plan.js` 的 Interface 注释）。
 */
export function buildAnimationSegments(cssRoot) {
  const segments = PREFIX_FILES.map((name) => ({
    // 不带 `setting` = 无条件片段。
    path: path.join(cssRoot, name),
  }));

  for (const type of ANIMATION_TYPES) {
    const key = type.setting;

    segments.push({
      setting: key,
      rule: "not-none",
      path: path.join(cssRoot, key, "_Duration.css"),
      duration: true,
    });

    if (type.animate) {
      segments.push({
        setting: key,
        rule: "not-none",
        path: path.join(cssRoot, key, "_Animate.css"),
      });
    }

    // `{value}` 由接缝用该段 setting 的取值替换：枚举值决定片段路径。
    segments.push({
      setting: key,
      rule: "not-none",
      path: path.join(cssRoot, key, "{value}.css"),
      duration: true,
    });
  }

  segments.push({
    setting: "Smooth-Mode",
    // 真值开关：未设置（false / undefined）即关闭，与渐变的 `!== false` 不同。
    rule: "truthy",
    path: path.join(cssRoot, "Misc", "Smooth-Mode.css"),
    duration: true,
  });
  segments.push({
    setting: "Tokens",
    rule: "truthy",
    // 不标 `duration`：Tokens 不参与时长占位替换。
    path: path.join(cssRoot, "Misc", "Tokens.css"),
  });

  return segments;
}
