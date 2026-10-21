/**
 * 角色：本体和头像的画法在 charArt.ts（美术交付）；这里是队标、名牌、图钉、画面外小牌、"出局"章和页面用的小画布。
 * 柴柴、橘子、团团、企企、兔兔、鼠鼠只换外观（DESIGN.md 2.6）。挨打时挤眼冒汗。
 * 缩放低于 0.7 时角色换成队色图钉（DESIGN.md 第 4 节），名牌、图钉、画面外小牌都按屏幕像素画，不跟着缩放。
 */
import type { Look, Team } from '../core/types.ts';
import { drawChar, drawPortrait, type Expr } from './charArt.ts';
import { FONT, INK, PAPER, RED, TEAM, TEAM_TEXT } from './palette.ts';

export { drawChar, drawPortrait, type Expr } from './charArt.ts';

export const LOOK_NAME: Record<Look, string> = { shiba: '柴柴', cat: '橘子', panda: '团团', penguin: '企企', rabbit: '兔兔', mouse: '鼠鼠' };

/** 队标：蓝队圆、黄队星（屏幕坐标） */
export function emblem(ctx: CanvasRenderingContext2D, team: Team, x: number, y: number, r: number, white = false): void {
  ctx.save();
  ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.strokeStyle = INK;
  if (team === 0) {
    ctx.fillStyle = white ? '#fff' : TEAM[0];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = white ? TEAM[0] : '#fff';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = white ? '#fff' : TEAM[1];
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.48 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function hpBar(ctx: CanvasRenderingContext2D, team: Team, x: number, y: number, w: number, h: number, frac: number): void {
  ctx.fillStyle = '#efe6d2';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = TEAM[team];
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * frac), h, h / 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.stroke();
}

export interface Tag {
  name: string;
  team: Team;
  hp: number;
  maxHp: number;
  out: boolean;
}

/** 头顶的名牌（屏幕坐标，(x, y) 是名牌底边中点）：队色竖条 + 队标、名字、血量数字和条 */
export function nameTag(ctx: CanvasRenderingContext2D, tag: Tag, x: number, y: number, current: boolean): void {
  const w = 78;
  const h = 30;
  const x0 = Math.round(x - w / 2);
  const y0 = Math.round(y - h);
  ctx.save();
  ctx.font = `800 12px ${FONT}`;
  ctx.fillStyle = 'rgba(70,41,26,0.25)';
  ctx.beginPath();
  ctx.roundRect(x0 + 2, y0 + 3, w, h, 6);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.strokeStyle = current ? RED : INK;
  ctx.lineWidth = current ? 2.6 : 1.8;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, 6);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = TEAM[tag.team];
  ctx.fillRect(x0, y0, 15, h);
  ctx.restore();
  ctx.stroke();
  emblem(ctx, tag.team, x0 + 7.5, y0 + h / 2, 5, true);
  ctx.fillStyle = INK;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(tag.name.slice(0, 4), x0 + 19, y0 + 10);
  ctx.textAlign = 'right';
  ctx.fillStyle = TEAM_TEXT[tag.team];
  ctx.fillText(String(tag.hp), x0 + w - 5, y0 + 10);
  hpBar(ctx, tag.team, x0 + 19, y0 + 19, w - 25, 6, tag.hp / tag.maxHp);
  if (tag.out) stamp(ctx, x0 + w / 2 + 6, y0 + h / 2, 0.8);
  ctx.restore();
}

/** "出局"红章 */
export function stamp(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.18);
  ctx.scale(k, k);
  ctx.strokeStyle = RED;
  ctx.fillStyle = 'rgba(255,250,240,0.85)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.roundRect(-26, -13, 52, 26, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = RED;
  ctx.font = `900 16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('出局', 0, 1);
  ctx.restore();
}

/** 队色图钉（缩小时代替角色）：(x, y) 是钉尖，也就是脚底 */
export function pin(ctx: CanvasRenderingContext2D, tag: Tag, x: number, y: number, current: boolean, t: number): void {
  ctx.save();
  const k = current ? 1.25 : 1;
  ctx.translate(x, y);
  if (current) {
    ctx.fillStyle = 'rgba(255,191,26,0.35)';
    ctx.beginPath();
    ctx.arc(0, -16 * k, 18 + Math.sin(t / 200) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.scale(k, k);
  ctx.fillStyle = TEAM[tag.team];
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-4, -8, -11, -11, -11, -18);
  ctx.arc(0, -18, 11, Math.PI, 0);
  ctx.bezierCurveTo(11, -11, 4, -8, 0, 0);
  ctx.fill();
  ctx.stroke();
  emblem(ctx, tag.team, 0, -18, 6, true);
  ctx.restore();
  ctx.save();
  ctx.font = `800 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAPER;
  ctx.strokeText(tag.name.slice(0, 4), x, y - 32 * k);
  ctx.fillStyle = INK;
  ctx.fillText(tag.name.slice(0, 4), x, y - 32 * k);
  hpBar(ctx, tag.team, x - 14, y + 3, 28, 5, tag.hp / tag.maxHp);
  ctx.restore();
}

/** 当前角色头顶的红箭头 */
export function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const b = Math.sin(t / 180) * 3;
  ctx.save();
  ctx.translate(x, y + b);
  ctx.fillStyle = RED;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -16);
  ctx.lineTo(6, -16);
  ctx.lineTo(6, -8);
  ctx.lineTo(12, -8);
  ctx.lineTo(0, 2);
  ctx.lineTo(-12, -8);
  ctx.lineTo(-6, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** 画面外的小牌：贴在屏幕边上，尖角指向它（名字、约几米、一截血量） */
export function edgeTag(ctx: CanvasRenderingContext2D, tag: Tag, x: number, y: number, dirX: number, dirY: number, meters: number | null): void {
  const w = 92;
  const h = 34;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = PAPER;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  // 尖角
  ctx.beginPath();
  const ax = dirX * (w / 2 + 9);
  const ay = dirY * (h / 2 + 9);
  ctx.moveTo(ax, ay);
  ctx.lineTo(dirX ? dirX * (w / 2 - 1) : -7, dirY ? dirY * (h / 2 - 1) : -7);
  ctx.lineTo(dirX ? dirX * (w / 2 - 1) : 7, dirY ? dirY * (h / 2 - 1) : 7);
  ctx.closePath();
  ctx.fillStyle = TEAM[tag.team];
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 8);
  ctx.fill();
  ctx.stroke();
  emblem(ctx, tag.team, -w / 2 + 12, 0, 7);
  ctx.fillStyle = INK;
  ctx.font = `800 12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(meters === null ? tag.name.slice(0, 4) : `${tag.name.slice(0, 3)} ${meters}米`, -w / 2 + 23, -6);
  hpBar(ctx, tag.team, -w / 2 + 23, 4, w - 31, 5, tag.hp / tag.maxHp);
  ctx.restore();
}

/** 当前角色脚下的金光 */
export function glow(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.save();
  const g = ctx.createRadialGradient(0, -20, 4, 0, -20, 34);
  g.addColorStop(0, 'rgba(255,214,90,0.55)');
  g.addColorStop(1, 'rgba(255,214,90,0)');
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.8 + Math.sin(t / 250) * 0.2;
  ctx.beginPath();
  ctx.arc(0, -20, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


/** 一张按像素比画的小画布（CSS 像素 w×h），draw 里用 CSS 像素坐标 */
export function smallCanvas(w: number, h: number, cls: string, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  c.className = cls;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  draw(ctx);
  return c;
}

/** 圆形头像（房间位子、结算表）；team 给了就带队色底和围巾 */
export function portrait(look: Look, team: Team | null, px: number, expr: Expr = 'normal'): HTMLCanvasElement {
  return smallCanvas(px, px, 'dl-face', (ctx) => drawPortrait(ctx, look, px / 2, px / 2, px - 2, { team, expr }));
}

/** 全身（首页、结算的领奖台）：一张小画布，画一只站着的；px 是 CSS 像素边长 */
export function avatar(look: Look, team: Team, px = 48): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  c.width = Math.round(px * dpr);
  c.height = Math.round(px * dpr);
  c.style.width = `${px}px`;
  c.style.height = `${px}px`;
  c.className = 'dl-avatar';
  const ctx = c.getContext('2d')!;
  // 兔耳朵最高到脚底上面 56，脚下的圈往下 5：按 66 高放进画布
  const k = (px / 66) * dpr;
  ctx.setTransform(k, 0, 0, k, (px / 2) * dpr, px * 0.92 * dpr);
  drawChar(ctx, look, team, 1, 'normal', 0);
  return c;
}
