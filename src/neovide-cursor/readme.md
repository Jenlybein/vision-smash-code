# 来源

本代码来自于 Github 仓库：[A Neovide-like Cursor Animation Plugin for VSCode](https://github.com/30d98f9b2/Neovide-Cursor)

原插件为 `Neovide Cursor`，作者 `Sertie`，[链接](https://marketplace.visualstudio.com/items?itemName=30d98f9b2.neovide-cursor)。

# 核心实现原理

1. **分离式顶点追踪 (Mass-Spring Corner Tracking)**

   * 本插件不将光标视为一个整体矩形, 而是将其拆解为四个独立的物理质点 (角点), 每个角点都绑定了

   * 一个独立的二阶阻尼弹簧振子系统, 这种设计允许光标在高速移动时发生剪切、拉伸和形变,

   * 从而还原 Neovide 那种充满弹性且有有机质感的视觉表现

2. **动态优先级分级 (Rank-Based Dynamic Factor)**

    * 当光标移动时, 系统会计算移动向量与每个角点向量的对齐度
        * 领先角点 (Leading Corners): 对齐度高, 被赋予高 Rank, 响应最快
        * 拖尾角点 (Trailing Corners): 对齐度低, 被赋予低 Rank, 产生明显的滞后

    * 通过这种分级控制, 光标在起始阶段会拉长, 在接近终点时会像橡皮筋一样收缩复位

3. **尺寸锚定与解耦 (Dimensional Decoupling)**

    * 在光标跨越不同宽度的字符 (如从单字节字符跳转到 Tab 或中文字符) 时, 若实时改变物理模型的

    * 目标尺寸会导致震荡, 插件在触发跳转 (Jump) 的瞬间锁定当前的 targetDim, 确保物理计算在

    * 局部坐标系内是稳定的, 直到下一次位置更新

4. **虚拟 Canvas 渲染层 (Virtual Overlay Layer)**

    * 由于 VSCode 原生光标无法实现非线性形变, 插件通过 CSS 禁用原生光标显示, 并创建一个

    * 覆盖全屏的 Canvas, Canvas 每一帧会实时抓取原生光标的 DOM 坐标作为引力中心, 驱动物理引擎,

    * 最终使用 polygon 绘制出经过物理形变后的光标图形

# 各配置参数

1. **颜色和外观**
   - `tailColor` ：拖尾颜色 (十六进制) | 默认: "#FFC0CB"
   - `tailOpacity`：不透明度 (0-1) | 默认: 1
2. **阴影辉光**
   - `useShadow`：辉光开关 (布尔值) | 默认: true (略微影响性能)
   - `shadowColor`：辉光颜色 (十六进制) | 默认: tailColor
   - `shadowBlurFactor`：模糊系数 (倍数) | 默认: 0.5
3. **动画时间**
   - `animationLength`：标准动画时长 (秒/s) | 默认: 0.125
   - `shortAnimationLength`：短距离位移动画时长 (秒/s) | 默认: 0.05
   - `shortMoveThreshold`：短距离位移阈值 (像素/px) | 默认: 8
4. **拖尾动态控制**
   - `rank0TrailFactor`：最拖尾角点速度因子 (倍数) | 默认: 1.0
   - `rank1TrailFactor`：次拖尾角点速度因子 (倍数) | 默认: 0.9
   - `rank2TrailFactor`：次领先角点速度因子 (倍数) | 默认: 0.5
   - `rank3TrailFactor`：最领先角点速度因子 (倍数) | 默认: 0.3
5. **领先角点行为控制**
   - `useHardSnap`：瞬移开关 (布尔值) | 默认: true (起稳定器的作用, 关闭会影响上方拖尾角点, 需重新调参)
   - `leadingSnapFactor`：瞬移系数 (倍数) | 默认: 0.1
   - `leadingSnapThreshold`：判定阈值 (0-1) | 默认: 0.5
   - `animationResetThreshold`：重置阈值 (秒/s) | 默认: 0.075
   - `maxTrailDistanceFactor`：最大拉伸 (倍数) | 默认: 100
   - `snapAnimationLength`：瞬移时长 (秒/s) | 默认: 0.02
6. **全局管理**
   - `cursorUpdatePollingRate`：扫描频率 (毫秒/ms) | 默认: 100 (影响性能大, 不建议小于100毫秒)
   - `cursorDisappearDelay`：拖尾消失延迟 (毫秒/ms) | 默认: 50
   - `cursorFadeOutDuration`：拖尾渐隐时长 (秒/s) | 默认: 0.075
7. **预设 CSS 字符串**
   - canvasFadeTransitionCss = `opacity ${cursorFadeOutDuration}s ease-out`; // 拖尾消失过渡 (由上方渐隐时长决定, 让拖尾在停止运动后平滑淡出)
   - nativeCursorDisappearTransitionCss = `opacity 0s ease-out`; // 原生光标瞬间消失 (当物理光标开始运动时, 立刻隐藏原生光标)
   - nativeCursorRevealTransitionCss = `opacity 0.075s ease-in`; // 原生光标平滑恢复 (当动画结束进入静止状态, 慢慢显现原生光标以对齐文字)