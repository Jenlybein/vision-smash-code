import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CUSTOM_UI_STYLE_LOADER,
  createLoaderAdapter,
  resolveLoader,
} from "../src/common/loader-adapter.js";
import { planRefresh } from "../src/common/refresh-plan.js";

// ---------------------------------------------------------------------------
// 假的 vscode
// ---------------------------------------------------------------------------
//
// 适配层不 import vscode：它能用的只有调用方注入进来的这一个对象。
// 这里只实现适配层会用到的那几个 API，并记录每次调用。
// `imports` 是配置里**原始**的条目数组（可能是字符串，也可能是对象）。

const CONFIGURATION_TARGET = { Global: 1, Workspace: 2 };

function fakeVscode({
  imports,
  installed = false,
  extensionsApi = "normal",
} = {}) {
  const log = {
    sections: [],
    gets: [],
    updates: [],
    commands: [],
    uriFiles: [],
    installedQueries: [],
  };

  const extensions =
    extensionsApi === "missing"
      ? undefined
      : {
          getExtension(id) {
            log.installedQueries.push(id);
            if (extensionsApi === "throws") throw new Error("扩展服务不可用");
            return installed ? { id } : undefined;
          },
        };

  return {
    log,
    vscode: {
      ConfigurationTarget: CONFIGURATION_TARGET,
      extensions,
      workspace: {
        getConfiguration(section) {
          log.sections.push(section);
          return {
            get(key) {
              log.gets.push(key);
              return imports;
            },
            update(key, value, target) {
              log.updates.push({ section, key, value, target });
              return Promise.resolve();
            },
          };
        },
      },
      commands: {
        executeCommand(...args) {
          log.commands.push(args);
          return Promise.resolve();
        },
      },
      Uri: {
        file(filePath) {
          log.uriFiles.push(filePath);
          // 与 vscode.Uri.file().toString() 同形：`file:///` + 去掉开头斜杠的路径。
          const normalized = filePath.replace(/^\/+/, "").split("\\").join("/");
          return { toString: () => `file:///${normalized}` };
        },
      },
    },
  };
}

const distinct = (values) => [...new Set(values)];

// ---------------------------------------------------------------------------
// 后端声明：配置节、属性名、命令、扩展 id
// ---------------------------------------------------------------------------

test("声明：配置节、属性名、重载命令与该扩展的实际实现一致", () => {
  // 依据：subframe7536.custom-ui-style 上游 README 的 Configurations / Commands 表
  // （`custom-ui-style.external.imports`、`custom-ui-style.reload`）。
  assert.equal(CUSTOM_UI_STYLE_LOADER.configSection, "custom-ui-style");
  assert.equal(CUSTOM_UI_STYLE_LOADER.importsProperty, "external.imports");
  assert.equal(CUSTOM_UI_STYLE_LOADER.reloadCommand, "custom-ui-style.reload");
});

test("声明：后端扩展 id 与展示名供运行时检测与安装指引复用", () => {
  assert.equal(CUSTOM_UI_STYLE_LOADER.extensionId, "subframe7536.custom-ui-style");
  assert.equal(CUSTOM_UI_STYLE_LOADER.displayName, "Custom UI Style");
  assert.equal(CUSTOM_UI_STYLE_LOADER.id, "custom-ui-style");
});

// ---------------------------------------------------------------------------
// 可用性检测：后端不可用时调用方拿不到适配器
// ---------------------------------------------------------------------------

test("可用性：按扩展 id 检测（不是按名字面量猜）", () => {
  const { vscode, log } = fakeVscode({ imports: [], installed: true });

  resolveLoader({ vscode });

  assert.deepEqual(log.installedQueries, ["subframe7536.custom-ui-style"]);
});

test("可用性：后端已安装时返回可用适配器，且只碰它自己的配置节", () => {
  const { vscode, log } = fakeVscode({
    imports: ["file:///ext/a.css"],
    installed: true,
  });

  const resolution = resolveLoader({ vscode });

  assert.equal(resolution.ok, true);
  assert.equal(resolution.adapter.id, "custom-ui-style");

  resolution.adapter.readImports();
  assert.deepEqual(distinct(log.sections), ["custom-ui-style"]);
  assert.deepEqual(distinct(log.gets), ["external.imports"]);
});

test("可用性：后端未安装时给出可操作的安装指引，且不返回适配器", () => {
  const { vscode } = fakeVscode({ imports: [], installed: false });

  const resolution = resolveLoader({ vscode });

  assert.equal(resolution.ok, false);
  assert.equal(resolution.adapter, undefined);
  assert.equal(resolution.extensionId, "subframe7536.custom-ui-style");
  // 安装指引必须可操作：带上扩展 id，并明确告诉用户去安装。
  assert.match(resolution.message, /subframe7536\.custom-ui-style/);
  assert.match(resolution.message, /安装/);
});

test("可用性：检测能力缺失时按可用处理（fail-open），不把可用环境误判成未安装", () => {
  const { vscode } = fakeVscode({ imports: [], extensionsApi: "missing" });

  const resolution = resolveLoader({ vscode });

  assert.equal(resolution.ok, true);
  assert.equal(resolution.adapter.id, "custom-ui-style");
});

test("可用性：检测抛错时同样按可用处理（fail-open）", () => {
  const { vscode } = fakeVscode({ imports: [], extensionsApi: "throws" });

  const resolution = resolveLoader({ vscode });

  assert.equal(resolution.ok, true);
});

// ---------------------------------------------------------------------------
// 条目形态：读取归一化
// ---------------------------------------------------------------------------

test("读取：对象条目归一化成它的 url，字符串条目原样返回", () => {
  const { vscode } = fakeVscode({
    imports: [
      "file:///ext/src/neovide-cursor/neovide-cursor.js",
      { type: "css", url: "https://example.com/user.css" },
    ],
  });

  const adapter = createLoaderAdapter({ vscode });

  assert.deepEqual(adapter.readImports(), [
    "file:///ext/src/neovide-cursor/neovide-cursor.js",
    "https://example.com/user.css",
  ]);
});

test("读取：认不出的条目被跳过，而不是让导入规划崩掉", () => {
  const { vscode } = fakeVscode({
    imports: [42, null, { type: "css" }, "file:///ext/a.css"],
  });

  const adapter = createLoaderAdapter({ vscode });

  // 计划接缝只接受字符串数组；非法值在这里被挡住，不会流进 `planRefresh`。
  assert.deepEqual(adapter.readImports(), ["file:///ext/a.css"]);
});

// ---------------------------------------------------------------------------
// 条目形态：写入映射
// ---------------------------------------------------------------------------

test("写入：本扩展的新条目是 file:// 字符串（该后端唯一接受本地文件的形态）", async () => {
  const { vscode, log } = fakeVscode({ imports: [] });
  const adapter = createLoaderAdapter({ vscode });

  const jsEntry = adapter.toEntry("/ext/src/neovide-cursor/neovide-cursor.js");
  const cssEntry = adapter.toEntry("/ext/src/gradient-theme/gradient-theme.css");
  await adapter.writeImports([jsEntry, cssEntry]);

  const written = log.updates.at(-1).value;
  assert.deepEqual(written, [
    "file:///ext/src/neovide-cursor/neovide-cursor.js",
    "file:///ext/src/gradient-theme/gradient-theme.css",
  ]);

  // 该后端的解析规则（0.7.2 `getResourceMeta`）：字符串条目必须 `file://` 开头、
  // 以 `.css` / `.js` 结尾，否则会被 promptWarn 后丢弃。对象条目的 `url` 只接受
  // `https://`，本地文件用对象形态会被静默丢弃——所以这里必须是字符串。
  for (const entry of written) {
    assert.equal(typeof entry, "string");
    assert.match(entry, /^file:\/\/.+\.(css|js)$/);
  }
});

test("写入：用户自己条目的形态原样保留，顺序按计划走", async () => {
  const ours = "file:///ext/src/neovide-cursor/neovide-cursor.js";
  const userCss = { type: "css", url: "https://example.com/user.css" };
  const userJs = "file:///home/me/my-own.js";
  const { vscode, log } = fakeVscode({
    imports: [userCss, ours, userJs],
  });
  const adapter = createLoaderAdapter({ vscode });

  // 计划：本扩展的条目被移除后重新追加（`reload` 状态的行为）→ 落到末尾。
  await adapter.writeImports([userCss.url, userJs, ours]);

  const written = log.updates.at(-1).value;
  // 对象条目仍是对象（没有被改形成裸字符串 → 不会被当成 ESM 重新解释），
  // 用户的裸字符串也仍是裸字符串；顺序按计划给出的顺序。
  assert.deepEqual(written, [userCss, userJs, ours]);
  assert.equal(written[0], userCss);
});

test("写入：本扩展条目被移除时，用户条目一个都不少", async () => {
  const ours = "file:///ext/src/neovide-cursor/neovide-cursor.js";
  const userCss = { type: "css", url: "https://example.com/user.css" };
  const userJs = "file:///home/me/my-own.js";
  const unreadable = { type: "css" }; // 缺 url：认不出，但绝不能被我们悄悄删掉
  const { vscode, log } = fakeVscode({
    imports: [userCss, ours, unreadable, userJs],
  });
  const adapter = createLoaderAdapter({ vscode });

  await adapter.writeImports(adapter.readImports().filter((id) => id !== ours));

  const written = log.updates.at(-1).value;
  // 用户条目全在（顺序按计划），认不出的那条原样追加在末尾。
  assert.deepEqual(written, [userCss, userJs, unreadable]);
});

// ---------------------------------------------------------------------------
// 与纯函数接缝配合（`toImportUri` 必须返回字符串）
// ---------------------------------------------------------------------------

test("与计划接缝配合：新增 / 移除只经过字符串 id，且不产生转换错误", async () => {
  const target = "/ext/src/neovide-cursor/neovide-cursor.js";
  const { vscode, log } = fakeVscode({ imports: [] });
  const adapter = createLoaderAdapter({ vscode });

  const added = planRefresh({
    effects: [{ key: "cursor", targetPath: target, enabled: true }],
    changeStates: { cursor: "switch" },
    currentImports: adapter.readImports(),
    fileExists: () => true,
    toImportUri: adapter.toEntry,
  });

  assert.deepEqual(added.errors, []);
  assert.deepEqual(added.imports, [
    "file:///ext/src/neovide-cursor/neovide-cursor.js",
  ]);

  await adapter.writeImports(added.imports);
  assert.deepEqual(log.updates.at(-1).value, added.imports);

  // 关闭：计划移除，写回时只剩用户自己的条目（这里没有用户条目 → 空列表）。
  const removed = planRefresh({
    effects: [{ key: "cursor", targetPath: target, enabled: false }],
    changeStates: { cursor: "switch" },
    currentImports: adapter.readImports(),
    fileExists: () => true,
    toImportUri: adapter.toEntry,
  });

  assert.deepEqual(removed.errors, []);
  await adapter.writeImports(removed.imports);
  assert.deepEqual(log.updates.at(-1).value, []);
});
