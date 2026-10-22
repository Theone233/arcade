/**
 * 好友房的房间页（DESIGN.md 5.6）：和单机的准备房间（room.ts）长得一样，多了这些：
 * - 顶栏：房间码和"复制链接"，有平台时"叫好友"（kit 的邀请面板）；对阵只有房主能改，别人看着；
 * - 对阵板：蓝、黄两队的位子。真人位子写昵称、"我""房主"、准备了没有、掉线；电脑位子写人物；空位"坐这里"，房主还能"加电脑"；
 * - 右边面板：我的武器、地图（房主能改，别人只看）、给某个位子换（我自己：小动物、武器；房主给电脑换人物、武器、撤掉；房主请人下场）；
 * - 底下：地图条；房主"开打！"（不能开时写原因），别人"准备"/"取消准备"；没上位子的"坐空位"，没坐下的"坐下"（有空座）。
 * 昵称一律走 textContent / escapeHtml。每次房间状态变了整页重画（stage.redraw），右边面板的滚动位置留着。
 */
import type { RoomInfo } from 'arcade-kit/protocol';
import { personaById, PERSONAS } from '../ai/personas.ts';
import { MAP_IDS, MAPS } from '../core/maps.ts';
import { LOOKS, type Look, type Team } from '../core/types.ts';
import { WEAPON_IDS, WEAPONS, type WeaponId } from '../core/weapons.ts';
import { slotOpen, slotTeam, startError, type NetAction, type RoomView, type SlotView } from '../net/rules.ts';
import { LOOK_NAME, portrait } from './chars.ts';
import { el } from './dom.ts';
import { escapeHtml } from './hud.ts';
import { MAP_ART } from './mapArt.ts';
import { TEAM_NAME } from './palette.ts';
import { angleLine, BLAST_NAME, EMB, mapCard, pickedTop, randomCard, weaponCard } from './room.ts';
import { Stage } from './stage.ts';
import { mapThumb } from './thumb.ts';
import { glyphIcon, weaponIcon } from './weaponArt.ts';

export interface FriendRoomData {
  code: string;
  room: RoomInfo | null;
  view: RoomView | null;
  /** 我坐的 kit 座位（没坐下是 null） */
  seat: number | null;
  /** 底下一行提示（等房主、出错了、连接断了） */
  note: string | null;
  /** 我没坐下、房间里还有空座 */
  canSit: boolean;
}

export interface FriendRoomOpts {
  homeText: string;
  muted: boolean;
  data(): FriendRoomData;
  act(a: NetAction): void;
  /** 没坐下的人点"坐下"（kit 的入座） */
  sit(): void;
  copyLink(): void;
  /** 叫好友（有平台、已登录时才有） */
  invite: (() => void) | null;
  onHome(): void;
  onMute(): boolean;
  /** 上一局的结算页（结算阶段回到房间页的人可以再看） */
  onResult(): void;
}

type Tab = 'weapon' | 'map' | 'seat';
/** 编辑中的位子：'me' 我自己，数字是位子（电脑、或者房主看别的真人） */
type Edit = 'me' | number;

const SIZES = [1, 2, 3] as const;

/** 位子上的名字：真人用 kit 座位上的昵称，电脑用人物名 */
export function seatName(room: RoomInfo | null, seat: number): string {
  return room?.seats[seat]?.name ?? '玩家';
}

export function renderFriendRoom(host: HTMLElement, o: FriendRoomOpts): Stage {
  let muted = o.muted;
  let tab: Tab = 'weapon';
  let edit: Edit = 'me';
  /** 右边面板的滚动位置：别人改了东西整页重画时不跳 */
  let keep: { tab: Tab; top: number } | null = null;

  const stage = new Stage(host, 'dl-room dl-friend', (v) => {
    const d = o.data();
    const L = v.layer;
    const port = v.port;
    const view = d.view;
    const room = d.room;
    const amHost = !!view && d.seat !== null && view.host === d.seat;
    const mySlot = view && d.seat !== null ? view.slots.findIndex((x) => x?.k === 'human' && x.seat === d.seat) : -1;
    const me = mySlot >= 0 ? (view!.slots[mySlot] as Extract<SlotView, { k: 'human' }>) : null;
    if (typeof edit === 'number' && (!view || !view.slots[edit] || (view.slots[edit]!.k === 'human' && !amHost))) {
      edit = 'me';
      if (tab === 'seat') tab = 'weapon';
    }
    if (tab === 'seat' && edit === 'me' && !me) tab = 'weapon';

    // 顶栏
    const bar = el('div', 'bar', L);
    const home = el('button', 'dl-btn dl-home', bar);
    home.append(glyphIcon('home', 17));
    el('span', '', home, o.homeText);
    home.addEventListener('click', () => o.onHome());
    el('span', 'ttl', bar, '好友房');
    const code = el('span', 'code', bar);
    el('small', '', code, '房间码');
    el('b', '', code, d.code);
    const tools = el('span', 'tools');
    const copy = el('button', 'dl-btn soft copy', tools, '复制链接');
    copy.addEventListener('click', () => o.copyLink());
    if (o.invite) el('button', 'dl-btn soft invite', tools, '叫好友').addEventListener('click', () => o.invite!());
    const seg = el('span', `dl-seg${amHost ? '' : ' ro'}`);
    for (const n of SIZES) {
      const on = view?.format === n;
      const b = el('button', on ? 'on' : '', seg, `${n}v${n}`);
      b.dataset.size = String(n);
      b.setAttribute('aria-pressed', String(on));
      if (amHost) b.addEventListener('click', () => !on && o.act({ t: 'format', n }));
      else b.disabled = true;
    }
    if (!port) {
      bar.append(tools);
      el('span', 'sp', bar);
      bar.append(seg);
    } else el('span', 'sp', bar);
    const mute = el('button', 'dl-btn icon dl-mute', bar);
    mute.style.width = mute.style.height = '36px';
    const paintMute = (): void => {
      mute.replaceChildren(glyphIcon(muted ? 'mute' : 'sound', 20));
      mute.setAttribute('aria-label', muted ? '打开声音' : '静音');
      mute.classList.toggle('on', muted);
    };
    paintMute();
    mute.addEventListener('click', () => {
      muted = o.onMute();
      paintMute();
    });
    if (port) {
      const r2 = el('div', 'bar2', L);
      el('b', '', r2, '对阵');
      r2.append(seg, el('span', 'sp'), tools);
    }

    // 对阵板
    const board = el('div', 'board dl-card', L);
    Object.assign(board.style, port ? { left: '12px', right: '12px', top: '100px', height: '250px' } : { left: '12px', top: '56px', width: '384px', height: '262px' });
    const rowH = port ? '104px' : '96px';
    for (const team of [0, 1] as const) {
      if (team === 1) board.insertAdjacentHTML('beforeend', '<div class="vs"><i></i><b>VS</b><i></i></div>');
      const row = el('div', `row t${team}`, board);
      row.style.height = rowH;
      const side = el('div', 'side', row);
      side.innerHTML = `${EMB[team]}${TEAM_NAME[team]}`;
      for (let k = 0; k < 3; k++) {
        const i = team * 3 + k;
        if (view && slotOpen(view.format, i)) slot(row, team, i, view, room, d.seat, amHost);
      }
    }
    if (view) {
      const bench = view.bench.map((b) => seatName(room, b.seat));
      const n = el('div', 'note bench', board);
      n.textContent = bench.length ? `看台：${bench.join('、')}` : port ? '' : amHost ? '点空位加电脑；点电脑换人物、换武器' : '点空位坐下，点自己的位子换小动物和武器';
    }

    // 右边（竖屏在下面）的面板
    const panel = el('div', 'panel', L);
    Object.assign(panel.style, port ? { left: '12px', right: '12px', top: '356px', height: '368px' } : { left: '404px', top: '52px', width: '428px', height: '268px' });
    const tabs = el('div', 'tabs', panel);
    const tabBtn = (t: Tab, label: string, small: string): void => {
      const b = el('button', tab === t ? 'on' : '', tabs);
      b.dataset.tab = t;
      b.innerHTML = `${escapeHtml(label)}${small ? `<small>${escapeHtml(small)}</small>` : ''}`;
      b.addEventListener('click', () => {
        tab = t;
        stage.redraw();
      });
    };
    const mapName = !view ? '' : view.map === 'random' ? '随机地图' : MAPS[view.map].name;
    if (tab === 'seat' && view) tabBtn('seat', edit === 'me' ? '换小动物' : `给 ${slotName(view, room, edit)} 换`, '');
    tabBtn('weapon', '我的武器', tab === 'seat' || !me ? '' : WEAPONS[me.weapon].name);
    tabBtn('map', '地图', tab === 'seat' ? '' : mapName);
    const sheet = el('div', 'sheet dl-card', panel);
    if (!view) el('p', 'empty', sheet, '正在进房间…');
    else if (tab === 'weapon') {
      if (!me) el('p', 'empty', sheet, d.seat === null ? '你在旁观。坐下以后再选武器。' : '你在看台上。点一个空位坐下，再选武器。');
      else {
        const grid = el('div', 'wgrid', sheet);
        grid.style.gridTemplateColumns = `repeat(${port ? 2 : 3}, minmax(0, 1fr))`;
        for (const id of WEAPON_IDS) weaponCard(grid, id, me.weapon === id, () => o.act({ t: 'weapon', weapon: id }));
      }
    } else if (tab === 'map') {
      if (!amHost) el('p', 'hint', sheet, '地图是房主选的，你这里只能看');
      const grid = el('div', 'wgrid mapgrid', sheet);
      grid.style.gridTemplateColumns = `repeat(${port ? 2 : 3}, minmax(0, 1fr))`;
      for (const id of MAP_IDS) mapCard(grid, id, view.map === id, amHost ? () => o.act({ t: 'map', map: id }) : null);
      randomCard(grid, view.map === 'random', amHost ? () => o.act({ t: 'map', map: 'random' }) : null);
    } else pick(sheet, view, room, me, amHost);
    sheet.scrollTop = keep && keep.tab === tab ? keep.top : tab === 'seat' ? 0 : pickedTop(sheet);
    sheet.addEventListener('scroll', () => (keep = { tab, top: sheet.scrollTop }));

    // 底下：地图条、开打 / 准备
    const foot = el('div', 'foot', L);
    Object.assign(foot.style, port ? { left: '12px', right: '12px', bottom: '14px', height: '96px', flexDirection: 'column', alignItems: 'stretch', gap: '4px' } : { left: '12px', right: '12px', top: '326px', height: '56px' });
    if (!port && view) {
      const chip = el('button', 'mapchip', foot);
      if (view.map === 'random') {
        const dice = el('span', 'dice', chip);
        dice.append(glyphIcon('dice', 30, '#e2432a'));
      } else chip.append(mapThumb(view.map, 70, 38, false));
      const t = el('span', '', chip);
      t.innerHTML = view.map === 'random' ? `<b>随机地图</b><small>开打时才揭晓</small>` : `<b>${escapeHtml(mapName)}</b><small>${escapeHtml(MAP_ART[view.map].card.short)}</small>`;
      chip.addEventListener('click', () => {
        tab = 'map';
        stage.redraw();
      });
    }
    const say = el('div', 'say', foot);
    if (!port) say.style.flex = '1';
    const go = el('button', 'dl-btn go fight dl-room-go', foot);
    if (port) go.style.height = '62px';
    else Object.assign(go.style, { width: '232px', height: '58px' });
    let line = d.note ?? '';
    if (!view) {
      go.innerHTML = '进房间…';
      go.disabled = true;
    } else if (view.phase === 'result' && !amHost && me?.ready) {
      line ||= '上一局打完了，等房主开下一局';
    }
    if (view) {
      const bad = startError(view);
      if (amHost) {
        go.innerHTML = `开打！<small>${view.format}v${view.format}${port ? ` · ${escapeHtml(mapName)}` : ''}</small>`;
        go.dataset.act = 'start';
        go.classList.toggle('wait', !!bad);
        go.addEventListener('click', () => o.act({ t: 'start' }));
        if (bad && !line) line = bad === 'not_ready' ? `等 ${notReady(view, room).join('、')} 准备` : '两队都要有人（真人或电脑）才能开打';
      } else if (me) {
        go.innerHTML = me.ready ? `取消准备<small>已经准备好了</small>` : `准备<small>选好小动物和武器</small>`;
        go.dataset.act = me.ready ? 'unready' : 'ready';
        go.classList.toggle('soft-go', me.ready);
        go.addEventListener('click', () => o.act({ t: 'ready', on: !me.ready }));
        if (!line) line = me.ready ? '等房主开打' : '选好了点"准备"';
      } else if (d.seat !== null) {
        const free = view.slots.findIndex((x, i) => x === null && slotOpen(view.format, i));
        go.innerHTML = `坐空位<small>${free >= 0 ? '上场一起打' : '位子满了'}</small>`;
        go.dataset.act = 'sit-slot';
        go.disabled = free < 0;
        go.addEventListener('click', () => free >= 0 && o.act({ t: 'sit', slot: free }));
      } else {
        go.innerHTML = `坐下<small>${d.canSit ? '进来一起打' : '人满了，只能看'}</small>`;
        go.dataset.act = 'sit';
        go.disabled = !d.canSit;
        go.addEventListener('click', () => o.sit());
      }
      if (view.phase === 'result') {
        const back = el('button', 'dl-btn soft see', say, '看上一局');
        back.addEventListener('click', () => o.onResult());
      }
    }
    el('span', 'line', say, line);
  });

  /** 位子上的名字 */
  function slotName(view: RoomView, room: RoomInfo | null, i: number): string {
    const x = view.slots[i];
    if (!x) return '空位';
    return x.k === 'human' ? seatName(room, x.seat) : personaById(x.persona)!.name;
  }

  /** 一个位子：头像、名字、你/真人/电脑、准备了没有、武器条；空位是"坐这里""加电脑" */
  function slot(row: HTMLElement, team: Team, i: number, view: RoomView, room: RoomInfo | null, mySeat: number | null, amHost: boolean): void {
    const x = view.slots[i];
    if (!x) {
      const b = el('div', 'dl-slot empty', row);
      b.dataset.slot = String(i);
      el('span', 'hole', b, '空位');
      const acts = el('div', 'acts', b);
      if (mySeat !== null) el('button', 'dl-btn soft sitbtn', acts, '坐这里').addEventListener('click', () => o.act({ t: 'sit', slot: i }));
      if (amHost) el('button', 'dl-btn soft botbtn', acts, '加电脑').addEventListener('click', () => o.act({ t: 'addbot', slot: i }));
      return;
    }
    const mine = x.k === 'human' && x.seat === mySeat;
    const editable = mine || (amHost && (x.k === 'bot' || x.seat !== mySeat));
    const b = el('button', `dl-slot${mine ? ' me' : ''}${tab === 'seat' && edit === (mine ? 'me' : i) ? ' editing' : ''}`, row);
    b.dataset.slot = String(i);
    b.dataset.kind = x.k;
    if (mine) el('i', 'metag', b, '我');
    else if (x.k === 'human' && x.seat === view.host) el('i', 'metag hosttag', b, '房主');
    if (editable) el('span', 'edit', b).append(glyphIcon('pencil', 14));
    const who = el('div', 'who', b);
    who.append(portrait(x.look, team, 38));
    const t = el('div', '', who);
    const name = x.k === 'human' ? seatName(room, x.seat) : personaById(x.persona)!.name;
    el('b', '', t, name).title = name;
    const seatInfo = x.k === 'human' ? room?.seats[x.seat] : null;
    const small = el('small', '', t, x.k === 'bot' ? '电脑' : `${LOOK_NAME[x.look]} · ${mine ? '你' : '真人'}`);
    if (seatInfo?.away) {
      small.textContent = '掉线了';
      small.classList.add('away');
    }
    const arm = el('div', 'arm', b);
    arm.append(weaponIcon(x.weapon, 20));
    el('span', '', arm, WEAPONS[x.weapon].name);
    if (x.k === 'human') {
      const st = x.seat === view.host ? null : x.ready ? '准备了' : '没准备';
      if (st) el('i', `ready${x.ready ? ' on' : ''}`, b, st);
    }
    if (editable)
      b.addEventListener('click', () => {
        tab = 'seat';
        edit = mine ? 'me' : i;
        keep = null;
        stage.redraw();
      });
    else b.disabled = true;
  }

  /** 给位子换：我自己换小动物和武器；房主给电脑换人物、武器、撤掉；房主请别的真人下场 */
  function pick(sheet: HTMLElement, view: RoomView, room: RoomInfo | null, me: Extract<SlotView, { k: 'human' }> | null, amHost: boolean): void {
    const box = el('div', 'pick', sheet);
    const target = edit === 'me' ? me : view.slots[edit];
    if (!target) return;
    const team: Team = edit === 'me' ? slotTeam(view.slots.indexOf(target)) : slotTeam(edit);
    const used = new Map<Look, SlotView>();
    view.slots.forEach((x, i) => x && slotOpen(view.format, i) && used.set(x.look, x));
    const foot = (lineHtml: string, extra: HTMLButtonElement[] = []): void => {
      const f = el('div', 'pickfoot', box);
      el('div', 'line', f).innerHTML = lineHtml;
      f.append(...extra);
      el('button', 'dl-btn', f, '好了').addEventListener('click', () => {
        tab = 'weapon';
        edit = 'me';
        stage.redraw();
      });
    };
    if (target.k === 'human' && edit !== 'me') {
      // 房主看别的真人：只能请他下场（掉线、不准备时用）
      const name = seatName(room, target.seat);
      box.insertAdjacentHTML('beforeend', `<h4>${escapeHtml(name)}<small>${room?.seats[target.seat]?.away ? '掉线了' : target.ready ? '准备好了' : '还没准备'}</small></h4>`);
      el('p', 'hint', box, '他一直不准备、掉线了，可以请他先下场看（他点空位还能再坐回来）。');
      const kick = el('button', 'dl-btn soft kick', box, '请他下场看');
      kick.addEventListener('click', () => o.act({ t: 'kick', slot: edit as number }));
      foot('');
      return;
    }
    const bot = target.k === 'bot' ? target : null;
    box.insertAdjacentHTML('beforeend', `<h4>${bot ? '人物' : '小动物'}<small>同一只小动物一局只上一次${bot ? '，点在场的电脑就和它对调' : '；电脑在用的就和它对调'}</small></h4>`);
    const faces = el('div', 'faces', box);
    for (const look of LOOKS) {
      const p = PERSONAS.find((x) => x.look === look)!;
      const holder = used.get(look);
      // 别的真人在用的点不了；电脑在用的就和它对调
      const taken = !!holder && holder !== target && holder.k === 'human';
      const f = el('button', look === target.look ? 'on' : holder ? 'used' : '', faces);
      f.dataset.look = look;
      f.dataset.persona = p.id;
      f.append(portrait(look, team, 40));
      el('span', '', f, bot ? p.name : LOOK_NAME[look]);
      if (taken) f.disabled = true;
      f.addEventListener('click', () => o.act(bot ? { t: 'setbot', slot: edit as number, persona: p.id } : { t: 'look', look }));
    }
    const weaponNow = target.weapon;
    const fav = bot ? personaById(bot.persona)! : null;
    box.insertAdjacentHTML('beforeend', `<h4>武器<small>${bot ? `电脑按性格挑的是${escapeHtml(WEAPONS[fav!.weapons[0]].name)}，你可以替它换` : '开局后不能换'}</small></h4>`);
    const arms = el('div', 'arms', box);
    for (const id of WEAPON_IDS) {
      const a = el('button', id === weaponNow ? 'on' : '', arms);
      a.dataset.weapon = id;
      a.append(weaponIcon(id, 26));
      el('span', '', a, WEAPONS[id].short);
      a.title = WEAPONS[id].name;
      a.addEventListener('click', () => o.act(bot ? { t: 'setbot', slot: edit as number, weapon: id as WeaponId } : { t: 'weapon', weapon: id }));
    }
    const w = WEAPONS[weaponNow];
    const who = bot ? `<b>${escapeHtml(fav!.name)}</b>：${escapeHtml(fav!.line)}` : `<b>${escapeHtml(LOOK_NAME[target.look])}</b>的样子`;
    const extra: HTMLButtonElement[] = [];
    if (bot && amHost) {
      const del = el('button', 'dl-btn soft delbot', undefined, '撤掉');
      const at = edit as number;
      del.addEventListener('click', () => {
        tab = 'weapon';
        edit = 'me';
        o.act({ t: 'delbot', slot: at });
      });
      extra.push(del);
    }
    foot(`${who}<br>${escapeHtml(w.name)}：攻 ${w.atk} 防 ${w.def} · ${BLAST_NAME[w.blast]}范围 · ${escapeHtml(angleLine(w))}`, extra);
  }

  return stage;
}

/** 还没准备的真人（房主不算） */
function notReady(v: RoomView, room: RoomInfo | null): string[] {
  return v.slots.flatMap((x, i) => (x?.k === 'human' && slotOpen(v.format, i) && x.seat !== v.host && !x.ready ? [seatName(room, x.seat)] : []));
}
