/**
 * 结算页（设计稿 v2-result）：背景是这张图的远景，左边赢的一队站在一笼大蒸笼上（撒彩纸），大字"蓝队赢啦！"；
 * 右边一张表：谁、伤害（条和"最多"）、命中、轰出画本、结果章（剩多少血 / 掉出画本 / 血量打空）；
 * 上面一行：地图 · 对阵 · 打了几轮，掉出画本几人 · 血量打空几人；底下"再来一局""回房间""大厅"。
 * 统计在 stats.ts（按存档重放算的）。竖屏照同样的东西上下排。
 */
import { MAPS } from '../core/maps.ts';
import { roundLimit, teamHp } from '../core/rules.ts';
import type { Char, Team } from '../core/types.ts';
import { WEAPONS } from '../core/weapons.ts';
import type { GameStats } from '../stats.ts';
import { paintBackdrop } from './backdrops.ts';
import { drawChar, portrait } from './chars.ts';
import { el } from './dom.ts';
import { escapeHtml } from './hud.ts';
import { MAP_ART } from './mapArt.ts';
import { FONT, INK, TEAM, TEAM_NAME } from './palette.ts';
import { Stage, type StageView } from './stage.ts';
import { glyphIcon, weaponIcon } from './weaponArt.ts';

export interface ResultOpts {
  stats: GameStats;
  homeText: string;
  homeUrl: string;
  onAgain(): void;
  onRoom(): void;
  onHome(): void;
}

/** 大字：纸色外描边 + 深褐描边 + 往右下的影子 */
function bigText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill: string, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(70,41,26,.35)';
  ctx.fillText(s, 4, 5);
  ctx.strokeStyle = '#fffaf0';
  ctx.lineWidth = 14;
  ctx.strokeText(s, 0, 0);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.strokeText(s, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(s, 0, 0);
  ctx.restore();
}

/** 一笼大蒸笼当领奖台，赢的一队站上面欢呼 */
function podium(ctx: CanvasRenderingContext2D, px: number, py: number, team: Team, chars: readonly Char[], happy: boolean): void {
  ctx.fillStyle = '#e6cc78';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.roundRect(px - 120, py, 240, 64, 10);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#a8902c';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (const y of [py + 20, py + 40]) {
    ctx.moveTo(px - 118, y);
    ctx.lineTo(px + 118, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#d6b65c';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.roundRect(px - 128, py - 10, 256, 16, 6);
  ctx.fill();
  ctx.stroke();
  const slots = chars.length === 1 ? [[0, 1.9]] : chars.length === 2 ? [[-50, 1.7], [50, 1.7]] : [[-78, 1.5], [0, 1.9], [78, 1.5]];
  // 中间那个位置给第一个（座位 1 号），两边是队友
  const order = chars.length === 3 ? [chars[1]!, chars[0]!, chars[2]!] : chars;
  order.forEach((c, i) => {
    const [dx, s] = slots[i]!;
    ctx.save();
    ctx.translate(px + dx!, py - 10);
    ctx.scale(s!, s!);
    drawChar(ctx, c.look, team, dx! > 0 ? -1 : 1, happy ? 'cheer' : 'normal', 60);
    ctx.restore();
  });
  if (!happy) return;
  const cs = ['#e2432a', '#2f78e0', '#ffbf1a', '#57b043', '#f27cb0'];
  for (let i = 0; i < 46; i++) {
    const x = px - 126 + ((i * 89) % 262);
    const y = py - 280 + ((i * 53) % 200);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(i);
    ctx.fillStyle = cs[i % 5]!;
    ctx.fillRect(-4, -2, 8, 4);
    ctx.restore();
  }
}

export function renderResult(host: HTMLElement, o: ResultOpts): Stage {
  const { stats } = o;
  const s = stats.state;
  const me = s.chars.find((c) => !c.ai)!;
  const size = Math.max(s.chars.filter((c) => c.team === 0).length, s.chars.filter((c) => c.team === 1).length);
  const won = s.winner;
  const win = won === me.team;
  const foeTeam = (1 - me.team) as Team;
  const foes = s.chars.filter((c) => c.team === foeTeam);
  const fellAll = foes.every((c) => stats.players[c.id]!.end === 'fall');
  const says =
    won === null
      ? `打满 ${roundLimit(s.setup)} 轮，两队剩下的血一样多`
      : s.endBy === 'turns'
        ? `打满 ${roundLimit(s.setup)} 轮比血量：蓝 ${teamHp(s, 0)} : 黄 ${teamHp(s, 1)}`
        : win
          ? fellAll
            ? size === 1
              ? `你把${foes[0]!.name}送出了画本`
              : '你这队把对面全送出了画本'
            : `${TEAM_NAME[foeTeam]}全部出局了`
          : size === 1
            ? me.hp <= 0
              ? '你的血量打空了，再来一局？'
              : '你掉出了画本，再来一局？'
            : `${TEAM_NAME[me.team]}全部出局了，再来一局？`;
  const mapName = MAPS[s.setup.map].name;

  return new Stage(host, 'dl-result', (v: StageView) => {
    const { bg: ctx, port, view } = v;
    // 背景：这张图的远景（世界 1050..2850 那一段）
    const k = port ? 0.62 : 0.5;
    const X0 = port ? 1200 : 1100;
    const Y0 = port ? -260 : -80;
    ctx.save();
    ctx.scale(k, k);
    ctx.translate(-X0, -Y0);
    paintBackdrop(ctx, MAP_ART[s.setup.map].theme, 3000, 780, { x0: X0 + view.x0 / k - 50, y0: Y0 + view.y0 / k - 50, w: (view.x1 - view.x0) / k + 100, h: (view.y1 - view.y0) / k + 100 });
    ctx.restore();
    const showTeam: Team = won ?? me.team;
    const px = port ? 195 : 140;
    const py = port ? 380 : 300;
    podium(ctx, px, py, showTeam, s.chars.filter((c) => c.team === showTeam), won !== null);
    const title = won === null ? null : TEAM_NAME[won];
    if (title) {
      bigText(ctx, title, port ? 130 : 84, port ? 150 : 72, 46, TEAM[won!], -0.08);
      bigText(ctx, '赢啦！', port ? 230 : 172, port ? 208 : 136, 58, '#ffbf1a', 0.05);
    } else bigText(ctx, '平局', port ? 195 : 140, port ? 190 : 120, 58, '#ffbf1a', -0.04);

    const L = v.layer;
    const sayEl = el('div', 'says', L);
    const sayText = el('span', '', sayEl, says);
    Object.assign(sayEl.style, port ? { left: '12px', right: '12px', top: '226px' } : { left: '12px', width: '256px', top: '156px' });
    // 一行放下：字多就把字号收小（横屏这一栏只有 256 宽）
    sayText.style.fontSize = `${Math.max(10, Math.min(13, Math.floor((port ? 340 : 232) / says.length)))}px`;
    // 竖屏：说明条和表格一起贴在按钮上面，几个人都不留空
    const box = port ? el('div', 'pbox', L) : L;
    if (port) Object.assign(box.style, { position: 'absolute', left: '12px', right: '12px', bottom: '82px', display: 'flex', flexDirection: 'column', gap: '8px' });
    const head = el('div', 'head', box);
    if (port) Object.assign(head.style, { position: 'static' });
    else Object.assign(head.style, { left: '290px', right: '12px', top: '8px', height: '82px' });
    const sub = el('div', 'sub', head);
    sub.innerHTML = `${escapeHtml(mapName)} · ${size}v${size} · 打了 <b>${s.round}</b> 轮<br>掉出画本 <b>${stats.falls}</b> 人 · 血量打空 <b>${stats.busts}</b> 人`;

    const tbl = el('div', 'tbl dl-card', box);
    Object.assign(tbl.style, port ? { position: 'static' } : { left: '290px', right: '12px', top: '92px' });
    const max = Math.max(1, ...stats.players.map((p) => p.dmg));
    const barW = port ? 26 : 86;
    const rows = s.chars
      .slice()
      .sort((a, b) => a.team - b.team || a.id - b.id)
      .map((c, i, all) => {
        const p = stats.players[c.id]!;
        const sep = i + 1 < all.length && all[i + 1]!.team !== c.team;
        const st = p.end === 'alive' ? `剩 ${p.hp}` : p.end === 'fall' ? '掉出画本' : '血量打空';
        return {
          c,
          html:
            `<td class="whoc"></td>` +
            `<td><div class="dmg"><b>${p.dmg}</b>${p.dmg ? `<i style="width:${Math.max(3, Math.round((barW * p.dmg) / max))}px;background:${TEAM[c.team]}"></i>` : ''}${p.dmg === max && p.dmg > 0 ? '<i class="mvp">最多</i>' : ''}</div></td>` +
            `<td>${p.hits}/${p.shots}</td>` +
            `<td>${p.kos ? `<b style="font-size:15px">${p.kos}</b> 人` : '<span class="nil">—</span>'}</td>` +
            `<td><span class="st ${p.end}">${st}</span></td>`,
          sep,
        };
      });
    const table = el('table', '', tbl);
    table.innerHTML = `<tr><th>谁</th><th class="l" style="padding-left:6px">伤害</th><th>命中</th><th>${port ? '轰出' : '轰出画本'}</th><th>结果</th></tr>`;
    for (const r of rows) {
      const tr = el('tr', `t${r.c.team}${r.sep ? ' sep' : ''}`, table);
      tr.dataset.id = String(r.c.id);
      tr.innerHTML = r.html;
      const who = el('div', 'who', tr.querySelector('.whoc') as HTMLElement);
      const p = stats.players[r.c.id]!;
      const happy = won === null ? 'normal' : r.c.team === won ? 'cheer' : 'hurt';
      who.append(portrait(r.c.look, r.c.team, 28, p.end === 'alive' ? happy : 'hurt'));
      const t = el('div', '', who);
      t.innerHTML = `${escapeHtml(r.c.name)}${r.c.ai ? '' : '<i class="mvp me">我</i>'}`;
      const sm = el('small', '', t);
      sm.append(weaponIcon(r.c.weapon, 13));
      el('span', '', sm, WEAPONS[r.c.weapon].name);
    }

    const acts = el('div', 'acts', L);
    Object.assign(acts.style, port ? { left: '12px', right: '12px', bottom: '18px' } : { left: '290px', right: '12px', bottom: '10px' });
    el('button', 'dl-btn go end-again', acts, '再来一局').addEventListener('click', () => o.onAgain());
    el('button', 'dl-btn soft end-room', acts, '回房间').addEventListener('click', () => o.onRoom());
    const home = el('button', 'dl-btn end-home', acts);
    home.append(glyphIcon('home', 17));
    el('span', '', home, o.homeText);
    home.addEventListener('click', () => o.onHome());
  });
}
