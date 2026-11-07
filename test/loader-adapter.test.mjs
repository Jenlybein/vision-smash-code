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

test("读取：从底层加载器的配置节读出注入列表", () => {
  const listing = ["file:///ext/src/gradient-theme/gradient-theme.css"];
  const { vscode, log } = fakeVscode({ imports: listing });

  const loader = createLoaderAdapter({ vscode });

  assert.deepEqual(loader.readImports(), listing);
  assert.deepEqual(log.sections, ["vscode_custom_css"]);
  assert.deepEqual(log.gets, ["imports"]);
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
      section: "vscode_custom_css",
      key: "imports",
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

test("重载：调用底层加载器的重载命令", () => {
  const { vscode, log } = fakeVscode({ imports: [] });

  createLoaderAdapter({ vscode }).reload();

  assert.deepEqual(log.commands, [["extension.updateCustomCSS"]]);
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
// 「替换适配层实现即可换后端」
// ---------------------------------------------------------------------------

const distinct = (values) => [...new Set(values)];

// 扮演执行层的业务代码：与 extension.js 的 flushChanges 同形——
// 读列表 → 用 toEntry 转换新增路径 → 写回整份列表 → 触发重载。
// 这段函数只认适配器的四个方法，不认识任何具体后端：下面两个后端跑的是同一段。
async function runRefreshFlow(adapter, { targetPath, nextImports }) {
  const currentImports = adapter.readImports();
  const entry = adapter.toEntry(targetPath);
  await adapter.writeImports(nextImports);
  await adapter.reload();
  return { currentImports, entry };
}

test("替换适配层实现即可切换配置键与重载命令，业务代码一行不改", async () => {
  // 假想后端：仅用于演示"换后端 = 换一份声明"，本工单不引入第二个真实后端（那是 #22）。
  const HYPOTHETICAL_LOADER = {
    configSection: "hypothetical_ui_style",
    importsProperty: "files",
    reloadCommand: "hypotheticalUiStyle.reload",
    toEntry: ({ filePath, vscode }) => vscode.Uri.file(filePath).toString(),
  };

  const input = {
    targetPath: "/ext/src/neovide-cursor/neovide-cursor.js",
    nextImports: ["file:///ext/src/gradient-theme/gradient-theme.css"],
  };

  const be5invis = fakeVscode({ imports: [] });
  const hypothetical = fakeVscode({ imports: [] });

  const viaDefault = await runRefreshFlow(
    createLoaderAdapter({ vscode: be5invis.vscode }),
    input,
  );
  const viaHypothetical = await runRefreshFlow(
    createLoaderAdapter({
      vscode: hypothetical.vscode,
      loader: HYPOTHETICAL_LOADER,
    }),
    input,
  );

  // 默认后端（be5invis）：键名、命令与重构前逐字节一致。
  // 流程里读、写各取一次配置（写入前会再读一次，以保留用户自己条目的形态，见 #22），
  // 因此按去重后的配置节 / 属性名断言"只碰这一个节、这一个属性"。
  assert.deepEqual(distinct(be5invis.log.sections), ["vscode_custom_css"]);
  assert.deepEqual(distinct(be5invis.log.gets), ["imports"]);
  assert.deepEqual(be5invis.log.commands, [["extension.updateCustomCSS"]]);

  // 换一份声明后，同一段业务代码读写的键、调用的命令都随之改变。
  assert.deepEqual(distinct(hypothetical.log.sections), ["hypothetical_ui_style"]);
  assert.deepEqual(distinct(hypothetical.log.gets), ["files"]);
  assert.deepEqual(hypothetical.log.commands, [["hypotheticalUiStyle.reload"]]);

  // 业务结果完全相同：变的只有"写到哪、调什么"。
  assert.deepEqual(viaDefault.currentImports, []);
  assert.deepEqual(viaDefault.currentImports, viaHypothetical.currentImports);
  assert.equal(viaDefault.entry, viaHypothetical.entry);
  assert.deepEqual(be5invis.log.updates[0].value, input.nextImports);
  assert.deepEqual(hypothetical.log.updates[0].value, input.nextImports);
});

// ---------------------------------------------------------------------------
// 收敛证据：加载器字面量只出现在适配层
// ---------------------------------------------------------------------------
//
// 只扫"会被扩展宿主加载的模块"（extension.js 与 src 下的 .js）：
// 测试自己需要引用这些字面量来锁住默认值，docs 里则是诊断记录，都不算模块。
// #22 起把第二个后端的标识也纳进来：业务代码同样不得出现它的名字或配置键。

const LOADER_LITERALS = [
  "vscode_custom_css",
  "extension.updateCustomCSS",
  "custom-ui-style",
  "subframe7536.custom-ui-style",
  "external.imports",
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

test("加载器字面量（配置键、命令名）只出现在适配层", () => {
  const offenders = [];
  for (const file of hostModules) {
    const source = fs.readFileSync(file, "utf8");
    for (const literal of LOADER_LITERALS) {
      if (source.includes(literal)) {
        offenders.push(`${relative(file)}: ${literal}`);
      }
    }
  }

  // 扫描本身确实有效：适配层里必须能找到这两个字面量，否则下面的空结果是假象。
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

  // #22 起入口不再自己造适配器，而是让适配层按设置值选（`selectLoader` 内部仍然
  // 用 `createLoaderAdapter`）；两条路径都算"经过适配层"。
  assert.match(source, /selectLoader|createLoaderAdapter/);
  assert.doesNotMatch(source, /getConfiguration\(\s*["']vscode_custom_css/);
  assert.doesNotMatch(source, /executeCommand\(\s*["']extension\.updateCustomCSS/);
});

// ---------------------------------------------------------------------------
// 业务代码不出现后端**名字**面量（ADR-0003「后果」节的承诺）
// ---------------------------------------------------------------------------
//
// 上一条测试覆盖的是配置键与命令名。这一条覆盖"名字"本身——「后端差异只存在于一个
// 可测试的适配层」这句承诺，只有在业务代码里连 `be5invis` / `custom-ui-style` 都不出现时才成立。
//
// 范围按 ADR 的措辞取「业务代码」：`extension.js` 与 `src/install`、`src/common` 下的模块。
// 五个效果目录（`src/neovide-cursor` 等）是**注入进 VS Code 的载荷脚本**，不是扩展宿主模块：
// 它们既不读也不写加载器配置，其中的历史注释提到后端名属于解释性文字，不在本条承诺范围内。

const BACKEND_NAME_LITERALS = [
  "be5invis",
  "custom-ui-style",
  "subframe7536.custom-ui-style",
  "Custom CSS and JS Loader",
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
  const offenders = [];
  for (const file of businessModules()) {
    const source = fs.readFileSync(file, "utf8");
    for (const literal of BACKEND_NAME_LITERALS) {
      if (source.includes(literal)) offenders.push(`${relative(file)}: ${literal}`);
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
    offenders.filter((line) => !line.startsWith("src/common/loader-adapter.js")),
    [],
  );
});
