/**
 * 电脑的性格（DESIGN.md 5.3）。数是打分的权重：
 * - heat：一张热量值几格（越大越舍不得付热量）；
 * - spin：打滑一次扣几格（越大越怕打滑）；
 * - ahead：下一回合刹不住的风险看得多重；
 * - boost / slip：冲刺、吸尾流的门槛（越小越爱用）；
 * - slop：失误的幅度（越大越常挑到不是最好的选择）。
 * 按场地分强弱：每档至少两个性格，挑的时候只在这一档里挑（不拿别档凑数）；"混着来"三档都有。
 * 每场的状态（规则里的 form）在这些数上再浮动（ai/index.ts 的 tuned）。强弱用 npm run sim 量，结果写在 DESIGN.md 5.3。
 * 名字不和别的游戏的电脑重（平台的保留昵称按游戏分组，但同一个站里重名容易混）。
 * 话多少、什么脾气（互动用）在 game/banter.ts 的 TEMPER，和这里的下标一一对应；开车的打分不看它。
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
}

export const PERSONAS: readonly Persona[] = [
  {
    name: '嘟嘟',
    level: 0,
    heat: 1,
    spin: 6,
    ahead: 0.2,
    boost: 0.4,
    slip: 0,
    slop: 4,
  },
  {
    name: '慢半拍',
    level: 0,
    heat: 2.2,
    spin: 18,
    ahead: 0.3,
    boost: 1.5,
    slip: 0.5,
    slop: 3,
  },
  {
    name: '冲冲',
    level: 1,
    heat: 0.7,
    spin: 7,
    ahead: 0.6,
    boost: -0.5,
    slip: -1.5,
    slop: 1.8,
  },
  {
    name: '跟屁虫',
    level: 1,
    heat: 0.9,
    spin: 10,
    ahead: 0.9,
    boost: 0.6,
    slip: -3,
    slop: 1.6,
  },
  {
    name: '刹车王',
    level: 1,
    heat: 1.35,
    spin: 14,
    ahead: 1.3,
    boost: 0.8,
    slip: -1,
    slop: 1.2,
  },
  {
    name: '弯道王',
    level: 2,
    heat: 1.1,
    spin: 10,
    ahead: 1,
    boost: 0.2,
    slip: -2,
    slop: 0,
  },
  {
    name: '精算师',
    level: 2,
    heat: 0.9,
    spin: 11,
    ahead: 1,
    boost: 0.3,
    slip: -1.5,
    slop: 0,
  },
];

/** 真人座位、离座交给电脑的座位用的打法 */
export const DEFAULT_PERSONA = 5;

/** 按场地挑 k 个性格：新手、普通、老手只在这一档里挑，混着来三档都有；先不重复，挑完一轮再重复 */
export function pickPersonas(rng: RandomStream, level: Level, k: number): number[] {
  const want = level === 'easy' ? [0] : level === 'normal' ? [1] : level === 'hard' ? [2] : [0, 1, 2];
  const pool = PERSONAS.flatMap((p, i) => (want.includes(p.level) ? [i] : []));
  const out: number[] = [];
  let bag: number[] = [];
  while (out.length < k) {
    if (bag.length === 0) bag = [...pool];
    out.push(bag.splice(rng.below(bag.length), 1)[0]!);
  }
  return out;
}
