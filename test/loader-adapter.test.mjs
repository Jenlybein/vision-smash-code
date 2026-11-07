import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { createLoaderAdapter } from "../src/common/loader-adapter.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const adapterFile = path.join(repoRoot, "src", "common", "loader-adapter.js");
const entryFile = path.join(repoRoot, "extension.js");

// ---------------------------------------------------------------------------
// 假的 vscode
// ---------------------------------------------------------------------------
//
// 适配层不 import vscode：它能用的只有调用方注入进来的这一个对象。
// 因此这里只实现适配层可能用到的那几个 API，并记录每次调用——
// 测试断言的是"适配层对底层加载器做了什么"，而不是它内部怎么实现。

const CONFIGURATION_TARGET = { Global: 1, Workspace: 2 };

function fakeVscode({ imports, updateNeverSettles = false } = {}) {
  const log = { sections: [], gets: [], updates: [], commands: [], uriFiles: [] };

  return {
    log,
    vscode: {
      ConfigurationTarget: CONFIGURATION_TARGET,
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
              return updateNeverSettles
                ? new Promise(() => {})
                : Promise.resolve();
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
          return {
            toString: () => `file:///${filePath.split("\\").join("/")}`,
          };
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 配置键：读取 / 写入
// ---------------------------------------------------------------------------

test("读取：从唯一后端的配置节读出注入列表", () => {
  const listing = ["file:///ext/src/gradient-theme/gradient-theme.css"];
  const { vscode, log } = fakeVscode({ imports: listing });

  const loader = createLoaderAdapter({ vscode });

  assert.deepEqual(loader.readImports(), listing);
  assert.deepEqual(log.sections, ["custom-ui-style"]);
  assert.deepEqual(log.gets, ["external.imports"]);
});

test("读取：配置未设置时得到空数组而不是 undefined", () => {
  const { vscode } = fakeVscode();

  assert.deepEqual(createLoaderAdapter({ vscode }).readImports(), []);
});

test("写入：整份列表写回用户级配置（不自己增删）", async () => {
  const { vscode, log } = fakeVscode({ imports: [] });
  const next = ["file:///ext/src/neovide-cursor/neovide-cursor.js"];

  await createLoaderAdapter({ vscode }).writeImports(next);

  assert.deepEqual(log.updates, [
    {
      section: "custom-ui-style",
      key: "external.imports",
      value: next,
      target: CONFIGURATION_TARGET.Global,
    },
  ]);
});

test("写入：不等待配置真正写完（提示与重载的时点因此不变）", async () => {
  // update 返回一个永不 resolve 的 Promise：适配层若 await 它，这里就会落到 timeout。
  const { vscode, log } = fakeVscode({ updateNeverSettles: true });

  const settled = await Promise.race([
    createLoaderAdapter({ vscode })
      .writeImports(["file:///ext/src/neovide-cursor/neovide-cursor.js"])
      .then(() => "returned"),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 1000)),
  ]);

  assert.equal(settled, "returned");
  assert.equal(log.updates.length, 1);
});

// ---------------------------------------------------------------------------
// 触发重载
// ---------------------------------------------------------------------------

test("重载：调用唯一后端的重载命令", () => {
  const { vscode, log } = fakeVscode({ imports: [] });

  createLoaderAdapter({ vscode }).reload();

  assert.deepEqual(log.commands, [["custom-ui-style.reload"]]);
});

// ---------------------------------------------------------------------------
// 路径 → 注入条目
// ---------------------------------------------------------------------------

test("条目：本地路径交给 vscode.Uri.file 转成注入用的 URI", () => {
  const { vscode, log } = fakeVscode({ imports: [] });
  const target = "C:\\ext\\src\\gradient-theme\\gradient-theme.css";

  const entry = createLoaderAdapter({ vscode }).toEntry(target);

  assert.deepEqual(log.uriFiles, [target]);
  assert.equal(entry, "file:///C:/ext/src/gradient-theme/gradient-theme.css");
});

// ---------------------------------------------------------------------------
// 收敛证据：加载器字面量只出现在适配层
// ---------------------------------------------------------------------------
//
// 只扫"会被扩展宿主加载的模块"（extension.js 与 src 下的 .js）：
// 测试自己需要引用这些字面量来锁住声明，docs 里则是诊断记录，都不算模块。

const LOADER_LITERALS = [
  "custom-ui-style",
  "subframe7536.custom-ui-style",
  "external.imports",
  "custom-ui-style.reload",
];

function listHostModules(dir = path.join(repoRoot, "src")) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listHostModules(full));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

const hostModules = [entryFile, ...listHostModules()];
const relative = (file) => path.relative(repoRoot, file).split(path.sep).join("/");

/** 扫描给定文件，返回包含任一给定字面量的「文件: 字面量」列表。 */
function scanFiles(files, literals) {
  const hits = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const literal of literals) {
      if (source.includes(literal)) hits.push(`${relative(file)}: ${literal}`);
    }
  }
  return hits;
}

test("加载器配置键与命令名只出现在适配层", () => {
  const offenders = scanFiles(hostModules, LOADER_LITERALS);

  // 扫描本身确实有效：适配层里必须能找到这些字面量，否则下面的空结果是假象。
  const adapterSource = fs.readFileSync(adapterFile, "utf8");
  for (const literal of LOADER_LITERALS) {
    assert.ok(
      adapterSource.includes(literal),
      `适配层里应当出现 ${literal}，实际没有`,
    );
  }

  assert.deepEqual(
    offenders.filter((line) => !line.startsWith("src/common/loader-adapter.js")),
    [],
  );
});

test("扩展入口通过适配层访问底层加载器，不自己拼键名或命令", () => {
  const source = fs.readFileSync(entryFile, "utf8");

  // 入口只调 `resolveLoader`（内部用 `createLoaderAdapter`），不直接碰配置键。
  assert.match(source, /resolveLoader/);
  assert.doesNotMatch(source, /getConfiguration\(\s*["']custom-ui-style/);
  assert.doesNotMatch(source, /executeCommand\(\s*["']custom-ui-style\.reload/);
});

// ---------------------------------------------------------------------------
// 业务代码不出现后端**名字**面量（ADR-0003 / ADR-0004 的承诺）
// ---------------------------------------------------------------------------
//
// 上一条测试覆盖的是配置键与命令名。这一条覆盖"名字"本身——「后端差异只存在于一个
// 可测试的适配层」这句承诺，只有在业务代码里连 `custom-ui-style` 都不出现时才成立。
//
// 范围按 ADR 的措辞取「业务代码」：`extension.js` 与 `src/install`、`src/common` 下的模块。
// 五个效果目录（`src/neovide-cursor` 等）是**注入进 VS Code 的载荷脚本**，不是扩展宿主模块：
// 它们既不读也不写加载器配置，其中的历史注释提到后端名属于解释性文字，不在本条承诺范围内。

const BACKEND_NAME_LITERALS = [
  "custom-ui-style",
  "subframe7536.custom-ui-style",
  "Custom UI Style",
];

function businessModules() {
  return [
    entryFile,
    ...listHostModules(path.join(repoRoot, "src", "install")),
    ...listHostModules(path.join(repoRoot, "src", "common")),
  ];
}

test("业务代码里不出现后端名字面量（名字只留在适配层）", () => {
  const hits = [];
  for (const file of businessModules()) {
    const source = fs.readFileSync(file, "utf8");
    for (const literal of BACKEND_NAME_LITERALS) {
      if (source.includes(literal)) hits.push(`${relative(file)}: ${literal}`);
    }
  }

  // 扫描本身确实有效：适配层里必须能找到这些名字，否则下面的空结果是假象。
  const adapterSource = fs.readFileSync(adapterFile, "utf8");
  for (const literal of BACKEND_NAME_LITERALS) {
    assert.ok(
      adapterSource.includes(literal),
      `适配层里应当出现 ${literal}，实际没有`,
    );
  }

  assert.deepEqual(
    hits.filter((line) => !line.startsWith("src/common/loader-adapter.js")),
    [],
  );
});

// ---------------------------------------------------------------------------
// 已删除的后端：业务代码里不留任何可执行痕迹
// ---------------------------------------------------------------------------
//
// ADR-0004 删掉了 `be5invis` 支持。适配层文件头仍会提到它——那是解释"为什么删掉"的
// 历史说明，属于文档而非可执行事实。这里分两层断言：
// 1. 业务代码（entry + src/install + src/common，含适配层）不再出现已删除后端的名字/配置键；
//    适配层唯一允许出现的，是文件头那段历史说明里的名字；
// 2. 适配层不得再声明它的任何可执行事实（`CUSTOM_CSS_LOADER` / 配置键 / 命令 / 扩展 id）。

const REMOVED_BACKEND_LITERALS = [
  "be5invis",
  "vscode_custom_css",
  "extension.updateCustomCSS",
  "Custom CSS and JS Loader",
];

test("已删除的后端在业务代码里不留痕迹（适配层的历史说明除外）", () => {
  // 非空转守卫：同一个扫描器必须能找到一定存在的字面量。
  const control = scanFiles(businessModules(), ["visionSmashCode"]);
  assert.ok(
    control.length > 0,
    "扫描器没有命中任何文件，说明扫描本身失效了",
  );
  assert.ok(
    control.some((line) => line.startsWith("extension.js:")),
    "扫描器应覆盖扩展入口 extension.js",
  );

  const offenders = scanFiles(businessModules(), REMOVED_BACKEND_LITERALS).filter(
    (line) => !line.startsWith("src/common/loader-adapter.js"),
  );
  assert.deepEqual(offenders, []);
});

test("适配层只保留历史说明，不再声明已删除后端的可执行事实", () => {
  const adapterSource = fs.readFileSync(adapterFile, "utf8");

  for (const literal of [
    "CUSTOM_CSS_LOADER",
    "vscode_custom_css",
    "extension.updateCustomCSS",
    "be5invis.vscode-custom-css",
    "DEFAULT_LOADER",
    "LOADERS",
    "selectLoader",
  ]) {
    assert.ok(
      !adapterSource.includes(literal),
      `适配层不应再出现 ${literal}`,
    );
  }
});
