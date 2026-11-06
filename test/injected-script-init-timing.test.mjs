// 本文件测的是「三个注入脚本在什么时机初始化」，不是视觉验证。
//
// 背景（见 docs/diagnosis/loader-and-effect-failures.md 的结论 A、已确证第 1 条）：
// 加载器 be5invis.vscode-custom-css 自 7.5.0 起把内容注入到 </head> 之前，
// 而这三个脚本都在顶层立即 new 出渲染器、构造函数里无条件 document.body.appendChild。
// <head> 中的经典脚本同步执行时 document.body 还是 null，于是抛 TypeError、整个脚本终止。
// 本文件用最小化的 document / window stub（node:vm，零新增依赖）把这个时序重放一遍：
//   - body 为 null 时执行脚本不得抛异常；
//   - DOMContentLoaded 已经触发过（readyState 不是 loading）时也必须最终初始化，
//     不能只挂一个永远等不到的事件监听；
//   - body 已经存在时仍然立即初始化（与旧加载器下的行为一致）。
//
// 注意：stub 只能证明「脚本不再因为 body 为 null 而中断，并且最终把 canvas 挂上了」，
// 它无法证明渐变/拖尾在真实 VS Code 渲染进程里画得对不对。真实效果需要在 1.13x +
// 加载器 7.5.x 上人工验证（步骤见工单 #20 的汇报）。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as vm from "node:vm";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// 三个运行时注入资产。它们不是 Node 模块，是加载器内联进 workbench 的经典脚本，
// 因此用 vm.runInContext 在「经典脚本」语义下执行，而不是 import（那是 ESM 语义）。
const effects = [
  {
    name: "neovide-cursor",
    file: "src/neovide-cursor/neovide-cursor.js",
    configVar: "cursorConfig",
  },
  {
    name: "mouse-tail",
    file: "src/mouse-tail/mouse-tail.js",
    configVar: "mouseConfig",
  },
  {
    name: "word-exploder",
    file: "src/word-exploder/word-exploder.js",
    configVar: "explosionConfig",
  },
];

function readEffect(effect) {
  return fs.readFileSync(path.join(repoRoot, effect.file), "utf8");
}

// canvas 2d 上下文只需要「存在且能被调用」；渲染本身不在本测试的证明范围内。
function createContext2d() {
  const noop = () => {};
  return {
    clearRect: noop,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    translate: noop,
    rotate: noop,
    setLineDash: noop,
  };
}

function createElement(tag) {
  if (tag === "canvas") {
    return {
      tagName: "CANVAS",
      style: {},
      width: 0,
      height: 0,
      getContext: () => createContext2d(),
    };
  }
  return { tagName: String(tag).toUpperCase(), style: {}, textContent: "" };
}

// 一套最小 DOM stub：只实现三个脚本实际用到的成员。
// 刻意不引入 jsdom —— 依赖体积远超收益，且这里的目的是「重放时序」而非「渲染页面」。
function createHarness({ withBody, readyState }) {
  const listeners = new Map(); // type -> [fn]
  const observers = []; // 交给测试手动触发
  const bodyAppends = [];
  const headAppends = [];

  const body = {
    nodeType: 1,
    appendChild(el) {
      bodyAppends.push(el);
      return el;
    },
  };

  const documentStub = {
    readyState,
    body: withBody ? body : null,
    hidden: false,
    head: {
      appendChild(el) {
        headAppends.push(el);
        return el;
      },
    },
    documentElement: { nodeType: 1, childNodes: [] },
    createElement: (tag) => createElement(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) {
      const bucket = listeners.get(type) ?? [];
      bucket.push(fn);
      listeners.set(type, bucket);
    },
    removeEventListener(type, fn) {
      const bucket = listeners.get(type);
      if (!bucket) return;
      listeners.set(
        type,
        bucket.filter((registered) => registered !== fn),
      );
    },
  };

  class MutationObserverStub {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      this.observed = null;
      observers.push(this);
    }

    observe(target, options) {
      this.observed = { target, options };
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  const sandbox = {
    document: documentStub,
    window: {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener() {},
      removeEventListener() {},
    },
    // 不能真的递归：三个脚本的 loop() 都以 requestAnimationFrame 收尾。
    requestAnimationFrame: () => 0,
    MutationObserver: MutationObserverStub,
    getComputedStyle: () => ({
      visibility: "visible",
      display: "block",
      transform: "none",
    }),
    performance: { now: () => 0 },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };

  const context = vm.createContext(sandbox);

  return {
    context,
    bodyAppends,
    headAppends,
    observers,
    // 在页面上执行一段经典脚本（= 加载器内联进来的那一段）。
    run(code, filename) {
      vm.runInContext(code, context, { filename });
    },
    load(effect) {
      this.run(readEffect(effect), effect.file);
    },
    // 解析器走到 <body> 了：body 出现，并引发一次文档树变更。
    attachBody() {
      documentStub.body = body;
    },
    // 把「body 出现」这件事投递给脚本：MutationObserver 收到一次文档树变更。
    // 注意 sandbox 里的 setTimeout 是空实现——#18 的诊断明确禁止用定时器硬等 body
    // （时序会随机器性能漂移），因此这里也不给「轮询 / 延时」留后门。
    deliverBody() {
      this.attachBody();
      this.dispatchMutations();
    },
    dispatchMutations() {
      for (const observer of observers) {
        if (!observer.disconnected) observer.callback([], observer);
      }
    },
    fire(type) {
      for (const fn of listeners.get(type) ?? []) fn({ type });
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length;
    },
  };
}

for (const effect of effects) {
  test(`${effect.name}：document.body 为 null（<head> 注入）时执行脚本不抛异常`, () => {
    const harness = createHarness({ withBody: false, readyState: "loading" });

    assert.doesNotThrow(
      () => harness.load(effect),
      `${effect.name} 在 document.body 为 null 时抛异常；` +
        "加载器把脚本内联进 <head> 时整个脚本会就此终止",
    );

    // body 还没出现时不应该有人往 null 上挂东西——这里只是把状态记清楚：
    assert.equal(harness.bodyAppends.length, 0);
  });

  test(`${effect.name}：body 为 null 时等 DOM 就绪，就绪后完成初始化`, () => {
    const harness = createHarness({ withBody: false, readyState: "loading" });
    harness.load(effect);

    assert.equal(
      harness.bodyAppends.length,
      0,
      "body 尚不存在时不应挂载任何节点",
    );

    harness.attachBody();
    harness.fire("DOMContentLoaded");

    assert.equal(
      harness.bodyAppends.length,
      1,
      `${effect.name} 在 DOMContentLoaded 之后没有把 canvas 挂到 body 上`,
    );
  });

  test(`${effect.name}：DOMContentLoaded 已触发过时仍能初始化（不靠一个等不到的事件）`, () => {
    // readyState 不是 loading ⇒ DOMContentLoaded 不会再来了。
    const harness = createHarness({ withBody: false, readyState: "complete" });
    harness.load(effect);

    assert.equal(harness.bodyAppends.length, 0);

    // 只制造「body 出现」这个事实，不补发 DOMContentLoaded。
    harness.deliverBody();

    assert.equal(
      harness.bodyAppends.length,
      1,
      `${effect.name} 在 DOMContentLoaded 已经触发过的时序下从未初始化`,
    );
    assert.equal(
      harness.listenerCount("DOMContentLoaded"),
      0,
      "readyState 已不是 loading 却还在等 DOMContentLoaded，这个监听永远不会被调用",
    );
  });

  test(`${effect.name}：body 已存在时立即初始化，不额外延迟`, () => {
    // 旧加载器把内容注入在 </html> 之前（body 之后）：这条路径必须保持原有行为。
    const harness = createHarness({ withBody: true, readyState: "complete" });
    harness.load(effect);

    assert.equal(
      harness.bodyAppends.length,
      1,
      `${effect.name} 在 body 已存在时没有立即初始化`,
    );
  });
}

test("三个注入脚本在同一个全局作用域里连续执行不冲突，且都会完成初始化", () => {
  // 加载器把每个文件各包一个 <script>，它们共享同一份全局作用域。
  // 这条用例用来阻止「在顶层新增同名 const / 重复声明」这类会互相打死的改动。
  const harness = createHarness({ withBody: false, readyState: "loading" });

  for (const effect of effects) {
    assert.doesNotThrow(
      () => harness.load(effect),
      `${effect.name} 与其它脚本共存时抛异常（顶层声明冲突？）`,
    );
  }

  // body 解析出来后 DOMContentLoaded 触发（<head> 注入时的正常时序）。
  harness.attachBody();
  harness.fire("DOMContentLoaded");

  assert.equal(
    harness.bodyAppends.length,
    effects.length,
    "三个脚本没有全部把 canvas 挂到 body 上",
  );
});

test("三个注入脚本的配置块标记完好：各一份，且仍包住配置对象", () => {
  // 扩展运行时会重写这段内容。它不是「代码风格」，是运行时契约，
  // 因此单独加一条守卫：改动初始化时序时不得顺手动它。
  const markers = ["/* __AUTO_CONFIG_START__ */", "/* __AUTO_CONFIG_END__ */"];

  for (const effect of effects) {
    const code = readEffect(effect);

    for (const marker of markers) {
      assert.equal(
        code.split(marker).length - 1,
        1,
        `${effect.name} 里 ${marker} 出现次数不是 1`,
      );
    }

    const start = code.indexOf(markers[0]);
    const end = code.indexOf(markers[1]);
    assert.ok(start >= 0 && end > start, `${effect.name} 的配置块标记顺序不对`);

    const block = code.slice(start, end);
    assert.match(
      block,
      new RegExp(`const\\s+${effect.configVar}\\s*=`),
      `${effect.name} 的配置块里找不到 const ${effect.configVar} =`,
    );
  }
});
