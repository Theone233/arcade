/**
 * 规则核心的状态、操作和事件（DESIGN.md 第 2 节）。所有状态都公开（2.7），电脑和画面都只读它。
 */
import type { Entropy } from 'arcade-kit/rng';
import type { Limited, Loadout } from './items.ts';
import type { MapId } from './maps.ts';
import type { Terrain } from './terrain.ts';
import type { WeaponId } from './weapons.ts';

export type Team = 0 | 1;
export type Dir = 1 | -1;
export type Look = 'shiba' | 'panda' | 'cat' | 'penguin' | 'rabbit' | 'mouse';
export const LOOKS: readonly Look[] = ['shiba', 'cat', 'panda', 'penguin', 'rabbit', 'mouse'];

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
  /** 有次数限制的特殊道具这一局还剩几次（锅盖；纸飞机 0.3.1 起不限次数，不记） */
  special: Record<Limited, number>;
}

export interface PlayerSetup {
  name: string;
  team: Team;
  look: Look;
  weapon: WeaponId;
  ai: boolean;
}

/**
 * 开局设置：地图和座位。players 的顺序就是座位顺序（队内按它轮），两队各 1–3 人（rules.ts 的 setupError 检查）。
 * maxRounds 不写就是 MAX_ROUNDS；界面不让改，留给模拟器比较"打满几轮"用。
 */
export interface Setup {
  map: MapId;
  players: readonly PlayerSetup[];
  maxRounds?: number;
}

export interface State {
  v: 1;
  key: Entropy;
  setup: Setup;
  terrain: Terrain;
  chars: Char[];
  /** 第几次出手（每个角色出手一次加 1），从 1 起；风和电脑的随机流按它取 */
  turn: number;
  /** 第几轮（所有还活着的角色各出手一次算一轮），从 1 起；打满 MAX_ROUNDS 轮按血量定胜负 */
  round: number;
  /** 这一轮已经出过手的角色（chars 的下标） */
  acted: number[];
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

/** 出手：角度、力度、朝向，加上这一发用的道具（每种几个；不写就是 0 / 不用，见 items.ts 的 Loadout） */
export interface FireAction extends Partial<Loadout> {
  t: 'fire';
  angle: number;
  power: number;
  facing: Dir;
}

/** pass：弃权（好友房超时，0.3.0），这一回合不爬、不打 */
export type Action = { t: 'move'; dir: Dir } | { t: 'face'; dir: Dir } | FireAction | { t: 'pass' };

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
  | { t: 'pass'; id: number }
  | { t: 'fire'; id: number; angle: number; power: number; facing: Dir; loadout: Loadout; cost: number }
  /** 一起飞出去的几颗（三岔是三颗同时飞；连发是一颗一颗来，每颗一个 shot 事件）；plane 是纸飞机 */
  | { t: 'shot'; flights: Flight[]; plane: boolean }
  /** 纸飞机：人从 from 瞬移到 to；to 是 null 就是飞出画本作废，人留在原地 */
  | { t: 'warp'; id: number; from: { x: number; y: number }; to: { x: number; y: number } | null }
  /** 爆炸：坑心、坑的大小（挖坑半径按颗数缩小过）、谁的坑形（坑形按武器分，core/craters.ts） */
  | { t: 'boom'; x: number; y: number; r: number; w: WeaponId }
  | { t: 'hurt'; id: number; dmg: number; hp: number }
  | { t: 'fall'; id: number; x: number; from: number; to: number; dmg: number }
  | { t: 'out'; id: number; why: OutWhy }
  | { t: 'turn'; id: number; turn: number; round: number; wind: number }
  | { t: 'over'; winner: Team | null; by: 'wipe' | 'turns' };

export type Step = { ok: true; state: State; events: Ev[] } | { ok: false; error: string };
