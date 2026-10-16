import { describe, expect, it } from 'vitest';
import { fluffNote, makeFluff, shortLine, toneOf, type FluffInput } from '../src/view/trade/chatFluff.ts';

/** 0.5.1 群聊热闹元素：确定性、只用在场群友、文案短，短话不硬截断。 */
const FRIENDS = [
  { id: 'xiaoli', name: '小李' },
  { id: 'laowang', name: '老王' },
  { id: 'zhangjie', name: '张姐' },
  { id: 'qunzhu', name: '韭菜收割机' },
  { id: 'kongjun', name: '空军老周' },
];
const base: FluffInput = { seed: 'abc', day: 3, salt: 'pre', tone: 'flat', friends: FRIENDS, said: [{ friendId: 'laowang', text: '大消费，不急。' }], max: 4 };
const len = (x: string): number => Array.from(x).length;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe('群聊热闹元素', () => {
  it('同一天重绘结果一样，换天会变', () => {
    expect(makeFluff(base)).toEqual(makeFluff({ ...base }));
    const days = Array.from({ length: 8 }, (_, d) => JSON.stringify(makeFluff({ ...base, day: d })));
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('按昨天行情定调', () => {
    expect(toneOf(null)).toBe('open');
    expect(toneOf(2.1)).toBe('boom');
    expect(toneOf(-1.5)).toBe('crash');
    expect(toneOf(0.2)).toBe('flat');
  });

  it('第一条是贴纸；只用在场群友；文案短、无 emoji、不提「群主」', () => {
    const ids = new Set(FRIENDS.map((f) => f.id));
    const nameOf = (id: string): string => FRIENDS.find((f) => f.id === id)?.name ?? '群友';
    for (const tone of ['boom', 'crash', 'flat', 'open'] as const) {
      for (let d = 0; d < 30; d++) {
        const list = makeFluff({ ...base, tone, day: d });
        expect(list.length).toBeLessThanOrEqual(4);
        expect(list[0]?.kind).toBe('sticker');
        for (const f of list) {
          expect(ids.has(f.friendId)).toBe(true);
          const texts = f.kind === 'sticker' ? [f.caption] : f.kind === 'reply' ? [f.quote, f.text] : [fluffNote(f, nameOf)];
          if (f.kind === 'sticker') expect(len(f.caption)).toBeLessThanOrEqual(5);
          if (f.kind === 'reply') expect(f.text.startsWith('@')).toBe(true);
          for (const t of texts) {
            expect(EMOJI.test(t), t).toBe(false);
            expect(t.includes('群主'), t).toBe(false);
            expect(len(t), t).toBeLessThanOrEqual(20);
          }
        }
      }
    }
  });

  it('max 截断、没人时为空', () => {
    expect(makeFluff({ ...base, max: 1 })).toHaveLength(1);
    expect(makeFluff({ ...base, friends: [] })).toEqual([]);
  });
});

describe('短话 shortLine', () => {
  it('整句放得下就用整句，去掉转发标记和括注', () => {
    expect(shortLine('【转发】大消费今天静悄悄')).toBe('大消费今天静悄悄');
    expect(shortLine('家人们！AI要起飞了！今晚直播细聊!')).toBe('家人们，AI要起飞了');
    expect(shortLine('大消费（听说）今天不错。')).toBe('大消费今天不错');
  });

  it('太长时拼前几个短句，不是机械截断', () => {
    const t = shortLine('幼儿园家长群都在聊大消费，应该要涨吧？我先买点试试水，你们随意', '', 16);
    expect(len(t)).toBeLessThanOrEqual(16);
    expect(t).toBe('幼儿园家长群都在聊大消费');
  });

  it('推荐理由跳过开头的股票名，不超过 12 字', () => {
    expect(shortLine('量子波动，课程学员人手一只', '量子波动', 12)).toBe('课程学员人手一只');
    for (const x of ['一二三四五六七八九十十一十二十三十四', '我自己也买了不少，这次真的不一样，信我']) expect(len(shortLine(x, '', 12))).toBeLessThanOrEqual(12);
  });
});
