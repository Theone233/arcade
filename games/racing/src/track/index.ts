/**
 * 按 id 找赛道。现在只有固定赛道；以后的随机赛道 id 是 'gen:<种子码>'，在这里按种子现生成（DESIGN.md 3.3），规则核心不用改。
 */
import { FIXED } from './fixed.ts';
import type { Track } from './types.ts';

export type { Corner, Track } from './types.ts';
export { FIXED } from './fixed.ts';

export function getTrack(id: string): Track | null {
  return FIXED.find((t) => t.id === id) ?? null;
}
