/**
 * 规则核心的状态、操作和事件（DESIGN.md 第 2 节）。所有状态都公开（2.7），电脑和画面都只读它。
 */
import type { Entropy } from 'arcade-kit/rng';
import type { Boost, ShotMode, Special } from './items.ts';
import type { MapId } from './maps.ts';
import type { Terrain } from './terrain.ts';
import type { WeaponId } from './weapons.ts';

export type Team = 0 | 1;
export type Dir = 1 | -1;
export type Look = 'shiba' | 'panda' | 'cat' | 'penguin';

export interface Char {
  id: number;
  name: string;
  team: Team;
  look: Look;
  weapon: WeaponId;
  /** 电脑控制 */
  ai: boolean;
  /** 脚底的位置（世界单位，整数）：(x, y) 这一点是地，往上是身体 */
  x: number;
  y: number;
  hp: number;
  /** 出局了（掉出画本或者血量掉光） */
  out: boolean;
  facing: Dir;
  /** 上一次用的角度和力度（界面的默认值和"上次"刻度） */
  angle: number;
  power: number | null;
  /** 特殊道具这一局还剩几次 */
  special: Record<Special, number>;
}

export interface PlayerSetup {
  name: string;
  team: Team;
  look: Look;
  weapon: WeaponId;
  ai: boolean;
}

export interface Setup {
  map: MapId;
  players: readonly PlayerSetup[];
}

export interface State {
  v: 1;
  key: Entropy;
  setup: Setup;
  terrain: Terrain;
  chars: Char[];
  /** 第几回合（每个角色出手一次算一回合），从 1 起 */
  turn: number;
  /** 轮到谁（chars 的下标） */
  actor: number;
  /** 这一回合的风：-5..5，正数往右吹 */
  wind: number;
  /** 这一回合剩下的体力 */
  stamina: number;
  /** 两队各自上一个出手的人（chars 的下标，-1 是还没有），队内按座位轮 */
  lastOf: [number, number];
  phase: 'play' | 'over';
  /** 赢的队；null 是平局（只在 over 时有意义） */
  winner: Team | null;
  /** 怎么结束的：一队全部出局，还是打满回合按血量定 */
  endBy: 'wipe' | 'turns' | null;
}

/** 出手：角度、力度、朝向，加上这一发用的道具（不写就是不用） */
export interface FireAction {
  t: 'fire';
  angle: number;
  power: number;
  facing: Dir;
  mode?: ShotMode;
  boost?: Boost;
  lid?: boolean;
  plane?: boolean;
}

export type Action = { t: 'move'; dir: Dir } | { t: 'face'; dir: Dir } | FireAction;

/** 一颗炮弹（或纸飞机）的飞行：path 是每一帧（1/60 秒）的位置，x、y 交替；end 是落点，飞出画本是 null；target 是直接打中的角色 */
export interface Flight {
  path: number[];
  end: { x: number; y: number } | null;
  target: number | null;
}

export type OutWhy = 'fall' | 'hp';

export type Ev =
  | { t: 'move'; id: number; x: number; y: number; cost: number }
  | { t: 'face'; id: number; dir: Dir }
  | { t: 'fire'; id: number; angle: number; power: number; facing: Dir; mode: ShotMode; boost: Boost; lid: boolean; plane: boolean; cost: number }
  /** 一起飞出去的几颗（三岔是三颗同时飞；连发是一颗一颗来，每颗一个 shot 事件）；plane 是纸飞机 */
  | { t: 'shot'; flights: Flight[]; plane: boolean }
  /** 纸飞机：人从 from 瞬移到 to；to 是 null 就是飞出画本作废，人留在原地 */
  | { t: 'warp'; id: number; from: { x: number; y: number }; to: { x: number; y: number } | null }
  | { t: 'boom'; x: number; y: number; r: number }
  | { t: 'hurt'; id: number; dmg: number; hp: number }
  | { t: 'push'; id: number; x: number; y: number }
  | { t: 'fall'; id: number; x: number; from: number; to: number; dmg: number }
  | { t: 'out'; id: number; why: OutWhy }
  | { t: 'turn'; id: number; turn: number; wind: number }
  | { t: 'over'; winner: Team | null; by: 'wipe' | 'turns' };

export type Step = { ok: true; state: State; events: Ev[] } | { ok: false; error: string };
