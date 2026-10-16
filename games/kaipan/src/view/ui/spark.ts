import Phaser from 'phaser';
import { COLOR, signColor } from '../theme.ts';
import { addText } from './text.ts';

/**
 * 0.5.1 迷你图表：折线（可带面积）、涨跌柱（以 0 为轴，红涨绿跌随配色），支持「从左往右画出来」的动画。
 * 画在一个 Graphics 上；play() 用场景的补间推进，场景关闭时随之回收；calm（减少动态）时直接画完。
 */
interface SparkOpts {
  kind: 'line' | 'bars';
  /** 折线颜色（不给则按首尾涨跌着色） */
  color?: number;
  /** 折线下面铺一层淡色面积 */
  area?: boolean;
  /** 折线最后一点画个圆点 */
  dot?: boolean;
  /** 线宽 */
  width?: number;
  /** 柱：最大幅度（pp），超过的截断；不给按数据最大值 */
  cap?: number;
  /** 柱：不给 cap 时，按数据最大值缩放的下限（pp）——小图上 1–2% 的涨跌也看得出高低，又不会把 0.2% 画成满格 */
  capMin?: number;
  /** 画一条 0 轴 / 起点基准线 */
  axis?: boolean;
  /** 0.5.1：前 pre 项是开局前的历史，画浅色（线是细虚线），和开局后分一道竖虚线 */
  pre?: number;
  /** 在开局前那段的左上角标「开局前」（大图用） */
  preLabel?: boolean;
  /** 底色（圆角矩形） */
  bg?: number;
  bgAlpha?: number;
}

export class Spark {
  readonly g: Phaser.GameObjects.Graphics;
  private values: number[];
  private readonly x: number;
  private readonly y: number;
  private readonly w: number;
  private readonly h: number;
  private o: SparkOpts;
  private tween: Phaser.Tweens.Tween | null = null;
  /** 「开局前」小字（preLabel 时才有；调用方要把它和 g 一起放进容器，见 nodes()） */
  label: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, values: readonly number[], o: SparkOpts) {
    this.g = scene.add.graphics();
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.o = o;
    this.values = [...values];
    if (o.preLabel) {
      this.label = addText(scene, x + 2, y - 2, '开局前', { size: 11, color: 0x9fb2c6 }).setVisible(false);
    }
    this.draw(1);
  }

  /** 图上的所有对象（放进容器用）。 */
  nodes(): Phaser.GameObjects.GameObject[] {
    return this.label ? [this.g, this.label] : [this.g];
  }

  /** 改开局前的项数（数据变了时一起改）。 */
  setPre(n: number): this {
    this.o.pre = n;
    return this;
  }

  set(values: readonly number[]): this {
    this.values = [...values];
    this.draw(1);
    return this;
  }

  /** 画出来的动画（ms 毫秒）；calm 时直接画完。 */
  play(ms = 500, calm = false): this {
    this.tween?.stop();
    if (calm || this.values.length < 2) {
      this.draw(1);
      return this;
    }
    const scene = this.g.scene;
    this.tween = scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      ease: 'Sine.easeOut',
      onUpdate: (tw) => {
        if (this.g.active) this.draw(tw.getValue() ?? 1);
      },
      onComplete: () => {
        if (this.g.active) this.draw(1);
      },
    });
    return this;
  }

  /** 画到进度 t（0..1）。 */
  draw(t: number): void {
    const g = this.g;
    const { x, y, w, h, o } = this;
    const v = this.values;
    g.clear();
    if (o.bg !== undefined) g.fillStyle(o.bg, o.bgAlpha ?? 1).fillRoundedRect(x - 4, y - 3, w + 8, h + 6, 6);
    if (v.length === 0) return;
    if (o.kind === 'bars') {
      const cap = o.cap ?? Math.max(o.capMin ?? 1, ...v.map((a) => Math.abs(a)));
      const n = v.length;
      const slot = w / n;
      const bw = Math.max(2, Math.min(12, slot * 0.66));
      const mid = y + h / 2;
      if (o.axis !== false) g.fillStyle(COLOR.ink, 0.25).fillRect(x, mid - 0.5, w, 1);
      const shown = Math.ceil(n * t);
      this.divider(slot * Math.min(n, o.pre ?? 0));
      for (let i = 0; i < shown; i++) {
        const a = v[i] ?? 0;
        const bh = Math.max(2, (Math.min(cap, Math.abs(a)) / cap) * (h / 2 - 1));
        const bx = x + i * slot + (slot - bw) / 2;
        g.fillStyle(Math.abs(a) < 0.05 ? COLOR.muted : signColor(a), i < (o.pre ?? 0) ? 0.5 : 1);
        if (a >= 0) g.fillRect(bx, mid - bh, bw, bh);
        else g.fillRect(bx, mid, bw, bh);
      }
      return;
    }
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const span = hi - lo || 1;
    const px = (i: number): number => x + (v.length === 1 ? w : (i / (v.length - 1)) * w);
    const py = (a: number): number => y + h - ((a - lo) / span) * h;
    const color = o.color ?? signColor((v[v.length - 1] ?? 0) - (v[0] ?? 0));
    const last = (v.length - 1) * t;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= Math.floor(last); i++) pts.push({ x: px(i), y: py(v[i] ?? 0) });
    const frac = last - Math.floor(last);
    if (frac > 0 && Math.floor(last) + 1 < v.length) {
      const i = Math.floor(last);
      const a = v[i] ?? 0;
      const b = v[i + 1] ?? 0;
      pts.push({ x: px(i) + (px(i + 1) - px(i)) * frac, y: py(a + (b - a) * frac) });
    }
    if (o.axis) g.lineStyle(1, COLOR.ink, 0.2).lineBetween(x, py(v[0] ?? 0), x + w, py(v[0] ?? 0));
    if (pts.length < 2) return;
    if (o.area) {
      g.fillStyle(color, 0.18);
      g.beginPath();
      g.moveTo(pts[0]!.x, y + h);
      for (const p of pts) g.lineTo(p.x, p.y);
      g.lineTo(pts[pts.length - 1]!.x, y + h);
      g.closePath();
      g.fillPath();
    }
    const pre = Math.min(pts.length - 1, Math.max(0, (o.pre ?? 0) - 1));
    if (pre > 0) {
      // 开局前：细、浅、虚线
      g.lineStyle(Math.max(1, (o.width ?? 2) - 0.5), color, 0.45);
      for (let i = 0; i < pre; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        for (let d = 0; d < 1; d += 0.5) g.lineBetween(a.x + (b.x - a.x) * d, a.y + (b.y - a.y) * d, a.x + (b.x - a.x) * (d + 0.3), a.y + (b.y - a.y) * (d + 0.3));
      }
      this.divider(pts[pre]!.x - x);
    } else this.divider(0);
    g.lineStyle(o.width ?? 2, color, 1);
    g.beginPath();
    g.moveTo(pts[pre]!.x, pts[pre]!.y);
    for (const p of pts.slice(pre + 1)) g.lineTo(p.x, p.y);
    g.strokePath();
    if (o.dot) {
      const p = pts[pts.length - 1]!;
      g.fillStyle(color, 1).fillCircle(p.x, p.y, (o.width ?? 2) + 1.5);
      g.lineStyle(1.5, 0xffffff, 1).strokeCircle(p.x, p.y, (o.width ?? 2) + 1.5);
    }
  }

  /** 开局那天的竖虚线（dx = 离左边多远；0 表示没有开局前的部分） */
  private divider(dx: number): void {
    this.label?.setVisible(dx > 26);
    if (dx <= 0) return;
    const g = this.g;
    g.lineStyle(1, 0x9fb2c6, 0.8);
    for (let yy = this.y; yy < this.y + this.h; yy += 5) g.lineBetween(this.x + dx, yy, this.x + dx, Math.min(this.y + this.h, yy + 2.5));
  }

  destroy(): void {
    this.label?.destroy();
    this.tween?.stop();
    this.g.destroy();
  }
}

export function addSpark(scene: Phaser.Scene, x: number, y: number, w: number, h: number, values: readonly number[], o: SparkOpts): Spark {
  return new Spark(scene, x, y, w, h, values, o);
}
