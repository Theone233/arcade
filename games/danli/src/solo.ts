/**
 * 单机（DESIGN.md 第 8 节）：一局 = 种子（256 位熵）+ 开局设置 + 一串操作。存档只存这三样（danli.solo），读档时从头重放，
 * 地形网格不用存（同一个种子加同一串操作，结果完全一样）。打完就删。
 * 0.2.0 起是第 2 版：开局设置是整局的（对阵、各座位的人物和武器、地图）；0.1.0 的老存档读不出来，直接丢掉。
 */
import { isEntropy, type Entropy } from 'arcade-kit/rng';
import { apply, newGame, replay, setupError } from './core/rules.ts';
import type { MapId } from './core/maps.ts';
import type { Action, Setup, State, Step } from './core/types.ts';

export const SOLO_KEY = 'danli.solo';

export interface SoloSave {
  v: 2;
  key: number[];
  setup: Setup;
  log: Action[];
}

/** 读存档：版本、种子、开局设置、操作都对得上才算；不对回 null（调用方把它删掉） */
export function parseSave(raw: string | null): SoloSave | null {
  if (!raw) return null;
  try {
    const save = JSON.parse(raw) as SoloSave;
    if (save?.v !== 2 || !isEntropy(save.key) || !Array.isArray(save.log) || setupError(save.setup)) return null;
    return save;
  } catch {
    return null;
  }
}

/** 新的一局的种子；?seed=数字（冒烟、截图、复现 bug 用）时由它定 */
export function newKey(): Entropy {
  const seed = new URLSearchParams(location.search).get('seed');
  if (seed && /^\d{1,9}$/.test(seed)) return [Number(seed), 7, 7, 7, 7, 7, 7, 7];
  return [...crypto.getRandomValues(new Uint32Array(8))];
}

export class Solo {
  state: State;

  readonly save: SoloSave;

  constructor(save: SoloSave) {
    this.save = save;
    const r = replay(save.key, save.setup, save.log);
    if (r.bad !== null) {
      save.log.length = r.bad;
    }
    this.state = r.state;
  }

  static fresh(setup: Setup): Solo {
    const key = newKey();
    const s = new Solo({ v: 2, key: [...key], setup, log: [] });
    s.state = newGame(key, setup);
    s.store();
    return s;
  }

  /** 接着上一局：读不出来、对不上就当没有 */
  static load(): Solo | null {
    try {
      const save = parseSave(localStorage.getItem(SOLO_KEY));
      if (!save) {
        clearSolo();
        return null;
      }
      const s = new Solo(save);
      if (s.state.phase === 'over') {
        clearSolo();
        return null;
      }
      return s;
    } catch {
      clearSolo();
      return null;
    }
  }

  apply(a: Action): Step {
    const r = apply(this.state, a);
    if (!r.ok) return r;
    this.state = r.state;
    this.save.log.push(a);
    if (r.state.phase === 'over') clearSolo();
    else this.store();
    return r;
  }

  store(): void {
    try {
      localStorage.setItem(SOLO_KEY, JSON.stringify(this.save));
    } catch {
      // 存不上（隐私模式、满了）就只有这一次
    }
  }
}

export function clearSolo(): void {
  try {
    localStorage.removeItem(SOLO_KEY);
  } catch {
    // 删不掉也不影响
  }
}

/** 有没有能接着打的存档，有就回首页那张卡片上写的东西（地图、几对几、第几轮）；老版本、坏了、打完了的顺手删掉 */
export function peekSolo(): { map: MapId; size: number; round: number } | null {
  try {
    const raw = localStorage.getItem(SOLO_KEY);
    if (!raw) return null;
    const save = parseSave(raw);
    const st = save ? replay(save.key, save.setup, save.log).state : null;
    if (!save || !st || st.phase === 'over') {
      clearSolo();
      return null;
    }
    const size = Math.max(...([0, 1] as const).map((t) => save.setup.players.filter((p) => p.team === t).length));
    return { map: save.setup.map, size, round: st.round };
  } catch {
    return null;
  }
}
