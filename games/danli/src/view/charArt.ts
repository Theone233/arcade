/**
 * 6 只萌宠（美术代理 2026-10-21 交付的 danli-chars.mjs，照原样改写成 TS）：柴柴、橘子、团团、企企、兔兔、鼠鼠。
 * drawChar(ctx, look, team, facing, expr, t)：世界坐标，脚底在 (0,0)，身高约 44（兔子耳朵再高 10）；
 * drawPortrait(ctx, look, x, y, size, opts)：圆形头像（屏幕坐标），房间、结算、画面外小牌用。
 * 认人靠剪影，不靠颜色：柴柴尖耳卷尾、橘子尖耳长尾带条纹、团团黑圆耳黑眼圈、企企没耳朵黄嘴、兔兔两只长耳、鼠鼠小圆耳大腮帮。
 * 线宽体系：外轮廓 2.2、五官 1.8、细节 1.2（世界单位；缩放 1 时就是屏幕像素）。不用滤镜、阴影、渐变。
 */
import type { Look, Team } from '../core/types.ts';
import { INK, TEAM } from './palette.ts';

type Ctx = CanvasRenderingContext2D;
export type Expr = 'normal' | 'hurt' | 'cheer';
type P = readonly [number, number];
const TAU = Math.PI * 2;

interface Skin {
  fur: string;
  face: string;
  inner?: string;
  ears: 'pointy' | 'round' | 'tiny' | 'long' | 'none';
  tail: 'curl' | 'long' | 'puff' | 'dot' | 'none';
  nose?: string;
  stripes?: string;
  whisk?: boolean;
  patch?: string;
  limb?: string;
  beak?: string;
  foot?: string;
  mask?: boolean;
  cheeks?: boolean;
}

const SKINS: Record<Look, Skin> = {
  shiba:   { fur: '#ef9442', face: '#fff1d6', inner: '#fff1d6', ears: 'pointy', tail: 'curl', nose: INK },
  cat:     { fur: '#f5a142', face: '#fff1d6', inner: '#f8b8a8', ears: 'pointy', tail: 'long', nose: '#e77b84', stripes: '#c8641c', whisk: true },
  panda:   { fur: '#fffdf6', face: '#fffdf6', inner: '#3a3540', ears: 'round', tail: 'dot', nose: '#3a3540', patch: '#3a3540', limb: '#3a3540' },
  penguin: { fur: '#3d4a72', face: '#fffdf6', ears: 'none', tail: 'none', beak: '#f5a531', foot: '#f5a531', mask: true },
  rabbit:  { fur: '#fffaf6', face: '#fffaf6', inner: '#f8b4c0', ears: 'long', tail: 'puff', nose: '#ef8a9c' },
  mouse: { fur: '#f2b766', face: '#fff6e6', inner: '#f8b8a8', ears: 'tiny', tail: 'none', nose: '#ef8a9c', cheeks: true },
};

function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
function fs(ctx: Ctx, fill: string, lw = 2.2): void { ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); } }

function tail(ctx: Ctx, s: Skin): void {
  if (s.tail === 'curl') {
    ctx.beginPath(); ctx.moveTo(-8, -9); ctx.bezierCurveTo(-20, -10, -20, -24, -12, -24); ctx.bezierCurveTo(-6, -24, -6, -17, -11, -16);
    ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 3.6; ctx.strokeStyle = s.fur; ctx.stroke();
    ctx.lineWidth = 1.4; ctx.strokeStyle = s.face; ctx.beginPath(); ctx.moveTo(-15, -21); ctx.quadraticCurveTo(-12, -23, -9, -21); ctx.stroke();
  } else if (s.tail === 'long') {
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.bezierCurveTo(-22, -6, -16, -24, -24, -30);
    ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 3.6; ctx.strokeStyle = s.fur; ctx.stroke();
    ctx.lineWidth = 1.6; ctx.strokeStyle = s.stripes!; ctx.beginPath(); ctx.moveTo(-18, -16); ctx.lineTo(-15, -14); ctx.moveTo(-20, -23); ctx.lineTo(-17, -22); ctx.stroke();
  } else if (s.tail === 'puff') { ell(ctx, -10, -9, 4.6, 4.2); fs(ctx, '#ffffff', 1.8); }
  else if (s.tail === 'dot') { ell(ctx, -10, -9, 3, 3); fs(ctx, s.limb!, 1.6); }
}

function ears(ctx: Ctx, s: Skin): void {
  if (s.ears === 'pointy') {
    for (const [a, b, c] of [[[-15, -33], [-12, -47], [-3, -39]], [[3, -40], [11, -48], [14, -33]]] as const) {
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0] - 1, b[1] + 2, b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); fs(ctx, s.fur);
      ctx.beginPath(); ctx.moveTo(a[0] + (c[0] - a[0]) * 0.25, a[1] + (c[1] - a[1]) * 0.25 - 1); ctx.lineTo(b[0] + (a[0] + c[0] - 2 * b[0]) * 0.18, b[1] + 5); ctx.lineTo(a[0] + (c[0] - a[0]) * 0.75, a[1] + (c[1] - a[1]) * 0.75 - 1); ctx.closePath(); fs(ctx, s.inner!, 0);
    }
  } else if (s.ears === 'round') { for (const [x, y] of [[-10, -38], [9, -39.5]] as const) { ell(ctx, x, y, 5.6, 5.4); fs(ctx, s.inner!); } }
  else if (s.ears === 'tiny') { for (const [x, y] of [[-10, -36], [9, -37.5]] as const) { ell(ctx, x, y, 4.4, 4.2); fs(ctx, s.fur); ell(ctx, x, y + 0.4, 2.2, 2.2); fs(ctx, s.inner!, 0); } }
  else if (s.ears === 'long') {
    // 左耳竖着，右耳往前折一下
    ctx.save(); ctx.translate(-5, -38); ctx.rotate(-0.16); ell(ctx, 0, -11, 4.8, 12.5); fs(ctx, s.fur); ell(ctx, 0, -10, 2.3, 9); fs(ctx, s.inner!, 0); ctx.restore();
    ctx.save(); ctx.translate(6, -38); ctx.rotate(0.22);
    ctx.beginPath(); ctx.moveTo(-4.6, 0); ctx.lineTo(-4.4, -12); ctx.quadraticCurveTo(-3, -20, 4, -19); ctx.quadraticCurveTo(12, -17, 12, -11); ctx.quadraticCurveTo(6, -13, 4.4, -10); ctx.lineTo(4.6, 0); ctx.closePath(); fs(ctx, s.fur);
    ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(-2, -12); ctx.quadraticCurveTo(-1, -16, 2, -15); ctx.lineTo(2, -2); ctx.closePath(); fs(ctx, s.inner!, 0);
    ctx.restore();
  }
}

function eyes(ctx: Ctx, s: Skin, expr: Expr): void {
  const E: readonly P[] = [[-1.5, -28.5], [8.5, -28.5]];
  if (s.patch) for (const [x, y] of E) { ell(ctx, x + 0.3, y + 0.3, 3.8, 4.6, x < 3 ? 0.35 : -0.35); fs(ctx, s.patch, 0); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const col = s.patch ? '#fffdf6' : INK;
  if (expr === 'hurt') {
    ctx.strokeStyle = col; ctx.lineWidth = 1.8;
    for (const [[x, y], d] of [[E[0]!, 1], [E[1]!, -1]] as const) { ctx.beginPath(); ctx.moveTo(x - 2.4 * d, y - 2.6); ctx.lineTo(x + 1.6 * d, y); ctx.lineTo(x - 2.4 * d, y + 2.6); ctx.stroke(); }
  } else if (expr === 'cheer') {
    ctx.strokeStyle = col; ctx.lineWidth = 1.8;
    for (const [x, y] of E) { ctx.beginPath(); ctx.arc(x, y + 1, 2.4, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  } else {
    for (const [x, y] of E) { ell(ctx, x, y, 1.9, 2.5); fs(ctx, col, 0); if (s.patch) { ell(ctx, x + 0.2, y + 0.4, 1.1, 1.4); fs(ctx, INK, 0); } else { ell(ctx, x + 0.6, y - 0.9, 0.7, 0.7); fs(ctx, '#ffffff', 0); } }
  }
}

function face(ctx: Ctx, s: Skin, expr: Expr): void {
  if (s.mask) { ctx.beginPath(); ctx.moveTo(3, -36); ctx.bezierCurveTo(-6, -40, -12, -30, -8, -22); ctx.bezierCurveTo(-4, -16, 10, -15, 13, -20); ctx.bezierCurveTo(16, -26, 12, -38, 3, -36); fs(ctx, s.face, 0); }
  else if (s.fur !== s.face) { ell(ctx, 4, -22.5, 9.5, 6.4); fs(ctx, s.face, 0); }
  if (s.cheeks) { ell(ctx, 3, -21.5, 13, 7.4); fs(ctx, s.face, 0); }
  if (s.stripes) { ctx.strokeStyle = s.stripes; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); for (const x of [-1, 3.5, 8]) { ctx.moveTo(x, -40); ctx.lineTo(x, -35.5); } ctx.stroke(); }
  // 脸红
  ctx.fillStyle = 'rgba(242,127,127,0.55)'; ell(ctx, -5, -23, 2.8, 1.7); ctx.fill();
  eyes(ctx, s, expr);
  // 鼻子、嘴
  if (s.beak) {
    ctx.beginPath(); ctx.moveTo(10, -26); ctx.quadraticCurveTo(19, -24.5, 10, -21); ctx.closePath(); fs(ctx, s.beak, 1.6);
    if (expr === 'cheer') { ctx.beginPath(); ctx.moveTo(10, -23.5); ctx.lineTo(16, -23.5); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke(); }
  } else {
    ell(ctx, 12.4, -24.6, 2, 1.5); fs(ctx, s.nose ?? INK, 0);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    if (expr === 'cheer') { ctx.beginPath(); ctx.moveTo(7, -22); ctx.quadraticCurveTo(10, -16, 13.5, -22); ctx.closePath(); fs(ctx, '#8a2f28', 1.4); ell(ctx, 10.3, -19.6, 1.8, 1.1); fs(ctx, '#f08c88', 0); }
    else if (expr === 'hurt') { ctx.beginPath(); ctx.moveTo(7, -20.5); ctx.quadraticCurveTo(8.5, -22, 10, -20.5); ctx.quadraticCurveTo(11.5, -19, 13, -20.5); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(12.4, -23.4); ctx.lineTo(12.4, -21.6); ctx.moveTo(9.4, -21.6); ctx.quadraticCurveTo(10.9, -20, 12.4, -21.6); ctx.quadraticCurveTo(13.9, -20, 15.2, -21.8); ctx.stroke(); }
  }
  if (s.whisk) { ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(16, -24); ctx.lineTo(21, -25.5); ctx.moveTo(16, -22.5); ctx.lineTo(21, -22); ctx.stroke(); ctx.globalAlpha = 1; }
}

/** 头（不含身子）：给头像和 drawChar 共用。坐标同 drawChar（头心约在 (1,-27)） */
function head(ctx: Ctx, s: Skin, expr: Expr): void {
  ears(ctx, s);
  if (s.cheeks) ell(ctx, 2, -27, 15.5, 13); else ell(ctx, 1, -27.5, 14, 13.2);
  fs(ctx, s.fur);
  if (s.ears === 'none') { ctx.beginPath(); ctx.moveTo(-1, -40.5); ctx.quadraticCurveTo(1, -46, 5, -45); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.stroke(); }
  face(ctx, s, expr);
}

/** 在世界坐标里画一只：脚底在 (0,0)，facing 1 朝右；expr: normal | hurt | cheer；t 毫秒（呼吸和欢呼的跳） */
export function drawChar(ctx: Ctx, look: Look, team: Team, facing: 1 | -1, expr: Expr, t = 0): void {
  const s = SKINS[look];
  ctx.save();
  ctx.lineJoin = 'round';
  // 脚下的队色圈
  ctx.lineWidth = 3; ctx.strokeStyle = TEAM[team]; ctx.fillStyle = team ? 'rgba(245,173,0,0.22)' : 'rgba(47,120,224,0.22)';
  ell(ctx, 0, 0, 17, 4.5); ctx.fill(); ctx.stroke();
  ctx.scale(facing, 1);
  const bob = expr === 'cheer' ? -Math.abs(Math.sin(t / 120)) * 4 : Math.sin(t / 400) * 0.6;
  ctx.translate(0, bob);
  tail(ctx, s);
  // 脚
  for (const fx of [-5, 6]) { ell(ctx, fx, -2.4, 4.6, 2.8); fs(ctx, s.foot ?? s.limb ?? s.fur); }
  // 身子 + 肚皮
  ell(ctx, 0, -10.5, 10.5, 9.2); fs(ctx, s.fur);
  if (s.limb) { ctx.save(); ell(ctx, 0, -10.5, 10.5, 9.2); ctx.clip(); ctx.fillStyle = s.limb; ctx.fillRect(-12, -14, 24, 6); ctx.restore(); ell(ctx, 0, -10.5, 10.5, 9.2); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke(); }
  ell(ctx, 2.5, -9.5, 6, 6); fs(ctx, s.face, 0);
  // 小手（往前伸，拿武器的那只）
  ell(ctx, 9, -11, 3.4, 3); fs(ctx, s.limb ?? s.fur, 1.8);
  head(ctx, s, expr);
  // 队色围巾
  ctx.fillStyle = TEAM[team]; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.roundRect(-10, -18, 20, 5, 2.5); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, -14.5); ctx.lineTo(-14, -8); ctx.lineTo(-5.5, -10.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  // 冒汗
  if (expr === 'hurt') { ctx.beginPath(); ctx.moveTo(-15, -44); ctx.quadraticCurveTo(-19, -37, -15, -36); ctx.quadraticCurveTo(-11, -37, -15, -44); fs(ctx, '#7cc4ec', 1.4); }
  ctx.restore();
}

/**
 * 圆形头像（屏幕坐标）：(x, y) 圆心，size 直径。opts.team 画队色底，opts.expr 表情，opts.ring 外圈颜色（默认墨线）。
 * 房间位子、结算表、画面外小牌都用它；size ≥ 28 才看得清五官。
 */
export function drawPortrait(ctx: Ctx, look: Look, x: number, y: number, size: number, { team = null, expr = 'normal', ring = INK, bg }: { team?: Team | null; expr?: Expr; ring?: string; bg?: string } = {}): void {
  const s = SKINS[look];
  const r = size / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = bg ?? (team === null ? '#fff1d6' : team ? '#fff1c8' : '#e3eefc'); ctx.fill();
  ctx.save(); ctx.clip();
  const k = size / 36;
  ctx.translate(x - 1 * k, y + 29 * k); ctx.scale(k, k);
  if (team !== null) { ctx.fillStyle = s.fur; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ell(ctx, 0, -8, 13, 10); ctx.fill(); ctx.stroke(); ctx.fillStyle = TEAM[team]; ctx.beginPath(); ctx.roundRect(-12, -17, 24, 6, 3); ctx.fill(); ctx.lineWidth = 1.6; ctx.stroke(); }
  head(ctx, s, expr);
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = Math.max(1.6, size / 22); ctx.strokeStyle = ring; ctx.stroke();
  ctx.restore();
}
