import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CUSTOM_CSS_LOADER,
  CUSTOM_UI_STYLE_LOADER,
  DEFAULT_LOADER,
  LOADERS,
  createLoaderAdapter,
  selectLoader,
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

function fakeVscode({ imports, installed = [], failUpdate = null } = {}) {
  const log = {
    sections: [],
    gets: [],
    updates: [],
    commands: [],
    uriFiles: [],
    installedQueries: [],
  };

  return {
    log,
    vscode: {
      ConfigurationTarget: CONFIGURATION_TARGET,
      extensions: {
        getExtension(id) {
          log.installedQueries.push(id);
          return installed.includes(id) ? { id } : undefined;
        },
      },
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
              if (failUpdate) throw failUpdate;
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
// 后端注册表
// ---------------------------------------------------------------------------

test("注册表：两个注入后端都在册，注册键就是各自的 id", () => {
  assert.deepEqual(Object.keys(LOADERS).sort(), ["be5invis", "custom-ui-style"]);

  for (const [key, declaration] of Object.entries(LOADERS)) {
    assert.equal(declaration.id, key, `注册键 ${key} 应与声明里的 id 一致`);
  }
});

test("默认后端仍是 be5invis：既有用户升级后行为不得改变", () => {
  assert.equal(DEFAULT_LOADER, CUSTOM_CSS_LOADER);
  assert.equal(CUSTOM_CSS_LOADER.id, "be5invis");
  assert.equal(LOADERS.be5invis, CUSTOM_CSS_LOADER);
  assert.equal(LOADERS["custom-ui-style"], CUSTOM_UI_STYLE_LOADER);
});

test("默认后端的配置键、属性名、重载命令与重构前逐字节一致", () => {
  // 这三条是 #21 已锁死的既有行为；本工单加第二个后端时不得顺手改动它们。
  assert.equal(CUSTOM_CSS_LOADER.configSection, "vscode_custom_css");
  assert.equal(CUSTOM_CSS_LOADER.importsProperty, "imports");
  assert.equal(CUSTOM_CSS_LOADER.reloadCommand, "extension.updateCustomCSS");
});

test("新后端的配置节、属性名、重载命令与该扩展的实际实现一致", () => {
  // 依据：subframe7536.custom-ui-style 0.7.2 的 package.json 与该扩展
  // src/config.ts（`getConfiguration("custom-ui-style").get("external.imports")`）。
  assert.equal(CUSTOM_UI_STYLE_LOADER.configSection, "custom-ui-style");
  assert.equal(CUSTOM_UI_STYLE_LOADER.importsProperty, "external.imports");
  assert.equal(CUSTOM_UI_STYLE_LOADER.reloadCommand, "custom-ui-style.reload");
});

test("每个后端声明都自带扩展 id，供运行时可用性检测复用", () => {
  assert.equal(CUSTOM_CSS_LOADER.extensionId, "be5invis.vscode-custom-css");
  assert.equal(
    CUSTOM_UI_STYLE_LOADER.extensionId,
    "subframe7536.custom-ui-style",
  );
});

// ---------------------------------------------------------------------------
// 按设置值选择后端
// ---------------------------------------------------------------------------

test("选择：设置未设置时选中默认后端", () => {
  const { vscode } = fakeVscode({
    imports: [],
    installed: ["be5invis.vscode-custom-css"],
  });

  const selection = selectLoader({ vscode, settingValue: undefined });

  assert.equal(selection.ok, true);
  assert.equal(selection.adapter.id, "be5invis");
});

test("选择：设置值选中对应后端", () => {
  const { vscode } = fakeVscode({
    imports: [],
    installed: ["subframe7536.custom-ui-style"],
  });

  const selection = selectLoader({ vscode, settingValue: "custom-ui-style" });

  assert.equal(selection.ok, true);
  assert.equal(selection.adapter.id, "custom-ui-style");
});

test("选择：未知设置值回退到默认后端，而不是让扩展整体失效", () => {
  const { vscode } = fakeVscode({
    imports: [],
    installed: ["be5invis.vscode-custom-css"],
  });

  const selection = selectLoader({ vscode, settingValue: "typo-backend" });

  assert.equal(selection.ok, true);
  assert.equal(selection.adapter.id, "be5invis");
});

test("选择：按扩展 id 检测可用性，而不是按后端名字面量猜", () => {
  const { vscode, log } = fakeVscode({
    imports: [],
    installed: ["be5invis.vscode-custom-css"],
  });

  selectLoader({ vscode, settingValue: "custom-ui-style" });

  assert.deepEqual(log.installedQueries, ["subframe7536.custom-ui-style"]);
});

test("选择：所选后端未安装时报明确错误并给出安装指引，且不返回适配器", () => {
  const { vscode } = fakeVscode({ imports: [] });

  const selection = selectLoader({ vscode, settingValue: "custom-ui-style" });

  assert.equal(selection.ok, false);
  assert.equal(selection.adapter, undefined);
  // 安装指引必须可操作：带上扩展 id，并明确告诉用户去安装。
  assert.match(selection.message, /subframe7536\.custom-ui-style/);
  assert.match(selection.message, /安装/);
  // 也给出退路：切回默认后端。
  assert.match(selection.message, /be5invis/);
});

test("选择：默认后端缺失时只给安装指引，不叫用户「切回」自己已选的后端", () => {
  const { vscode } = fakeVscode({ imports: [] });

  const selection = selectLoader({ vscode, settingValue: "be5invis" });

  assert.equal(selection.ok, false);
  assert.match(selection.message, /be5invis\.vscode-custom-css/);
  assert.match(selection.message, /安装/);
  assert.doesNotMatch(selection.message, /切回/);
});

test("选择：后端可用时返回的适配器只碰该后端自己的配置节", () => {
  const { vscode, log } = fakeVscode({
    imports: ["file:///ext/a.css"],
    installed: ["subframe7536.custom-ui-style"],
  });

  const { adapter } = selectLoader({ vscode, settingValue: "custom-ui-style" });
  adapter.readImports();

  assert.deepEqual(distinct(log.sections), ["custom-ui-style"]);
  assert.deepEqual(distinct(log.gets), ["external.imports"]);
});

// ---------------------------------------------------------------------------
// 条目形态：读取归一化
// ---------------------------------------------------------------------------

test("custom-ui-style 读取：对象条目归一化成它的 url，字符串条目原样返回", () => {
  const { vscode } = fakeVscode({
    imports: [
      "file:///ext/src/neovide-cursor/neovide-cursor.js",
      { type: "css", url: "https://example.com/user.css" },
    ],
  });

  const adapter = createLoaderAdapter({
    vscode,
    loader: CUSTOM_UI_STYLE_LOADER,
  });

  assert.deepEqual(adapter.readImports(), [
    "file:///ext/src/neovide-cursor/neovide-cursor.js",
    "https://example.com/user.css",
  ]);
});

test("custom-ui-style 读取：认不出的条目被跳过，而不是让导入规划崩掉", () => {
  const { vscode } = fakeVscode({
    imports: [42, null, { type: "css" }, "file:///ext/a.css"],
  });

  const adapter = createLoaderAdapter({
    vscode,
    loader: CUSTOM_UI_STYLE_LOADER,
  });

  // 计划接缝只接受字符串数组；非法值在这里被挡住，不会流进 `planRefresh`。
  assert.deepEqual(adapter.readImports(), ["file:///ext/a.css"]);
});

test("be5invis 读取：非字符串条目同样被挡住（配置写坏时不再让计划崩）", () => {
  const { vscode } = fakeVscode({
    imports: [{ url: "file:///ext/a.js" }, "file:///ext/b.css"],
  });

  const adapter = createLoaderAdapter({ vscode, loader: CUSTOM_CSS_LOADER });

  assert.deepEqual(adapter.readImports(), ["file:///ext/b.css"]);
});

// ---------------------------------------------------------------------------
// 条目形态：写入映射
// ---------------------------------------------------------------------------

test("custom-ui-style 写入：本扩展的新条目是 file:// 字符串（该后端唯一接受本地文件的形态）", async () => {
  const { vscode, log } = fakeVscode({ imports: [] });
  const adapter = createLoaderAdapter({
    vscode,
    loader: CUSTOM_UI_STYLE_LOADER,
  });

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

test("custom-ui-style 写入：用户自己条目的形态原样保留，顺序按计划走", async () => {
  const ours = "file:///ext/src/neovide-cursor/neovide-cursor.js";
  const userCss = { type: "css", url: "https://example.com/user.css" };
  const userJs = "file:///home/me/my-own.js";
  const { vscode, log } = fakeVscode({
    imports: [userCss, ours, userJs],
  });
  const adapter = createLoaderAdapter({
    vscode,
    loader: CUSTOM_UI_STYLE_LOADER,
  });

  // 计划：本扩展的条目被移除后重新追加（`reload` 状态的行为）→ 落到末尾。
  await adapter.writeImports([userCss.url, userJs, ours]);

  const written = log.updates.at(-1).value;
  // 对象条目仍是对象（没有被改形成裸字符串 → 不会被当成 ESM 重新解释），
  // 用户的裸字符串也仍是裸字符串；顺序按计划给出的顺序。
  assert.deepEqual(written, [userCss, userJs, ours]);
  assert.equal(written[0], userCss);
});

test("custom-ui-style 写入：本扩展条目被移除时，用户条目一个都不少", async () => {
  const ours = "file:///ext/src/neovide-cursor/neovide-cursor.js";
  const userCss = { type: "css", url: "https://example.com/user.css" };
  const userJs = "file:///home/me/my-own.js";
  const unreadable = { type: "css" }; // 缺 url：认不出，但绝不能被我们悄悄删掉
  const { vscode, log } = fakeVscode({
    imports: [userCss, ours, unreadable, userJs],
  });
  const adapter = createLoaderAdapter({
    vscode,
    loader: CUSTOM_UI_STYLE_LOADER,
  });

  await adapter.writeImports(adapter.readImports().filter((id) => id !== ours));

  const written = log.updates.at(-1).value;
  // 用户条目全在（顺序按计划），认不出的那条原样追加在末尾。
  assert.deepEqual(written, [userCss, userJs, unreadable]);
});

test("be5invis 写入：条目就是计划给出的字符串列表，逐字节不变", async () => {
  const { vscode, log } = fakeVscode({ imports: ["file:///ext/old.css"] });
  const adapter = createLoaderAdapter({ vscode, loader: CUSTOM_CSS_LOADER });
  const next = ["file:///ext/old.css", "file:///ext/new.js"];

  await adapter.writeImports(next);

  assert.deepEqual(log.updates.at(-1).value, next);
});

// ---------------------------------------------------------------------------
// 与纯函数接缝配合（`toImportUri` 必须返回字符串）
// ---------------------------------------------------------------------------

test("与计划接缝配合：custom-ui-style 下新增 / 移除只经过字符串 id，且不产生转换错误", async () => {
  const target = "/ext/src/neovide-cursor/neovide-cursor.js";
  const { vscode, log } = fakeVscode({ imports: [] });
  const adapter = createLoaderAdapter({
    vscode,
    loader: CUSTOM_UI_STYLE_LOADER,
  });

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

// ---------------------------------------------------------------------------
// 第三个后端：只加一份声明，业务代码一行不改
// ---------------------------------------------------------------------------

test("第三后端：条目是对象的后端也只需加一份声明，业务代码不动", async () => {
  // 假想后端：条目形态与两个真实后端都不同（对象），验证适配层吸收的是"形态"而不是"某家"。
  const OBJECT_ENTRY_LOADER = {
    id: "object-entry",
    extensionId: "example.object-entry",
    configSection: "object_entry",
    importsProperty: "files",
    reloadCommand: "objectEntry.reload",
    toEntry: ({ filePath, vscode }) => vscode.Uri.file(filePath).toString(),
    toId: (entry) =>
      typeof entry === "string"
        ? entry
        : typeof entry?.url === "string"
          ? entry.url
          : null,
    fromId: (id) => ({ type: id.endsWith(".css") ? "css" : "js", url: id }),
  };

  const userEntry = { type: "css", url: "https://example.com/user.css" };
  const { vscode, log } = fakeVscode({
    imports: [userEntry, "file:///ext/old.js"],
  });
  const adapter = createLoaderAdapter({
    vscode,
    loader: OBJECT_ENTRY_LOADER,
  });

  const target = "/ext/src/gradient-theme/gradient-theme.css";
  const plan = planRefresh({
    effects: [
      { key: "gradient", targetPath: "/ext/old.js", enabled: false },
      { key: "cursor", targetPath: target, enabled: true },
    ],
    changeStates: { gradient: "switch", cursor: "switch" },
    currentImports: adapter.readImports(),
    fileExists: () => true,
    toImportUri: adapter.toEntry,
  });

  await adapter.writeImports(plan.imports);

  assert.deepEqual(log.updates.at(-1).value, [
    userEntry,
    { type: "css", url: "file:///ext/src/gradient-theme/gradient-theme.css" },
  ]);
});
