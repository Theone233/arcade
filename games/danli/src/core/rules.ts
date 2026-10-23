/**
 * 规则核心（DESIGN.md 第 2 节）：纯函数、确定性。输入状态和操作，输出新状态和事件；不碰 DOM、网络、Math.random、Date、三角函数。
 * 随机只用 arcade-kit/rng 的 ChaCha20 按用途分流：'open' 开局（出生点、谁先手），'wind' 每回合的风（序号是回合数）。
 * 对阵 1v1、2v2、3v3：两队各 1–3 人，座位顺序就是 setup.players 的顺序。
 *
 * 一回合：轮到的角色先爬（耗体力）、调朝向，然后带着这回合选的道具发射（道具也耗体力，和爬共用这回合的 100 点）。
 * 炮弹落地或打中人就爆炸：挖坑、扣血（不推人，0.3.0 起）、脚下空了就掉、出局；连发一颗一颗算（前一颗的坑、掉落会影响后一颗），三岔三颗同时飞、按落地先后炸；
 * 纸飞机不炸，人瞬移到落点。然后换下一个：两队交替出手，队内按座位轮（出局的跳过）；一队全部出局就输；
 * 打满 MAX_ROUNDS 轮（所有还活着的角色各出手一次算一轮；人少的那队轮得快，一轮里有人会出手两次）按全队剩余血量总和定胜负。
 */
import { shuffle, stream, type Entropy, type RandomStream } from 'arcade-kit/rng';
import { idiv, isqrt } from './fixed.ts';
import { COMMON, digRadius, FORK_SPREAD, loadoutCost, loadoutError, PLAIN, shellsPer, shotScale, SPECIALS, volleys, type Loadout } from './items.ts';
import { buildTerrain, isMapId, MAPS, type MapDef } from './maps.ts';
import { BODY_CY, BODY_H, BODY_R, launch, simulate, type Shot } from './physics.ts';
import { cloneTerrain, dig as digCrater, solidAt, type Terrain } from './terrain.ts';
import { LOOKS, type Action, type Char, type Dir, type Ev, type FireAction, type Flight, type OutWhy, type Setup, type State, type Step, type Team } from './types.ts';
import { blastDamage, isWeaponId, weapon } from './weapons.ts';

/** 血量上限（0.1.0 平衡调整：DESIGN.md 2.6 定 150，模拟器调到 180，见 README"数值"） */
export const MAX_HP = 180;
export const MAX_STAMINA = 100;
/** 打满几轮按血量定（策划 2026-10-21 定：1v1 是 30 次出手，和 0.1.0 一样；2v2、3v3 不会被人数压短） */
export const MAX_ROUNDS = 15;
/** 每队最多几人（3v3） */
export const TEAM_MAX = 3;
/** 爬一步走多远（一格） */
export const STEP = 4;
/** 平地爬一步扣几点体力；往上每 2 单位高差再加 1 */
export const STEP_COST = 2;
/** 一步最多往上、往下多少（再高就爬不上去；再低就是悬崖，停住不走） */
export const MAX_UP = 12;
export const MAX_DOWN = 12;
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

/** 打满几轮按血量定胜负 */
export function roundLimit(setup: Pick<Setup, 'maxRounds'>): number {
  return setup.maxRounds ?? MAX_ROUNDS;
}

/** 开局设置合不合法（读存档、开局前查）：地图、两队各 1–3 人、人物和武器都认得、出生点够用。合法回 null */
export function setupError(setup: unknown): string | null {
  if (!setup || typeof setup !== 'object') return 'setup';
  const s = setup as Partial<Setup>;
  if (!isMapId(s.map)) return 'map';
  if (!Array.isArray(s.players)) return 'players';
  const size = [0, 0];
  for (const p of s.players as unknown[]) {
    if (!p || typeof p !== 'object') return 'player';
    const q = p as Record<string, unknown>;
    if (q.team !== 0 && q.team !== 1) return 'team';
    if (typeof q.name !== 'string' || !q.name || q.name.length > 16) return 'name';
    if (!LOOKS.includes(q.look as never)) return 'look';
    if (!isWeaponId(q.weapon)) return 'weapon';
    if (typeof q.ai !== 'boolean') return 'ai';
    size[q.team]! += 1;
  }
  if (size[0]! < 1 || size[1]! < 1 || size[0]! > TEAM_MAX || size[1]! > TEAM_MAX) return 'size';
  if (s.players.length > MAPS[s.map].spawns.length) return 'spawns';
  if (s.maxRounds !== undefined && (!Number.isInteger(s.maxRounds) || s.maxRounds < 1)) return 'rounds';
  return null;
}

/** 这一列从上往下第一块地的地面（出生点的 y） */
export function surfaceY(t: Terrain, height: number, x: number): number {
  let y = 0;
  while (y < height && !solidAt(t, x, y)) y++;
  return y;
}

/**
 * 出生点（DESIGN.md 第 3 节）：候选表用 'open' 洗一遍，再用它抽哪队先挑，两队交错取点（比如黄 1、蓝 1、黄 2、蓝 2……）。
 * 每个座位按洗好的顺序找第一个"离已经站好的对手至少 enemyGap、离队友至少 MATE_GAP"的点，找不到就取折算后最远的那个。
 * 这样摆一遍不一定全满足：从洗好的顺序的第 1、2、3……个点起各摆一遍，取第一种全满足的；都不满足就取"最差的那一处折算后最远"的一种。
 * enemyGap 按人数定：地图宽 ÷ (总人数 + 1)，厨房面团岛（宽 3000）1v1 是 1000、2v2 是 600、3v3 是 428。
 * 回每个座位（setup.players 的下标）的 x。
 */
export const MATE_GAP = 240;

export function pickSpawns(m: MapDef, teams: readonly Team[], open: RandomStream): number[] {
  const order = shuffle(m.spawns.map((p) => p.x), open);
  const enemyGap = Math.floor(m.width / (teams.length + 1));
  // 取点的先后：两队交错，各队内按座位；哪队先挑也随机（固定蓝队先挑时两队分到的位置分布不一样，模拟器里 2v2 黄队多赢一成）
  const lead = open.below(2);
  const byTeam = [lead, 1 - lead].map((t) => teams.flatMap((x, i) => (x === t ? [i] : [])));
  const seats: number[] = [];
  for (let k = 0; k < TEAM_MAX; k++) for (const list of byTeam) if (k < list.length) seats.push(list[k]!);
  // 折算分：离对手 / enemyGap 和离队友 / MATE_GAP 里小的那个，交叉相乘比大小（不做除法）；够了门槛就是 enemyGap × MATE_GAP
  const enough = enemyGap * MATE_GAP;
  let best: { at: number[]; worst: number } | null = null;
  for (let from = 0; from < order.length; from++) {
    const list = [...order.slice(from), ...order.slice(0, from)];
    const at: number[] = teams.map(() => -1);
    let worst = Infinity;
    for (const seat of seats) {
      let pick = -1;
      let top = -1;
      for (const x of list) {
        if (at.includes(x)) continue;
        let score = Infinity;
        for (let i = 0; i < teams.length; i++) {
          if (at[i]! < 0) continue;
          const d = Math.abs(at[i]! - x);
          score = Math.min(score, teams[i] === teams[seat] ? d * enemyGap : d * MATE_GAP);
        }
        if (score >= enough) {
          pick = x;
          top = score;
          break;
        }
        if (score > top) {
          top = score;
          pick = x;
        }
      }
      at[seat] = pick;
      worst = Math.min(worst, top);
    }
    if (worst >= enough) return at;
    if (!best || worst > best.worst) best = { at, worst };
  }
  return best!.at;
}

export function newGame(key: Entropy, setup: Setup): State {
  const bad = setupError(setup);
  if (bad) throw new Error(`开局设置不对：${bad}`);
  const m = MAPS[setup.map];
  const { xs, first } = opening(key, setup);
  return startFrom(key, setup, buildTerrain(m), xs, first, windFor(key, 1));
}

/** 开局要抽的两样（'open' 随机流）：每个座位的出生点 x、哪队先手 */
export function opening(key: Entropy, setup: Setup): { xs: number[]; first: Team } {
  const open = stream(key, 'open');
  const xs = pickSpawns(MAPS[setup.map], setup.players.map((p) => p.team), open);
  return { xs, first: open.below(2) as Team };
}

/**
 * 按定好的出生点（每个座位的 x）、先手的队、第一回合的风开局（newGame 抽完这几样以后也走这里）。
 * 好友房的页面拿不到种子（DESIGN.md 5.6），按房间下发的这几样从头重放；terrain 是这张图刚光栅化好的地形（调用方可以给一份缓存的副本）。
 */
export function startFrom(key: Entropy, setup: Setup, terrain: Terrain, xs: readonly number[], first: Team, wind: number): State {
  const m = MAPS[setup.map];
  const chars: Char[] = setup.players.map((p, id) => {
    const x = xs[id]!;
    return {
      id,
      name: p.name,
      team: p.team,
      look: p.look,
      weapon: p.weapon,
      ai: p.ai,
      x,
      y: surfaceY(terrain, m.height, x),
      hp: MAX_HP,
      out: false,
      facing: 1,
      angle: 45,
      power: null,
      special: { lid: SPECIALS.lid.perGame },
    };
  });
  // 开局朝着最近的对手
  for (const c of chars) {
    let near: Char | null = null;
    for (const o of chars) if (o.team !== c.team && (!near || Math.abs(o.x - c.x) < Math.abs(near.x - c.x))) near = o;
    c.facing = near && near.x < c.x ? -1 : 1;
  }
  const s: State = { v: 1, key, setup, terrain, chars, turn: 1, round: 1, acted: [], actor: -1, wind: 0, stamina: MAX_STAMINA, lastOf: [-1, -1], phase: 'play', winner: null, endBy: null };
  s.actor = nextOf(s, first);
  s.wind = wind;
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
  return { ...s, chars: s.chars.map((c) => ({ ...c, special: { ...c.special } })), lastOf: [s.lastOf[0], s.lastOf[1]], acted: [...s.acted] };
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

/** 出手里的道具（没写的按 0 / 不用算；形状不对的留给 loadoutError 拒） */
export function loadoutOf(a: Partial<Loadout>): Loadout {
  const l: Loadout = { ...PLAIN };
  for (const k of COMMON) if (a[k] !== undefined) l[k] = a[k] as number;
  if (a.lid !== undefined) l.lid = a.lid;
  if (a.plane !== undefined) l.plane = a.plane;
  return l;
}

/** 这个角色这回合能不能这样出手：组合合法、锅盖还有次数、体力够。能就回 null */
export function loadoutBlocked(s: State, c: Char, l: Loadout): string | null {
  const bad = loadoutError(l);
  if (bad) return bad;
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
  if (a.t === 'pass') {
    // 弃权（好友房超时、或者自己点）：这一回合不爬、不打，算出过手
    const s = copy(state);
    const events: Ev[] = [{ t: 'pass', id: me.id }];
    finishTurn(s, events);
    return { ok: true, state: s, events };
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
  me.angle = angle;
  me.power = power;
  me.facing = facing;
  const events: Ev[] = [{ t: 'fire', id: me.id, angle, power, facing, loadout: { ...l }, cost }];
  if (l.plane) {
    paperPlane(s, me, angle, power, facing, events);
  } else {
    // 地形这一手只复制一次（后面每一颗都在这份上挖）
    s.terrain = cloneTerrain(s.terrain);
    const scale = shotScale(l);
    // 这一手颗数越多，每颗的坑越小（DESIGN.md 2.6）；伤害半径不变
    const dig = digRadius(weapon(me.weapon).dig, l);
    // 一轮一轮来：每轮的坑、掉落都算完再出下一轮（前一轮的坑会影响后一轮）；自己出局了就不再扔
    for (let k = 0; k < volleys(l) && !me.out; k++) {
      if (shellsPer(l) === 1) {
        const sh = previewShot(s, angle, power, facing, true, l.lid);
        events.push({ t: 'shot', flights: [flight(sh)], plane: false });
        if (sh.end) blast(s, me, sh.end, sh.hit, scale, dig, events);
      } else {
        // 三岔：这一轮三颗同时出膛（角度 −6°、0、+6°，夹在 0–90°），按落地的先后炸（一样快的按角度从小到大）；
        // 后炸的那颗打中的人已经出局，就按落点炸
        const shots = [angle - FORK_SPREAD, angle, angle + FORK_SPREAD].map((a) => previewShot(s, Math.max(0, Math.min(90, a)), power, facing, true, l.lid));
        events.push({ t: 'shot', flights: shots.map(flight), plane: false });
        const order = shots.map((sh, i) => ({ sh, i })).sort((a, b) => a.sh.path.length - b.sh.path.length || a.i - b.i);
        for (const { sh } of order) {
          if (!sh.end) continue;
          const hit = sh.hit !== null && !s.chars[sh.hit]!.out ? sh.hit : null;
          blast(s, me, sh.end, hit, scale, dig, events);
        }
      }
      settle(s, events);
    }
  }
  finishTurn(s, events);
  return { state: s, events };
}

/** 一颗炮弹落地：直接打中人时炸点放到他身子中间（坑一定挖到他脚下，DESIGN.md 2.3"打人也会把人脚下炸出洞"），否则在落点炸 */
function blast(s: State, me: Char, end: { x: number; y: number }, hit: number | null, scale: number, dig: number, events: Ev[]): void {
  const t = hit === null ? null : s.chars[hit]!;
  explode(s, me, t ? t.x : end.x, t ? t.y - BODY_CY : end.y, hit, scale, dig, events);
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

/** 爆炸：挖坑（半径 dig，按这一手的总颗数缩小过）、扣血（乘道具的倍率，伤害半径不变）。不推人（DESIGN.md 2.5，0.3.0 起）：脚下挖空了由 settle 让人往下掉 */
function explode(s: State, shooter: Char, ex: number, ey: number, direct: number | null, scale: number, dig: number, events: Ev[]): void {
  const sw = weapon(shooter.weapon);
  const r = sw.radius;
  // 地形在 fire 里已经复制过一份，这里直接挖
  digCrater(s.terrain, ex, ey, dig, sw.id);
  // 事件里的 r 是坑的大小、w 是谁家的坑形（画面照它在自己那份地形上挖，和规则核心同一套）
  events.push({ t: 'boom', x: ex, y: ey, r: dig, w: sw.id });
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
  if (!s.acted.includes(me.id)) s.acted.push(me.id);
  // 这一轮完了吗：还活着的每个人都出过手（这一手里出局的不用等）
  const roundDone = s.chars.every((c) => c.out || s.acted.includes(c.id));
  const left: [number, number] = [alive(s, 0).length, alive(s, 1).length];
  if (left[0] === 0 || left[1] === 0) {
    s.phase = 'over';
    s.winner = left[0] === 0 && left[1] === 0 ? null : left[0] === 0 ? 1 : 0;
    s.endBy = 'wipe';
    events.push({ t: 'over', winner: s.winner, by: 'wipe' });
    return;
  }
  if (roundDone && s.round >= roundLimit(s.setup)) {
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
  if (roundDone) {
    s.round += 1;
    s.acted = [];
  }
  s.wind = windFor(s.key, s.turn);
  s.stamina = MAX_STAMINA;
  events.push({ t: 'turn', id: s.actor, turn: s.turn, round: s.round, wind: s.wind });
}

/** 从头按操作重放（存档、回放、测试用）；中间有一步不合法就停在那里并回报 */
export function replay(key: Entropy, setup: Setup, log: readonly Action[], onEvents?: (events: readonly Ev[]) => void): { state: State; bad: number | null } {
  let s = newGame(key, setup);
  for (let i = 0; i < log.length; i++) {
    const r = apply(s, log[i]!);
    if (!r.ok) return { state: s, bad: i };
    s = r.state;
    onEvents?.(r.events);
  }
  return { state: s, bad: null };
}
