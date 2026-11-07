import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { CUSTOM_UI_STYLE_LOADER } from "../src/common/loader-adapter.js";

/**
 * manifest 与用户文档里关于「注入后端」的硬约束（ADR-0004）。
 *
 * ADR-0004 决定只保留 Custom UI Style：设置项 `visionSmashCode.loader`、后端注册表与
 * 切换逻辑全部删除。这里把"删除"与"文档必须写清的用户级前置条件"钉住，避免以后
 * 有人顺手把切换能力或旧后端加回来。
 */

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

const README_FILES = ["README.md", "README-zh.md"];

/** 读两份 README 的正文。 */
function readmeText(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

// ---------------------------------------------------------------------------
// manifest：切换能力已删除
// ---------------------------------------------------------------------------

test("manifest：不再声明注入后端设置项（切换能力已删除）", () => {
  assert.equal(
    configurationProperties["visionSmashCode.loader"],
    undefined,
    "package.json 不应再声明 visionSmashCode.loader",
  );

  const raw = fs.readFileSync(path.join(repoRoot, "package.json"), "utf8");
  assert.doesNotMatch(raw, /visionSmashCode\.loader/);
});

test("manifest：不硬依赖注入后端（保留运行时检测 + 安装提示）", () => {
  // 维护者明确选择「运行时检测 + 提示安装」而不是 extensionDependencies。
  const dependencies = manifest.extensionDependencies;

  assert.ok(
    dependencies === undefined ||
      (Array.isArray(dependencies) && dependencies.length === 0),
    `extensionDependencies 应为空，实际是 ${JSON.stringify(dependencies)}`,
  );
});

test("manifest：后端扩展 id 不散落在 manifest 里（唯一事实来源是适配层声明）", () => {
  const raw = fs.readFileSync(path.join(repoRoot, "package.json"), "utf8");

  assert.ok(
    !raw.includes(CUSTOM_UI_STYLE_LOADER.extensionId),
    `backend extension id ${CUSTOM_UI_STYLE_LOADER.extensionId} 不应出现在 manifest 里`,
  );
});

// ---------------------------------------------------------------------------
// 文档：单一后端 + 用户级前置条件 + 未验证声明
// ---------------------------------------------------------------------------

test("文档：两份 README 都说明唯一后端与它的配置键", () => {
  for (const file of README_FILES) {
    const text = readmeText(file);
    assert.match(text, /Custom UI Style/, `${file} 应点名唯一后端`);
    assert.match(
      text,
      /subframe7536\.custom-ui-style/,
      `${file} 应给出后端扩展 id`,
    );
    assert.match(
      text,
      /custom-ui-style\.external\.imports/,
      `${file} 应说明注入列表写在哪里`,
    );
  }
});

test("文档：写明「执行 Custom UI Style: Reload」这一前置条件", () => {
  for (const file of README_FILES) {
    assert.match(
      readmeText(file),
      /Custom UI Style: Reload/,
      `${file} 应写明改完设置要执行 Custom UI Style: Reload`,
    );
  }
});

test("文档：写明 reloadWithoutPrompting 默认 false 会先弹提示等确认", () => {
  for (const file of README_FILES) {
    assert.match(
      readmeText(file),
      /reloadWithoutPrompting/,
      `${file} 应提到 reloadWithoutPrompting`,
    );
    assert.match(
      readmeText(file),
      /false/,
      `${file} 应说明 reloadWithoutPrompting 默认是 false`,
    );
    assert.match(
      readmeText(file),
      /(提示|确认|prompt|confirm)/i,
      `${file} 应说明默认值下会先弹提示等确认`,
    );
  }
});

test("文档：写明 Windows 上有时需要完全退出 VS Code 而不是 Reload Window", () => {
  for (const file of README_FILES) {
    const text = readmeText(file);
    assert.match(text, /Windows/, `${file} 应点名 Windows`);
    assert.match(
      text,
      /(完全退出|关闭所有窗口|fully (quit|close|exit)|close all (VS Code )?windows)/i,
      `${file} 应说明 Windows 上有时要完全退出 VS Code`,
    );
    assert.match(
      text,
      /Reload Window|重新加载窗口|重载窗口/,
      `${file} 应对比出「不是 Reload Window 就够了」`,
    );
  }
});

test("文档：写明 loadStrategy 设为 disable 会忽略全部外部资源", () => {
  for (const file of README_FILES) {
    const text = readmeText(file);
    assert.match(text, /loadStrategy/, `${file} 应提到 loadStrategy`);
    assert.match(
      text,
      /disable/,
      `${file} 应说明 loadStrategy 被设为 "disable" 时的后果`,
    );
    assert.match(
      text,
      /(忽略|禁用|disabled|ignored)/i,
      `${file} 应说明 disable 会忽略外部资源`,
    );
  }
});

test("文档：诚实标注 ESM 下三个 JS 效果未经真实编辑器验证", () => {
  for (const file of README_FILES) {
    const text = readmeText(file);
    assert.match(text, /ES ?module|ESM/i, `${file} 应说明本地 JS 按 ESM 加载`);
    assert.match(
      text,
      /(光标拖尾|鼠标尾迹|文字爆炸|cursor trail|mouse trail|typing explosion)/i,
      `${file} 应点名三个 JS 效果`,
    );
    assert.match(
      text,
      /(未(经|在)?[^。\n]{0,12}验证|not (been )?verified|unverified)/i,
      `${file} 应明确声明这一点未经真实编辑器验证`,
    );
  }
});

test("文档：不再宣传可切换后端", () => {
  for (const file of README_FILES) {
    const text = readmeText(file);
    assert.doesNotMatch(
      text,
      /visionSmashCode\.loader/,
      `${file} 不应再提到已删除的设置项`,
    );
    assert.doesNotMatch(
      text,
      /Choosing the injection backend|选择注入后端/,
      `${file} 不应再保留「选择注入后端」一节`,
    );
  }
});
