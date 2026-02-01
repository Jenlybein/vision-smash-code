import * as fs from "fs";
import * as vscode from "vscode";

export async function getUpdatedCSS(context,cssRoot){
  let css = "";
  // 加入默认过渡效果
  css += await getCSSFile("Default-Transitions.css", cssRoot);
  // 加入自定义动画文件
  css += await getCSSFile("Custom-Animations.css", cssRoot);

  // 读取配置文件
  const config = vscode.workspace.getConfiguration("animations");

  for (const key of ["Command-Palette", "Tabs", "Active", "Scrolling"]) {
    const setting = config.get(key);
    if (setting !== "None") {
      css += updateDuration(
        await getCSSFile(`${key}/${setting}.css`, cssRoot),
        key
      );
    }
  }

  /**
   * Adds all boolean settings to the css string
   */
  for (const key of ["Smooth-Mode"]) {
    if (config.get(key) as boolean) {
      css += updateDuration(await getCSSFile(`Misc/${key}.css`, cssRoot), key);
    }
  }

  //Remove all new lines
  css = css.replace(/\n/g, "");

  return css;
}

async function getCSSFile(cssFilePath,cssRoot){
  let css = "";
  try {
    await vscode.workspace.fs
      .readFile(vscode.Uri.file(cssRoot + cssFilePath)) //Reads the file
      .then((data) => (css += data.toString())); //Adds the content to the css string
  } catch (error) {
    console.error("Error reading css file", error);
  }
  return css;
}

/**
 * Updates the duration in the css string
 * @param css The css string to update
 * @param key The key of the duration in the settings
 * @returns The updated css string
 */
export function updateDuration(css, key) {
  const config = vscode.workspace.getConfiguration("animations"); //Extension settings
  let duration = (config.get("Durations"))[key]; //The duration of the animation

  if (!duration || parseInt(`${duration}`) > 10000) {
    duration = config.get("Default-Duration");
    if (!duration || parseInt(`${duration}`) > 10000) {
      return css;
    }
  }

  css = css.replace(
    /\/\*<Duration>\*\/.*\/\*<\/Duration>\*\//g,
    `${duration}ms`
  );

  return css;
}