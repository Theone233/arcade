// WebAudio 现合成的音效：不带任何音频文件。
// 随机只用在声音的细微抖动上（画面层），不碰规则。

export type Sfx =
  | 'draw' | 'discard' | 'pon' | 'kan' | 'hu' | 'zimo' | 'wind' | 'rain'
  | 'turn' | 'tick' | 'win' | 'lose' | 'click' | 'deal';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let noiseBuf: AudioBuffer | null = null;

/** 在用户第一次点击里调；浏览器要求有用户操作才能建 AudioContext，之后反复调没副作用 */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
    master = null;
  }
}

export function setSound(on: boolean): void {
  enabled = on;
}

/** 给 arcade-kit/fun 的 playFunSound 用；没解锁或关了声音返回 null。out 是总音量，我们自己的音效也走它 */
export function audioOut(): { ctx: AudioContext; out: AudioNode } | null {
  if (!enabled || !ctx || !master) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: master };
}

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

type Env = { c: AudioContext; out: AudioNode };

/** 一段滤波噪声：t 开始，dur 秒，指数衰减；freq 可从 f0 扫到 f1 */
function burst(e: Env, t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, q = 1, f1 = f0): void {
  const s = e.c.createBufferSource();
  s.buffer = noise(e.c);
  s.loop = true;
  const f = e.c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = e.c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(e.out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

/** 一个音：freq 可滑到 f1 */
function tone(e: Env, t: number, dur: number, vol: number, type: OscillatorType, f0: number, f1 = f0): void {
  const o = e.c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = e.c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(e.out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** 牌拍桌：带通噪声的"啪" + 低频一敲 */
function slap(e: Env, t: number, power: number): void {
  const j = 1 + (Math.random() - 0.5) * 0.12;
  burst(e, t, 0.07, 0.7 * power, 'bandpass', 2400 * j, 1.2);
  tone(e, t, 0.09, 0.5 * power, 'sine', 190 * j, 80);
}

const note = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

function chime(e: Env, t: number, freq: number, vol: number, dur = 0.5): void {
  tone(e, t, dur, vol, 'triangle', freq);
  tone(e, t, dur * 0.6, vol * 0.3, 'sine', freq * 2);
}

function gong(e: Env, t: number): void {
  burst(e, t, 1.3, 0.35, 'bandpass', 3500, 0.7);
  burst(e, t, 0.9, 0.25, 'highpass', 6000);
  tone(e, t, 1.2, 0.35, 'sine', 110, 90);
  tone(e, t, 1.0, 0.15, 'sine', 237, 230);
}

const PLAYERS: Record<Sfx, (e: Env, t: number) => void> = {
  discard: (e, t) => slap(e, t, 1),
  draw: (e, t) => {
    burst(e, t, 0.04, 0.3, 'bandpass', 3200, 1.5);
    tone(e, t, 0.05, 0.2, 'sine', 260, 150);
  },
  deal: (e, t) => {
    for (let i = 0; i < 6; i++) burst(e, t + i * 0.07, 0.05, 0.3, 'bandpass', 2800 + i * 150, 1.5);
  },
  pon: (e, t) => {
    slap(e, t, 1.1);
    slap(e, t + 0.13, 1.3);
  },
  kan: (e, t) => {
    slap(e, t, 1.2);
    slap(e, t + 0.12, 1.3);
    slap(e, t + 0.24, 1.5);
    tone(e, t + 0.24, 0.5, 0.4, 'sine', 70, 50);
  },
  hu: (e, t) => {
    gong(e, t);
    [67, 71, 74].forEach((n, i) => chime(e, t + 0.15 + i * 0.12, note(n), 0.18));
  },
  zimo: (e, t) => {
    gong(e, t);
    [67, 71, 74].forEach((n, i) => chime(e, t + 0.15 + i * 0.12, note(n), 0.2));
    [79, 83, 86, 91, 95].forEach((n, i) => chime(e, t + 0.55 + i * 0.07, note(n), 0.12, 0.6));
  },
  wind: (e, t) => burst(e, t, 0.8, 0.45, 'bandpass', 300, 3, 1800),
  rain: (e, t) => {
    for (let i = 0; i < 40; i++) burst(e, t + (i / 40) * 0.95 + Math.random() * 0.02, 0.03, 0.12, 'highpass', 4500 + Math.random() * 3000);
  },
  turn: (e, t) => {
    chime(e, t, note(88), 0.16, 0.25);
    chime(e, t + 0.14, note(93), 0.16, 0.3);
  },
  tick: (e, t) => tone(e, t, 0.05, 0.18, 'square', 1500),
  win: (e, t) => [60, 64, 67, 72, 76].forEach((n, i) => chime(e, t + i * 0.1, note(n), 0.18, 0.6)),
  lose: (e, t) => {
    tone(e, t, 0.4, 0.2, 'triangle', note(64));
    tone(e, t + 0.25, 0.6, 0.2, 'triangle', note(57));
  },
  click: (e, t) => {
    burst(e, t, 0.025, 0.2, 'bandpass', 3000, 2);
    tone(e, t, 0.03, 0.1, 'sine', 900, 600);
  },
};

export function play(s: Sfx): void {
  const o = audioOut();
  if (!o) return;
  PLAYERS[s]({ c: o.ctx, out: o.out }, o.ctx.currentTime + 0.01);
}
