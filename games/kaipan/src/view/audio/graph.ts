/**
 * 音频图与发声单元。
 *
 *   sfx 音效 ──→ sfx.dry ─────────────┐
 *            └→ sfx.send → 短混响 ────┴→ sfxLevel ───────────┐
 *   音乐 ────→ music.dry ─────────────┐                       ├→ 隔直高通 → 压缩 → 软限幅 → master(含静音) → 输出
 *            └→ music.send → 长混响 ──┴→ musicLevel → duck ──┘
 *
 * 音量在限幅之后的 master 上调节，所以限幅行为与音量无关；软限幅曲线的上限约 -1.2 dBFS，保证不削波。
 * Voice 是一次发声（一个音效或一个音符）的节点集合：统一排定停止时间，结束后断开全部节点。
 */
import { LEVEL_RAMP, Rng, dbToGain, type BusLevels } from './logic.ts';

// ───────────────────────── 包络 ─────────────────────────

/** 冲击型包络：线性起音到 peak，指数衰减 d 秒到 -60 dB，再 10 ms 线性归零。返回归零时刻。 */
export function envPerc(p: AudioParam, t: number, a: number, d: number, peak: number): number {
  const ta = t + Math.max(a, 0.001);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, ta);
  p.exponentialRampToValueAtTime(Math.max(peak * 0.001, 1e-6), ta + d);
  p.linearRampToValueAtTime(0, ta + d + 0.01);
  return ta + d + 0.01;
}

/**
 * ADSR 包络：起音 a，衰减 d 到 sustain×peak，保持到 t+hold，释放 r 秒（指数到 -60 dB 再归零）。
 * 返回归零时刻。
 */
export function envAdsr(
  p: AudioParam,
  t: number,
  a: number,
  d: number,
  sustain: number,
  hold: number,
  r: number,
  peak: number,
): number {
  const ta = t + Math.max(a, 0.001);
  const sus = Math.max(peak * sustain, 1e-5);
  const th = Math.max(t + hold, ta + d);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, ta);
  if (d > 0) p.exponentialRampToValueAtTime(sus, ta + d);
  p.setValueAtTime(sus, th);
  p.exponentialRampToValueAtTime(Math.max(sus * 0.001, 1e-7), th + r);
  p.linearRampToValueAtTime(0, th + r + 0.01);
  return th + r + 0.01;
}

/** 平滑改参数：从当前值线性过渡到 target（≥30 ms，避免爆音）。 */
function rampParam(p: AudioParam, target: number, now: number, dur = LEVEL_RAMP): void {
  holdParam(p, now);
  p.linearRampToValueAtTime(target, now + dur);
}

/** 取消 now 之后的自动化并保持当前值。 */
export function holdParam(p: AudioParam, now: number): void {
  const anyP = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof anyP.cancelAndHoldAtTime === 'function') {
    anyP.cancelAndHoldAtTime(now);
  } else {
    const v = p.value;
    p.cancelScheduledValues(now);
    p.setValueAtTime(v, now);
  }
}

// ───────────────────────── 共享缓冲 ─────────────────────────

/** 2 秒白噪声（单声道），每个上下文只生成一次，所有噪声音色复用它（随机起点 + 循环）。 */
function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rng = new Rng(0x5eed);
  for (let i = 0; i < len; i++) d[i] = rng.next() * 2 - 1;
  return buf;
}

/**
 * 程序生成的混响冲激响应：双声道独立噪声 × 指数衰减，越往后越暗（逐渐收窄的一阶低通），
 * 开头 8 ms 渐入避免咔嗒声。
 */
function makeImpulse(ctx: BaseAudioContext, seconds: number, brightness: number, seed: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const rng = new Rng(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const env = Math.pow(1 - x, 2.2) * Math.min(1, i / (sr * 0.008));
      // 低通系数从 brightness 逐渐降到 brightness×0.15：尾巴更暗
      const k = brightness * (1 - 0.85 * x);
      lp += k * (rng.next() * 2 - 1 - lp);
      d[i] = lp * env;
    }
  }
  // 归一化到能量约为 1，避免混响送量依赖冲激长度
  let e = 0;
  for (let ch = 0; ch < 2; ch++) for (const v of buf.getChannelData(ch)) e += v * v;
  const norm = 1 / Math.sqrt(Math.max(e / 2, 1e-9));
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (d[i] ?? 0) * norm * 0.5;
  }
  return buf;
}

/** 软限幅曲线：|x| ≤ 0.7 线性，之上用 tanh 平滑压到 ≤ 0.875（约 -1.16 dBFS）。 */
function makeSoftClipCurve(n = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const knee = 0.7;
  const room = 0.19;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + room * Math.tanh((ax - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

// ───────────────────────── Voice ─────────────────────────

/** 一次发声的节点集合。所有源节点在 finish() 时统一排定停止，最后一个结束后断开全部节点。 */
export class Voice {
  readonly ctx: BaseAudioContext;
  readonly out: GainNode;
  readonly start: number;
  readonly priority: number;
  end: number;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly noiseBuf: AudioBuffer | null;
  private done = false;
  private onDone: ((v: Voice) => void) | null = null;

  constructor(ctx: BaseAudioContext, dest: AudioNode, start: number, priority: number, noise: AudioBuffer | null) {
    this.ctx = ctx;
    this.start = start;
    this.end = start;
    this.priority = priority;
    this.noiseBuf = noise;
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.nodes.push(this.out);
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  /** 延长结束时间（包络归零时刻）。 */
  until(t: number): void {
    if (t > this.end) this.end = t;
  }

  gain(value = 1): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    this.nodes.push(g);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    this.nodes.push(f);
    return f;
  }

  panner(pan: number): StereoPannerNode {
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    this.nodes.push(p);
    return p;
  }

  osc(type: OscillatorType, freq: number, t: number, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.value = detune;
    o.start(t);
    this.nodes.push(o);
    this.sources.push(o);
    return o;
  }

  /** 共享噪声缓冲的播放器（随机起点、循环）。 */
  noise(t: number, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    if (this.noiseBuf) {
      s.buffer = this.noiseBuf;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(t, ((t * 7919) % 1) * this.noiseBuf.duration);
    } else {
      s.start(t);
    }
    this.nodes.push(s);
    this.sources.push(s);
    return s;
  }

  /** 登记外部创建的节点，便于统一断开。 */
  own<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  /** 排定所有源节点停止，并在最后一个结束后清理。onDone 在清理时回调。 */
  finish(onDone: ((v: Voice) => void) | null = null): void {
    this.onDone = onDone;
    const stopAt = this.end + 0.02;
    let last: AudioScheduledSourceNode | null = null;
    for (const s of this.sources) {
      s.stop(stopAt);
      last = s;
    }
    if (last) last.onended = () => this.cleanup();
    else this.cleanup();
  }

  /** 被挤掉或释放时：15 ms 淡出后提前停止。 */
  kill(now: number): void {
    if (this.done) return;
    const g = this.out.gain;
    holdParam(g, now);
    g.linearRampToValueAtTime(0, now + 0.015);
    for (const s of this.sources) {
      try {
        s.stop(now + 0.02);
      } catch {
        // 已停止
      }
    }
    if (this.sources.length === 0) this.cleanup();
  }

  /** 立即断开（dispose 用）。 */
  cleanup(): void {
    if (this.done) return;
    this.done = true;
    for (const s of this.sources) s.onended = null;
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // 忽略
      }
    }
    this.nodes.length = 0;
    this.sources.length = 0;
    const cb = this.onDone;
    this.onDone = null;
    cb?.(this);
  }

  get finished(): boolean {
    return this.done;
  }
}

// ───────────────────────── 总线与主链 ─────────────────────────

export class AudioGraph {
  readonly ctx: BaseAudioContext;
  readonly noise: AudioBuffer;
  /** 音效干声入口 / 混响送入 */
  readonly sfxDry: GainNode;
  readonly sfxSend: GainNode;
  /** 音乐干声入口 / 混响送入 */
  readonly musicDry: GainNode;
  readonly musicSend: GainNode;
  private readonly sfxLevel: GainNode;
  private readonly musicLevel: GainNode;
  private readonly duckGain: GainNode;
  private readonly master: GainNode;
  private readonly all: AudioNode[] = [];

  constructor(ctx: BaseAudioContext, levels: BusLevels) {
    this.ctx = ctx;
    this.noise = makeNoiseBuffer(ctx);
    const g = (v: number): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      this.all.push(n);
      return n;
    };

    this.master = g(levels.master);
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeSoftClipCurve();
    shaper.oversample = 'none';
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -9;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const dcBlock = ctx.createBiquadFilter();
    dcBlock.type = 'highpass';
    dcBlock.frequency.value = 22;
    dcBlock.Q.value = 0.707;
    const mix = g(1);
    this.all.push(shaper, comp, dcBlock);
    mix.connect(dcBlock).connect(comp).connect(shaper).connect(this.master).connect(ctx.destination);

    // 音效总线：短而亮的房间混响
    this.sfxLevel = g(levels.sfx);
    this.sfxDry = g(1);
    this.sfxSend = g(1);
    const sfxVerb = ctx.createConvolver();
    sfxVerb.buffer = makeImpulse(ctx, 1.3, 0.55, 11);
    this.all.push(sfxVerb);
    this.sfxDry.connect(this.sfxLevel);
    this.sfxSend.connect(sfxVerb).connect(this.sfxLevel);
    this.sfxLevel.connect(mix);

    // 音乐总线：较长较暗的大厅混响 + 闪避
    this.musicLevel = g(levels.music);
    this.duckGain = g(1);
    this.musicDry = g(1);
    this.musicSend = g(1);
    const musicVerb = ctx.createConvolver();
    musicVerb.buffer = makeImpulse(ctx, 3.2, 0.3, 23);
    this.all.push(musicVerb);
    this.musicDry.connect(this.musicLevel);
    this.musicSend.connect(musicVerb).connect(this.musicLevel);
    this.musicLevel.connect(this.duckGain).connect(mix);
  }

  setLevels(l: BusLevels, immediate = false): void {
    const now = this.ctx.currentTime;
    const set = (p: AudioParam, v: number): void => {
      if (immediate) {
        p.cancelScheduledValues(0);
        p.value = v;
      } else rampParam(p, v, now);
    };
    set(this.master.gain, l.master);
    set(this.sfxLevel.gain, l.sfx);
    set(this.musicLevel.gain, l.music);
  }

  /** 音乐闪避：at 时刻 ~80 ms 内压低 depthDb，until 时刻起约 0.6 秒恢复。 */
  duck(at: number, depthDb: number, until: number): void {
    const p = this.duckGain.gain;
    holdParam(p, at);
    p.setTargetAtTime(dbToGain(depthDb), at, 0.025);
    p.setTargetAtTime(1, Math.max(until, at + 0.1), 0.2);
  }

  dispose(): void {
    for (const n of this.all) {
      try {
        n.disconnect();
      } catch {
        // 忽略
      }
    }
  }
}

/** 并发音效池：超过上限时按优先级/先后淘汰（见 logic.pickVictim）。 */
export class VoicePool {
  readonly voices = new Set<Voice>();
  readonly limit: number;
  constructor(limit: number) {
    this.limit = limit;
  }
  get size(): number {
    return this.voices.size;
  }
  add(v: Voice): void {
    this.voices.add(v);
  }
  remove(v: Voice): void {
    this.voices.delete(v);
  }
  killAll(now: number): void {
    for (const v of this.voices) v.kill(now);
  }
  cleanupAll(): void {
    for (const v of [...this.voices]) v.cleanup();
    this.voices.clear();
  }
}
