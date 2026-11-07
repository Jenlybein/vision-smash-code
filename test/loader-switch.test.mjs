import { test } from "node:test";
import assert from "node:assert/strict";

import { switchLoader } from "../src/install/loader-switch.js";

// ---------------------------------------------------------------------------
// 假适配器
// ---------------------------------------------------------------------------
//
// 本模块只认适配器的 `readImports` / `writeImports` / `reload`，不认识任何具体后端。
// 因此这里用最小假对象，断言的是"切换时对两个后端各做了什么"。

function fakeAdapter(entries, { failRead, failWrite, failReload } = {}) {
  const log = { reads: 0, writes: [], reloads: 0 };

  return {
    log,
    readImports() {
      log.reads += 1;
      if (failRead) throw failRead;
      return entries;
    },
    async writeImports(next) {
      log.writes.push(next);
      if (failWrite) throw failWrite;
    },
    reload() {
      log.reloads += 1;
      if (failReload) throw failReload;
    },
  };
}

// 本扩展的 5 个目标文件（这里只取两个，足以验证匹配规则）。
const OUR_CURSOR = "C:\\ext\\src\\neovide-cursor\\neovide-cursor.js";
const OUR_ANIMATIONS = "C:\\ext\\src\\vscode-animations\\Vscode-Animations.css";
const OUR_PATHS = [OUR_CURSOR, OUR_ANIMATIONS];

// 旧后端列表里这些条目属于本扩展（不同后端的条目形态不同，但 id 都是字符串）。
const oursCursor = "file:///C:/ext/src/neovide-cursor/neovide-cursor.js";
const oursAnimations = "file:///C:/ext/src/vscode-animations/Vscode-Animations.css";
const userEntry = "file:///C:/Users/me/my-own.css";
const userSecond = "https://example.com/theme.js";

test("切换后端：只移除本扩展的条目，用户自己的条目一条不动", async () => {
  const previous = fakeAdapter([oursCursor, userEntry, oursAnimations, userSecond]);
  const flush = async () => {};

  await switchLoader({ previous, ourPaths: OUR_PATHS, flush });

  assert.deepEqual(previous.log.writes, [[userEntry, userSecond]]);
});

test("切换后端：比较忽略大小写（沿用 basename 规则，兼容历史拼写）", async () => {
  // 目标文件是 `Vscode-Animations.css`，旧列表里残留的是另一种拼写。
  const previous = fakeAdapter([
    "file:///C:/ext/src/vscode-animations/vscode-animations.css",
    userEntry,
  ]);

  await switchLoader({
    previous,
    ourPaths: OUR_PATHS,
    flush: async () => {},
  });

  assert.deepEqual(previous.log.writes, [[userEntry]]);
});

test("切换后端：旧后端本来就没有本扩展的条目时不写回，也不触发它的重载", async () => {
  const previous = fakeAdapter([userEntry]);

  await switchLoader({
    previous,
    ourPaths: OUR_PATHS,
    flush: async () => {},
  });

  assert.deepEqual(previous.log.writes, []);
  assert.equal(previous.log.reloads, 0);
});

test("切换后端：清理成功后触发旧后端重载，让它把已注入的内容也刷新掉", async () => {
  const previous = fakeAdapter([oursCursor, userEntry]);

  await switchLoader({
    previous,
    ourPaths: OUR_PATHS,
    flush: async () => {},
  });

  assert.equal(previous.log.reloads, 1);
});

test("切换后端：清理失败不阻断新后端写入，两处错误各自上报", async () => {
  const previous = fakeAdapter([oursCursor, userEntry], {
    failWrite: new Error("配置被锁定"),
  });
  const reported = [];
  let flushCalls = 0;

  const result = await switchLoader({
    previous,
    ourPaths: OUR_PATHS,
    flush: async () => {
      flushCalls += 1;
    },
    reportError: (message) => reported.push(message),
  });

  assert.equal(flushCalls, 1, "旧后端清理失败时，新后端写入必须照常执行");
  assert.equal(reported.length, 1);
  assert.match(reported[0], /旧注入后端/);
  assert.match(reported[0], /配置被锁定/);
  assert.deepEqual(result.errors, reported);
});

test("切换后端：旧后端读取失败同样不阻断新后端写入", async () => {
  const previous = fakeAdapter([], { failRead: new Error("配置读取失败") });
  const reported = [];
  let flushCalls = 0;

  await switchLoader({
    previous,
    ourPaths: OUR_PATHS,
    flush: async () => {
      flushCalls += 1;
    },
    reportError: (message) => reported.push(message),
  });

  assert.equal(flushCalls, 1);
  assert.equal(reported.length, 1);
  assert.match(reported[0], /配置读取失败/);
});

test("切换后端：旧后端重载失败也只报错，不影响新后端写入", async () => {
  const previous = fakeAdapter([oursCursor, userEntry], {
    failReload: new Error("命令不存在"),
  });
  const reported = [];
  let flushCalls = 0;

  await switchLoader({
    previous,
    ourPaths: OUR_PATHS,
    flush: async () => {
      flushCalls += 1;
    },
    reportError: (message) => reported.push(message),
  });

  assert.equal(flushCalls, 1);
  assert.equal(reported.length, 1);
  assert.match(reported[0], /命令不存在/);
});

test("切换后端：新后端写入失败会被独立上报（不与旧后端的问题混成一条）", async () => {
  const previous = fakeAdapter([oursCursor]);
  const reported = [];

  const result = await switchLoader({
    previous,
    ourPaths: OUR_PATHS,
    flush: async () => {
      throw new Error("新后端写入失败");
    },
    reportError: (message) => reported.push(message),
  });

  assert.equal(reported.length, 1);
  assert.match(reported[0], /新注入后端/);
  assert.match(reported[0], /新后端写入失败/);
  assert.deepEqual(result.errors, reported);
});

test("切换后端：没有旧后端（首次激活即缺后端）时跳过清理，照常写新后端", async () => {
  let flushCalls = 0;
  const reported = [];

  const result = await switchLoader({
    previous: null,
    ourPaths: OUR_PATHS,
    flush: async () => {
      flushCalls += 1;
    },
    reportError: (message) => reported.push(message),
  });

  assert.equal(flushCalls, 1);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(reported, []);
});

test("切换后端：目标路径为空的效果不会导致误删（空路径不参与匹配）", async () => {
  const previous = fakeAdapter([userEntry]);

  await switchLoader({
    previous,
    ourPaths: ["", ...OUR_PATHS],
    flush: async () => {},
  });

  // 空路径的 basename 是空串，绝不能因此把条目清空。
  assert.deepEqual(previous.log.writes, []);
});

// ---------------------------------------------------------------------------
// 顺序是契约：旧后端的重载必须排在新后端写入之后
//
// 用户实测：从 custom-ui-style 切回 be5invis 后所有效果都不生效，必须把总开关取消再勾回
// 才生效。原因是旧后端的重载会立刻重建 workbench.html 并重启窗口，把后面那次「写新后端 +
// 新后端重载」一起吞掉。这里把顺序钉死，防止以后有人「顺手」把重载挪回清理那一步。
// ---------------------------------------------------------------------------

test("切换顺序：先清理旧后端，再写新后端，最后才刷新旧后端", async () => {
  const order = [];

  const previous = {
    readImports: () => ["file:///x/src/gradient-theme/gradient-theme.css"],
    writeImports: async () => {
      order.push("clean-old");
    },
    reload: () => {
      order.push("reload-old");
    },
  };

  const flush = async () => {
    order.push("flush-new");
  };

  await switchLoader({
    previous,
    ourPaths: ["C:\\ext\\src\\gradient-theme\\gradient-theme.css"],
    flush,
  });

  assert.deepEqual(
    order,
    ["clean-old", "flush-new", "reload-old"],
    `顺序错误：旧后端的重载排到了新后端写入之前（${JSON.stringify(order)}）`,
  );
});