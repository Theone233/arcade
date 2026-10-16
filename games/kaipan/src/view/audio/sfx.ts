/**
 * 音效配方：每种 cue（含分档/变体）如何用合成积木搭出来。
 *
 * 风格约定：全部落在 D 调（与背景音乐同调），UI 与群聊用短促的正弦/三角波与 FM 小叮，
 * 事件音用 FM 电钢与钟，大事件加铜管与鼓；高频分音限制在 7 kHz 以下，所有尖锐音都过低通，避免刺耳。
 * 响度层级（单个音效的峰值，送入总线前）：滚动小跳音 ≈ 0.03–0.05，UI ≈ 0.03–0.12，事件 ≈ 0.15–0.3，大事件 ≈ 0.3–0.5。
 */
import type { Voice } from './graph.ts';
import { Rng, chainPitch, chatPitch, clamp, countUpPitch, cueKey, dbToGain, heatMix, midiToFreq, revealPitch, revealTier, settleTier, signTier } from './logic.ts';
import { bell, brass, drum, fm, noise, tone } from './synth.ts';
import type { AutoSellReason, Mood as MarketMood, RewardKind } from '../../core/index.ts';
import type { Cue, UiSound } from './types.ts';

const n = midiToFreq;

/**
 * 响度校准（dB，按变体）：配方里的峰值是按“听感层级”手写的，再用 tools/audio-check.ts 测得的
 * 400 ms 响度微调到：hover ≈ -55，滚动小跳音 ≈ -48，UI/群聊 ≈ -38～-46，事件 ≈ -28～-34，大事件 ≈ -16～-22（音量全满时）。
 */
const TRIM: Readonly<Record<string, number>> = {
  'ui:denied': -7,
  'ui:select': -3,
  guide: -5,
  marketOpen: -2,
  'settle:win': -3,
  'judge:hit': -2,
  'weather:flat': -3,
  'weather:bear': -3,
  'heat:up': 3,
  'heat:down': 2,
  'heat:mixed': 3,
  'reveal:flat': 2,
  'reveal:limitDown': -4,
  limitDown: -2,
  'news:delisted': -5,
  monthStart: -2,
  bill: 4,
  'reward:stock': -4,
  'reward:skip': 3,
  event: -3,
  'eventResult:gain': -2,
  'eventResult:none': 2,
};

/**
 * 在 Voice 里搭出 cue 对应的声音，t 为开始时刻。返回混响送量（0..1），由引擎接到混响送入口。
 */
export function buildSfx(v: Voice, c: Cue, t: number): number {
  const trim = TRIM[cueKey(c)];
  if (trim) v.out.gain.value = dbToGain(trim);
  return recipe(v, c, t);
}

function recipe(v: Voice, c: Cue, t: number): number {
  switch (c.type) {
    case 'ui':
      return ui(v, c.name, t);
    case 'guide':
      tone(v, { freq: n(81), t, a: 0.012, d: 0.35, peak: 0.06 });
      fm(v, { freq: n(86), ratio: 2, index: 0.4, t: t + 0.09, a: 0.012, d: 0.5, peak: 0.055 });
      return 0.25;
    case 'chat':
      return chat(v, c.index, t);
    case 'buy':
      return buy(v, t);
    case 'sell':
      return sell(v, t);
    case 'marketOpen':
      // 开盘钟：一声敲击瞬态 + 两下 A4 钟（第二下稍弱）
      noise(v, { filter: 'bandpass', f: 3200, q: 0.8, t, a: 0.001, d: 0.03, peak: 0.05 });
      bell(v, { freq: n(69), t, d: 2.6, peak: 0.24 });
      bell(v, { freq: n(69), t: t + 0.42, d: 2.2, peak: 0.16 });
      return 0.35;
    case 'weather':
      return weather(v, c.to, t);
    case 'thunder':
      // 远处的雷：只有闷闷的隆隆声，没有近雷的“咔嚓”
      rumble(v, t, { lp: 220, peak: 0.13, rolls: 3, rng: new Rng(41) });
      return 0.35;
    case 'heat':
      return heat(v, c.up, c.down, c.max, t);
    case 'reveal':
      return reveal(v, c.move, c.limit, c.index, t);
    case 'chain':
      return chain(v, c.index, t);
    case 'limitUp':
      return fireworks(v, t);
    case 'limitDown':
      return rainCloud(v, t);
    case 'item':
      return item(v, c.delta, t);
    case 'news':
      return news(v, c.kind, t);
    case 'autoSold':
      return autoSold(v, c.reason, t);
    case 'countUp': {
      const f = n(countUpPitch(c.progress));
      tone(v, { type: 'square', freq: f, t, a: 0.001, d: 0.04, peak: 0.045, lp: 2600 });
      tone(v, { freq: f / 2, t, a: 0.001, d: 0.05, peak: 0.03 });
      return 0;
    }
    case 'settle':
      return settle(v, settleTier(c.ret), t);
    case 'judge':
      if (c.hit) {
        [74, 81, 86].forEach((m, i) => fm(v, { freq: n(m), ratio: 1, index: 1.1, t: t + i * 0.05, d: 0.55, peak: 0.085 }));
        tone(v, { freq: n(90), t: t + 0.15, d: 0.3, peak: 0.03 });
        return 0.25;
      }
      tone(v, { type: 'triangle', freq: n(65), t, d: 0.2, peak: 0.11, lp: 900 });
      tone(v, { type: 'triangle', freq: n(64), t: t + 0.12, d: 0.35, peak: 0.1, lp: 800 });
      return 0.12;
    case 'bill':
      return bill(v, t);
    case 'stamp':
      return stamp(v, c.paid, c.credit, t);
    case 'rewardShow':
      return rewardShow(v, t);
    case 'reward':
      return reward(v, c.kind, t);
    case 'event':
      return event(v, t);
    case 'eventResult':
      return eventResult(v, signTier(c.delta), t);
    case 'monthStart':
      return monthStart(v, t);
    case 'friendJoin':
      return friendJoin(v, t);
    case 'runWon':
      return runWon(v, t);
    case 'runLost':
      return runLost(v, t);
  }
}

function ui(v: Voice, name: UiSound, t: number): number {
  switch (name) {
    case 'hover':
      tone(v, { freq: n(88), t, a: 0.002, d: 0.035, peak: 0.028 });
      return 0;
    case 'click':
      tone(v, { type: 'triangle', freq: 880, to: 640, glide: 0.03, t, a: 0.001, d: 0.05, peak: 0.08, lp: 4000 });
      noise(v, { filter: 'highpass', f: 3000, t, a: 0.001, d: 0.012, peak: 0.03 });
      return 0;
    case 'select':
      fm(v, { freq: n(81), ratio: 2, index: 0.6, t, a: 0.002, d: 0.09, peak: 0.07 });
      fm(v, { freq: n(86), ratio: 2, index: 0.6, t: t + 0.045, a: 0.002, d: 0.12, peak: 0.07 });
      return 0.1;
    case 'denied':
      for (const [dt, f] of [
        [0, 196],
        [0.095, 175],
      ] as const) {
        tone(v, { type: 'square', freq: f, to: f * 0.96, glide: 0.08, t: t + dt, a: 0.004, d: 0.08, peak: 0.08, lp: 900 });
        tone(v, { freq: f, t: t + dt, a: 0.004, d: 0.08, peak: 0.07 });
      }
      return 0;
    case 'open':
      noise(v, { filter: 'bandpass', f: 500, fTo: 2500, fTime: 0.18, q: 1.2, t, a: 0.04, d: 0.16, peak: 0.06 });
      tone(v, { freq: n(74), to: n(81), glide: 0.12, t, a: 0.01, d: 0.15, peak: 0.035 });
      return 0.1;
    case 'close':
      noise(v, { filter: 'bandpass', f: 2500, fTo: 500, fTime: 0.16, q: 1.2, t, a: 0.02, d: 0.14, peak: 0.06 });
      tone(v, { freq: n(81), to: n(74), glide: 0.12, t, a: 0.01, d: 0.13, peak: 0.035 });
      return 0.1;
    case 'toggle':
      for (const [dt, f] of [
        [0, 1400],
        [0.04, 1050],
      ] as const) {
        tone(v, { type: 'triangle', freq: f, t: t + dt, a: 0.001, d: 0.02, peak: 0.06, lp: 5000 });
        noise(v, { filter: 'highpass', f: 4000, t: t + dt, a: 0.001, d: 0.008, peak: 0.025 });
      }
      return 0;
  }
}

// ───────────────────────── 盘前：群聊、买卖 ─────────────────────────

function chat(v: Voice, index: number, t: number): number {
  // 消息气泡：一声极短的上滑“啵”+ FM 小叮（音高随第几条在五声音阶上小幅起伏）+ 高八度泛光
  const f = n(chatPitch(index));
  const pan = (((Number.isFinite(index) ? Math.floor(index) : 0) % 3) - 1) * 0.12;
  tone(v, { freq: f * 0.5, to: f * 0.75, glide: 0.025, t, a: 0.002, d: 0.04, peak: 0.035, pan });
  fm(v, { freq: f, ratio: 4, index: 0.6, indexEnd: 0.05, indexTime: 0.08, t: t + 0.015, a: 0.002, d: 0.32, peak: 0.07, pan });
  tone(v, { freq: f * 2, t: t + 0.02, a: 0.002, d: 0.1, peak: 0.016, pan });
  return 0.12;
}

function buy(v: Voice, t: number): number {
  // 买入：筹码“咔”+ 两声上扬的三角波（A5 → D6，带一点向上的滑音），垫一个低八度，像把股票“放进”格子
  noise(v, { filter: 'bandpass', f: 3800, q: 1.5, t, a: 0.001, d: 0.02, peak: 0.04 });
  tone(v, { type: 'triangle', freq: n(81) * 0.97, to: n(81), glide: 0.04, t, a: 0.002, d: 0.18, peak: 0.085, lp: 4000 });
  tone(v, { type: 'triangle', freq: n(86) * 0.97, to: n(86), glide: 0.04, t: t + 0.07, a: 0.002, d: 0.3, peak: 0.085, lp: 4000 });
  fm(v, { freq: n(74), ratio: 2, index: 0.6, t: t + 0.07, a: 0.002, d: 0.25, peak: 0.04 });
  return 0.15;
}

function sell(v: Voice, t: number): number {
  // 卖出：收银抽屉“咔哒”+ 收银“叮”（两声高钟）+ 三枚硬币落下——收钱的感觉
  noise(v, { filter: 'bandpass', f: 1400, q: 2, t, a: 0.001, d: 0.04, peak: 0.09 });
  noise(v, { filter: 'highpass', f: 5000, t, a: 0.001, d: 0.02, peak: 0.03 });
  bell(v, { freq: n(93), t: t + 0.05, d: 0.7, peak: 0.12 });
  bell(v, { freq: n(98), t: t + 0.09, d: 0.6, peak: 0.07 });
  const rng = new Rng(23);
  for (let i = 0; i < 3; i++) {
    fm(v, { freq: n(rng.pick([95, 98, 100])), ratio: 3.01, index: 0.8, t: t + 0.2 + i * 0.06 + rng.range(0, 0.015), d: 0.12, peak: 0.035, pan: rng.range(-0.4, 0.4) });
  }
  return 0.18;
}

// ───────────────────────── 开盘：天气、热度 ─────────────────────────

interface RumbleOpts {
  /** 低通截止：越低越远越闷 */
  lp: number;
  peak: number;
  /** 隆隆的翻滚次数 */
  rolls: number;
  rng: Rng;
}

/** 雷声主体：低通、慢速回放的噪声，几次错开的翻滚，越往后越弱越暗。 */
function rumble(v: Voice, t: number, o: RumbleOpts): number {
  let end = noise(v, { filter: 'lowpass', f: o.lp * 1.6, fTo: o.lp * 0.5, fTime: 2.2, q: 0.7, rate: 0.35, t, a: 0.12, d: 2.6, peak: o.peak });
  let at = t + 0.15;
  for (let i = 0; i < o.rolls; i++) {
    const k = 1 - i / (o.rolls + 1);
    end = Math.max(end, noise(v, { filter: 'lowpass', f: o.lp * k + 60, q: 0.9, rate: 0.4, t: at, a: 0.08, d: 0.9 + o.rng.range(0, 0.5), peak: o.peak * 0.7 * k, pan: o.rng.range(-0.4, 0.4) }));
    at += 0.3 + o.rng.range(0, 0.35);
  }
  return end;
}

function weather(v: Voice, to: MarketMood, t: number): number {
  switch (to) {
    case 'bull':
      // 放晴：上扫的气流 + D 大调上行闪光（D–F♯–A–D）+ 一声明亮的小钟
      noise(v, { filter: 'bandpass', f: 600, fTo: 4000, fTime: 0.5, q: 1.5, t, a: 0.25, d: 0.35, peak: 0.04 });
      [74, 78, 81, 86].forEach((m, i) => fm(v, { freq: n(m), ratio: 2, index: 0.5, t: t + 0.1 + i * 0.07, a: 0.004, d: 0.6, peak: 0.06, pan: (i - 1.5) * 0.15 }));
      bell(v, { freq: n(90), t: t + 0.4, d: 1.2, peak: 0.06 });
      return 0.35;
    case 'flat':
      // 转阴：一阵柔和的风 + 平稳的四度长音（A–D），不喜不悲
      noise(v, { filter: 'bandpass', f: 500, fTo: 900, fTime: 0.8, q: 1.2, t, a: 0.35, d: 0.2, sustain: 0.7, hold: 0.5, r: 0.6, peak: 0.05 });
      for (const m of [69, 74]) tone(v, { type: 'triangle', freq: n(m), t: t + 0.1, a: 0.2, d: 0.2, sustain: 0.7, hold: 0.4, r: 0.6, peak: 0.045, lp: 1600 });
      return 0.3;
    case 'bear':
      // 雷雨：近处的闷雷（低通“咔”+ 隆隆）+ 低音 D 小三和弦
      noise(v, { filter: 'lowpass', f: 900, t, a: 0.004, d: 0.25, peak: 0.12 });
      drum(v, { freq: 70, to: 35, t, d: 0.6, peak: 0.16 });
      rumble(v, t + 0.05, { lp: 380, peak: 0.16, rolls: 3, rng: new Rng(17) });
      [50, 53, 57].forEach((m) => tone(v, { type: 'triangle', freq: n(m), t: t + 0.1, a: 0.25, d: 0.2, sustain: 0.7, hold: 0.6, r: 0.9, peak: 0.045, lp: 700 }));
      return 0.3;
  }
}

function heat(v: Voice, up: number, down: number, max: number, t: number): number {
  const mix = heatMix(up, down, max);
  const k = mix.intensity;
  if (mix.warm === 0 && mix.cool === 0) {
    // 都没动：一口很轻的气
    noise(v, { filter: 'bandpass', f: 700, fTo: 1100, fTime: 0.3, q: 1, t, a: 0.1, d: 0.25, peak: 0.025 });
    return 0.1;
  }
  const rng = new Rng(59);
  if (mix.warm > 0) {
    // 升温：火苗“呼”——上扫的带通噪声 + 低频暖色滑音，外加几粒噼啪（升温题材越多越多）
    const w = mix.warm * k;
    noise(v, { filter: 'bandpass', f: 280, fTo: 1600, fTime: 0.45, q: 1.1, t, a: 0.14, d: 0.45, peak: 0.1 * (0.5 + 0.5 * w), pan: -0.15 });
    noise(v, { filter: 'lowpass', f: 500, rate: 0.6, t, a: 0.1, d: 0.5, peak: 0.06 * (0.5 + 0.5 * w) });
    tone(v, { type: 'triangle', freq: n(57), to: n(62), glide: 0.35, t, a: 0.08, d: 0.45, peak: 0.05 * (0.4 + 0.6 * w), lp: 900 });
    const crackles = clamp(Math.round(2 + Number(up) * 1.5), 2, 9);
    for (let i = 0; i < crackles; i++) {
      noise(v, { filter: 'bandpass', f: rng.range(1800, 4200), q: 2, t: t + 0.08 + rng.range(0, 0.45), a: 0.001, d: 0.015, peak: 0.05 * (0.5 + 0.5 * w), pan: rng.range(-0.5, 0.3) });
    }
  }
  if (mix.cool > 0) {
    // 退潮：冰晶叮当——非整数比 FM 的玻璃感高音，下行散落，垫一层很薄的高频霜
    const c = mix.cool * k;
    const t0 = mix.warm > 0 ? t + 0.12 : t;
    const pitches = [98, 97, 93, 90, 88, 86];
    const count = clamp(Math.round(2 + Number(down) * 1.2), 3, 6);
    for (let i = 0; i < count; i++) {
      fm(v, { freq: n(pitches[i] ?? 86), ratio: 2.76, index: 0.7, indexEnd: 0.05, indexTime: 0.06, t: t0 + i * 0.06 + rng.range(0, 0.02), a: 0.001, d: 0.4, peak: 0.045 * (0.5 + 0.5 * c), pan: rng.range(-0.1, 0.5) });
    }
    noise(v, { filter: 'highpass', f: 6000, t: t0, a: 0.05, d: 0.5, peak: 0.018 * (0.5 + 0.5 * c) });
  }
  return 0.3;
}

// ───────────────────────── 结算：揭晓、连线、道具、滚动 ─────────────────────────

function reveal(v: Voice, move: number, limit: 'up' | 'down' | null, index: number, t: number): number {
  // 小人揭晓：一声“啵”（冒出来）+ 音高随涨跌的电钢；涨带上滑、跌带下滑并发暗；涨停加闪光琶音，跌停加低沉一击
  const tier = revealTier(move, limit);
  const pan = Number.isFinite(index) ? clamp((index - 1.5) * 0.2, -0.45, 0.45) : 0;
  const m = revealPitch(limit === 'up' ? Math.max(move, 10) : limit === 'down' ? Math.min(move, -10) : move);
  const f = n(m);
  noise(v, { filter: 'bandpass', f: 1600, q: 1.5, t, a: 0.001, d: 0.02, peak: 0.05, pan });
  tone(v, { freq: 300, to: 520, glide: 0.03, t, a: 0.002, d: 0.05, peak: 0.04, pan });
  const tb = t + 0.03;
  switch (tier) {
    case 'limitUp':
    case 'up':
      fm(v, { freq: f / 1.03, to: f, glide: 0.05, ratio: 1, index: 1.2, indexEnd: 0.15, indexTime: 0.3, t: tb, a: 0.003, d: 0.55, peak: 0.1, pan });
      tone(v, { freq: f * 2, t: tb + 0.02, a: 0.002, d: 0.18, peak: 0.02, pan });
      break;
    case 'flat':
      fm(v, { freq: f, ratio: 1, index: 0.8, t: tb, a: 0.003, d: 0.35, peak: 0.08, pan });
      break;
    case 'down':
    case 'limitDown':
      tone(v, { type: 'triangle', freq: f * 1.03, to: f, glide: 0.08, t: tb, a: 0.004, d: 0.45, peak: 0.12, lp: 1400, pan });
      fm(v, { freq: f, ratio: 1, index: 0.5, t: tb, a: 0.004, d: 0.35, peak: 0.04, pan });
      break;
  }
  if (tier === 'limitUp') {
    [86, 90, 93, 98].forEach((p, i) => tone(v, { freq: n(p), t: tb + 0.08 + i * 0.045, a: 0.002, d: 0.35, peak: 0.04, pan: pan + (i % 2 ? 0.15 : -0.15) }));
    bell(v, { freq: n(98), t: tb + 0.26, d: 0.9, peak: 0.05 });
    return 0.3;
  }
  if (tier === 'limitDown') {
    drum(v, { freq: 90, to: 45, t: tb, d: 0.35, peak: 0.14 });
    tone(v, { type: 'sawtooth', freq: n(51), t: tb, a: 0.01, d: 0.6, peak: 0.035, lp: 500, pan });
    tone(v, { type: 'sawtooth', freq: n(52), t: tb, a: 0.01, d: 0.6, peak: 0.03, lp: 500, pan });
    return 0.25;
  }
  return 0.2;
}

function chain(v: Voice, index: number, t: number): number {
  // 连线：一道向上划过的“嗖”（窄带噪声 + 滑音）落在拨弦 FM 上，音高逐条上行
  const f = n(chainPitch(index));
  noise(v, { filter: 'bandpass', f: 1200, fTo: 4500, fTime: 0.12, q: 3, t, a: 0.03, d: 0.1, peak: 0.035 });
  tone(v, { freq: f * 0.75, to: f, glide: 0.1, t, a: 0.01, d: 0.12, peak: 0.03 });
  fm(v, { freq: f, ratio: 3, index: 0.9, indexEnd: 0.05, indexTime: 0.1, t: t + 0.1, a: 0.002, d: 0.4, peak: 0.08 });
  tone(v, { freq: f * 1.5, t: t + 0.12, a: 0.002, d: 0.2, peak: 0.02 });
  return 0.2;
}

function fireworks(v: Voice, t: number): number {
  // 涨停烟花：升空的哨音（上滑正弦 + 嘶嘶声）→ 低频“嘭”+ 噼里啪啦的散落火花 + 金色闪光琶音
  tone(v, { freq: 700, to: 2200, glide: 0.55, t, a: 0.05, d: 0.1, sustain: 0.8, hold: 0.5, r: 0.05, peak: 0.035, lp: 4000 });
  noise(v, { filter: 'bandpass', f: 2000, fTo: 5000, fTime: 0.55, q: 2, t, a: 0.1, d: 0.1, sustain: 0.8, hold: 0.45, r: 0.08, peak: 0.03 });
  const tb = t + 0.6;
  drum(v, { freq: 80, to: 38, t: tb, d: 0.7, peak: 0.3, click: 0.4, clickLp: 1500 });
  noise(v, { filter: 'lowpass', f: 1800, fTo: 300, fTime: 0.6, rate: 0.7, t: tb, a: 0.002, d: 0.8, peak: 0.16 });
  const rng = new Rng(97);
  for (let i = 0; i < 18; i++) {
    const at = tb + 0.1 + rng.range(0, 0.9) * rng.range(0.4, 1);
    noise(v, { filter: 'bandpass', f: rng.range(2500, 6000), q: 2.5, t: at, a: 0.001, d: 0.02, peak: rng.range(0.02, 0.05), pan: rng.range(-0.7, 0.7) });
  }
  [86, 90, 93, 98, 102].forEach((m, i) => fm(v, { freq: n(m), ratio: 3.01, index: 0.7, t: tb + 0.08 + i * 0.06, a: 0.002, d: 0.5, peak: 0.04, pan: rng.range(-0.5, 0.5) }));
  bell(v, { freq: n(93), t: tb + 0.05, d: 1.4, peak: 0.08 });
  return 0.4;
}

function rainCloud(v: Voice, t: number): number {
  // 跌停雨云：低沉的乌云铺底（D 小三和弦低音区，过低通）+ 一声闷鼓 + 稀疏落下的雨滴
  drum(v, { freq: 75, to: 40, t, d: 0.6, peak: 0.18 });
  [38, 50, 53, 57].forEach((m) => tone(v, { type: 'triangle', freq: n(m), t, a: 0.15, d: 0.3, sustain: 0.7, hold: 0.7, r: 0.9, peak: 0.05, lp: 600 }));
  noise(v, { filter: 'lowpass', f: 400, rate: 0.5, t, a: 0.2, d: 0.3, sustain: 0.6, hold: 0.7, r: 0.8, peak: 0.05 });
  const rng = new Rng(71);
  for (let i = 0; i < 14; i++) {
    const at = t + 0.2 + rng.range(0, 1.4);
    const f = rng.range(900, 1600);
    tone(v, { freq: f, to: f * 0.6, glide: 0.04, t: at, a: 0.001, d: 0.06, peak: rng.range(0.015, 0.03), pan: rng.range(-0.6, 0.6) });
  }
  noise(v, { filter: 'bandpass', f: 3500, q: 0.6, t: t + 0.2, a: 0.4, d: 0.3, sustain: 0.5, hold: 0.8, r: 0.6, peak: 0.012 });
  return 0.3;
}

function item(v: Voice, delta: number, t: number): number {
  // 道具触发“闪一下”：一道很短的上扫闪光 + 两声 FM 小钟；加成上行（A–D），减损下行（D–A）并更暗
  const plus = !(delta < 0);
  noise(v, { filter: 'bandpass', f: plus ? 2500 : 1800, fTo: plus ? 6000 : 900, fTime: 0.1, q: 2.5, t, a: 0.02, d: 0.08, peak: 0.03 });
  const [a, b] = plus ? [81, 86] : [74, 69];
  fm(v, { freq: n(a), ratio: plus ? 4 : 2, index: 0.7, t, a: 0.002, d: 0.22, peak: 0.07 });
  fm(v, { freq: n(b), ratio: plus ? 4 : 2, index: 0.7, t: t + 0.06, a: 0.002, d: 0.32, peak: 0.07 });
  if (plus) tone(v, { freq: n(93), t: t + 0.08, a: 0.002, d: 0.2, peak: 0.02 });
  return 0.2;
}

function news(v: Voice, kind: 'uncap' | 'warning' | 'delisted', t: number): number {
  switch (kind) {
    case 'uncap':
      // 摘帽：上行“叮咚叮”+ 小钟
      [74, 81, 86].forEach((m, i) => fm(v, { freq: n(m), ratio: 2, index: 0.8, t: t + i * 0.08, a: 0.002, d: 0.4, peak: 0.08 }));
      bell(v, { freq: n(90), t: t + 0.24, d: 0.9, peak: 0.06 });
      return 0.25;
    case 'warning':
      // ST 警示：两声“嘀—嘀”方波（过低通），第二声更低
      for (const [dt, m] of [
        [0, 81],
        [0.16, 77],
      ] as const) {
        tone(v, { type: 'square', freq: n(m), t: t + dt, a: 0.003, d: 0.1, peak: 0.07, lp: 2200 });
        tone(v, { freq: n(m), t: t + dt, a: 0.003, d: 0.1, peak: 0.05 });
      }
      return 0.12;
    case 'delisted':
      // 退市：低沉的金属敲击（非整数比 FM）+ 下滑三角波
      fm(v, { freq: n(45), ratio: 1.41, index: 2, t, d: 0.9, peak: 0.16 });
      tone(v, { type: 'triangle', freq: n(57), to: n(45), glide: 0.6, t: t + 0.05, a: 0.01, d: 0.8, peak: 0.08, lp: 900 });
      noise(v, { filter: 'lowpass', f: 700, t, a: 0.002, d: 0.2, peak: 0.05 });
      return 0.25;
  }
}

function autoSold(v: Voice, reason: AutoSellReason, t: number): number {
  switch (reason) {
    case 'stop':
      // 止损：短促下行警示“嘀–嘟”
      tone(v, { type: 'square', freq: n(83), t, a: 0.003, d: 0.07, peak: 0.07, lp: 2200 });
      tone(v, { freq: n(83), t, a: 0.003, d: 0.07, peak: 0.05 });
      tone(v, { type: 'square', freq: n(79), t: t + 0.085, a: 0.003, d: 0.1, peak: 0.07, lp: 2000 });
      tone(v, { freq: n(79), t: t + 0.085, a: 0.003, d: 0.1, peak: 0.05 });
      return 0.1;
    case 'take':
      // 止盈：上行“嘀–嘀”+ 一枚硬币
      tone(v, { type: 'square', freq: n(79), t, a: 0.003, d: 0.07, peak: 0.06, lp: 2400 });
      tone(v, { freq: n(79), t, a: 0.003, d: 0.07, peak: 0.045 });
      tone(v, { type: 'square', freq: n(86), t: t + 0.085, a: 0.003, d: 0.1, peak: 0.06, lp: 2600 });
      tone(v, { freq: n(86), t: t + 0.085, a: 0.003, d: 0.1, peak: 0.045 });
      fm(v, { freq: n(98), ratio: 3.01, index: 0.8, t: t + 0.18, a: 0.001, d: 0.25, peak: 0.06 });
      return 0.12;
    case 'delist':
      // 退市被卖：短一点的低沉敲击 + 纸张撕下的噪声
      fm(v, { freq: n(45), ratio: 1.41, index: 1.6, t, d: 0.6, peak: 0.13 });
      noise(v, { filter: 'bandpass', f: 2200, fTo: 900, fTime: 0.2, q: 1.2, t: t + 0.04, a: 0.01, d: 0.2, peak: 0.05 });
      return 0.2;
  }
}

function settle(v: Voice, tier: ReturnType<typeof settleTier>, t: number): number {
  switch (tier) {
    case 'bigWin': {
      // 收银机“咔”+“叮”，随后一串硬币和上行闪光，底下垫一个温暖的大三和弦
      noise(v, { filter: 'bandpass', f: 1500, q: 2, t, a: 0.001, d: 0.05, peak: 0.12 });
      noise(v, { filter: 'highpass', f: 5000, t, a: 0.001, d: 0.03, peak: 0.05 });
      bell(v, { freq: n(88), t: t + 0.06, d: 1.4, peak: 0.2 });
      bell(v, { freq: n(90), t: t + 0.09, d: 1.2, peak: 0.13 });
      const rng = new Rng(77);
      const coins = [98, 100, 102, 105];
      for (let i = 0; i < 8; i++) {
        fm(v, { freq: n(rng.pick(coins)), ratio: 3.01, index: 0.8, t: t + 0.2 + i * 0.065 + rng.range(0, 0.02), d: 0.12, peak: 0.03, pan: rng.range(-0.5, 0.5) });
      }
      [86, 90, 93, 98].forEach((m, i) => tone(v, { freq: n(m), t: t + 0.15 + i * 0.04, d: 0.4, peak: 0.045 }));
      [62, 66, 69].forEach((m) => tone(v, { type: 'triangle', freq: n(m), t, a: 0.02, d: 0.2, sustain: 0.7, hold: 0.5, r: 0.6, peak: 0.06, lp: 2000 }));
      return 0.3;
    }
    case 'win':
      [74, 78, 81].forEach((m, i) => fm(v, { freq: n(m), ratio: 1, index: 1.2, t: t + i * 0.07, d: 0.6, peak: 0.1 }));
      tone(v, { freq: n(86), t: t + 0.14, d: 0.4, peak: 0.04 });
      return 0.2;
    case 'flat':
      tone(v, { type: 'triangle', freq: n(69), t, d: 0.25, peak: 0.08, lp: 1500 });
      tone(v, { freq: n(69), t: t + 0.11, d: 0.25, peak: 0.05 });
      return 0.1;
    case 'loss':
      tone(v, { type: 'triangle', freq: n(69), t, d: 0.25, peak: 0.1, lp: 1400 });
      tone(v, { type: 'triangle', freq: n(65), t: t + 0.13, d: 0.45, peak: 0.1, lp: 1200 });
      return 0.15;
    case 'bigLoss':
      // 沉闷下坠：低频撞击 + 下滑的失谐锯齿（小二度摩擦）+ 隆隆声 + 低音小三和弦
      drum(v, { freq: 110, to: 40, t, d: 0.5, peak: 0.32 });
      tone(v, { type: 'sawtooth', freq: n(57), to: 55, glide: 0.9, t, a: 0.02, d: 0.1, sustain: 0.8, hold: 0.6, r: 0.5, peak: 0.07, lp: 1200, lpTo: 200, lpTime: 1.0 });
      tone(v, { type: 'sawtooth', freq: n(58), to: 58, glide: 0.9, t, a: 0.02, d: 0.1, sustain: 0.8, hold: 0.6, r: 0.5, peak: 0.045, lp: 1000, lpTo: 180, lpTime: 1.0 });
      noise(v, { filter: 'lowpass', f: 300, fTo: 80, q: 0.8, rate: 0.5, t, a: 0.02, d: 0.9, peak: 0.1 });
      [50, 53, 57].forEach((m) => tone(v, { type: 'triangle', freq: n(m), t: t + 0.05, a: 0.05, d: 0.2, sustain: 0.7, hold: 0.5, r: 0.7, peak: 0.05, lp: 900 }));
      return 0.25;
  }
}

// ───────────────────────── 月底：账单、印章、三选一、事件 ─────────────────────────

function bill(v: Voice, t: number): number {
  // 账单滑入：纸面擦过桌面的长噪声（先亮后暗）+ 落定时一下轻拍 + 低音提示
  noise(v, { filter: 'bandpass', f: 2600, fTo: 900, fTime: 0.3, q: 0.9, t, a: 0.08, d: 0.28, peak: 0.07 });
  noise(v, { filter: 'highpass', f: 4000, t, a: 0.06, d: 0.2, peak: 0.02 });
  noise(v, { filter: 'bandpass', f: 700, q: 1, t: t + 0.3, a: 0.001, d: 0.05, peak: 0.08 });
  tone(v, { freq: 160, to: 110, glide: 0.05, t: t + 0.3, a: 0.001, d: 0.08, peak: 0.06 });
  fm(v, { freq: n(69), ratio: 2, index: 0.5, t: t + 0.32, a: 0.003, d: 0.4, peak: 0.04 });
  return 0.12;
}

function stamp(v: Voice, paid: boolean, credit: boolean, t: number): number {
  // 印章：低频撞击 + 木质闷响 + “咔嚓”；已还清接明亮的 D 大和弦与钟，逾期接暗色小二度铜管与低鼓
  drum(v, { freq: 95, to: 40, t, d: 0.35, peak: 0.33, click: 0.3, clickLp: 900 });
  noise(v, { filter: 'lowpass', f: 1200, t, a: 0.001, d: 0.12, peak: 0.14 });
  noise(v, { filter: 'bandpass', f: 2600, q: 1, t: t + 0.005, a: 0.001, d: 0.05, peak: 0.1 });
  noise(v, { filter: 'bandpass', f: 4800, q: 1.2, t: t + 0.02, a: 0.001, d: 0.03, peak: 0.05 });
  const tc = t + 0.08;
  if (paid) {
    [62, 69, 74, 78, 81].forEach((m) => brass(v, { freq: n(m), t: tc, hold: 0.35, r: 0.5, peak: 0.05, bright: 3500 }));
    bell(v, { freq: n(86), t: tc, d: 1.2, peak: 0.1 });
  } else {
    [50, 51, 57].forEach((m) => brass(v, { freq: n(m), t: tc, hold: 0.45, r: 0.6, peak: 0.06, bright: 1200 }));
    drum(v, { freq: 70, to: 38, t: tc + 0.25, d: 0.5, peak: 0.2 });
    tone(v, { type: 'triangle', freq: n(57), to: n(50), glide: 0.5, t: tc + 0.1, a: 0.02, d: 0.7, peak: 0.07, lp: 900 });
  }
  if (credit) {
    // 信用卡代还：“刷”一下卡 + POS 机两声短“嘀”
    const tk = tc + 0.45;
    noise(v, { filter: 'bandpass', f: 1500, fTo: 4500, fTime: 0.15, q: 1.5, t: tk, a: 0.03, d: 0.12, peak: 0.05 });
    for (const dt of [0.2, 0.32]) tone(v, { freq: 1568, t: tk + dt, a: 0.002, d: 0.07, peak: 0.05, lp: 3000 });
  }
  return 0.3;
}

function rewardShow(v: Voice, t: number): number {
  // 三张奖励卡依次亮相：三道短“唰”+ 逐张上行的 FM 小钟，最后一层薄薄的闪光
  [0, 1, 2].forEach((i) => {
    const at = t + i * 0.12;
    const pan = (i - 1) * 0.35;
    noise(v, { filter: 'bandpass', f: 900, fTo: 3200, fTime: 0.08, q: 1, t: at, a: 0.02, d: 0.07, peak: 0.04, pan });
    fm(v, { freq: n([81, 86, 90][i] ?? 81), ratio: 4, index: 0.6, t: at + 0.04, a: 0.002, d: 0.45, peak: 0.06, pan });
  });
  noise(v, { filter: 'highpass', f: 7000, t: t + 0.3, a: 0.05, d: 0.5, peak: 0.015 });
  return 0.3;
}

function reward(v: Voice, kind: RewardKind | null, t: number): number {
  switch (kind) {
    case 'item':
      // 道具：上扫气流 + 利底亚色彩的闪光琶音 + 尾部小钟
      noise(v, { filter: 'bandpass', f: 1500, fTo: 5500, fTime: 0.4, q: 3, t, a: 0.2, d: 0.25, peak: 0.035 });
      [74, 78, 80, 85, 88].forEach((m, i) => fm(v, { freq: n(m), ratio: 4, index: 0.6, t: t + i * 0.055, a: 0.003, d: 0.45, peak: 0.05, pan: i % 2 ? 0.3 : -0.3 }));
      bell(v, { freq: n(93), t: t + 0.3, d: 0.9, peak: 0.05 });
      return 0.35;
    case 'friend':
      // 新群友：门铃“叮咚”+ 一声消息“啵”
      return friendJoin(v, t);
    case 'stock':
      // 稀有股票：买入的上扬 + 金色和弦与钟
      buy(v, t);
      [62, 69, 78].forEach((m) => tone(v, { type: 'triangle', freq: n(m), t: t + 0.1, a: 0.02, d: 0.2, sustain: 0.7, hold: 0.4, r: 0.5, peak: 0.05, lp: 2500 }));
      bell(v, { freq: n(90), t: t + 0.25, d: 1.1, peak: 0.08 });
      return 0.3;
    case null:
      // 都不要：纸张收起 + 一声平淡的低音
      noise(v, { filter: 'bandpass', f: 2200, fTo: 600, fTime: 0.15, q: 1.2, t, a: 0.02, d: 0.14, peak: 0.05 });
      tone(v, { type: 'triangle', freq: n(69), to: n(62), glide: 0.12, t: t + 0.05, a: 0.005, d: 0.25, peak: 0.07, lp: 1500 });
      return 0.1;
  }
}

function event(v: Voice, t: number): number {
  // 事件出现：电钢“叮—咚”（上行四度，悬而未决）+ 一层慢起的低音与气流
  fm(v, { freq: n(81), ratio: 1, index: 1.1, t, a: 0.003, d: 0.6, peak: 0.1 });
  fm(v, { freq: n(86), ratio: 1, index: 1.1, t: t + 0.14, a: 0.003, d: 0.8, peak: 0.09 });
  tone(v, { type: 'triangle', freq: n(50), t, a: 0.15, d: 0.2, sustain: 0.7, hold: 0.4, r: 0.5, peak: 0.06, lp: 700 });
  noise(v, { filter: 'bandpass', f: 800, fTo: 2000, fTime: 0.4, q: 1.2, t, a: 0.2, d: 0.3, peak: 0.025 });
  return 0.3;
}

function eventResult(v: Voice, sign: 'gain' | 'loss' | 'none', t: number): number {
  switch (sign) {
    case 'gain': {
      // 进账：上行三和弦电钢 + 一串硬币
      [74, 78, 81].forEach((m, i) => fm(v, { freq: n(m), ratio: 1, index: 1.2, t: t + i * 0.07, d: 0.6, peak: 0.09 }));
      const rng = new Rng(19);
      for (let i = 0; i < 4; i++) fm(v, { freq: n(rng.pick([93, 95, 98])), ratio: 3.01, index: 0.8, t: t + 0.2 + i * 0.06, a: 0.001, d: 0.15, peak: 0.04, pan: rng.range(-0.4, 0.4) });
      return 0.2;
    }
    case 'loss':
      // 破财：两声下行三角波 + 低音一沉
      tone(v, { type: 'triangle', freq: n(69), t, d: 0.25, peak: 0.1, lp: 1400 });
      tone(v, { type: 'triangle', freq: n(64), t: t + 0.13, d: 0.5, peak: 0.1, lp: 1200 });
      tone(v, { freq: n(45), t: t + 0.13, a: 0.01, d: 0.5, peak: 0.07 });
      return 0.15;
    case 'none':
      tone(v, { type: 'triangle', freq: n(69), t, d: 0.25, peak: 0.08, lp: 1500 });
      tone(v, { freq: n(74), t: t + 0.11, d: 0.3, peak: 0.05 });
      return 0.1;
  }
}

function monthStart(v: Voice, t: number): number {
  // 新月份：日历翻页（三下纸张掀动）+ 一个温和的 D 大三和弦钟琶音
  const rng = new Rng(13);
  for (let i = 0; i < 3; i++) {
    noise(v, { filter: 'bandpass', f: rng.range(1400, 2400), fTo: rng.range(600, 900), fTime: 0.08, q: 1, t: t + i * 0.09, a: 0.01, d: 0.08, peak: 0.05, pan: rng.range(-0.2, 0.2) });
  }
  [62, 66, 69, 74].forEach((m, i) => fm(v, { freq: n(m + 12), ratio: 2, index: 0.7, t: t + 0.3 + i * 0.08, a: 0.003, d: 0.8, peak: 0.06 }));
  bell(v, { freq: n(86), t: t + 0.6, d: 1.2, peak: 0.07 });
  [50, 62].forEach((m) => tone(v, { type: 'triangle', freq: n(m), t: t + 0.3, a: 0.1, d: 0.2, sustain: 0.7, hold: 0.5, r: 0.7, peak: 0.04, lp: 1200 }));
  return 0.3;
}

function friendJoin(v: Voice, t: number): number {
  // 新群友入群：门铃“叮咚”（F♯6 → D6，两声钟）+ 一声消息气泡“啵”
  bell(v, { freq: n(90), t, d: 1.0, peak: 0.12, maxFreq: 6000 });
  bell(v, { freq: n(86), t: t + 0.32, d: 1.3, peak: 0.12, maxFreq: 6000 });
  tone(v, { freq: n(81) * 0.5, to: n(81) * 0.75, glide: 0.025, t: t + 0.7, a: 0.002, d: 0.04, peak: 0.035 });
  fm(v, { freq: n(81), ratio: 4, index: 0.6, t: t + 0.715, a: 0.002, d: 0.3, peak: 0.06 });
  return 0.3;
}

function runWon(v: Voice, t: number): number {
  // 号角：三连音弱起 → 五度长音 → 主和弦，低音定音鼓托底，总长 < 3 秒
  const notes: readonly [number, number, number][] = [
    [0, 74, 0.08],
    [0.13, 74, 0.08],
    [0.26, 74, 0.08],
    [0.4, 81, 0.42],
    [0.9, 78, 0.14],
  ];
  for (const [dt, m, hold] of notes) {
    brass(v, { freq: n(m), t: t + dt, hold, r: 0.18, peak: 0.1, bright: 3000 });
    brass(v, { freq: n(m - 12), t: t + dt, hold, r: 0.18, peak: 0.05, bright: 1800 });
  }
  const tc = t + 1.15;
  [50, 62, 69, 74, 78, 81].forEach((m) => brass(v, { freq: n(m), t: tc, hold: 0.75, r: 0.55, peak: 0.055, bright: 3000 }));
  drum(v, { freq: 75, to: 55, t: t + 0.4, d: 0.5, peak: 0.2, click: 0.2, clickLp: 600 });
  drum(v, { freq: 75, to: 52, t: tc, d: 0.8, peak: 0.25, click: 0.25, clickLp: 600 });
  noise(v, { filter: 'highpass', f: 6000, t: tc, a: 0.01, d: 1.2, peak: 0.035 });
  bell(v, { freq: n(86), t: tc, d: 1.3, peak: 0.08 });
  return 0.3;
}

function runLost(v: Voice, t: number): number {
  // 下行小调：A–F–E–D，最后落在 D 小三和弦
  const line: readonly [number, number][] = [
    [0, 69],
    [0.35, 65],
    [0.7, 64],
  ];
  for (const [dt, m] of line) {
    tone(v, { type: 'triangle', freq: n(m), t: t + dt, a: 0.02, d: 0.1, sustain: 0.6, hold: 0.25, r: 0.3, peak: 0.1, lp: 1600 });
    tone(v, { freq: n(m + 12), t: t + dt, a: 0.02, d: 0.1, sustain: 0.6, hold: 0.25, r: 0.3, peak: 0.03 });
  }
  const tc = t + 1.05;
  tone(v, { type: 'triangle', freq: n(62), t: tc, a: 0.03, d: 0.2, sustain: 0.7, hold: 0.8, r: 0.8, peak: 0.1, lp: 1600 });
  [50, 53, 57].forEach((m) => tone(v, { type: 'triangle', freq: n(m), t: tc, a: 0.08, d: 0.2, sustain: 0.7, hold: 0.8, r: 0.8, peak: 0.055, lp: 1100 }));
  return 0.3;
}

interface CueVariant {
  key: string;
  label: string;
  cue: Cue;
}

/** 试听面板与测量工具用：每种 cue 的全部变体（按 0.3 流程排序：界面 → 盘前 → 开盘 → 结算 → 收盘 → 月底 → 胜负）。 */
export function allCueVariants(): CueVariant[] {
  const L: CueVariant[] = [];
  const add = (key: string, label: string, cue: Cue): void => {
    L.push({ key, label, cue });
  };
  const ui: [UiSound, string][] = [
    ['hover', '悬停'],
    ['click', '点击'],
    ['select', '选中'],
    ['denied', '拒绝'],
    ['open', '打开'],
    ['close', '关闭'],
    ['toggle', '切换'],
  ];
  for (const [name, label] of ui) add(`ui:${name}`, `UI ${label}`, { type: 'ui', name });
  add('guide', '引导气泡', { type: 'guide' });
  // 盘前
  add('chat', '群聊消息', { type: 'chat', index: 0 });
  add('friendJoin', '新群友入群', { type: 'friendJoin' });
  add('buy', '买入', { type: 'buy' });
  add('sell', '卖出', { type: 'sell' });
  // 开盘
  add('marketOpen', '开盘钟', { type: 'marketOpen' });
  const moods: [MarketMood, string][] = [
    ['bull', '晴'],
    ['flat', '阴'],
    ['bear', '雷雨'],
  ];
  for (const [to, label] of moods) add(`weather:${to}`, `天气 ${label}`, { type: 'weather', to });
  add('thunder', '远雷', { type: 'thunder' });
  add('heat:up', '热度 升温', { type: 'heat', up: 3, down: 0, max: 15 });
  add('heat:down', '热度 退潮', { type: 'heat', up: 0, down: 2, max: 20 });
  add('heat:mixed', '热度 有升有降', { type: 'heat', up: 2, down: 2, max: 12 });
  add('heat:none', '热度 不动', { type: 'heat', up: 0, down: 0, max: 0 });
  // 结算
  add('reveal:limitUp', '揭晓 涨停', { type: 'reveal', move: 10, limit: 'up', index: 0 });
  add('reveal:up', '揭晓 上涨', { type: 'reveal', move: 3.5, limit: null, index: 1 });
  add('reveal:flat', '揭晓 平', { type: 'reveal', move: 0.1, limit: null, index: 2 });
  add('reveal:down', '揭晓 下跌', { type: 'reveal', move: -3.5, limit: null, index: 3 });
  add('reveal:limitDown', '揭晓 跌停', { type: 'reveal', move: -10, limit: 'down', index: 0 });
  add('chain', '连线', { type: 'chain', index: 0 });
  add('item:plus', '道具 加成', { type: 'item', id: 'longtou', delta: 2 });
  add('item:minus', '道具 减损', { type: 'item', id: 'margin', delta: -2 });
  add('countUp', '账户滚动 (中段)', { type: 'countUp', progress: 0.5 });
  add('limitUp', '涨停烟花', { type: 'limitUp' });
  add('limitDown', '跌停雨云', { type: 'limitDown' });
  add('settle:bigWin', '收益 大赚', { type: 'settle', ret: 5 });
  add('settle:win', '收益 小赚', { type: 'settle', ret: 1.2 });
  add('settle:flat', '收益 持平', { type: 'settle', ret: 0 });
  add('settle:loss', '收益 小亏', { type: 'settle', ret: -1.2 });
  add('settle:bigLoss', '收益 大亏', { type: 'settle', ret: -5 });
  add('news:uncap', '危险股翻身', { type: 'news', kind: 'uncap' });
  add('news:warning', 'ST 警示', { type: 'news', kind: 'warning' });
  add('news:delisted', '退市消息', { type: 'news', kind: 'delisted' });
  const reasons: [AutoSellReason, string][] = [
    ['stop', '止损'],
    ['take', '止盈'],
    ['delist', '退市'],
  ];
  for (const [reason, label] of reasons) add(`autoSold:${reason}`, `自动卖出 ${label}`, { type: 'autoSold', reason });
  add('judge:hit', '收盘 说中', { type: 'judge', hit: true });
  add('judge:miss', '收盘 说错', { type: 'judge', hit: false });
  // 月底
  add('monthStart', '新月份', { type: 'monthStart' });
  add('bill', '账单滑入', { type: 'bill' });
  add('stamp:paid', '印章 已还清', { type: 'stamp', paid: true, credit: false });
  add('stamp:paid+credit', '印章 信用卡代还', { type: 'stamp', paid: true, credit: true });
  add('stamp:overdue', '印章 逾期', { type: 'stamp', paid: false, credit: false });
  add('stamp:overdue+credit', '印章 逾期(刷卡)', { type: 'stamp', paid: false, credit: true });
  add('rewardShow', '三选一亮相', { type: 'rewardShow' });
  const kinds: [RewardKind | null, string, string][] = [
    ['item', 'item', '道具'],
    ['friend', 'friend', '群友'],
    ['stock', 'stock', '股票'],
    [null, 'skip', '都不要'],
  ];
  for (const [kind, key, label] of kinds) add(`reward:${key}`, `选奖励 ${label}`, { type: 'reward', kind });
  add('event', '事件出现', { type: 'event' });
  add('eventResult:gain', '事件 进账', { type: 'eventResult', delta: 2000 });
  add('eventResult:loss', '事件 破财', { type: 'eventResult', delta: -2000 });
  add('eventResult:none', '事件 无变化', { type: 'eventResult', delta: 0 });
  // 胜负
  add('runWon', '通关', { type: 'runWon' });
  add('runLost', '失败', { type: 'runLost' });
  return L;
}
