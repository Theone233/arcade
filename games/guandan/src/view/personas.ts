/**
 * 三个电脑的性格：只影响台词和表情，不影响出牌（出牌由 src/ai 决定）。
 * 老张：豪爽、爱炸弹；小美：稳、话少、冷静；阿强：莽、嘴快、输了不服。
 */
import type { SeatId } from './labels.ts';

export type Situation =
  | 'bomb' | 'jokerBomb' | 'bombed' | 'beat' | 'lead' | 'pass' | 'first' | 'last' | 'fewCards'
  | 'tribute' | 'getTribute' | 'partnerFirst' | 'win' | 'lose' | 'start' | 'jiefeng';

type BotId = Exclude<SeatId, 'me'>;

const LINES: Record<BotId, Partial<Record<Situation, string[]>>> = {
  laozhang: {
    bomb: ['炸！', '看我的炸弹！', '炸了再说！', '嘿，就等这一下'],
    jokerBomb: ['四个王！服不服？', '天王炸，管够！'],
    bombed: ['哎哟，炸我？', '行啊你们'],
    beat: ['压一手', '这个我要了', '来来来'],
    pass: ['过', '你们先', '不要'],
    lead: ['走一个', '开张'],
    first: ['头游！老张还是老张', '哈哈，我先走一步'],
    last: ['唉，手气不行', '下把再炸回来'],
    fewCards: ['我可快走完了啊'],
    tribute: ['拿去拿去', '一张牌而已'],
    getTribute: ['谢了啊'],
    partnerFirst: ['好！阿强漂亮'],
    win: ['痛快！', '老张赢了请喝茶'],
    lose: ['今天不算，再来！'],
    start: ['来来，开打！', '今天手热'],
    jiefeng: ['我来接'],
  },
  xiaomei: {
    bomb: ['炸。', '这时候该炸了'],
    jokerBomb: ['天王炸。', '收下吧'],
    bombed: ['嗯，记住了', '有点意思'],
    beat: ['压', '我来', '顶上'],
    pass: ['过', '不要', '你先'],
    lead: ['我出', '小牌走'],
    first: ['头游。', '先走一步'],
    last: ['这把牌太散', '下一副'],
    fewCards: ['还剩几张'],
    tribute: ['给。'],
    getTribute: ['收到'],
    partnerFirst: ['漂亮！', '队友给力'],
    win: ['稳稳拿下', '配合得好'],
    lose: ['没关系，下局再来'],
    start: ['加油', '好好打'],
    jiefeng: ['我接上'],
  },
  aqiang: {
    bomb: ['炸！谁怕谁', '炸死你们！', '吃我一炸'],
    jokerBomb: ['天王炸！！', '无敌了！'],
    bombed: ['什么鬼！', '不讲武德啊'],
    beat: ['管上！', '压死', '冲冲冲'],
    pass: ['算了算了', '过过过', '让你一手'],
    lead: ['看好了！', '接招'],
    first: ['我第一！', '冲刺成功'],
    last: ['不可能！', '牌太烂了'],
    fewCards: ['我要走了哦！'],
    tribute: ['哼，给你'],
    getTribute: ['嘿嘿，谢啦'],
    partnerFirst: ['张叔牛！'],
    win: ['赢麻了！', '太爽了'],
    lose: ['再来一局！我不服'],
    start: ['冲！', '今天必赢'],
    jiefeng: ['接风！看我的'],
  },
};

let counter = 0;

/** 取一句台词（轮换着来，不全靠随机，免得连说同一句）。没有该情境的台词时返回 null。 */
export function lineFor(id: SeatId, sit: Situation): string | null {
  if (id === 'me') return null;
  const list = LINES[id][sit];
  if (!list || list.length === 0) return null;
  counter = (counter + 1 + Math.floor(Math.random() * 3)) % 9973;
  return list[counter % list.length]!;
}

/** 说话频率：老张、阿强话多，小美话少。 */
export const TALKATIVE: Record<SeatId, number> = { me: 0, laozhang: 0.45, xiaomei: 0.22, aqiang: 0.55 };
