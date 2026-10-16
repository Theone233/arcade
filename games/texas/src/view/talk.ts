/**
 * 电脑的"表情"（0.3.0，DESIGN.md 13.3）：全下、赢大池、诈唬成了、被抓时按性格冒泡说一句；摊牌时亮出诈唬。
 * 只在画面层：说不说、说哪句用 Math.random（不进规则，好友房里各台设备看到的可以不一样）。
 * 不刷屏：整桌隔 SPEAK_GAP_MS 才说下一句，一手里一个人最多说一次；话多的性格说得勤，闷的几乎不说。
 */

import type { StickerId } from 'arcade-kit/fun';

/**
 * 自己推全下、跟别人的全下（跟到全下）、赢了大池子、诈唬成了（亮出来的，或者下了注别人都弃了）、诈唬被抓。
 * 推和跟分开（0.3.0 实打：老好自己推全下时说"跟到底！"）
 */
export type Moment = 'allin' | 'callAllin' | 'bigWin' | 'bluffWon' | 'caught';

/** 每种性格多爱说话（‰），顺序同 PERSONAS：稳哥、阿飙、老好、慢慢、算盘、江湖、虎子、老鹰、叨叨、小白 */
const CHATTY = [150, 450, 350, 200, 150, 300, 550, 150, 900, 450];

/** 台词按性格分；没写的那种时刻用 COMMON。大白话，不嘲弄人 */
const LINES: Partial<Record<Moment, string[]>>[] = [
  { allin: ['就这一把了'], callAllin: ['我跟'], bigWin: ['稳稳的'], caught: ['难得试一次'] },
  { allin: ['全推，敢跟吗？', '来！'], callAllin: ['跟你玩到底'], bluffWon: ['不服来跟', '又偷到了'], caught: ['被你看穿了'], bigWin: ['我就说吧'] },
  { allin: ['全押上了！'], callAllin: ['跟到底！'], bigWin: ['运气好运气好'], caught: ['我也就试试'] },
  { allin: ['我、我全下了…'], callAllin: ['我…我跟'], bigWin: ['居然赢了'], bluffWon: ['吓、吓到你了？'] },
  { allin: ['算过了'], callAllin: ['赔率够，跟'], bigWin: ['算得没错'], caught: ['概率站在你那边'], bluffWon: ['这个价你不跟'] },
  { allin: ['看你接不接'], callAllin: ['接了'], bluffWon: ['嘿嘿', '承蒙关照'], caught: ['江湖上就是这样'], bigWin: ['承让承让'] },
  { allin: ['全上！', '敢不敢？'], callAllin: ['谁怕谁'], bluffWon: ['被我吓跑了吧', '胆子小了点'], caught: ['诈唬嘛，常有的事'], bigWin: ['哈哈哈'] },
  { allin: ['到此为止'], callAllin: ['看牌吧'], bigWin: ['意料之中'], bluffWon: ['收下了'] },
  { allin: ['冲冲冲！', '拼了！'], callAllin: ['一起冲！'], bigWin: ['发财啦！', '今天手气旺'], bluffWon: ['都不玩了？'], caught: ['哎呀被抓了'] },
  { allin: ['全下是这样按的吧？'], callAllin: ['跟了跟了'], bigWin: ['我赢了？！'], bluffWon: ['大家怎么都走了'], caught: ['原来要有牌才行…'] },
];

/** 电脑说话时配的表情包（kit 的 STICKERS）：按时刻，几个性格换一个更像它的 */
const STICKER: Record<Moment, StickerId> = { allin: 'cool', callAllin: 'cool', bigWin: 'smug', bluffWon: 'sly', caught: 'sweat' };
const STICKER_BY: Partial<Record<number, Partial<Record<Moment, StickerId>>>> = {
  3: { allin: 'sweat', callAllin: 'sweat', bigWin: 'shock' },
  6: { allin: 'angry', callAllin: 'angry', bigWin: 'lol' },
  8: { bigWin: 'lol', caught: 'cry' },
  9: { allin: 'shock', callAllin: 'shock', bigWin: 'love', caught: 'cry' },
};
export const stickerFor = (persona: number, m: Moment): StickerId => STICKER_BY[persona]?.[m] ?? STICKER[m];

const COMMON: Record<Moment, string[]> = {
  allin: ['全下'],
  callAllin: ['跟了'],
  bigWin: ['承让'],
  bluffWon: ['嘿'],
  caught: ['被抓了'],
};

/** 整桌两句话之间至少隔这么久（真人节奏，不刷屏） */
const SPEAK_GAP_MS = 8_000;
/** 同一个电脑同一句话至少隔这么多手再说（0.3.0 实打："嘿"连着几手重复）；这一刻能说的都刚说过就不说 */
export const REPEAT_HANDS = 5;

export class Talk {
  private last = -Infinity;
  private said = new Set<number>();
  private hand = -1;
  /** 每个座位每句话上次是第几手说的 */
  private lastSaid = new Map<string, number>();

  /**
   * 这一刻要不要说、说哪句；不说时 null。must：亮诈唬、赢大池子这种一手就一回的，不看间隔
   */
  line(seat: number, persona: number, handNo: number, m: Moment, must = false): string | null {
    if (handNo !== this.hand) {
      this.hand = handNo;
      this.said.clear();
    }
    const now = performance.now();
    if (this.said.has(seat) || (!must && now - this.last < SPEAK_GAP_MS)) return null;
    if (Math.random() * 1000 >= (CHATTY[persona] ?? 300) * (must ? 2 : 1)) return null;
    const pool = (LINES[persona]?.[m] ?? COMMON[m]).filter((x) => handNo - (this.lastSaid.get(`${seat}:${x}`) ?? -Infinity) >= REPEAT_HANDS);
    if (!pool.length) return null;
    const text = pool[Math.floor(Math.random() * pool.length)]!;
    this.last = now;
    this.said.add(seat);
    this.lastSaid.set(`${seat}:${text}`, handNo);
    return text;
  }
}

export { bluffer } from '../core/fame.ts';
