import Phaser from 'phaser';
import type { Animator } from '../fx/anim.ts';
import type { Rect } from '../rect.ts';
import { COLOR } from '../theme.ts';
import { addText } from '../ui/text.ts';
import { viewOf } from '../viewport.ts';

const MAX_W = 168;

/**
 * 股票小人的台词气泡（F5）：冒在小人头顶，几秒后自己淡掉。不挡点击（不可交互）。
 * 关掉动画时也显示（直接出现、按时消失）。返回气泡所占区域，方便自动化检查。
 */
export function quipBubble(scene: Phaser.Scene, anim: Animator, x: number, y: number, text: string, hold = 2200, maxRight = viewOf(scene).w): { root: Phaser.GameObjects.Container; rect: Rect } {
  const t = addText(scene, 0, 0, text, { size: 12, bold: true, color: COLOR.ink, wrap: MAX_W - 20, align: 'center', originX: 0.5, originY: 0.5, lineSpacing: 2 });
  const w = Math.min(MAX_W, t.width + 20);
  const h = t.height + 14;
  // 不出屏幕左右（maxRight：右边不越过这条线，持仓小人的台词不压到手机上的推荐卡）
  const cx = Math.max(w / 2 + 6, Math.min(maxRight - w / 2 - 6, x));
  const top = y - 12 - h;
  const bg = scene.add.rectangle(0, 0, w, h, 0xffffff).setRounded(Math.min(14, h / 2)).setStrokeStyle(2.5, COLOR.ink, 1);
  const tx = Math.max(-w / 2 + 14, Math.min(w / 2 - 14, x - cx));
  const tail = scene.add.triangle(0, 0, tx - 7, h / 2 - 1, tx + 7, h / 2 - 1, tx, h / 2 + 10, 0xffffff).setOrigin(0, 0);
  const line = scene.add.graphics().lineStyle(2.5, COLOR.ink, 1).strokePoints([new Phaser.Math.Vector2(tx - 7, h / 2), new Phaser.Math.Vector2(tx, h / 2 + 10), new Phaser.Math.Vector2(tx + 7, h / 2)]);
  const root = scene.add.container(cx, top + h / 2, [bg, tail, line, t]).setDepth(165);
  if (!anim.calm && !anim.instant) {
    root.setScale(0.4);
    anim.fx({ targets: root, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }
  scene.time.delayedCall(hold, () => {
    if (!root.active) return;
    scene.tweens.add({ targets: root, alpha: 0, duration: 240, onComplete: () => root.destroy() });
  });
  return { root, rect: { x: cx - w / 2, y: top, w, h: h + 10 } };
}
