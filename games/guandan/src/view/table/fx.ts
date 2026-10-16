/** 特效：大字、闪光、震屏、粒子、庆祝。全部自管生命周期，播完即销毁。 */
import Phaser from 'phaser';
import { dur, tweenP, wait } from '../anim.ts';
import { COLOR, GAME_HEIGHT, TYPE } from '../theme.ts';
import { text, worldW } from '../ui/kit.ts';

/** 画面中央的大字（"炸弹×6""天王炸""接风""第 3 副"）。 */
export async function bigWord(
  scene: Phaser.Scene,
  msg: string,
  opts: { color?: number; stroke?: number; size?: number; y?: number; hold?: number; sub?: string; depth?: number } = {},
): Promise<void> {
  const W = worldW(scene);
  const c = scene.add.container(W / 2, opts.y ?? GAME_HEIGHT * 0.42).setDepth(opts.depth ?? 3500);
  const t = text(scene, 0, 0, msg, {
    size: opts.size ?? TYPE.huge,
    color: opts.color ?? COLOR.goldLight,
    bold: true,
    font: 'title',
    stroke: opts.stroke ?? COLOR.redDark,
    strokeWidth: 10,
    shadow: true,
  });
  c.add(t);
  if (opts.sub) c.add(text(scene, 0, t.height / 2 + 22, opts.sub, { size: TYPE.title, color: 0xfff6e0, bold: true, stroke: 0x2b1d14, strokeWidth: 5 }));
  if (dur(1) === 0) {
    c.destroy();
    return;
  }
  c.setScale(2.2).setAlpha(0);
  await tweenP(scene, { targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  await wait(scene, opts.hold ?? 520);
  await tweenP(scene, { targets: c, alpha: 0, y: c.y - 30, duration: 260 });
  c.destroy();
}

/** 横幅提示（不挡操作）：一条半透明长条从左滑入。 */
export async function banner(scene: Phaser.Scene, msg: string, y = 300, color = 0x2b1d14): Promise<void> {
  const W = worldW(scene);
  const c = scene.add.container(W / 2, y).setDepth(3400);
  const t = text(scene, 0, 0, msg, { size: TYPE.title, color: COLOR.goldLight, bold: true, font: 'title' });
  const w = Math.max(360, t.width + 140);
  const g = scene.add.graphics();
  g.fillStyle(color, 0.82).fillRect(-w / 2, -30, w, 60);
  g.lineStyle(2, COLOR.gold, 0.9).lineBetween(-w / 2, -30, w / 2, -30).lineBetween(-w / 2, 30, w / 2, 30);
  c.add([g, t]);
  if (dur(1) === 0) {
    c.destroy();
    return;
  }
  c.setAlpha(0).setScale(1, 0.2);
  await tweenP(scene, { targets: c, alpha: 1, scaleY: 1, duration: 180 });
  await wait(scene, 800);
  await tweenP(scene, { targets: c, alpha: 0, duration: 220 });
  c.destroy();
}

export function flash(scene: Phaser.Scene, color: number, alpha = 0.6): void {
  if (dur(1) === 0) return;
  const r = scene.add.graphics().setDepth(3300);
  r.fillStyle(color, alpha).fillRect(0, 0, worldW(scene), GAME_HEIGHT);
  scene.tweens.add({ targets: r, alpha: 0, duration: dur(380), onComplete: () => r.destroy() });
}

export function shake(scene: Phaser.Scene, ms: number, intensity: number): void {
  if (dur(1) === 0) return;
  scene.cameras.main.shake(dur(ms), intensity);
}

/** 一次性粒子爆发。 */
export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: 'spark' | 'petal' | 'coin' | 'confetti' | 'star' | 'smoke',
  count: number,
  opts: { speed?: [number, number]; life?: number; gravity?: number; scale?: [number, number]; tint?: number[] } = {},
): void {
  if (dur(1) === 0) return;
  const em = scene.add.particles(x, y, `particle:${kind}`, {
    speed: { min: opts.speed?.[0] ?? 150, max: opts.speed?.[1] ?? 420 },
    angle: { min: 0, max: 360 },
    lifespan: opts.life ?? 900,
    gravityY: opts.gravity ?? 300,
    scale: { start: opts.scale?.[0] ?? 0.9, end: opts.scale?.[1] ?? 0.2 },
    alpha: { start: 1, end: 0 },
    rotate: { min: 0, max: 360 },
    tint: opts.tint,
    emitting: false,
  });
  em.setDepth(3450);
  em.explode(count);
  scene.time.delayedCall((opts.life ?? 900) + 200, () => em.destroy());
}

/** 光芒：从中心旋转散开的金色光束（天王炸、升级用）。 */
export function rays(scene: Phaser.Scene, x: number, y: number, color = 0xffd25a): void {
  if (dur(1) === 0) return;
  const g = scene.add.graphics().setPosition(x, y).setDepth(3290);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const b = a + 0.12;
    g.fillStyle(color, 0.28).fillTriangle(0, 0, Math.cos(a) * 900, Math.sin(a) * 900, Math.cos(b) * 900, Math.sin(b) * 900);
  }
  g.setScale(0.2).setAlpha(0.9);
  scene.tweens.add({ targets: g, scale: 1, angle: 25, alpha: 0, duration: dur(1100), ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
}

/** 持续的彩带/花瓣雨（胜利页），返回停止函数。 */
export function rain(scene: Phaser.Scene, kind: 'confetti' | 'petal' | 'coin' | 'smoke', depth: number, tint?: number[]): () => void {
  const W = worldW(scene);
  const em = scene.add.particles(0, -20, `particle:${kind}`, {
    x: { min: 0, max: W },
    speedY: { min: 90, max: 200 },
    speedX: { min: -40, max: 40 },
    lifespan: 5200,
    rotate: { min: 0, max: 360 },
    scale: { min: 0.6, max: 1.2 },
    frequency: kind === 'smoke' ? 220 : 60,
    alpha: kind === 'smoke' ? { start: 0.5, end: 0 } : 1,
    tint,
  });
  em.setDepth(depth);
  return () => {
    em.stop();
    scene.time.delayedCall(5400, () => em.destroy());
  };
}
