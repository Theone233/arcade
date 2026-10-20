/**
 * 截图、冒烟用的无头浏览器。playwright-core 认的浏览器版本和本地装的不一定一样：
 * 先用环境变量 CHROME 指的；没有就在 playwright 的缓存目录里找装了的 chrome-headless-shell（取版本最新的）；都没有就交给 playwright 自己找。
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';

function findShell(): string | undefined {
  if (process.env.CHROME) return process.env.CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = join(root, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (existsSync(p)) return p;
  }
  return undefined;
}

export function launch(): Promise<Browser> {
  const executablePath = findShell();
  return chromium.launch({ args: ['--no-zygote', '--disable-gpu'], ...(executablePath ? { executablePath } : {}) });
}
