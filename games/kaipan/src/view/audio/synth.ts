/**
 * 合成积木：在一个 Voice 里搭振荡器、FM、噪声和加法合成钟声。音效与音乐共用。
 * 所有函数返回包络归零的时刻并自动延长 Voice 的结束时间。
 */
import { envAdsr, envPerc, type Voice } from './graph.ts';

interface EnvOpts {
  t: number;
  /** 起音（秒） */
  a?: number;
  /** 冲击型包络的衰减时长（到 -60 dB）；ADSR 时为衰减到 sustain 的时长 */
  d: number;
  peak: number;
  /** 给出 hold 时使用 ADSR：保持到 t+hold 再以 r 释放 */
  hold?: number;
  r?: number;
  sustain?: number;
}

interface Routing {
  /** 输出到哪里（默认 Voice.out） */
  dest?: AudioNode;
  pan?: number;
}

function applyEnv(g: GainNode, o: EnvOpts): number {
  const a = o.a ?? 0.003;
  if (o.hold !== undefined) return envAdsr(g.gain, o.t, a, o.d, o.sustain ?? 0.6, o.hold, o.r ?? 0.2, o.peak);
  return envPerc(g.gain, o.t, a, o.d, o.peak);
}

function route(v: Voice, node: AudioNode, r: Routing): void {
  const dest = r.dest ?? v.out;
  if (r.pan) node.connect(v.panner(r.pan)).connect(dest);
  else node.connect(dest);
}

interface ToneOpts extends EnvOpts, Routing {
  type?: OscillatorType;
  freq: number;
  /** 滑音终点频率与时长 */
  to?: number;
  glide?: number;
  detune?: number;
  /** 低通截止（可随时间滑到 lpTo） */
  lp?: number;
  lpTo?: number;
  lpTime?: number;
  q?: number;
  hp?: number;
  /** 周期波形（覆盖 type） */
  wave?: PeriodicWave;
}

/** 单振荡器 + 可选滤波 + 包络。 */
export function tone(v: Voice, o: ToneOpts): number {
  const osc = v.osc(o.type ?? 'sine', o.freq, o.t, o.detune ?? 0);
  if (o.wave) osc.setPeriodicWave(o.wave);
  if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), o.t + (o.glide ?? 0.1));
  let node: AudioNode = osc;
  if (o.lp !== undefined) {
    const f = v.filter('lowpass', o.lp, o.q ?? 0.707);
    if (o.lpTo !== undefined) {
      f.frequency.setValueAtTime(o.lp, o.t);
      f.frequency.exponentialRampToValueAtTime(Math.max(o.lpTo, 20), o.t + (o.lpTime ?? o.d));
    }
    node = node.connect(f);
  }
  if (o.hp !== undefined) node = node.connect(v.filter('highpass', o.hp));
  const g = v.gain(0);
  node.connect(g);
  route(v, g, o);
  const end = applyEnv(g, o);
  v.until(end);
  return end;
}

interface FmOpts extends EnvOpts, Routing {
  freq: number;
  /** 调制器频率比 */
  ratio: number;
  /** 调制指数（调制深度 = index × 调制器频率），在 indexTime 内衰减到 indexEnd */
  index: number;
  indexEnd?: number;
  indexTime?: number;
  to?: number;
  glide?: number;
  lp?: number;
}

/** 双算子 FM：钟、电钢、马林巴、金属感都靠它。 */
export function fm(v: Voice, o: FmOpts): number {
  const car = v.osc('sine', o.freq, o.t);
  const mf = o.freq * o.ratio;
  const mod = v.osc('sine', mf, o.t);
  const mg = v.gain(0);
  const depth = o.index * mf;
  const depthEnd = Math.max((o.indexEnd ?? o.index * 0.05) * mf, 0.01);
  mg.gain.setValueAtTime(depth, o.t);
  mg.gain.exponentialRampToValueAtTime(depthEnd, o.t + (o.indexTime ?? o.d * 0.6));
  mod.connect(mg).connect(car.frequency);
  if (o.to !== undefined) {
    const tt = o.t + (o.glide ?? 0.1);
    car.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), tt);
    mod.frequency.exponentialRampToValueAtTime(Math.max(o.to * o.ratio, 1), tt);
  }
  let node: AudioNode = car;
  if (o.lp !== undefined) node = node.connect(v.filter('lowpass', o.lp));
  const g = v.gain(0);
  node.connect(g);
  route(v, g, o);
  const end = applyEnv(g, o);
  v.until(end);
  return end;
}

interface NoiseOpts extends EnvOpts, Routing {
  filter: BiquadFilterType;
  f: number;
  fTo?: number;
  fTime?: number;
  q?: number;
  /** 噪声缓冲回放速率：<1 更暗更粗 */
  rate?: number;
}

/** 滤波噪声：气流、沙沙声、镲、敲击瞬态。 */
export function noise(v: Voice, o: NoiseOpts): number {
  const src = v.noise(o.t, o.rate ?? 1);
  const f = v.filter(o.filter, o.f, o.q ?? 0.707);
  if (o.fTo !== undefined) {
    f.frequency.setValueAtTime(o.f, o.t);
    f.frequency.exponentialRampToValueAtTime(Math.max(o.fTo, 20), o.t + (o.fTime ?? o.d));
  }
  const g = v.gain(0);
  src.connect(f).connect(g);
  route(v, g, o);
  const end = applyEnv(g, o);
  v.until(end);
  return end;
}

/** 钟的分音：[频率比, 相对幅度, 衰减倍率]。比例取自典型的教堂钟/小钟谱。 */
const BELL_PARTIALS: readonly (readonly [number, number, number])[] = [
  [0.5, 0.35, 1.3], // hum
  [1, 1, 1], // prime
  [1.19, 0.45, 0.75], // 小三度
  [1.5, 0.3, 0.6], // 五度
  [2, 0.4, 0.55], // 八度
  [2.74, 0.22, 0.35],
  [3.76, 0.12, 0.25],
  [5.4, 0.06, 0.15],
];

interface BellOpts extends Routing {
  freq: number;
  t: number;
  d: number;
  peak: number;
  partials?: readonly (readonly [number, number, number])[];
  /** 高于此频率的分音省略（防刺耳） */
  maxFreq?: number;
}

/** 加法合成钟：各分音独立衰减，高分音衰减更快，泛音逐渐收拢成纯音。 */
export function bell(v: Voice, o: BellOpts): number {
  const parts = o.partials ?? BELL_PARTIALS;
  const maxF = o.maxFreq ?? 7000;
  let sum = 0;
  for (const [, amp] of parts) sum += amp;
  let end = o.t;
  // 所有分音汇到一个增益上，减少节点
  const bus = v.gain(1);
  route(v, bus, o);
  for (const [ratio, amp, decay] of parts) {
    const f = o.freq * ratio;
    if (f > maxF) continue;
    const osc = v.osc('sine', f, o.t, (ratio - 1) * 1.5);
    const g = v.gain(0);
    osc.connect(g).connect(bus);
    end = Math.max(end, envPerc(g.gain, o.t, 0.002, o.d * decay, (o.peak * amp) / sum));
  }
  v.until(end);
  return end;
}

interface BrassOpts extends Routing {
  freq: number;
  t: number;
  /** 保持时长（秒），之后以 r 释放 */
  hold: number;
  r?: number;
  peak: number;
  /** 滤波打开的峰值频率（亮度） */
  bright?: number;
}

/** 铜管感：两路微失谐锯齿 + 先张后收的低通，起音带一点“咘”的爆发。 */
export function brass(v: Voice, o: BrassOpts): number {
  const bright = o.bright ?? 2600;
  const f = v.filter('lowpass', 300, 1.2);
  f.frequency.setValueAtTime(300, o.t);
  f.frequency.exponentialRampToValueAtTime(bright, o.t + 0.06);
  f.frequency.exponentialRampToValueAtTime(Math.max(bright * 0.5, 300), o.t + 0.06 + Math.max(o.hold, 0.1));
  const a = v.osc('sawtooth', o.freq, o.t, -7);
  const b = v.osc('sawtooth', o.freq, o.t, 7);
  a.connect(f);
  b.connect(f);
  const g = v.gain(0);
  f.connect(g);
  route(v, g, o);
  const end = envAdsr(g.gain, o.t, 0.03, 0.15, 0.75, o.hold, o.r ?? 0.25, o.peak);
  v.until(end);
  return end;
}

interface DrumOpts extends Routing {
  freq: number;
  to: number;
  t: number;
  d: number;
  peak: number;
  /** 敲击噪声的量（0..1）与低通频率 */
  click?: number;
  clickLp?: number;
}

/** 鼓 / 定音鼓 / 底鼓：下滑正弦 + 少量滤波噪声瞬态。 */
export function drum(v: Voice, o: DrumOpts): number {
  let end = tone(v, { type: 'sine', freq: o.freq, to: o.to, glide: Math.min(o.d * 0.4, 0.2), t: o.t, a: 0.002, d: o.d, peak: o.peak, dest: o.dest, pan: o.pan });
  if (o.click) {
    end = Math.max(end, noise(v, { filter: 'lowpass', f: o.clickLp ?? 1200, t: o.t, a: 0.001, d: Math.min(0.08, o.d * 0.3), peak: o.peak * o.click, dest: o.dest }));
  }
  return end;
}
