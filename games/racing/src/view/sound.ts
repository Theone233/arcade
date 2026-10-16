/**
 * WebAudio 现合成的音效：不带任何音频文件。随机只用在声音的细微抖动上（画面层），不碰规则。
 */
export type Sfx = 'click' | 'go' | 'move' | 'boost' | 'slip' | 'heat' | 'spin' | 'finish' | 'turn' | 'win' | 'lose';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let noiseBuf: AudioBuffer | null = null;

/** 在用户第一次点击里调；浏览器要求有用户操作才能建 AudioContext */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
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

/** 给 arcade-kit/fun 的 playFunSound 用 */
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

function tone(c: AudioContext, out: AudioNode, t: number, dur: number, vol: number, type: OscillatorType, f0: number, f1 = f0): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hiss(c: AudioContext, out: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0): void {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

export function play(s: Sfx): void {
  const a = audioOut();
  if (!a) return;
  const { ctx: c, out } = a;
  const t = c.currentTime + 0.01;
  switch (s) {
    case 'click':
      tone(c, out, t, 0.05, 0.15, 'square', 900, 700);
      break;
    case 'go':
      tone(c, out, t, 0.12, 0.2, 'triangle', 520, 780);
      break;
    case 'move':
      // 引擎拉一下：锯齿波往上扫
      tone(c, out, t, 0.45, 0.08, 'sawtooth', 70, 160);
      tone(c, out, t, 0.45, 0.05, 'square', 140, 300);
      break;
    case 'boost':
      hiss(c, out, t, 0.5, 0.25, 'bandpass', 400, 2400);
      tone(c, out, t, 0.5, 0.08, 'sawtooth', 120, 340);
      break;
    case 'slip':
      hiss(c, out, t, 0.4, 0.18, 'highpass', 1200, 3000);
      break;
    case 'heat':
      hiss(c, out, t, 0.35, 0.18, 'bandpass', 3000, 900);
      break;
    case 'spin':
      hiss(c, out, t, 0.7, 0.3, 'bandpass', 1800, 600);
      tone(c, out, t, 0.6, 0.1, 'sawtooth', 300, 90);
      break;
    case 'finish':
      [523, 659, 784, 1047].forEach((f, i) => tone(c, out, t + i * 0.09, 0.25, 0.18, 'triangle', f));
      break;
    case 'turn':
      tone(c, out, t, 0.12, 0.18, 'sine', 880);
      tone(c, out, t + 0.13, 0.15, 0.18, 'sine', 1175);
      break;
    case 'win':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, out, t + i * 0.1, 0.35, 0.2, 'triangle', f));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(c, out, t + i * 0.14, 0.3, 0.16, 'triangle', f));
      break;
  }
}
