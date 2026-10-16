/**
 * 音频客观检查：起 vite（127.0.0.1 上系统挑的空闲端口，不占任何模块登记的端口）→ 无头 Chromium。
 * 浏览器类检查需要错开时，用 flock 加一把锁再运行 node tools/audio-check.ts
 *
 *   node tools/audio-check.ts            全部检查
 *   node tools/audio-check.ts --sfx      只测音效
 *   node tools/audio-check.ts --music    只测音乐
 *   node tools/audio-check.ts --page     只做真实页面冒烟
 *
 * 1. 每个音效（含变体）用 OfflineAudioContext 走完整主链渲染（音量全满的最坏情况），测峰值/RMS/时长/尾部/直流；
 * 2. 每个情绪渲染 16 秒音乐，bull（最密）再渲染 60 秒并采样活跃音符数，另测一段多情绪交叉淡化；
 * 3. 打开 ?soundboard=1&seed=demo，用真实点击试听若干按钮，再连发 200 个账户滚动，检查节流与 console error。
 * 任一指标越界（削波、峰值 > -1 dBFS、尾部未归零、直流偏移、节点增长、报错）以非零码退出。
 */
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';

let BASE = '';
const errors: string[] = [];
const only = process.argv.find((a) => a === '--sfx' || a === '--music' || a === '--page');

interface Analysis {
  peakDb: number;
  rmsDb: number;
  momentaryDb: number;
  duration: number;
  tailDb: number;
  dc: number;
  clipped: number;
}

const f1 = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '-∞');
const pad = (s: string, n: number): string => {
  // 中文按 2 列宽计
  let w = 0;
  for (const ch of s) w += /[一-鿿＀-￯]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
};
const lpad = (s: string, n: number): string => ' '.repeat(Math.max(0, n - s.length)) + s;

function checkAnalysis(name: string, a: Analysis, opts: { maxPeakDb: number; silentOk?: boolean }): string {
  const bad: string[] = [];
  if (a.clipped > 0) bad.push(`削波 ${a.clipped} 样本`);
  if (a.peakDb > opts.maxPeakDb) bad.push(`峰值 ${f1(a.peakDb)} dBFS > ${opts.maxPeakDb}`);
  if (a.tailDb > -80) bad.push(`尾部未归零 ${f1(a.tailDb)} dBFS`);
  if (Math.abs(a.dc) > 1e-4) bad.push(`直流偏移 ${a.dc.toExponential(1)}`);
  if (!opts.silentOk && !Number.isFinite(a.peakDb)) bad.push('无声');
  if (bad.length) errors.push(`[${name}] ${bad.join('；')}`);
  return bad.length ? '✗' : 'ok';
}

async function openBlank(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[离线] console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[离线] pageerror: ${e.message}`));
  // 打开一个同源的静态资源作为空白页，再动态导入模块
  await page.goto(`${BASE}package.json`);
  return page;
}

async function checkSfx(browser: Browser): Promise<void> {
  const page = await openBlank(browser);
  const rows = (await page.evaluate(`import('/src/view/audio/offline.ts').then((m) => m.renderAllCues())`)) as (Analysis & {
    key: string;
    label: string;
    nodesLeft: number;
  })[];
  console.log('\n## 音效（音量全满、经主链；时长到 -60 dBFS）\n');
  console.log(`${pad('变体', 22)}${pad('名称', 16)}${lpad('峰值dBFS', 9)}${lpad('RMS', 7)}${lpad('400ms', 7)}${lpad('时长s', 7)}${lpad('尾部dB', 8)}${lpad('残留', 5)}  结果`);
  for (const r of rows) {
    const res = checkAnalysis(r.key, r, { maxPeakDb: -1 });
    if (r.nodesLeft > 0) errors.push(`[${r.key}] 渲染结束后仍有 ${r.nodesLeft} 个音效未回收`);
    console.log(
      `${pad(r.key, 22)}${pad(r.label, 16)}${lpad(f1(r.peakDb), 9)}${lpad(f1(r.rmsDb), 7)}${lpad(f1(r.momentaryDb), 7)}${lpad(r.duration.toFixed(2), 7)}${lpad(f1(r.tailDb), 8)}${lpad(String(r.nodesLeft), 5)}  ${res}`,
    );
  }
  const cc = (await page.evaluate(`import('/src/view/audio/offline.ts').then((m) => m.concurrencyCheck())`)) as { requested: number; active: number; stolen: number };
  console.log(`\n并发上限：同时请求 ${cc.requested} 个，在播 ${cc.active} 个，淘汰 ${cc.stolen} 次`);
  if (cc.active > 16) errors.push(`并发上限失效：${cc.active}`);
  await page.close();
}

async function checkMusic(browser: Browser): Promise<void> {
  const page = await openBlank(browser);
  const moods = ['title', 'bull', 'flat', 'bear', 'payday', 'victory', 'defeat', 'silent'];
  console.log('\n## 音乐（16 秒，音乐与总音量全满）\n');
  console.log(`${pad('情绪', 10)}${lpad('峰值dBFS', 9)}${lpad('RMS', 7)}${lpad('400ms', 7)}${lpad('音符/秒', 9)}${lpad('亮度', 8)}${lpad('音符(8s/16s)', 14)}  结果`);
  const density: Record<string, { notes: number; bright: number }> = {};
  for (const m of moods) {
    const r = (await page.evaluate(
      `import('/src/view/audio/offline.ts').then((o) => o.renderMusic([[0, '${m}']], 16))`,
    )) as Analysis & { samples: [number, number, number][]; notesPerSec: number; brightness: number };
    const res = checkAnalysis(`music:${m}`, { ...r, tailDb: -100 }, { maxPeakDb: -1, silentOk: m === 'silent' });
    const at = (t: number): number => r.samples.find((s) => s[0] >= t)?.[1] ?? -1;
    density[m] = { notes: r.notesPerSec, bright: r.brightness };
    console.log(
      `${pad(m, 10)}${lpad(f1(r.peakDb), 9)}${lpad(f1(r.rmsDb), 7)}${lpad(f1(r.momentaryDb), 7)}${lpad(r.notesPerSec.toFixed(1), 9)}${lpad(r.brightness.toFixed(3), 8)}${lpad(`${at(8)}/${at(15)}`, 14)}  ${res}`,
    );
    if (m === 'silent' && Number.isFinite(r.peakDb)) errors.push(`silent 情绪不应出声：${f1(r.peakDb)}`);
  }
  // 情绪色彩：牛市比震荡更密，熊市比牛市更暗
  if (!((density.bull?.notes ?? 0) > (density.flat?.notes ?? 0))) errors.push('bull 的节奏没有比 flat 更密');
  if (!((density.bear?.bright ?? 1) < (density.bull?.bright ?? 0))) errors.push('bear 没有比 bull 更暗');

  // 长时间渲染：活跃音符数不随时间增长（bull 最密）
  const long = (await page.evaluate(`import('/src/view/audio/offline.ts').then((o) => o.renderMusic([[0, 'bull']], 60, 5))`)) as Analysis & {
    samples: [number, number, number][];
  };
  console.log('\n## bull 60 秒：活跃音符 / 节点数（每 5 秒）\n');
  console.log(long.samples.map((s) => `${lpad(s[0].toFixed(0), 3)}s: ${lpad(String(s[1]), 3)} 音符 ${lpad(String(s[2]), 4)} 节点`).join('\n'));
  checkAnalysis('music:bull-60s', { ...long, tailDb: -100 }, { maxPeakDb: -1 });
  const firstHalf = Math.max(...long.samples.filter((s) => s[0] > 3 && s[0] <= 30).map((s) => s[2]));
  const secondHalf = Math.max(...long.samples.filter((s) => s[0] > 30).map((s) => s[2]));
  console.log(`前 30 秒最大节点 ${firstHalf}，后 30 秒最大节点 ${secondHalf}`);
  if (secondHalf > firstHalf * 1.5 + 20) errors.push(`音乐节点数随时间增长：${firstHalf} → ${secondHalf}`);

  // 情绪切换：交叉淡化 + 回收淡出的播放器（含 1 秒内连切 3 次：天气来回变）
  const seq: [number, string][] = [
    [0, 'title'],
    [6, 'flat'],
    [12, 'bull'],
    [18, 'bear'],
    [21, 'bull'],
    [21.4, 'flat'],
    [21.8, 'bear'],
    [24, 'payday'],
    [28, 'victory'],
    [31, 'defeat'],
    [34, 'silent'],
  ];
  const x = (await page.evaluate(`import('/src/view/audio/offline.ts').then((o) => o.renderMusic(${JSON.stringify(seq)}, 44, 2))`)) as Analysis & {
    samples: [number, number, number][];
  };
  console.log(`\n## 情绪切换序列（含 1 秒内连切 3 次，34 秒后 silent）\n`);
  console.log(`峰值 ${f1(x.peakDb)} dBFS，RMS ${f1(x.rmsDb)}；末段采样 ${x.samples.slice(-3).map((s) => `${s[0]}s:${s[1]}音符`).join(' ')}`);
  checkAnalysis('music:sequence', x, { maxPeakDb: -1 });
  const lastSample = x.samples[x.samples.length - 1];
  if (lastSample && lastSample[1] > 0) errors.push(`silent 后仍有 ${lastSample[1]} 个音符未回收`);
  await page.close();
}

async function checkPage(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}?soundboard=1&seed=demo`);
  await page.waitForTimeout(1500);
  // 画面层尚未接入 createAudio 时，自行创建一个实例来挂面板
  const created = (await page.evaluate(
    `document.getElementById('kp-soundboard') ? 'game' : import('/src/view/audio/index.ts').then((m) => { window.__kpApi = m.createAudio(); return 'self'; })`,
  )) as string;
  await page.waitForSelector('#kp-soundboard');
  const before = await page.evaluate(`window.__kpAudio.stats()`);
  // 按 0.3 流程点：盘前群聊 → 买入 → 开盘 → 天气 → 热度 → 揭晓 → 连线 → 道具 → 滚动 → 烟花 → 月底 → 三选一
  const clicks = [
    '[data-mood="flat"]',
    '[data-cue="ui:click"]',
    '[data-cue="chat:seq"]',
    '[data-cue="buy"]',
    '[data-cue="marketOpen"]',
    '[data-mood="bear"]',
    '[data-cue="weather:bear"]',
    '[data-cue="heat:mixed"]',
    '[data-cue="reveal:seq"]',
    '[data-cue="chain:seq"]',
    '[data-cue="item:plus"]',
    '[data-cue="countUp:seq"]',
    '[data-cue="limitUp"]',
    '[data-mood="payday"]',
    '[data-cue="bill"]',
    '[data-cue="stamp:paid+credit"]',
    '[data-cue="rewardShow"]',
    '[data-cue="reward:friend"]',
  ];
  for (const sel of clicks) {
    await page.click(`#kp-soundboard ${sel}`);
    await page.waitForTimeout(250);
  }
  const afterClicks = (await page.evaluate(`window.__kpAudio.stats()`)) as Record<string, unknown> | null;
  // 同步连发 200 个账户滚动（模拟极端情况）
  const burst = (await page.evaluate(`(() => {
    const h = window.__kpAudio;
    const s0 = h.stats();
    for (let i = 0; i < 200; i++) h.api.cue({ type: 'countUp', progress: i / 199 });
    const s1 = h.stats();
    return { played: s1.played - s0.played, throttled: s1.throttled - s0.throttled, sfxVoices: s1.sfxVoices };
  })()`)) as { played: number; throttled: number; sfxVoices: number };
  // 按 60 fps 每帧一跳发 60 个账户滚动
  const paced = (await page.evaluate(`new Promise((res) => {
    const h = window.__kpAudio;
    const s0 = h.stats();
    const t0 = performance.now();
    let i = 0;
    const id = setInterval(() => {
      h.api.cue({ type: 'countUp', progress: i / 59 });
      if (++i >= 60) { clearInterval(id); const s1 = h.stats(); res({ sent: 60, played: s1.played - s0.played, elapsed: (performance.now() - t0) / 1000 }); }
    }, 1000 / 60);
  })`)) as { sent: number; played: number; elapsed: number };
  // 暂停 / 恢复 / 销毁
  const lifecycle = (await page.evaluate(`(async () => {
    const h = window.__kpAudio;
    h.api.setPaused(true);
    await new Promise((r) => setTimeout(r, 300));
    const paused = h.stats();
    const p0 = paused.played;
    h.api.cue({ type: 'ui', name: 'click' });
    const droppedWhilePaused = h.stats().played === p0;
    h.api.setPaused(false);
    await new Promise((r) => setTimeout(r, 300));
    const resumed = h.stats();
    return { pausedState: paused.state, droppedWhilePaused, resumedState: resumed.state, musicVoices: resumed.musicVoices };
  })()`)) as Record<string, unknown>;
  console.log('\n## 真实页面 ?soundboard=1&seed=demo\n');
  console.log(`面板来源：${created === 'game' ? '游戏内 createAudio' : '测试脚本自建（画面层尚未接入）'}`);
  console.log(`解锁前：${JSON.stringify(before)}`);
  console.log(`点击 ${clicks.length} 个按钮后：${JSON.stringify(afterClicks)}`);
  console.log(`同步连发 200 个账户滚动：发声 ${burst.played}，节流 ${burst.throttled}，当前在播音效 ${burst.sfxVoices}`);
  console.log(`按 60 fps 发 60 个账户滚动：发声 ${paced.played}，实际用时 ${paced.elapsed.toFixed(2)} 秒`);
  console.log(`暂停/恢复：${JSON.stringify(lifecycle)}`);
  if (before !== null) errors.push('解锁前就创建了 AudioContext');
  if (burst.played > 1) errors.push(`同步 200 个账户滚动节流失效：发声 ${burst.played}`);
  // 节流规则：账户滚动两次发声至少间隔 30 ms
  const limit = Math.floor(paced.elapsed / 0.03) + 1;
  if (paced.played > limit) errors.push(`实时账户滚动节流不足：${paced.sent} 跳发声 ${paced.played}（上限 ${limit}）`);
  if (paced.played < paced.sent / 4) errors.push(`账户滚动被节流过度：${paced.sent} 跳只发声 ${paced.played}`);
  if (lifecycle.droppedWhilePaused !== true) errors.push('暂停时 cue 未被丢弃');
  await page.evaluate(`window.__kpAudio.api.dispose()`);
  const gone = await page.evaluate(`!document.getElementById('kp-soundboard')`);
  if (!gone) errors.push('dispose 后面板未移除');
  for (const e of pageErrors) errors.push(`[页面] ${e}`);
  await context.close();
}

async function main(): Promise<void> {
  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;
  try {
    server = await createServer({
      root: process.cwd(),
      logLevel: 'warn',
      server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
    });
    await server.listen();
    const addr = server.httpServer?.address();
    if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
    BASE = `http://127.0.0.1:${addr.port}/`;
    browser = await chromium.launch({
      args: ['--no-sandbox', '--no-zygote', '--in-process-gpu', '--enable-unsafe-swiftshader', '--no-proxy-server'],
    });
    if (!only || only === '--sfx') await checkSfx(browser);
    if (!only || only === '--music') await checkMusic(browser);
    if (!only || only === '--page') await checkPage(browser);
  } catch (err) {
    errors.push(err instanceof Error ? (err.stack ?? err.message) : String(err));
  } finally {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
  if (errors.length > 0) {
    console.error(`\n失败（${errors.length}）：`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log('\n全部通过。');
}

await main();
