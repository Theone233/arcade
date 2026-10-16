import Phaser from 'phaser';
import type { Face } from '../../core/index.ts';
import { artRef, stockAnchors, stockKey, type ArtRef } from '../assets.ts';
import type { Animator } from '../fx/anim.ts';

/** 合成图画布边长（素材像素） */
const CANVAS = 128;

interface GuyOpts {
  /** 待机呼吸（减少动态效果、动画关闭时传 false） */
  idle: boolean;
}

/** 眨眼：每 3–6 秒一次，闭眼约 120ms */
const BLINK_GAP = [3000, 6000] as const;
const BLINK_MS = 120;

/**
 * 股票小人：合成图（按表情换图），以地面锚点 (64, 116) 为原点。
 * 结构：容器（定位）→ body（弹跳、发抖）→ image（呼吸）。待机呼吸是一个循环补间，销毁时一并停掉。
 * 待机时平静表情会随机眨眼（换成与 calm 对齐的 blink 图；没有 blink 素材就不眨），各小人的节奏错开。
 */
export class StockGuy extends Phaser.GameObjects.Container {
  readonly stockId: string;
  readonly size: number;
  private readonly puppet: Phaser.GameObjects.Container;
  private readonly image: Phaser.GameObjects.Image;
  private base: number;
  private readonly headTop: number;
  private face: Face;
  private breath: Phaser.Tweens.Tween | null = null;
  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  private blinking = false;
  /** 当前纹理的原始宽度（纹理像素），换图时尺寸不同就按比例修正缩放 */
  private texW = 0;

  /** 现在的表情 */
  get faceNow(): Face {
    return this.face;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, stockId: string, face: Face, size: number, opts: GuyOpts) {
    super(scene, x, y);
    this.stockId = stockId;
    this.size = size;
    this.face = face;
    const a = stockAnchors(scene.cache, stockId);
    this.headTop = a.headTop;
    const ref = this.refFor(face);
    this.image = (ref ? scene.add.image(0, 0, ref.tex, ref.frame) : scene.add.image(0, 0, '__WHITE')).setOrigin(0.5, a.ground / CANVAS);
    this.image.setDisplaySize(size, size);
    this.texW = this.image.frame.realWidth;
    if (!ref) this.image.setVisible(false);
    this.base = this.image.scaleX;
    this.puppet = scene.add.container(0, 0, [this.image]);
    this.add(this.puppet);
    scene.add.existing(this);
    if (opts.idle) {
      this.breath = scene.tweens.add({
        targets: this.image,
        scaleX: this.base * 1.018,
        scaleY: this.base * 1.04,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: Math.random() * 1500,
      });
      this.scheduleBlink(true);
    }
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.breath?.remove();
      this.breath = null;
      this.blinkTimer?.remove(false);
      this.blinkTimer = null;
      scene.tweens.killTweensOf([this.image, this.puppet]);
    });
  }

  /** 下一次眨眼：间隔随机，第一次再多错开一点，免得同一屏的小人一起眨。 */
  private scheduleBlink(first = false): void {
    const [lo, hi] = BLINK_GAP;
    const delay = lo + Math.random() * (hi - lo) + (first ? Math.random() * 2000 : 0);
    this.blinkTimer = this.scene.time.delayedCall(delay, () => this.blink());
  }

  private blink(): void {
    if (!this.active) return;
    const ref = this.face === 'calm' && this.image.visible ? artRef(this.scene.textures, stockKey(this.stockId, 'blink')) : null;
    if (ref) {
      this.blinking = true;
      this.applyRef(ref);
      this.blinkTimer = this.scene.time.delayedCall(BLINK_MS, () => {
        if (!this.active) return;
        this.blinking = false;
        const calm = this.refFor(this.face);
        if (calm) this.applyRef(calm);
        this.scheduleBlink();
      });
      return;
    }
    this.scheduleBlink();
  }

  /** 换图；新纹理尺寸不同（图集与单独 SVG 混用）时按比例修正缩放，呼吸补间随之重来。 */
  private applyRef(ref: ArtRef): void {
    this.image.setTexture(ref.tex, ref.frame).setVisible(true);
    const w = this.image.frame.realWidth;
    if (w !== this.texW && w > 0 && this.texW > 0) {
      const k = this.texW / w;
      this.texW = w;
      const restart = this.breath !== null;
      this.breath?.remove();
      this.breath = null;
      this.image.setScale(this.image.scaleX * k, this.image.scaleY * k);
      this.base *= k;
      if (restart) {
        this.image.setScale(this.base);
        this.breath = this.scene.tweens.add({ targets: this.image, scaleX: this.base * 1.018, scaleY: this.base * 1.04, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }
  }

  private refFor(face: Face): ArtRef | null {
    return artRef(this.scene.textures, stockKey(this.stockId, face)) ?? artRef(this.scene.textures, stockKey(this.stockId, 'calm'));
  }

  get currentFace(): Face {
    return this.face;
  }

  setFace(face: Face): this {
    if (face === this.face && !this.blinking) return this;
    this.face = face;
    this.blinking = false;
    const ref = this.refFor(face);
    if (ref) this.applyRef(ref);
    return this;
  }

  /** 头顶在本容器里的 y（负数），弹涨跌幅用。 */
  headY(): number {
    return -((stockAnchors(this.scene.cache, this.stockId).ground - this.headTop) * this.size) / CANVAS;
  }

  /** 世界坐标下头顶位置。 */
  headWorld(): { x: number; y: number } {
    const m = this.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty + this.headY() * m.scaleY };
  }

  /** 开心地弹一下：先压扁再起跳，落地回弹。strength 0..1。 */
  bounce(anim: Animator, strength = 1): void {
    if (anim.instant) return;
    const body = this.puppet;
    this.scene.tweens.killTweensOf(body);
    body.setScale(1).setY(0);
    if (anim.calm) {
      anim.fx({ targets: body, scaleY: { from: 1.06, to: 1 }, duration: 240, ease: 'Quad.easeOut' }, () => body.setScale(1));
      return;
    }
    const h = this.size * (0.08 + 0.1 * strength);
    anim.fx({
      targets: body,
      scaleX: { from: 1.08, to: 0.96 },
      scaleY: { from: 0.9, to: 1.06 },
      y: { from: 0, to: -h },
      duration: 170,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (!body.active) return;
        anim.fx({ targets: body, y: 0, scaleX: 1, scaleY: 1, duration: 260, ease: 'Bounce.easeOut' }, () => body.setScale(1).setY(0));
      },
    });
  }

  /** 发抖：沿 x 小幅抖动。 */
  shake(anim: Animator, strength = 1): void {
    if (anim.instant) return;
    const body = this.puppet;
    this.scene.tweens.killTweensOf(body);
    body.setX(0);
    if (anim.calm) return;
    const dx = 2 + 3 * strength;
    anim.fx({ targets: body, x: { from: -dx, to: dx }, duration: 50, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' }, () => body.setX(0));
  }
}
