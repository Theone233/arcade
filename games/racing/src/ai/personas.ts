/**
 * 电脑的性格（DESIGN.md 5.3）。数是打分的权重：
 * - heat：一张热量值几格（越大越舍不得付热量）；
 * - spin：打滑一次扣几格（越大越怕打滑）；
 * - ahead：下一回合刹不住的风险看得多重；
 * - boost / slip：冲刺、吸尾流的门槛（越小越爱用）；
 * - slop：失误的幅度（小白会挑到不是最好的选择）。
 * 强弱用 npm run sim 量，结果写在 DESIGN.md 5.3。
 */
import type { RandomStream } from 'arcade-kit/rng';
import type { Level } from '../core/types.ts';

export interface Persona {
  name: string;
  /** 0 新手、1 普通、2 老手 */
  level: number;
  heat: number;
  spin: number;
  ahead: number;
  boost: number;
  slip: number;
  slop: number;
  /** 台词：超车、打滑、冲线、被别人吸尾流 */
  lines: { pass: string[]; spin: string[]; finish: string[]; slip: string[] };
}

export const PERSONAS: readonly Persona[] = [
  {
    name: '冲冲',
    level: 1,
    heat: 0.7,
    spin: 7,
    ahead: 0.6,
    boost: -0.5,
    slip: -1.5,
    slop: 0.3,
    lines: { pass: ['让一让！', '油门焊死！'], spin: ['哎呀冲过头了', '没事，再来'], finish: ['冲就完事了！'], slip: ['借个风！'] },
  },
  {
    name: '稳哥',
    level: 1,
    heat: 1.8,
    spin: 16,
    ahead: 1.4,
    boost: 1.0,
    slip: -0.5,
    slop: 0,
    lines: { pass: ['稳稳的'], spin: ['不应该啊……'], finish: ['稳住，我们能赢'], slip: ['稳着点跟'] },
  },
  {
    name: '算盘',
    level: 2,
    heat: 1.2,
    spin: 11,
    ahead: 1,
    boost: 0.3,
    slip: -1.2,
    slop: 0,
    lines: { pass: ['算好了的'], spin: ['算漏了一步'], finish: ['一格不差'], slip: ['尾流就是白给的速度'] },
  },
  {
    name: '跟屁虫',
    level: 1,
    heat: 0.9,
    spin: 10,
    ahead: 0.9,
    boost: 0.6,
    slip: -3,
    slop: 0.6,
    lines: { pass: ['跟紧了！'], spin: ['跟丢了……'], finish: ['跟着跟着就赢了'], slip: ['贴上了！'] },
  },
  {
    name: '小白',
    level: 0,
    heat: 1,
    spin: 6,
    ahead: 0.2,
    boost: 0.4,
    slip: 0,
    slop: 3,
    lines: { pass: ['我超车了？'], spin: ['这弯怎么这么急'], finish: ['我居然跑完了'], slip: ['什么是尾流？'] },
  },
  {
    name: '老司机',
    level: 2,
    heat: 1.1,
    spin: 10,
    ahead: 1,
    boost: 0.2,
    slip: -2,
    slop: 0,
    lines: { pass: ['走你'], spin: ['失误，下圈找回来'], finish: ['老司机，没毛病'], slip: ['借你的风用用'] },
  },
];

/** 真人座位、离座交给电脑的座位用的打法 */
export const DEFAULT_PERSONA = 2;

/** 按强弱挑 k 个不重复的性格（数不够时重复） */
export function pickPersonas(rng: RandomStream, level: Level, k: number): number[] {
  const all = PERSONAS.map((_, i) => i);
  const want = level === 'easy' ? [0] : level === 'normal' ? [1] : level === 'hard' ? [2] : [0, 1, 2];
  const pool = all.filter((i) => want.includes(PERSONAS[i]!.level));
  // 新手一档只有一个小白，配上普通的凑数；老手一档两个，配上普通的
  const fill = level === 'easy' || level === 'hard' ? all.filter((i) => PERSONAS[i]!.level === 1) : [];
  const out: number[] = [];
  const bag = [...pool];
  while (out.length < k) {
    if (bag.length === 0) bag.push(...(fill.length ? fill : pool));
    const j = rng.below(bag.length);
    out.push(bag.splice(j, 1)[0]!);
  }
  return out;
}
