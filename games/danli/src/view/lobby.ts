/**
 * 选桌页（M1）：一张图（厨房面团岛）、你对电脑、"单机开打"；有没打完的单机就多一个"接着上一局"。
 * 选武器的备战页、电脑强弱 M2 再做。
 */
import { buildTerrain, KITCHEN } from '../core/maps.ts';
import { MAT_MASK } from '../core/terrain.ts';
import { weapon } from '../core/weapons.ts';
import { LOOK_NAME } from './chars.ts';
import { el } from './dom.ts';
import { emblemSvg, escapeHtml } from './hud.ts';

export interface LobbyOpts {
  myName: string;
  botName: string;
  homeText: string;
  homeUrl: string;
  canResume: boolean;
  onStart(): void;
  onResume(): void;
}

let thumb: HTMLCanvasElement | null = null;

/** 地图缩略图：地形网格一格一个像素，下面一层雾 */
function mapThumb(): HTMLCanvasElement {
  if (thumb) return thumb;
  const t = buildTerrain(KITCHEN);
  const c = document.createElement('canvas');
  c.width = t.cols;
  c.height = t.rows;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, t.rows);
  g.addColorStop(0, '#efe8dc');
  g.addColorStop(0.6, '#e4dccd');
  g.addColorStop(1, '#a9abbe');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, t.cols, t.rows);
  const img = ctx.getImageData(0, 0, t.cols, t.rows);
  for (let r = 0; r < t.rows; r++) {
    for (let col = 0; col < t.cols; col++) {
      const v = t.cells[r * t.cols + col]! & MAT_MASK;
      if (!v) continue;
      const above = r > 0 && t.cells[(r - 1) * t.cols + col]! & MAT_MASK;
      const i = (r * t.cols + col) * 4;
      const [R, G, B] = above ? [248 - r / 3, 223 - r / 2.5, 178 - r / 2] : [70, 41, 26];
      img.data[i] = R;
      img.data[i + 1] = G;
      img.data[i + 2] = B;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  thumb = c;
  return c;
}

export function renderLobby(host: HTMLElement, o: LobbyOpts): HTMLElement {
  const root = el('div', 'dl-lobby', host);
  const bar = el('div', 'dl-lobby-bar', root);
  const home = el('a', 'dl-home', bar);
  home.href = o.homeUrl;
  home.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z"/></svg><span>${escapeHtml(o.homeText)}</span>`;
  el('span', 'dl-version', bar, `v${__DANLI_VERSION__}`);

  const main = el('div', 'dl-lobby-main', root);
  const head = el('div', 'dl-lobby-head', main);
  el('h1', '', head, '弹里个弹');
  el('p', '', head, '萌宠和厨房道具大乱斗：看风、调角度、按住蓄力，把对手打空血量或轰出画本');

  const card = el('div', 'dl-map-card', main);
  const pic = el('div', 'dl-map-pic', card);
  pic.appendChild(mapThumb());
  const info = el('div', 'dl-map-info', card);
  el('b', '', info, KITCHEN.name);
  el('span', '', info, KITCHEN.line);

  const w = weapon('steamer');
  const vs = el('div', 'dl-vs', main);
  const side = (team: 0 | 1, name: string, who: string): void => {
    const s = el('div', `dl-side t${team}`, vs);
    s.innerHTML = `${emblemSvg(team)}<div><b>${escapeHtml(name)}</b><small>${escapeHtml(who)} · ${escapeHtml(w.name)}</small></div>`;
  };
  side(0, o.myName, `你 · ${LOOK_NAME.shiba}`);
  el('span', 'dl-vs-mark', vs, 'VS');
  side(1, o.botName, '电脑');

  const acts = el('div', 'dl-lobby-acts', main);
  if (o.canResume) el('button', 'dl-btn soft', acts, '接着上一局').addEventListener('click', () => o.onResume());
  el('button', 'dl-btn go big', acts, '单机开打').addEventListener('click', () => o.onStart());

  const how = el('ul', 'dl-how', main);
  for (const line of [
    '拖动角色身边的角度盘调角度（往左拖就朝左）',
    '按住"发射"蓄力，松手发射；看顶上的风',
    '每回合 100 点体力：爬和道具共用，用不完就清零',
    '道具：连发、三岔、加力每回合都能选；纸飞机、锅盖每局 2 次',
    '画本很薄：炸塌脚下的地，人会掉下去，掉出画本就出局',
  ])
    el('li', '', how, line);
  return root;
}
