/**
 * 规则核心（DESIGN.md 第 2 节）：纯函数、确定性。输入状态和操作，输出新状态和事件；不碰 DOM、网络、Math.random、Date、三角函数。
 * 随机只用 arcade-kit/rng 的 ChaCha20 按用途分流：'open' 开局（出生点、谁先手），'wind' 每回合的风（序号是回合数）。
 *
 * 一回合：轮到的角色先爬（耗体力）、调朝向，然后带着这回合选的道具发射（道具也耗体力，和爬共用这回合的 100 点）。
 * 炮弹落地或打中人就爆炸：挖坑、扣血、推开、掉落、出局；连发一颗一颗算（前一颗的坑、掉落会影响后一颗），三岔三颗同时飞、按落地先后炸；
 * 纸飞机不炸，人瞬移到落点。然后换下一个：两队交替出手，队内按座位轮；一队全部出局就输；打满 MAX_TURNS 回合按全队剩余血量总和定胜负。
 */
import { shuffle, stream, type Entropy } from 'arcade-kit/rng';
import { idiv, isqrt } from './fixed.ts';
import { FORK_SPREAD, loadoutCost, loadoutError, MODES, PLAIN, shotScale, SPECIALS, type Loadout } from './items.ts';
import { buildTerrain, MAPS, type MapDef } from './maps.ts';
import { BODY_CY, BODY_H, BODY_R, launch, simulate, type Shot } from './physics.ts';
import { carve, cloneTerrain, solidAt, type Terrain } from './terrain.ts';
import type { Action, Char, Dir, Ev, FireAction, Flight, OutWhy, Setup, State, Step, Team } from './types.ts';
import { blastDamage, weapon } from './weapons.ts';

/** 血量上限（0.1.0 平衡调整：DESIGN.md 2.6 定 150，模拟器调到 180，见 README"数值"） */
export const MAX_HP = 180;
export const MAX_STAMINA = 100;
export const MAX_TURNS = 30;
/** 爬一步走多远（一格） */
export const STEP = 4;
/** 平地爬一步扣几点体力；往上每 2 单位高差再加 1 */
export const STEP_COST = 2;
/** 一步最多往上、往下多少（再高就爬不上去；再低就是悬崖，停住不走） */
export const MAX_UP = 12;
export const MAX_DOWN = 12;
/** 爆心推开的最远距离 */
export const PUSH = 24;
/** 摔多高以内不扣血；再高每 10 单位扣 1，最多 FALL_MAX */
export const FALL_SAFE = 60;
export const FALL_MAX = 20;

export function mapOf(s: Pick<State, 'setup'>): MapDef {
  return MAPS[s.setup.map];
}

export function windFor(key: Entropy, turn: number): number {
  return stream(key, 'wind', turn).below(11) - 5;
}

/** 脚下有没有地：脚底中间和左右各 3 个单位，有一处是地就站得住 */
export function supported(t: Terrain, x: number, y: number): boolean {
  return solidAt(t, x - 3, y) || solidAt(t, x, y) || solidAt(t, x + 3, y);
}

function bodyClear(t: Terrain, x: number, y: number): boolean {
  return !solidAt(t, x, y - 1) && !solidAt(t, x, y - BODY_CY) && !solidAt(t, x, y - BODY_H);
}

/** (x, y) 能不能站人：脚底是地、上面站得下 */
function standable(t: Terrain, x: number, y: number): boolean {
  return solidAt(t, x, y) && bodyClear(t, x, y);
}

export function newGame(key: Entropy, setup: Setup): State {
  const m = MAPS[setup.map];
  const terrain = buildTerrain(m);
  const open = stream(key, 'open');
  const slots = [shuffle(m.spawns[0], open), shuffle(m.spawns[1], open)];
  const used = [0, 0];
  const chars: Char[] = setup.players.map((p, id) => {
    const x = slots[p.team]![used[p.team]!++ % slots[p.team]!.length]!;
    let y = 0;
    while (y < m.height && !solidAt(terrain, x, y)) y++;
    return {
      id,
      name: p.name,
      team: p.team,
      look: p.look,
      weapon: p.weapon,
      ai: p.ai,
      x,
      y,
      hp: MAX_HP,
      out: false,
      facing: x < m.width / 2 ? 1 : -1,
      angle: 45,
      power: null,
      special: { plane: SPECIALS.plane.perGame, lid: SPECIALS.lid.perGame },
    };
  });
  const first = open.below(2) as Team;
  const s: State = { v: 1, key, setup, terrain, chars, turn: 1, actor: -1, wind: 0, stamina: MAX_STAMINA, lastOf: [-1, -1], phase: 'play', winner: null, endBy: null };
  s.actor = nextOf(s, first);
  s.wind = windFor(key, 1);
  return s;
}

/** 这队下一个该出手的（座位顺序轮，跳过出局的）；全队出局回 -1 */
function nextOf(s: State, team: Team): number {
  const members = s.chars.filter((c) => c.team === team).map((c) => c.id);
  const at = members.indexOf(s.lastOf[team]);
  for (let k = 1; k <= members.length; k++) {
    const id = members[(at + k + members.length) % members.length]!;
    if (!s.chars[id]!.out) return id;
  }
  return -1;
}

export function alive(s: State, team: Team): Char[] {
  return s.chars.filter((c) => c.team === team && !c.out);
}

export function teamHp(s: State, team: Team): number {
  return alive(s, team).reduce((n, c) => n + c.hp, 0);
}

function copy(s: State): State {
  return { ...s, chars: s.chars.map((c) => ({ ...c, special: { ...c.special } })), lastOf: [s.lastOf[0], s.lastOf[1]] };
}

/** 往 dir 爬一步落在哪、花几点体力；爬不了回原因 */
export function stepTarget(t: Terrain, width: number, c: Pick<Char, 'x' | 'y'>, dir: Dir): { y: number; cost: number } | { error: 'edge' | 'steep' | 'cliff' } {
  const nx = c.x + dir * STEP;
  if (nx < 0 || nx >= width) return { error: 'edge' };
  let wall = false;
  for (let yy = c.y - MAX_UP; yy <= c.y + MAX_DOWN; yy++) {
    if (!solidAt(t, nx, yy)) continue;
    wall = true;
    if (solidAt(t, nx, yy - 1) || !bodyClear(t, nx, yy)) continue;
    const up = c.y - yy;
    return { y: yy, cost: STEP_COST + (up > 0 ? up >> 1 : 0) };
  }
  return { error: wall ? 'steep' : 'cliff' };
}

/** 出手里的道具（没写的按不用算） */
export function loadoutOf(a: Pick<FireAction, 'mode' | 'boost' | 'lid' | 'plane'>): Loadout {
  return { mode: a.mode ?? PLAIN.mode, boost: a.boost ?? PLAIN.boost, lid: a.lid ?? false, plane: a.plane ?? false };
}

/** 这个角色这回合能不能这样出手：组合合法、特殊道具还有次数、体力够。能就回 null */
export function loadoutBlocked(s: State, c: Char, l: Loadout): string | null {
  const bad = loadoutError(l);
  if (bad) return bad;
  if (l.plane && c.special.plane <= 0) return 'no_plane';
  if (l.lid && c.special.lid <= 0) return 'no_lid';
  if (loadoutCost(l) > s.stamina) return 'tired';
  return null;
}

export function apply(state: State, a: Action): Step {
  if (state.phase !== 'play') return { ok: false, error: 'over' };
  const me = state.chars[state.actor]!;
  const m = mapOf(state);
  if (a.t === 'face') {
    if (a.dir !== 1 && a.dir !== -1) return { ok: false, error: 'bad' };
    const s = copy(state);
    s.chars[me.id]!.facing = a.dir;
    return { ok: true, state: s, events: [{ t: 'face', id: me.id, dir: a.dir }] };
  }
  if (a.t === 'move') {
    if (a.dir !== 1 && a.dir !== -1) return { ok: false, error: 'bad' };
    const to = stepTarget(state.terrain, m.width, me, a.dir);
    if ('error' in to) return { ok: false, error: to.error };
    if (to.cost > state.stamina) return { ok: false, error: 'tired' };
    const s = copy(state);
    const c = s.chars[me.id]!;
    c.x += a.dir * STEP;
    c.y = to.y;
    c.facing = a.dir;
    s.stamina -= to.cost;
    return { ok: true, state: s, events: [{ t: 'move', id: c.id, x: c.x, y: c.y, cost: to.cost }] };
  }
  if (a.t === 'fire') {
    const w = weapon(me.weapon);
    if (!Number.isInteger(a.angle) || a.angle < w.minAngle || a.angle > w.maxAngle) return { ok: false, error: 'angle' };
    if (!Number.isInteger(a.power) || a.power < 1 || a.power > 100) return { ok: false, error: 'power' };
    if (a.facing !== 1 && a.facing !== -1) return { ok: false, error: 'bad' };
    const l = loadoutOf(a);
    const blocked = loadoutBlocked(state, me, l);
    if (blocked) return { ok: false, error: blocked };
    return { ok: true, ...fire(state, a.angle, a.power, a.facing, l) };
  }
  return { ok: false, error: 'bad' };
}

/** 不改状态，只算这一颗会怎么飞（电脑在心里试用）；lid 是用了锅盖（不受风） */
export function previewShot(s: State, angle: number, power: number, facing: Dir, record = false, lid = false): Shot {
  const me = s.chars[s.actor]!;
  const m = mapOf(s);
  return simulate(s.terrain, s.chars, m.width, m.height, lid ? 0 : s.wind, launch(me, angle, power, facing), record);
}

const flight = (shot: Shot): Flight => ({ path: shot.path, end: shot.end, target: shot.hit });

function fire(state: State, angle: number, power: number, facing: Dir, l: Loadout): { state: State; events: Ev[] } {
  const s = copy(state);
  const me = s.chars[s.actor]!;
  const cost = loadoutCost(l);
  s.stamina -= cost;
  if (l.lid) me.special.lid -= 1;
  if (l.plane) me.special.plane -= 1;
  me.angle = angle;
  me.power = power;
  me.facing = facing;
  const events: Ev[] = [{ t: 'fire', id: me.id, angle, power, facing, mode: l.mode, boost: l.boost, lid: l.lid, plane: l.plane, cost }];
  if (l.plane) {
    paperPlane(s, me, angle, power, facing, events);
  } else if (l.mode === 'fork') {
    // 三岔：三颗同时出膛（角度各差 FORK_SPREAD），按落地的先后炸；后炸的那颗如果打中的人已经出局，就按落点炸
    const shots = [angle - FORK_SPREAD, angle, angle + FORK_SPREAD].map((a) => previewShot(s, Math.max(0, Math.min(90, a)), power, facing, true, l.lid));
    events.push({ t: 'shot', flights: shots.map(flight), plane: false });
    const order = shots.map((sh, i) => ({ sh, i })).sort((a, b) => a.sh.path.length - b.sh.path.length || a.i - b.i);
    for (const { sh } of order) {
      if (!sh.end) continue;
      const hit = sh.hit !== null && !s.chars[sh.hit]!.out ? sh.hit : null;
      blast(s, me, sh.end, hit, facing, shotScale(l), events);
    }
    settle(s, events);
  } else {
    // 普通和连发：一颗一颗来，每颗炸完、掉落都算完再出下一颗（前一颗的坑会影响后一颗）；自己出局了就不再扔
    for (let k = 0; k < MODES[l.mode].count && !me.out; k++) {
      const sh = previewShot(s, angle, power, facing, true, l.lid);
      events.push({ t: 'shot', flights: [flight(sh)], plane: false });
      if (sh.end) blast(s, me, sh.end, sh.hit, facing, shotScale(l), events);
      settle(s, events);
    }
  }
  finishTurn(s, events);
  return { state: s, events };
}

/** 一颗炮弹落地：直接打中人时炸点放到他身子中间（坑一定挖到他脚下，DESIGN.md 2.3"打人也会把人脚下炸出洞"），否则在落点炸 */
function blast(s: State, me: Char, end: { x: number; y: number }, hit: number | null, facing: Dir, scale: number, events: Ev[]): void {
  const t = hit === null ? null : s.chars[hit]!;
  explode(s, me, t ? t.x : end.x, t ? t.y - BODY_CY : end.y, hit, facing, scale, events);
}

/**
 * 纸飞机（DESIGN.md 2.6）：照常飞、受风；落地不炸、不伤、不挖，人瞬移到落点上方的空位；撞到角色就落在他旁边最近的空位；
 * 飞出画本就作废，人留在原地（道具照样用掉）。找不到能站的地方也按作废算。
 */
function paperPlane(s: State, me: Char, angle: number, power: number, facing: Dir, events: Ev[]): void {
  const m = mapOf(s);
  const sh = previewShot(s, angle, power, facing, true);
  events.push({ t: 'shot', flights: [flight(sh)], plane: true });
  const from = { x: me.x, y: me.y };
  let to: { x: number; y: number } | null = null;
  if (sh.end && sh.hit !== null) to = besideChar(s.terrain, m.width, s.chars[sh.hit]!);
  else if (sh.end) to = aboveLanding(s.terrain, m.width, sh.end.x, sh.end.y);
  if (to) {
    me.x = to.x;
    me.y = to.y;
  }
  events.push({ t: 'warp', id: me.id, from, to });
}

/** 纸飞机会把人送到哪（电脑在心里试用）：飞出画本或找不到站的地方回 null */
export function planeLanding(s: State, angle: number, power: number, facing: Dir): { x: number; y: number } | null {
  const m = mapOf(s);
  const sh = previewShot(s, angle, power, facing);
  if (!sh.end) return null;
  return sh.hit !== null ? besideChar(s.terrain, m.width, s.chars[sh.hit]!) : aboveLanding(s.terrain, m.width, sh.end.x, sh.end.y);
}

/** 脚下的地有多厚（往下数到第一块空，最多数到 limit） */
export function groundDepth(t: Terrain, x: number, y: number, limit = 120): number {
  let d = 0;
  while (d < limit && solidAt(t, x, y + d)) d++;
  return d;
}

/** 落点上方第一个站得下的地方：从落点往上找"脚底是地、上面站得下" */
function aboveLanding(t: Terrain, width: number, x: number, y: number): { x: number; y: number } | null {
  if (x < 0 || x >= width) return null;
  for (let yy = y; yy > y - 240; yy--) if (standable(t, x, yy)) return { x, y: yy };
  return null;
}

/** 角色旁边最近的空位：左右各往外找，高度在他脚底上下 40 以内 */
function besideChar(t: Terrain, width: number, c: Char): { x: number; y: number } | null {
  for (let d = 2 * BODY_R + 4; d <= 200; d += 4) {
    for (const side of [-1, 1] as const) {
      const x = c.x + side * d;
      if (x < 0 || x >= width) continue;
      for (let yy = c.y - 40; yy <= c.y + 40; yy++) if (standable(t, x, yy)) return { x, y: yy };
    }
  }
  return null;
}

/** 爆炸：挖坑（坑的大小不看道具）、扣血（乘道具的倍率）、推开 */
function explode(s: State, shooter: Char, ex: number, ey: number, direct: number | null, facing: Dir, scale: number, events: Ev[]): void {
  const m = mapOf(s);
  const sw = weapon(shooter.weapon);
  const r = sw.radius;
  s.terrain = cloneTerrain(s.terrain);
  carve(s.terrain, ex, ey, sw.dig);
  // 事件里的 r 是坑的半径（画面照它在自己那份地形上挖）
  events.push({ t: 'boom', x: ex, y: ey, r: sw.dig });
  const pushes: { c: Char; amount: number; dir: Dir }[] = [];
  for (const c of s.chars) {
    if (c.out) continue;
    const dx = c.x - ex;
    const dy = c.y - BODY_CY - ey;
    const dd = direct === c.id ? 0 : Math.max(0, isqrt(dx * dx + dy * dy) - BODY_R);
    if (dd > r) continue;
    const dmg = blastDamage(sw, weapon(c.weapon), r, dd, scale);
    if (dmg > 0) {
      c.hp = Math.max(0, c.hp - dmg);
      events.push({ t: 'hurt', id: c.id, dmg, hp: c.hp });
    }
    pushes.push({ c, amount: idiv(PUSH * (r - dd), r), dir: dx > 0 ? 1 : dx < 0 ? -1 : facing });
  }
  for (const { c, amount, dir } of pushes) {
    if (c.hp <= 0) continue;
    const x0 = c.x;
    const y0 = c.y;
    for (let k = 0; k < amount; k++) {
      const nx = c.x + dir;
      if (nx < 0 || nx >= m.width) {
        c.x = nx;
        break;
      }
      let lifted = -1;
      for (let u = 0; u <= 8; u++) {
        if (bodyClear(s.terrain, nx, c.y - u)) {
          lifted = u;
          break;
        }
      }
      if (lifted < 0) break;
      c.x = nx;
      c.y -= lifted;
    }
    if (c.x !== x0 || c.y !== y0) events.push({ t: 'push', id: c.id, x: c.x, y: c.y });
  }
  for (const c of s.chars) {
    if (!c.out && c.hp <= 0) knockOut(c, 'hp', events);
  }
}

function knockOut(c: Char, why: OutWhy, events: Ev[]): void {
  c.out = true;
  events.push({ t: 'out', id: c.id, why });
}

/** 脚下没地的往下掉；掉出画本（低于底边，或出了左右边）立刻出局；摔得高的扣一点血 */
function settle(s: State, events: Ev[]): void {
  const m = mapOf(s);
  for (const c of s.chars) {
    if (c.out) continue;
    if (c.x < 0 || c.x >= m.width) {
      events.push({ t: 'fall', id: c.id, x: c.x, from: c.y, to: m.height + 60, dmg: 0 });
      knockOut(c, 'fall', events);
      continue;
    }
    if (supported(s.terrain, c.x, c.y)) continue;
    let y = c.y + 1;
    while (y < m.height && !supported(s.terrain, c.x, y)) y++;
    if (y >= m.height) {
      events.push({ t: 'fall', id: c.id, x: c.x, from: c.y, to: m.height + 60, dmg: 0 });
      c.y = m.height + 60;
      knockOut(c, 'fall', events);
      continue;
    }
    const h = y - c.y;
    const dmg = h > FALL_SAFE ? Math.min(FALL_MAX, idiv(h - FALL_SAFE, 10)) : 0;
    c.y = y;
    c.hp = Math.max(0, c.hp - dmg);
    events.push({ t: 'fall', id: c.id, x: c.x, from: y - h, to: y, dmg });
    if (dmg > 0) events.push({ t: 'hurt', id: c.id, dmg, hp: c.hp });
    if (c.hp <= 0) knockOut(c, 'hp', events);
  }
}

function finishTurn(s: State, events: Ev[]): void {
  const me = s.chars[s.actor]!;
  s.lastOf[me.team] = me.id;
  const left: [number, number] = [alive(s, 0).length, alive(s, 1).length];
  if (left[0] === 0 || left[1] === 0) {
    s.phase = 'over';
    s.winner = left[0] === 0 && left[1] === 0 ? null : left[0] === 0 ? 1 : 0;
    s.endBy = 'wipe';
    events.push({ t: 'over', winner: s.winner, by: 'wipe' });
    return;
  }
  if (s.turn >= MAX_TURNS) {
    const hp = [teamHp(s, 0), teamHp(s, 1)];
    s.phase = 'over';
    s.winner = hp[0] === hp[1] ? null : hp[0]! > hp[1]! ? 0 : 1;
    s.endBy = 'turns';
    events.push({ t: 'over', winner: s.winner, by: 'turns' });
    return;
  }
  const other = (1 - me.team) as Team;
  s.actor = nextOf(s, other);
  s.turn += 1;
  s.wind = windFor(s.key, s.turn);
  s.stamina = MAX_STAMINA;
  events.push({ t: 'turn', id: s.actor, turn: s.turn, wind: s.wind });
}

/** 从头按操作重放（存档、回放、测试用）；中间有一步不合法就停在那里并回报 */
export function replay(key: Entropy, setup: Setup, log: readonly Action[]): { state: State; bad: number | null } {
  let s = newGame(key, setup);
  for (let i = 0; i < log.length; i++) {
    const r = apply(s, log[i]!);
    if (!r.ok) return { state: s, bad: i };
    s = r.state;
  }
  return { state: s, bad: null };
}
