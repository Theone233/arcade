/**
 * 武器图标和界面小图标（美术代理 2026-10-21 交付的 danli-icons.mjs，照原样改写成 TS）：Canvas 2D，
 * 房间的武器卡、位子、结算表、对局底栏共用；战场上飞的炮弹也用同一套图（drawShell）。
 */
import type { WeaponId } from '../core/weapons.ts';
import { smallCanvas } from './chars.ts';
import { INK } from './palette.ts';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function line(ctx: Ctx, k: number, w = 2.2): void { ctx.lineWidth = w * k; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }
function fs(ctx: Ctx, fill: string, k: number, w = 2.2): void { ctx.fillStyle = fill; ctx.fill(); if (w) { line(ctx, k, w); ctx.stroke(); } }

const ART: Record<WeaponId, (ctx: Ctx, k: number) => void> = {
  steamer(ctx, k) {
    ctx.beginPath(); ctx.roundRect(-15, -4, 30, 16, 4); fs(ctx, '#d8c46a', k);
    line(ctx, k, 1.4); ctx.strokeStyle = '#8f8a2c'; ctx.beginPath(); ctx.moveTo(-14, 4); ctx.lineTo(14, 4); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -5, 13, 9, 0, Math.PI, 0); ctx.closePath(); fs(ctx, '#fdebc6', k);
    line(ctx, k, 1.4); ctx.beginPath(); ctx.moveTo(-4, -11); ctx.quadraticCurveTo(0, -7, 4, -11); ctx.moveTo(0, -14); ctx.lineTo(0, -10); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-17, -6, 34, 5, 2); fs(ctx, '#c8b04a', k, 1.8);
  },
  melon(ctx, k) {
    ctx.beginPath(); ctx.ellipse(0, 2, 15, 13, 0, 0, TAU); fs(ctx, '#57b043', k);
    ctx.save(); ctx.clip(); ctx.strokeStyle = '#23662a'; ctx.lineWidth = 3 * k; ctx.beginPath();
    for (const dx of [-9, 0, 9]) { ctx.moveTo(dx, -12); ctx.quadraticCurveTo(dx + (dx ? dx * 0.4 : 3), 2, dx, 16); } ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 2, 15, 13, 0, 0, TAU); line(ctx, k); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.ellipse(-6, -4, 4, 2.4, -0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    line(ctx, k, 1.8); ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(2, -16, 6, -16); ctx.stroke();
  },
  paddle(ctx, k) {
    ctx.save(); ctx.rotate(-0.5);
    ctx.beginPath(); ctx.roundRect(-2.5, 2, 5, 15, 2); fs(ctx, '#d99a55', k, 1.8);
    ctx.beginPath(); ctx.ellipse(0, -7, 9, 10, 0, 0, TAU); fs(ctx, '#bccbd6', k);
    ctx.save(); ctx.clip(); ctx.strokeStyle = '#7f93a3'; ctx.lineWidth = 1.2 * k; ctx.beginPath(); for (let i = -8; i <= 8; i += 4) { ctx.moveTo(i, -18); ctx.lineTo(i, 4); ctx.moveTo(-10, i - 7); ctx.lineTo(10, i - 7); } ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, -7, 9, 10, 0, 0, TAU); line(ctx, k); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(10, -8, 6.5, 0, TAU); fs(ctx, '#a26be0', k);
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(8, -10, 2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  },
  carrot(ctx, k) {
    ctx.save(); ctx.rotate(0.7);
    ctx.fillStyle = '#57b043'; for (const a of [-0.5, 0, 0.5]) { ctx.save(); ctx.translate(0, -14); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -5, 2.6, 6, 0, 0, TAU); fs(ctx, '#57b043', k, 1.6); ctx.restore(); }
    ctx.beginPath(); ctx.moveTo(-7, -13); ctx.quadraticCurveTo(-6, 4, 0, 17); ctx.quadraticCurveTo(6, 4, 7, -13); ctx.closePath(); fs(ctx, '#f27f22', k);
    line(ctx, k, 1.4); ctx.strokeStyle = '#b34f12'; ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(1, -4); ctx.moveTo(-3, 2); ctx.lineTo(3, 4); ctx.moveTo(-1, 9); ctx.lineTo(2, 10); ctx.stroke();
    ctx.restore();
  },
  rocket(ctx, k) {
    ctx.save(); ctx.rotate(0.45);
    ctx.beginPath(); ctx.roundRect(-6, -8, 12, 22, 2); fs(ctx, '#e8454f', k);
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(-6, 0, 12, 4); ctx.beginPath(); ctx.roundRect(-6, -8, 12, 22, 2); line(ctx, k); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(0, -18); ctx.lineTo(7, -8); ctx.closePath(); fs(ctx, '#ffc928', k);
    ctx.restore();
    ctx.strokeStyle = '#ffb21a'; ctx.lineWidth = 2.2 * k; ctx.lineCap = 'round'; ctx.beginPath();
    for (const [x, y, dx, dy] of [[-12, 12, -4, 4], [-6, 16, -2, 5], [-14, 5, -5, 1]] as const) { ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); } ctx.stroke();
  },
  slipper(ctx, k) {
    ctx.save(); ctx.rotate(-0.35);
    ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 16, 0, 0, TAU); fs(ctx, '#fbe2a0', k);
    ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 13.5, 0, 0, TAU); ctx.fillStyle = '#4f9ee8'; ctx.fill();
    line(ctx, k, 2.6); ctx.strokeStyle = '#2a5fa8'; ctx.beginPath(); ctx.moveTo(-7, 2); ctx.quadraticCurveTo(0, -12, 7, 2); ctx.stroke();
    ctx.restore();
  },
  frisbee(ctx, k) {
    ctx.beginPath(); ctx.ellipse(0, 4, 16, 8, 0, 0, TAU); fs(ctx, '#d0559a', k);
    ctx.beginPath(); ctx.ellipse(0, 1, 16, 8, 0, 0, TAU); fs(ctx, '#f27cb0', k);
    ctx.beginPath(); ctx.ellipse(0, 1, 8, 4, 0, 0, TAU); fs(ctx, '#8c6be0', k, 1.6);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * k; ctx.beginPath(); ctx.arc(0, -4, 16, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
  },
  milktea(ctx, k) {
    line(ctx, k, 3.2); ctx.strokeStyle = '#f2607e'; ctx.beginPath(); ctx.moveTo(3, -10); ctx.lineTo(8, -18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(10, -8); ctx.lineTo(7, 16); ctx.lineTo(-7, 16); ctx.closePath(); fs(ctx, '#d9a46a', k);
    ctx.beginPath(); ctx.ellipse(0, -9, 11, 3.6, 0, 0, TAU); fs(ctx, '#fffdf6', k, 1.8);
    ctx.fillStyle = INK; for (const [x, y] of [[-4, 11], [1, 12], [5, 10], [-2, 7], [3, 6]] as const) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill(); }
  },
};
/** 武器图标：(x, y) 是中心，size 是边长（≥ 24 才看得清）；线宽按 size 等比 */
export function drawWeapon(ctx: Ctx, id: WeaponId, x: number, y: number, size: number): void {
  const k = size / 40;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ART[id](ctx, 1);
  ctx.restore();
}

export type Glyph = 'sound' | 'mute' | 'book' | 'dice' | 'pencil' | 'check' | 'home' | 'cup';

/** 界面小图标（屏幕坐标，(x, y) 中心，size 边长）：喇叭、静音、规则书、骰子、铅笔、勾、房子、奖杯 */
export function drawGlyph(ctx: Ctx, name: Glyph, x: number, y: number, size: number, color = INK): void {
  const k = size / 24;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.lineWidth = 2.2; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (name === 'sound' || name === 'mute') {
    ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(-4, -4); ctx.lineTo(2, -9); ctx.lineTo(2, 9); ctx.lineTo(-4, 4); ctx.lineTo(-9, 4); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    if (name === 'sound') { ctx.arc(3, 0, 5, -0.9, 0.9); ctx.moveTo(6.8, -7.4); ctx.arc(3, 0, 9, -0.95, 0.95); }
    else { ctx.moveTo(5, -4); ctx.lineTo(11, 4); ctx.moveTo(11, -4); ctx.lineTo(5, 4); }
    ctx.stroke();
  } else if (name === 'book') {
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(-5, -9, -10, -8); ctx.lineTo(-10, 8); ctx.quadraticCurveTo(-5, 7, 0, 10); ctx.quadraticCurveTo(5, 7, 10, 8); ctx.lineTo(10, -8); ctx.quadraticCurveTo(5, -9, 0, -6); ctx.lineTo(0, 10); ctx.stroke();
  } else if (name === 'dice') {
    ctx.beginPath(); ctx.roundRect(-9, -9, 18, 18, 4); ctx.stroke();
    for (const [a, b] of [[-4, -4], [4, 4], [0, 0], [4, -4], [-4, 4]] as const) { ctx.beginPath(); ctx.arc(a, b, 1.7, 0, TAU); ctx.fill(); }
  } else if (name === 'pencil') {
    ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(-7, 3); ctx.lineTo(5, -9); ctx.lineTo(9, -5); ctx.lineTo(-3, 7); ctx.closePath(); ctx.stroke();
  } else if (name === 'check') {
    ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-2, 6); ctx.lineTo(9, -7); ctx.stroke();
  } else if (name === 'home') {
    ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(0, -9); ctx.lineTo(9, -1); ctx.lineTo(9, 9); ctx.lineTo(3, 9); ctx.lineTo(3, 3); ctx.lineTo(-3, 3); ctx.lineTo(-3, 9); ctx.lineTo(-9, 9); ctx.closePath(); ctx.stroke();
  } else if (name === 'cup') {
    ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(7, -9); ctx.lineTo(6, 1); ctx.quadraticCurveTo(0, 6, -6, 1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-7, -6); ctx.quadraticCurveTo(-12, -6, -11, -1); ctx.quadraticCurveTo(-10, 2, -6, 1); ctx.moveTo(7, -6); ctx.quadraticCurveTo(12, -6, 11, -1); ctx.quadraticCurveTo(10, 2, 6, 1); ctx.moveTo(0, 4); ctx.lineTo(0, 8); ctx.moveTo(-5, 9); ctx.lineTo(5, 9); ctx.stroke();
  }
  ctx.restore();
}


/** 武器图标的小画布（CSS 像素边长 px） */
export function weaponIcon(id: WeaponId, px: number): HTMLCanvasElement {
  return smallCanvas(px, px, 'dl-wicon', (ctx) => drawWeapon(ctx, id, px / 2, px / 2, px));
}

/** 界面小图标的小画布 */
export function glyphIcon(name: Glyph, px: number, color = INK): HTMLCanvasElement {
  return smallCanvas(px, px, 'dl-glyph', (ctx) => drawGlyph(ctx, name, px / 2, px / 2, px, color));
}

/** 这几把是长条的，飞的时候头朝前 */
const POINTED: ReadonlySet<WeaponId> = new Set(['carrot', 'rocket', 'slipper']);
/** 图标里"头"本来朝哪（弧度）：萝卜尖朝右下、烟花朝右上、拖鞋竖着 */
const NOSE: Partial<Record<WeaponId, number>> = { carrot: Math.PI / 2 + 0.7, rocket: -Math.PI / 2 + 0.45, slipper: -Math.PI / 2 - 0.35 };

/**
 * 炮弹：就是那把武器的图标，世界坐标 (x, y)，k 是放大倍数（镜头拉远时画大一点）；
 * 长条的（萝卜、烟花、拖鞋）按速度 (vx, vy) 把头转到前面，圆的（包子、西瓜、球、飞盘、珍珠奶茶）慢慢转着飞
 */
export function drawShell(ctx: Ctx, id: WeaponId, x: number, y: number, k: number, vx: number, vy: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  if (POINTED.has(id)) ctx.rotate(Math.atan2(vy, vx) - (NOSE[id] ?? 0));
  else if (id === 'melon' || id === 'paddle') ctx.rotate(t / 160);
  drawWeapon(ctx, id, 0, 0, 24 * k);
  ctx.restore();
}
