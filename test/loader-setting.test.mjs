import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { LOADERS, DEFAULT_LOADER } from "../src/common/loader-adapter.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);

// 把一个 `contributes.configuration` 块摊平成 键 → 声明 的映射。
const configurationProperties = Object.assign(
  {},
  ...(manifest.contributes?.configuration ?? []).map(
    (block) => block.properties ?? {},
  ),
);

const LOADER_SETTING = "visionSmashCode.loader";

// ---------------------------------------------------------------------------
// 设置项声明
// ---------------------------------------------------------------------------

test("manifest：注入后端设置项已声明，枚举就是注册表里的两个后端", () => {
  const setting = configurationProperties[LOADER_SETTING];

  assert.ok(setting, `package.json 应当声明 ${LOADER_SETTING}`);
  assert.equal(setting.type, "string");
  assert.deepEqual([...setting.enum].sort(), Object.keys(LOADERS).sort());
});

test("manifest：默认后端是 be5invis（既有用户升级后行为不变）", () => {
  const setting = configurationProperties[LOADER_SETTING];

  assert.equal(setting.default, "be5invis");
  assert.equal(setting.default, DEFAULT_LOADER.id);
});

test("manifest：设置项有中英双语描述，并写明 custom-ui-style 是实验性的、可随时切回", () => {
  const setting = configurationProperties[LOADER_SETTING];
  const description = [
    setting.description,
    setting.markdownDescription,
    ...(setting.enumDescriptions ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  // 中英双语：至少各出现一次后端 id 的说明，两段描述里都要有中文与英文。
  assert.match(description, /be5invis/);
  assert.match(description, /custom-ui-style/);
  assert.match(description, /[A-Za-z]{4,}/);
  assert.match(description, /[\u4e00-\u9fa5]/);

  // 实验性 + 可随时切回：这两条是维护者要求的能力边界声明，不是可选项。
  assert.match(description, /实验|experimental/i);
  assert.match(description, /切回|switch back/i);
});

test("manifest：设置项的描述说明了默认值与切换的代价（旧后端的条目会被清理）", () => {
  const setting = configurationProperties[LOADER_SETTING];
  const description = [
    setting.description,
    setting.markdownDescription,
    ...(setting.enumDescriptions ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  assert.match(description, /默认|default/i);
  assert.match(description, /移除|清理|remove|clean/i);
});

// ---------------------------------------------------------------------------
// manifest 决策 A：移除硬依赖
// ---------------------------------------------------------------------------

test("manifest：不再硬依赖某个注入后端（决策 A：改为运行时检测）", () => {
  // 硬依赖会让「可切换」形同虚设：用户禁用 be5invis 时本扩展根本不会激活，
  // 设置项永远读不到。因此 extensionDependencies 必须为空 / 不存在。
  const dependencies = manifest.extensionDependencies;

  assert.ok(
    dependencies === undefined ||
      (Array.isArray(dependencies) && dependencies.length === 0),
    `extensionDependencies 应为空，实际是 ${JSON.stringify(dependencies)}`,
  );
});

test("manifest：后端扩展 id 没有散落在 manifest 里（而是留在各自的 loader 声明里）", () => {
  // 检测复用同一个事实来源：声明里的 extensionId。manifest 若也写一份就会有两处真相。
  const raw = fs.readFileSync(path.join(repoRoot, "package.json"), "utf8");

  for (const declaration of Object.values(LOADERS)) {
    assert.ok(
      !raw.includes(declaration.extensionId),
      `backend extension id ${declaration.extensionId} 不应出现在 manifest 里`,
    );
  }
});

// ---------------------------------------------------------------------------
// 文档
// ---------------------------------------------------------------------------

test("文档：两份 README 都补充了注入后端设置项的说明", () => {
  for (const file of ["README.md", "README-zh.md"]) {
    const text = fs.readFileSync(path.join(repoRoot, file), "utf8");
    assert.ok(
      text.includes(LOADER_SETTING),
      `${file} 应当提到 ${LOADER_SETTING}`,
    );
    assert.ok(
      text.includes("custom-ui-style"),
      `${file} 应当说明另一个可选后端的名字`,
    );
  }
});
