import Phaser from 'phaser';
import { artRef, type ArtRef } from '../assets.ts';
import { COLOR, RENDER_SCALE } from '../theme.ts';
import { viewOf } from '../viewport.ts';
import type { Animator } from './anim.ts';

/**
 * 粒子与贴图特效（v3 素材）。大幅效果在「减少动态效果」、动画关闭或快进时跳过；
 * 发射器与贴图在效果结束后销毁，不留残余对象。
 */

const FX_DEPTH = 400;
/** 下面的粒子缩放按「纹理为 RENDER_SCALE 倍」写；实际纹理倍数不同（图集）时在 burst 里换算 */
const K = 1 / RENDER_SCALE;

type ScaleCfg = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig['scale'];

/** 把按 RENDER_SCALE 倍纹理写的缩放换算到实际纹理倍数。 */
function fixScale(scale: ScaleCfg, ref: ArtRef): ScaleCfg {
  const f = RENDER_SCALE / ref.px;
  if (f === 1 || scale === undefined) return scale;
  if (typeof scale === 'number') return scale * f;
  if (typeof scale === 'object' && scale !== null && 'start' in scale) {
    const o = scale as { start: number; end: number };
    return { ...o, start: o.start * f, end: o.end * f };
  }
  return scale;
}

/** 按世界尺寸换算的图片缩放（scale = 1 时显示为素材定义的世界尺寸）。 */
function img(scene: Phaser.Scene, x: number, y: number, key: string): { image: Phaser.GameObjects.Image; k: number } | null {
  const ref = artRef(scene.textures, key);
  if (!ref) return null;
  return { image: scene.add.image(x, y, ref.tex, ref.frame), k: 1 / ref.px };
}

/** 发射一次性粒子并在寿命结束后销毁发射器。 */
function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  texture: string,
  count: number,
  config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
  depth = FX_DEPTH,
): void {
  const ref = artRef(scene.textures, texture);
  if (!ref || count <= 0) return;
  const emitter = scene.add.particles(x, y, ref.tex, { ...config, frame: ref.frame, scale: fixScale(config.scale, ref), emitting: false });
  emitter.setDepth(depth);
  emitter.explode(count);
  const life = typeof config.lifespan === 'number' ? config.lifespan : 1500;
  scene.time.delayedCall(life + 200, () => emitter.destroy());
}

const FIREWORK_TINTS = [0xffd34d, 0xff5a7a, 0x5ad1ff, 0x9dff6a, 0xffffff, 0xff9a3c];

/** 涨停烟花：一道拖尾升空，在 (x, y) 炸开整朵烟花 + 星星和彩点。 */
export function fireworks(scene: Phaser.Scene, anim: Animator, x: number, y: number, big = false): void {
  if (anim.calm) {
    // 减少动态效果：只在原地淡入淡出一朵小烟花
    if (anim.instant) return;
    const b = img(scene, x, y, 'fx:firework_burst');
    if (!b) return;
    const one = b.image.setDisplaySize(64, 64).setAlpha(0).setDepth(FX_DEPTH);
    anim.fx({ targets: one, alpha: { from: 0.9, to: 0 }, duration: 700 }, () => one.destroy());
    return;
  }
  const rise = 70;
  const tr = img(scene, x, y + rise, 'fx:firework_trail');
  if (tr) {
    const trail = tr.image.setDisplaySize(6, 30).setDepth(FX_DEPTH).setTint(0xffd34d);
    anim.fx({ targets: trail, y: y, alpha: { from: 1, to: 0.2 }, duration: 260, ease: 'Quad.easeOut' }, () => trail.destroy());
  }
  scene.time.delayedCall(240, () => {
    if (!scene.sys.isActive()) return;
    const fb = img(scene, x, y, 'fx:firework_burst');
    if (fb) {
      const b = fb.image.setScale(0.2 * fb.k).setDepth(FX_DEPTH);
      const size = big ? 1.5 : 1.1;
      scene.tweens.add({ targets: b, scale: size * fb.k, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Cubic.easeOut', onComplete: () => b.destroy() });
    }
    burst(scene, x, y, 'fx:firework_star', big ? 14 : 9, {
      speed: { min: 120, max: 260 },
      angle: { min: 0, max: 360 },
      gravityY: 220,
      rotate: { min: 0, max: 360 },
      scale: { start: 0.9 * K, end: 0.3 * K },
      lifespan: 1000,
    });
    burst(scene, x, y, 'fx:firework_dot', big ? 30 : 18, {
      speed: { min: 60, max: 220 },
      angle: { min: 0, max: 360 },
      gravityY: 160,
      scale: { start: 0.8 * K, end: 0 },
      tint: FIREWORK_TINTS,
      lifespan: 900,
    });
  });
}

/** 跌停雨云：在 (x, y) 飘来一朵愁眉雨云，下几滴雨后散去。 */
export function rainCloud(scene: Phaser.Scene, anim: Animator, x: number, y: number): void {
  if (anim.instant) return;
  const rc = img(scene, x - 30, y, 'fx:raincloud');
  if (!rc) return;
  const cloud = rc.image.setDisplaySize(96, 60).setAlpha(0).setDepth(FX_DEPTH);
  anim.fx({ targets: cloud, x, alpha: 1, duration: 300, ease: 'Quad.easeOut' });
  anim.fx({ targets: cloud, alpha: 0, delay: 1300, duration: 400 }, () => cloud.destroy());
  if (anim.calm) return;
  scene.time.delayedCall(260, () => {
    if (!scene.sys.isActive()) return;
    const drop = artRef(scene.textures, 'fx:raindrop');
    if (!drop) return;
    const emitter = scene.add.particles(x, y + 18, drop.tex, {
      frame: drop.frame,
      x: { min: -32, max: 32 },
      speedY: { min: 160, max: 220 },
      scale: fixScale({ start: 0.8 * K, end: 0.6 * K }, drop),
      alpha: { start: 0.9, end: 0.3 },
      lifespan: 420,
      frequency: 45,
    });
    emitter.setDepth(FX_DEPTH);
    scene.time.delayedCall(1000, () => emitter.stop());
    scene.time.delayedCall(1600, () => emitter.destroy());
  });
}

/** 升温：从热度条末端冒出几簇小火苗。 */
export function flameBurst(scene: Phaser.Scene, anim: Animator, x: number, y: number, n: number): void {
  if (anim.calm) return;
  burst(
    scene,
    x,
    y,
    'fx:flame_small',
    n,
    {
      x: { min: -6, max: 6 },
      speedY: { min: -70, max: -30 },
      speedX: { min: -15, max: 15 },
      scale: { start: 0.9 * K, end: 0.2 * K },
      alpha: { start: 1, end: 0 },
      lifespan: 650,
    },
    60,
  );
}

/** 降温 / 退潮：冰晶碎片向四周散开。 */
export function iceBurst(scene: Phaser.Scene, anim: Animator, x: number, y: number, n: number): void {
  if (anim.calm) return;
  burst(
    scene,
    x,
    y,
    'fx:ice_shard',
    n,
    {
      speed: { min: 30, max: 90 },
      angle: { min: 0, max: 360 },
      rotate: { min: 0, max: 360 },
      gravityY: 120,
      scale: { start: 0.9 * K, end: 0.3 * K },
      alpha: { start: 1, end: 0 },
      lifespan: 700,
    },
    60,
  );
}

/** 小闪光（买入、道具触发）。 */
export function sparkles(scene: Phaser.Scene, anim: Animator, x: number, y: number, n = 8, tint: number = COLOR.gold): void {
  if (anim.calm) return;
  burst(scene, x, y, 'fx:sparkle', n, {
    speed: { min: 40, max: 140 },
    angle: { min: 0, max: 360 },
    scale: { start: 1.1 * K, end: 0 },
    tint,
    lifespan: 600,
  });
}

/** 通关：屏幕上方洒下彩点。 */
export function confetti(scene: Phaser.Scene, anim: Animator): void {
  if (anim.calm) return;
  const w = viewOf(scene).w;
  burst(scene, w / 2, -10, 'fx:firework_dot', 90, {
    x: { min: -w / 2, max: w / 2 },
    speedY: { min: 120, max: 320 },
    speedX: { min: -80, max: 80 },
    gravityY: 160,
    scale: { start: 1 * K, end: 0.7 * K },
    tint: FIREWORK_TINTS,
    lifespan: 2600,
  });
}
