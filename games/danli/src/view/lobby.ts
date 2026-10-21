/**
 * 选桌页（首页，设计稿 v2-lobby / v2-lobby-port）：厨房远景 + 一条面团舞台，六只小动物站两边；标题字、红飘带；
 * "开始游戏"进准备房间，有没打完的单机就多一张"接着上一局"（地图缩略图、对阵、第几轮）；右上角"怎么玩"和静音。
 */
import type { MapId } from '../core/maps.ts';
import { MAPS } from '../core/maps.ts';
import type { Look, Team } from '../core/types.ts';
import { paintBackdrop } from './backdrops.ts';
import { drawChar, type Expr } from './chars.ts';
import { el } from './dom.ts';
import { escapeHtml } from './hud.ts';
import { INK } from './palette.ts';
import { Stage, type StageView } from './stage.ts';
import { mapThumb } from './thumb.ts';
import { titleSvg } from './title.ts';
import { glyphIcon } from './weaponArt.ts';

export interface LobbyOpts {
  homeText: string;
  homeUrl: string;
  /** 能接着打的那一局（没有就是 null） */
  resume: { map: MapId; size: number; round: number } | null;
  muted: boolean;
  onRoom(): void;
  onResume(): void;
  /** 点静音，回新的状态 */
  onMute(): boolean;
}

const HOW = [
  '拖动角色身边的角度盘调角度（往左拖就朝左）',
  '按住"发射"蓄力，松手发射；看顶上的风',
  '每回合 100 点体力：爬和道具共用，用不完就清零',
  '道具：连发、三岔、加力每回合都能选；纸飞机、锅盖每局 2 次',
  '画本很薄：炸塌脚下的地，人会掉下去，掉出画本就出局',
  '两队轮流出手，队里按座位轮；一队全部出局就输，打满 15 轮比剩下的血',
];

type Cast = [Look, Team, number, 1 | -1, Expr, number];

/** 背景：厨房远景，下面一条起伏的面团当舞台，小动物站在上面 */
function paintBg(v: StageView): void {
  const { bg: ctx, port, view } = v;
  const k = port ? 0.62 : 0.56;
  const X0 = port ? 1700 : 1180;
  const Y0 = port ? -320 : -30;
  ctx.save();
  // 设计坐标 → 世界坐标：x 世界 = X0 + x 设计 / k
  ctx.scale(k, k);
  ctx.translate(-X0, -Y0);
  paintBackdrop(ctx, 'kitchen', 3000, 780, { x0: X0 + view.x0 / k - 50, y0: Y0 + view.y0 / k - 50, w: (view.x1 - view.x0) / k + 100, h: (view.y1 - view.y0) / k + 100 });
  ctx.restore();
  const gy = port ? 560 : 326;
  const L = view.x0 - 20;
  const R = view.x1 + 20;
  ctx.beginPath();
  ctx.moveTo(L, gy + 6);
  for (let x = Math.floor(L / 40) * 40; x <= R; x += 40) ctx.quadraticCurveTo(x + 20, gy - 6 + (Math.abs(x / 40) % 2) * 4, x + 40, gy + (Math.abs(x / 40) % 3) * 2);
  ctx.lineTo(R, view.y1 + 20);
  ctx.lineTo(L, view.y1 + 20);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, gy, 0, view.y1);
  g.addColorStop(0, '#fdeccb');
  g.addColorStop(0.6, '#f3d29c');
  g.addColorStop(1, '#e3ab6a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#eba650';
  ctx.stroke();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) {
    const x = view.x0 + ((i * 97) % (view.x1 - view.x0));
    const y = gy + 24 + ((i * 53) % Math.max(10, view.y1 - gy - 30));
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + (i % 3), 2.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const cast: Cast[] = port
    ? [['shiba', 0, 60, 1, 'cheer', 1.7], ['panda', 0, 128, 1, 'normal', 1.7], ['rabbit', 1, 200, -1, 'normal', 1.7], ['cat', 1, 268, -1, 'hurt', 1.7], ['penguin', 0, 330, -1, 'cheer', 1.5]]
    : [['shiba', 0, 70, 1, 'cheer', 1.6], ['panda', 0, 150, 1, 'normal', 1.6], ['mouse', 0, 222, 1, 'normal', 1.45], ['rabbit', 1, 610, -1, 'normal', 1.6], ['cat', 1, 690, -1, 'hurt', 1.6], ['penguin', 1, 770, -1, 'cheer', 1.6]];
  for (const [look, team, x, f, e, s] of cast) {
    ctx.save();
    ctx.translate(x, gy + 10);
    ctx.scale(s, s);
    drawChar(ctx, look, team, f, e, 60);
    ctx.restore();
  }
}

export function renderLobby(host: HTMLElement, o: LobbyOpts): Stage {
  let muted = o.muted;
  const stage = new Stage(host, 'dl-lobby', (v) => {
    paintBg(v);
    const L = v.layer;
    const bar = el('div', 'bar', L);
    const home = el('a', 'dl-btn dl-home', bar);
    home.href = o.homeUrl;
    home.append(glyphIcon('home', 18));
    el('span', '', home, o.homeText);
    el('span', 'sp', bar);
    el('span', 'ver', bar, `v${__DANLI_VERSION__}`);
    const how = el('button', 'dl-btn how', bar);
    how.append(glyphIcon('book', 18));
    el('span', '', how, '怎么玩');
    how.addEventListener('click', () => showHow(host));
    const mute = el('button', 'dl-btn icon dl-mute', bar);
    const paint = (): void => {
      mute.replaceChildren(glyphIcon(muted ? 'mute' : 'sound', 22));
      mute.setAttribute('aria-label', muted ? '打开声音' : '静音');
      mute.classList.toggle('on', muted);
    };
    paint();
    mute.addEventListener('click', () => {
      muted = o.onMute();
      paint();
    });

    const title = el('div', 'title', L);
    title.innerHTML = titleSvg(v.port ? { w: 340, h: 130, size: 74 } : { w: 400, h: 140, size: 82 });
    const rib = el('div', 'ribbon', L, '萌宠 × 厨房道具 · 回合制抛物线大乱斗');
    const acts = el('div', 'acts', L);
    const start = el('button', 'dl-btn go start', acts);
    start.innerHTML = '开始游戏<small>进准备房间 · 1v1 到 3v3</small>';
    start.addEventListener('click', () => o.onRoom());
    if (o.resume) {
      const r = o.resume;
      const b = el('button', 'dl-btn soft resume', acts);
      b.append(mapThumb(r.map, 58, 34, false));
      const t = el('div', '', b);
      t.innerHTML = `<b>接着上一局</b><small>${escapeHtml(MAPS[r.map].name)} · ${r.size}v${r.size}</small>`;
      el('i', 'pg', b, `第 ${r.round} 轮`);
      b.addEventListener('click', () => o.onResume());
    }
    const tips = el('div', 'tips', acts);
    for (const t of ['看风', '调角度', '按住蓄力', '轰出画本就赢']) el('span', '', tips, t);
    const pos = (e: HTMLElement, css: Partial<CSSStyleDeclaration>): void => void Object.assign(e.style, css);
    if (v.port) {
      pos(title, { left: '25px', top: '96px' });
      pos(rib, { left: '62px', top: '262px' });
      pos(acts, { left: '24px', right: '24px', bottom: '34px' });
    } else {
      pos(title, { left: '36px', top: '54px' });
      pos(rib, { left: '70px', top: '206px' });
      pos(acts, { right: '24px', top: '74px', width: '268px' });
      tips.hidden = true;
    }
  });
  return stage;
}

/** "怎么玩"：几句要点 */
function showHow(host: HTMLElement): void {
  const mask = el('div', 'dl-mask how', host);
  const card = el('div', 'dl-card', mask);
  el('h2', '', card, '怎么玩');
  const ul = el('ul', 'dl-how', card);
  for (const line of HOW) el('li', '', ul, line);
  const row = el('div', 'dl-card-row', card);
  el('button', 'dl-btn go', row, '知道了').addEventListener('click', () => mask.remove());
  mask.addEventListener('click', (e) => e.target === mask && mask.remove());
}
