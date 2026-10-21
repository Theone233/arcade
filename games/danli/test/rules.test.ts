import { describe, expect, it } from 'vitest';
import { apply, FALL_SAFE, MAX_HP, MAX_ROUNDS, MAX_STAMINA, newGame, previewShot, replay, stepTarget, STEP, STEP_COST, windFor } from '../src/core/rules.ts';
import { carve, cloneTerrain, solidAt } from '../src/core/terrain.ts';
import type { Action, Ev, State } from '../src/core/types.ts';
import { blastDamage, weapon } from '../src/core/weapons.ts';
import { flat, KEY, SETUP, slab } from './helpers.ts';

function run(s: State, a: Action): { state: State; events: Ev[] } {
  const r = apply(s, a);
  if (!r.ok) throw new Error(r.error);
  return r;
}

/** 找一发直接打中对面的（角度 45，力度从小往大试） */
function hitPower(s: State): number {
  for (let p = 20; p <= 100; p++) if (previewShot(s, 45, p, s.chars[s.actor]!.facing).hit === 1 - s.actor) return p;
  throw new Error('打不中');
}

const LOG: Action[] = [
  { t: 'move', dir: 1 },
  { t: 'move', dir: 1 },
  { t: 'fire', angle: 40, power: 62, facing: 1 },
  { t: 'move', dir: -1 },
  { t: 'fire', angle: 50, power: 70, facing: -1 },
  { t: 'face', dir: -1 },
  { t: 'fire', angle: 30, power: 55, facing: -1 },
  { t: 'fire', angle: 65, power: 80, facing: 1 },
];

/** 只放合法的那几步（出手顺序随种子变，爬不了的跳过） */
function play(key: number[], log: readonly Action[]): { state: State; events: Ev[][] } {
  let s = newGame(key, SETUP);
  const events: Ev[][] = [];
  for (const a of log) {
    const r = apply(s, a);
    if (!r.ok) continue;
    s = r.state;
    events.push(r.events);
  }
  return { state: s, events };
}

const snap = (s: State): string => JSON.stringify({ ...s, terrain: Buffer.from(s.terrain.cells).toString('base64') });

describe('确定性', () => {
  it('同一个种子加同一串操作，状态和事件完全一样', () => {
    const a = play(KEY, LOG);
    const b = play(KEY, LOG);
    expect(snap(a.state)).toBe(snap(b.state));
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('换个种子，风和开局不一样', () => {
    const winds = new Set<string>();
    for (let k = 0; k < 8; k++) winds.add(JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8].map((_, t) => windFor([k, 1, 1, 1, 1, 1, 1, 1], t + 1))));
    expect(winds.size).toBeGreaterThan(1);
  });

  it('风在 -5..5', () => {
    for (let t = 1; t <= 200; t++) {
      const w = windFor(KEY, t);
      expect(w).toBeGreaterThanOrEqual(-5);
      expect(w).toBeLessThanOrEqual(5);
    }
  });

  it('重放得到同一个局面；有一步不合法就停在那里', () => {
    const a = play(KEY, LOG);
    const legal: Action[] = [];
    let s = newGame(KEY, SETUP);
    for (const x of LOG) {
      const r = apply(s, x);
      if (r.ok) {
        s = r.state;
        legal.push(x);
      }
    }
    expect(snap(replay(KEY, SETUP, legal).state)).toBe(snap(a.state));
    const bad = replay(KEY, SETUP, [...legal, { t: 'fire', angle: 5, power: 50, facing: 1 }]);
    expect(bad.bad).toBe(legal.length);
  });

  it('apply 不改原来的状态', () => {
    const s = newGame(KEY, SETUP);
    const before = snap(s);
    apply(s, { t: 'fire', angle: 45, power: 60, facing: 1 });
    apply(s, { t: 'move', dir: 1 });
    expect(snap(s)).toBe(before);
  });
});

describe('开局', () => {
  it('两队站在地面上（脚底是地，上面是空）', () => {
    for (let k = 0; k < 10; k++) {
      const s = newGame([k, 0, 0, 0, 0, 0, 0, 0], SETUP);
      for (const c of s.chars) {
        expect(solidAt(s.terrain, c.x, c.y)).toBe(true);
        expect(solidAt(s.terrain, c.x, c.y - 1)).toBe(false);
        expect(c.hp).toBe(MAX_HP);
      }
      expect(s.chars[0]!.x).not.toBe(s.chars[1]!.x);
      expect(s.stamina).toBe(MAX_STAMINA);
    }
  });
});

describe('出手检查', () => {
  it('角度要在武器范围里、力度 1..100 的整数', () => {
    const s = flat([1000, 2000]);
    const w = weapon('steamer');
    expect(apply(s, { t: 'fire', angle: w.minAngle - 1, power: 50, facing: 1 }).ok).toBe(false);
    expect(apply(s, { t: 'fire', angle: w.maxAngle + 1, power: 50, facing: 1 }).ok).toBe(false);
    expect(apply(s, { t: 'fire', angle: 45, power: 0, facing: 1 }).ok).toBe(false);
    expect(apply(s, { t: 'fire', angle: 45, power: 101, facing: 1 }).ok).toBe(false);
    expect(apply(s, { t: 'fire', angle: 45.5, power: 50, facing: 1 }).ok).toBe(false);
    expect(apply(s, { t: 'fire', angle: 45, power: 50, facing: 1 }).ok).toBe(true);
  });
});

describe('爆炸', () => {
  it('直接打中人也照样以命中点为圆心挖坑，挖到他脚下', () => {
    const s = flat([1000, 1300]);
    const r = run(s, { t: 'fire', angle: 45, power: hitPower(s), facing: 1 });
    const shot = r.events.find((e) => e.t === 'shot');
    expect(shot?.t === 'shot' && shot.flights[0]!.target).toBe(1);
    const boom = r.events.find((e) => e.t === 'boom');
    expect(boom).toBeTruthy();
    // 脚底下那一格原来是地，现在没了
    expect(solidAt(s.terrain, 1300, 500)).toBe(true);
    expect(solidAt(r.state.terrain, 1300, 500)).toBe(false);
  });

  it('直接命中扣满额，离爆心越远越少（到边上一半），对方的防御减一点', () => {
    const w = weapon('steamer');
    const full = blastDamage(w, w, w.radius, 0);
    const edge = blastDamage(w, w, w.radius, w.radius);
    expect(full).toBe(Math.floor(w.base * ((70 + 5 * w.atk) / 100) * ((100 - 3 * w.def) / 100)));
    expect(edge).toBe(Math.floor(full / 2));
    expect(blastDamage(w, w, w.radius, w.radius + 1)).toBe(0);
    for (let d = 1; d <= w.radius; d++) expect(blastDamage(w, w, w.radius, d)).toBeLessThanOrEqual(blastDamage(w, w, w.radius, d - 1));
    const tough = { ...w, def: 9 };
    expect(blastDamage(w, tough, w.radius, 0)).toBeLessThan(full);
    const strong = { ...w, atk: 9 };
    expect(blastDamage(strong, w, w.radius, 0)).toBeGreaterThan(full);
  });

  it('打中扣血、把人往外推，并且记事件', () => {
    const s = flat([1000, 1300]);
    const r = run(s, { t: 'fire', angle: 45, power: hitPower(s), facing: 1 });
    const hurt = r.events.find((e) => e.t === 'hurt' && e.id === 1);
    expect(hurt).toBeTruthy();
    expect(r.state.chars[1]!.hp).toBe(MAX_HP - (hurt as { dmg: number }).dmg);
    expect(r.state.chars[0]!.hp).toBe(MAX_HP);
  });

  it('自己也会被自己的爆炸伤到', () => {
    const s = flat([1000, 2500]);
    // 一堵墙挡在面前，炮弹一出膛就炸
    s.terrain = slab(1018, 1060, 300, 500, cloneTerrain(s.terrain));
    const r = run(s, { t: 'fire', angle: 20, power: 50, facing: 1 });
    expect(r.events.some((e) => e.t === 'hurt' && e.id === 0)).toBe(true);
  });

  it('站在井口旁边的被炸到，会被推（或者连地一起炸）进井里，掉出画本出局', () => {
    // 1000..1100 是一口打穿到底的井
    const t = slab(0, 1000, 500, 700);
    slab(1100, 3000, 500, 700, t);
    const s = flat([600, 990], { terrain: t });
    let pushed: { state: State; events: Ev[] } | null = null;
    for (let a = 20; a <= 70 && !pushed; a++) {
      for (let p = 20; p <= 80 && !pushed; p++) {
        const r = run(s, { t: 'fire', angle: a, power: p, facing: 1 });
        if (r.events.some((e) => e.t === 'push' && e.id === 1) && r.events.some((e) => e.t === 'out' && e.id === 1)) pushed = r;
      }
    }
    expect(pushed).not.toBeNull();
    expect(pushed!.events).toContainEqual({ t: 'out', id: 1, why: 'fall' });
    expect(pushed!.state.chars[1]!.out).toBe(true);
    expect(pushed!.state.phase).toBe('over');
    expect(pushed!.state.winner).toBe(0);
    expect(pushed!.state.endBy).toBe('wipe');
  });

  it('推开的方向是离开爆心的方向', () => {
    const s = flat([600, 1400]);
    for (let p = 20; p <= 80; p++) {
      const shot = previewShot(s, 45, p, 1);
      if (!shot.end || shot.hit !== null || shot.end.x < 1375 || shot.end.x > 1395) continue;
      const r = run(s, { t: 'fire', angle: 45, power: p, facing: 1 });
      const push = r.events.find((e) => e.t === 'push' && e.id === 1);
      expect(push && push.t === 'push' && push.x).toBeGreaterThan(1400);
      return;
    }
    throw new Error('没找到落在他左边的一发');
  });
});

describe('掉落', () => {
  it('脚下炸空了就往下掉，落到下面的地上；摔得高扣一点血', () => {
    const t = slab(0, 3000, 500, 560);
    slab(0, 3000, 700, 760, t);
    const s = flat([1000, 2000], { terrain: t });
    // 先在 2 号脚下挖穿上层（模拟早先的坑），再随便打一发结算
    const tt = cloneTerrain(s.terrain);
    for (let y = 500; y <= 560; y += 10) carve(tt, 2000, y, 20);
    s.terrain = tt;
    const r = run(s, { t: 'fire', angle: 45, power: 30, facing: 1 });
    const fall = r.events.find((e) => e.t === 'fall' && e.id === 1);
    expect(fall).toMatchObject({ t: 'fall', id: 1, from: 500, to: 700 });
    expect(r.state.chars[1]!.y).toBe(700);
    const h = 200;
    expect((fall as { dmg: number }).dmg).toBe(Math.floor((h - FALL_SAFE) / 10));
    expect(r.state.chars[1]!.out).toBe(false);
  });

  it('下面什么都没有就掉出画本，立刻出局', () => {
    const s = flat([1000, 2000]);
    const tt = cloneTerrain(s.terrain);
    for (let y = 480; y <= 720; y += 10) carve(tt, 2000, y, 22);
    s.terrain = tt;
    const r = run(s, { t: 'fire', angle: 45, power: 30, facing: 1 });
    expect(r.events).toContainEqual({ t: 'out', id: 1, why: 'fall' });
    expect(r.state.winner).toBe(0);
  });
});

describe('爬', () => {
  it(`平地一步一格，扣 ${STEP_COST} 点体力`, () => {
    const s = flat([1000, 2000]);
    const r = run(s, { t: 'move', dir: 1 });
    expect(r.state.chars[0]!.x).toBe(1000 + STEP);
    expect(r.state.stamina).toBe(MAX_STAMINA - STEP_COST);
    expect(r.state.chars[0]!.facing).toBe(1);
  });

  it('往上坡按高差加价，下坡不额外扣', () => {
    // 1004 起高 8 个单位的台阶
    const t = slab(0, 3000, 500, 700);
    slab(1006, 3000, 492, 500, t);
    const s = flat([1000, 2000], { terrain: t });
    const up = run(s, { t: 'move', dir: 1 });
    expect(up.state.chars[0]!.y).toBe(492);
    expect(MAX_STAMINA - up.state.stamina).toBe(STEP_COST + 4);
    const s2 = flat([1004, 2000], { terrain: t });
    s2.chars[0]!.y = 492;
    const down = run(s2, { t: 'move', dir: -1 });
    expect(down.state.chars[0]!.y).toBe(500);
    expect(MAX_STAMINA - down.state.stamina).toBe(STEP_COST);
  });

  it('太陡爬不上去', () => {
    const t = slab(0, 3000, 500, 700);
    slab(1004, 3000, 440, 500, t);
    const s = flat([1000, 2000], { terrain: t });
    expect(apply(s, { t: 'move', dir: 1 })).toEqual({ ok: false, error: 'steep' });
  });

  it('不会自己走下悬崖：前面是空的就停住', () => {
    const t = slab(0, 1004, 500, 700);
    slab(1300, 3000, 500, 700, t);
    const s = flat([1000, 2000], { terrain: t });
    expect(stepTarget(s.terrain, 3000, s.chars[0]!, 1)).toEqual({ error: 'cliff' });
    expect(apply(s, { t: 'move', dir: 1 }).ok).toBe(false);
    expect(apply(s, { t: 'move', dir: -1 }).ok).toBe(true);
  });

  it('体力用完就爬不动，下一回合回满', () => {
    let s = flat([500, 2000]);
    let n = 0;
    for (;;) {
      const r = apply(s, { t: 'move', dir: 1 });
      if (!r.ok) {
        expect(r.error).toBe('tired');
        break;
      }
      s = r.state;
      n++;
    }
    expect(n).toBe(MAX_STAMINA / STEP_COST);
    expect(s.stamina).toBe(0);
    const next = run(s, { t: 'fire', angle: 45, power: 20, facing: 1 });
    expect(next.state.stamina).toBe(MAX_STAMINA);
  });

  it('出不了画本的左右边', () => {
    const s = flat([2, 2000]);
    expect(apply(s, { t: 'move', dir: -1 })).toEqual({ ok: false, error: 'edge' });
  });
});

describe('回合和胜负', () => {
  it('两队交替出手，每回合换风、回满体力', () => {
    let s = newGame(KEY, SETUP);
    const first = s.actor;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(s.actor);
      const r = run(s, { t: 'fire', angle: 70, power: 5, facing: 1 });
      s = r.state;
      const turn = r.events.find((e) => e.t === 'turn');
      expect(turn).toMatchObject({ t: 'turn', turn: i + 2, wind: windFor(KEY, i + 2) });
    }
    expect(seen).toEqual([first, 1 - first, first, 1 - first, first, 1 - first]);
  });

  it('2 对 2：两队交替，队内按座位轮，跳过出局的', () => {
    const setup = { map: 'kitchen' as const, players: [...SETUP.players, { name: '团团', team: 0 as const, look: 'panda' as const, weapon: 'steamer' as const, ai: true }, { name: '企企', team: 1 as const, look: 'penguin' as const, weapon: 'steamer' as const, ai: true }] };
    let s = newGame(KEY, setup);
    const order: number[] = [];
    for (let i = 0; i < 8; i++) {
      order.push(s.actor);
      s = run(s, { t: 'fire', angle: 70, power: 5, facing: 1 }).state;
    }
    const teamOf = (id: number): number => setup.players[id]!.team;
    for (let i = 1; i < order.length; i++) expect(teamOf(order[i]!)).not.toBe(teamOf(order[i - 1]!));
    // 每队内部轮着来
    const t0 = order.filter((id) => teamOf(id) === 0);
    expect(new Set(t0.slice(0, 2)).size).toBe(2);
    // 让 0 队不在出手的那一个出局，之后 0 队只剩另一个出手
    const gone = t0.find((id) => id !== s.actor)!;
    s.chars[gone]!.out = true;
    for (let i = 0; i < 6; i++) {
      if (teamOf(s.actor) === 0) expect(s.actor).not.toBe(gone);
      s = run(s, { t: 'fire', angle: 70, power: 5, facing: 1 }).state;
    }
  });

  it(`打满 ${MAX_ROUNDS} 轮按全队剩余血量定胜负`, () => {
    // 第 15 轮，对面已经出过手：我这一手打完这一轮就结束
    let s = flat([500, 2500]);
    s.chars[0]!.hp = 40;
    s.chars[1]!.hp = 70;
    s.round = MAX_ROUNDS;
    s.acted = [1];
    const r = run(s, { t: 'fire', angle: 20, power: 60, facing: -1 });
    expect(r.state.phase).toBe('over');
    expect(r.state.endBy).toBe('turns');
    expect(r.state.winner).toBe(1);
    expect(r.events.at(-1)).toEqual({ t: 'over', winner: 1, by: 'turns' });
    // 血量一样是平局（往左打出画本，谁也不伤）
    s = flat([500, 2500]);
    s.round = MAX_ROUNDS;
    s.acted = [1];
    expect(run(s, { t: 'fire', angle: 20, power: 60, facing: -1 }).state.winner).toBeNull();
  });

  it('血量掉光出局，一队全部出局就输；结束以后不能再出手', () => {
    const s = flat([1000, 1300]);
    s.chars[1]!.hp = 5;
    const r = run(s, { t: 'fire', angle: 45, power: hitPower(s), facing: 1 });
    expect(r.events).toContainEqual({ t: 'out', id: 1, why: 'hp' });
    expect(r.state.winner).toBe(0);
    expect(apply(r.state, { t: 'move', dir: 1 })).toEqual({ ok: false, error: 'over' });
  });
});
