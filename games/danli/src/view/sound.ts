/**
 * 音效（DESIGN.md 第 4 节）：全部用 WebAudio 现场合成，不放音频文件。
 * - 解锁：浏览器（尤其 iOS）要在用户手势里才让出声。第一次按下、松手、按键时才建 AudioContext 并 resume，之前的音效直接不放；
 * - 不刺耳：总音量压低，过一个压缩器和 5 kHz 的低通；多用三角波、正弦和滤过的噪声，不用方波、锯齿波；
 * - 不堆：同一时刻最多 MAX_VOICES 个声音，多了就丢；每种声音有最短间隔（连发、爬动、一炮炸到几个人时不会叠成一团）；
 * - 静音开关记在 danli.prefs（main.ts 存取），这里只管开关。
 */

export type Sfx = 'shot' | 'plane' | 'boom' | 'hit' | 'fall' | 'crawl' | 'item' | 'turn' | 'win' | 'lose' | 'draw' | 'button' | 'warp';

/** 同一时刻最多几个声音 */
const MAX_VOICES = 6;
/** 每种声音的最短间隔（毫秒） */
const GAP: Partial<Record<Sfx, number>> = { crawl: 90, hit: 70, boom: 60, button: 50, item: 50, shot: 40 };

type Ctx = AudioContext;

export class Sound {
  private ctx: Ctx | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private last = new Map<Sfx, number>();
  private charging: { osc: OscillatorNode; gain: GainNode } | null = null;
  private crawlFlip = false;
  muted = false;

  /** 页面一开就调：等第一次手势解锁 */
  install(target: EventTarget = window): void {
    const unlock = (): void => {
      this.unlock();
      if (this.ctx?.state === 'running') for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown']) target.removeEventListener(t, unlock, true);
    };
    for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown']) target.addEventListener(t, unlock, true);
  }

  private unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20;
        comp.ratio.value = 4;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 5000;
        const out = ctx.createGain();
        out.gain.value = this.muted ? 0 : 0.5;
        out.connect(comp);
        comp.connect(lp);
        lp.connect(ctx.destination);
        // 1 秒白噪声，爆炸、嗖、爬动都从它滤出来
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.ctx = ctx;
        this.out = out;
        this.noise = buf;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // 没有 WebAudio 就不出声
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    if (m) this.charge(null);
  }

  /** 能放吗：解锁了、没静音、没超过同时的声音数、这种声音没太密；能放就占一个位子，dur 秒后让出来 */
  private take(name: Sfx, dur: number): Ctx | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted || this.voices >= MAX_VOICES) return null;
    const now = performance.now();
    if (now - (this.last.get(name) ?? -1e9) < (GAP[name] ?? 0)) return null;
    this.last.set(name, now);
    this.voices++;
    window.setTimeout(() => this.voices--, dur * 1000 + 30);
    return ctx;
  }

  /** 一个音：频率从 f0 滑到 f1，起音 a 秒，总长 dur 秒 */
  private tone(ctx: Ctx, at: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, a = 0.01): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + a);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(this.out!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** 一段滤过的噪声：滤波器的频率从 f0 滑到 f1 */
  private hiss(ctx: Ctx, at: number, type: BiquadFilterType, f0: number, f1: number, q: number, dur: number, vol: number, a = 0.01): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + a);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out!);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  /** 放一个音效；size 给爆炸用（坑的半径，19–35），坑大声音闷一点、响一点 */
  play(name: Sfx, size = 26): void {
    const lens: Record<Sfx, number> = { shot: 0.3, plane: 0.35, boom: 0.5, hit: 0.2, fall: 1.0, crawl: 0.05, item: 0.14, turn: 0.3, win: 0.6, lose: 0.6, draw: 0.4, button: 0.06, warp: 0.2 };
    const ctx = this.take(name, lens[name]);
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'shot':
        // 嗖：带通噪声从高往低扫
        this.hiss(ctx, t, 'bandpass', 2200, 500, 1.4, 0.3, 0.5, 0.02);
        this.tone(ctx, t, 'triangle', 520, 260, 0.12, 0.06);
        break;
      case 'plane':
        this.hiss(ctx, t, 'bandpass', 3000, 1200, 2, 0.35, 0.28, 0.04);
        break;
      case 'boom': {
        // 噗：低通噪声往下收，加一个往下掉的低音"咚"
        const k = Math.min(1.2, Math.max(0.7, size / 26));
        this.hiss(ctx, t, 'lowpass', 1100 / k, 120, 0.8, 0.45, 0.7 * k, 0.008);
        this.tone(ctx, t, 'sine', 150 / k, 45, 0.35, 0.55 * k, 0.005);
        break;
      }
      case 'hit':
        // 被打中：短短的"啵嘤"
        this.tone(ctx, t, 'triangle', 660, 300, 0.18, 0.22);
        this.tone(ctx, t, 'sine', 990, 760, 0.07, 0.06);
        break;
      case 'fall':
        // 掉出画本：往下滑的哨音
        this.tone(ctx, t, 'sine', 900, 170, 1.0, 0.14, 0.03);
        this.tone(ctx, t, 'triangle', 450, 85, 1.0, 0.05, 0.03);
        break;
      case 'crawl':
        // 爬一步：一下轻轻的"沙"，左右脚换一下音高
        this.crawlFlip = !this.crawlFlip;
        this.hiss(ctx, t, 'bandpass', this.crawlFlip ? 1400 : 1100, 900, 3, 0.05, 0.1, 0.004);
        break;
      case 'item':
        this.tone(ctx, t, 'triangle', 660, 660, 0.06, 0.13);
        this.tone(ctx, t + 0.06, 'triangle', 990, 990, 0.08, 0.13);
        break;
      case 'turn':
        this.tone(ctx, t, 'triangle', 784, 784, 0.14, 0.16);
        this.tone(ctx, t + 0.12, 'triangle', 1047, 1047, 0.18, 0.16);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(ctx, t + i * 0.1, 'triangle', f, f, 0.22, 0.17));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => this.tone(ctx, t + i * 0.16, 'triangle', f, f * 0.97, 0.24, 0.15));
        break;
      case 'draw':
        [523, 523].forEach((f, i) => this.tone(ctx, t + i * 0.14, 'triangle', f, f, 0.18, 0.14));
        break;
      case 'button':
        this.tone(ctx, t, 'sine', 560, 470, 0.05, 0.12, 0.004);
        break;
      case 'warp':
        this.hiss(ctx, t, 'bandpass', 900, 2000, 2, 0.18, 0.18, 0.02);
        break;
    }
  }

  /**
   * 蓄力：p 是 0..100，声调跟着往上走（220 → 660 Hz）；p 是 null 就收掉。
   * 只占一个位子，整个蓄力过程是同一个音，不会一帧一个。
   */
  charge(p: number | null): void {
    const ctx = this.ctx;
    if (p === null) {
      const c = this.charging;
      this.charging = null;
      if (c && ctx) {
        c.gain.gain.cancelScheduledValues(ctx.currentTime);
        c.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
        c.osc.stop(ctx.currentTime + 0.1);
        window.setTimeout(() => this.voices--, 130);
      }
      return;
    }
    const f = 220 * (1 + (2 * Math.min(100, Math.max(0, p))) / 100);
    if (this.charging && ctx) {
      this.charging.osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.03);
      return;
    }
    if (!ctx || ctx.state !== 'running' || this.muted || this.voices >= MAX_VOICES) return;
    this.voices++;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.out!);
    osc.start();
    this.charging = { osc, gain };
  }
}

export const sound = new Sound();
