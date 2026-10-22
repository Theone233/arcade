/**
 * 冒烟、截图用：打包页面（和 npm run build:cf 一样，到 dist-cf/games/danli），在本机起真的 Worker（wrangler dev，本地模式，不要 Cloudflare 账号），
 * 好友房的房间、计量都是本地的 Durable Object（存储放系统临时目录，用完删掉）。没有平台：kit 的独立模式，每个浏览器上下文是一个游客。
 * 端口由系统分配（AGENTS.md 第 3 节）。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';

const root = new URL('..', import.meta.url).pathname;

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const s = createServer();
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => done(port));
    });
  });
}

export interface LocalWorker {
  /** 游戏首页，如 http://127.0.0.1:12345/games/danli/ */
  base: string;
  stop(): Promise<void>;
}

export async function startWorker(): Promise<LocalWorker> {
  await build({ root, logLevel: 'warn', build: { outDir: join(root, 'dist-cf/games/danli'), emptyOutDir: true } });
  const port = await freePort();
  const state = mkdtempSync(join(tmpdir(), 'danli-worker-'));
  const child: ChildProcess = spawn(join(root, 'node_modules/.bin/wrangler'), ['dev', '--port', String(port), '--ip', '127.0.0.1', '--inspector-port', '0', '--persist-to', state, '--log-level', 'warn'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  let log = '';
  child.stdout?.on('data', (d: Buffer) => (log += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (log += d.toString()));
  const base = `http://127.0.0.1:${port}/games/danli/`;
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`wrangler dev 起不来：\n${log}`);
    try {
      const r = await fetch(`${base}health`);
      if (r.ok) break;
    } catch {
      // 还没起来
    }
    if (Date.now() - t0 > 90_000) {
      child.kill();
      throw new Error(`wrangler dev 90 秒没起来：\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return {
    base,
    stop: async () => {
      if (child.exitCode === null) {
        const exited = new Promise((r) => child.once('exit', r));
        child.kill('SIGTERM');
        await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
        if (child.exitCode === null) child.kill('SIGKILL');
      }
      rmSync(state, { recursive: true, force: true });
    },
  };
}
