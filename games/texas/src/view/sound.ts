/**
 * 音效全用 WebAudio 现合成（DESIGN.md 8.1），没有音频文件：发牌是一小段滤过的噪声，筹码是两三下高频的"咔"，
 * 过牌是敲桌子的闷响，赢了是三个音的琶音。第一次点击后才建 AudioContext（浏览器要求有用户操作）。
 */
import { playFunSound, type FunPhase, type PropId } from 'arcade-kit/fun';

export type Sfx = 'card' | 'flip' | 'chip' | 'check' | 'fold' | 'win' | 'turn' | 'tick' | 'taunt' | 'banner' | 'bigpot';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let on = true;

export function setSound(enabled: boolean): void {
  on = enabled;
}

/** 在用户的第一次点击里调 */
export function unlockAudio(): void {
  if (ctx || typeof AudioContext === 'undefined') return;
  ctx = new AudioContext();
  noise = ctx.createBuffer(1, ctx.sampleRate / 4, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function burst(t: number, freq: number, q: number, peak: number, decay: number): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, peak, 0.002, decay);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t, Math.random() * 0.1, decay + 0.02);
}

function tone(t: number, freq: number, type: OscillatorType, peak: number, decay: number): void {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  env(g, t, peak, 0.004, decay);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + decay + 0.05);
}

export function play(s: Sfx): void {
  if (!on || !ctx || !noise) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime + 0.005;
  const j = 1 + (Math.random() - 0.5) * 0.12;
  switch (s) {
    case 'card':
      burst(t, 2600 * j, 0.9, 0.22, 0.05);
      break;
    case 'flip':
      burst(t, 1800 * j, 0.7, 0.2, 0.07);
      burst(t + 0.03, 3200 * j, 1.2, 0.1, 0.04);
      break;
    case 'chip':
      for (let i = 0; i < 3; i++) {
        tone(t + i * 0.035, 3600 * j + i * 300, 'triangle', 0.07, 0.04);
        burst(t + i * 0.035, 5200 * j, 3, 0.08, 0.025);
      }
      break;
    case 'check':
      tone(t, 140, 'sine', 0.35, 0.09);
      tone(t + 0.11, 150, 'sine', 0.3, 0.08);
      break;
    case 'fold':
      burst(t, 900 * j, 0.6, 0.12, 0.16);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.09, f, 'sine', 0.16, 0.5));
      break;
    // 轮到我（0.3.0 朋友们："到自己出牌来点音效提示一下"）：三个音往上走，比原来两个音响一点、清楚一点
    case 'turn':
      tone(t, 784, 'sine', 0.2, 0.22);
      tone(t + 0.11, 988, 'sine', 0.18, 0.22);
      tone(t + 0.22, 1319, 'sine', 0.16, 0.35);
      break;
    // 计时最后 5 秒的嘀嗒：木头敲一下
    case 'tick':
      tone(t, 1900, 'square', 0.04, 0.03);
      burst(t, 3000, 4, 0.06, 0.02);
      break;
    // 有人发嘲讽：轻轻"啵"一下
    case 'taunt':
      tone(t, 520 * j, 'sine', 0.12, 0.08);
      tone(t + 0.05, 780 * j, 'sine', 0.1, 0.1);
      break;
    // 名场面横幅：短促的号角
    case 'banner':
      [392, 523, 659, 784].forEach((f, i) => tone(t + i * 0.07, f, 'triangle', 0.13, 0.3));
      tone(t + 0.3, 1047, 'triangle', 0.15, 0.6);
      break;
    // 大池子收进赢家：一串筹码哗啦啦
    case 'bigpot':
      for (let i = 0; i < 9; i++) {
        const k = t + i * 0.045 + Math.random() * 0.02;
        tone(k, 3000 + Math.random() * 1500, 'triangle', 0.06, 0.05);
        burst(k, 4800 + Math.random() * 1200, 3, 0.07, 0.03);
      }
      break;
  }
}

/** 好友房道具的声音（kit 0.7.0 现场合成）：跟着静音开关走，用同一个 AudioContext */
export function funSound(prop: PropId, phase: FunPhase): void {
  if (!on || !ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  playFunSound(ctx, ctx.destination, prop, phase, 0.8);
}
