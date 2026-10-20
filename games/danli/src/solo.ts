/**
 * 单机（DESIGN.md 第 8 节）：一局 = 种子（256 位熵）+ 开局设置 + 一串操作。存档只存这三样（danli.solo），读档时从头重放，
 * 地形网格不用存（同一个种子加同一串操作，结果完全一样）。打完就删。
 */
import { isEntropy, type Entropy } from 'arcade-kit/rng';
import { PERSONAS } from './ai/personas.ts';
import { apply, newGame, replay } from './core/rules.ts';
import type { Action, Setup, State, Step } from './core/types.ts';

export const SOLO_KEY = 'danli.solo';

export interface SoloSave {
  v: 1;
  key: number[];
  setup: Setup;
  log: Action[];
}

/** 新的一局的种子；?seed=数字（冒烟、截图、复现 bug 用）时由它定 */
export function newKey(): Entropy {
  const seed = new URLSearchParams(location.search).get('seed');
  if (seed && /^\d{1,9}$/.test(seed)) return [Number(seed), 7, 7, 7, 7, 7, 7, 7];
  return [...crypto.getRandomValues(new Uint32Array(8))];
}

export function soloSetup(myName: string): Setup {
  const bot = PERSONAS[0]!;
  return {
    map: 'kitchen',
    players: [
      { name: myName, team: 0, look: 'shiba', weapon: 'steamer', ai: false },
      { name: bot.name, team: 1, look: bot.look, weapon: 'steamer', ai: true },
    ],
  };
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

  static fresh(myName: string): Solo {
    const key = newKey();
    const setup = soloSetup(myName);
    const s = new Solo({ v: 1, key: [...key], setup, log: [] });
    s.state = newGame(key, setup);
    s.store();
    return s;
  }

  /** 接着上一局：读不出来、对不上就当没有 */
  static load(): Solo | null {
    try {
      const raw = localStorage.getItem(SOLO_KEY);
      if (!raw) return null;
      const save = JSON.parse(raw) as SoloSave;
      if (save?.v !== 1 || !isEntropy(save.key) || !Array.isArray(save.log) || !save.setup) return null;
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

export function hasSolo(): boolean {
  try {
    return !!localStorage.getItem(SOLO_KEY);
  } catch {
    return false;
  }
}
