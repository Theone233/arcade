import { STICKERS, PROPS } from 'arcade-kit/fun';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, interpret, parseCards, type DealResult, type PlayRecord } from '../src/core/index.ts';
import { EMOTES, EMOTE_COUNT, PROP_BASE, PROP_COUNT, STICKER_BASE, STICKER_COUNT, TAUNTS, emoteOf, taunt } from '../src/net/emotes.ts';
import { suggestFor } from '../src/view/suggest.ts';
import { dealTitles, emptyMatchLog, logDeal, matchTitles } from '../src/stake/titles.ts';
import { KEYS, getBlocked, setBlocked } from '../src/view/store.ts';

const play = (s: string) => interpret(parseCards(s), 2, DEFAULT_OPTIONS)[0]!;

describe('嘲讽系统', () => {
  it('编号表：短语 0–7 不动，嘲讽、表情、道具依次往后；表情、道具对得上 kit 的列表', () => {
    expect(EMOTES).toHaveLength(8);
    expect(emoteOf(0)).toEqual({ kind: 'phrase', text: '好牌！' });
    expect(emoteOf(8)).toEqual({ kind: 'taunt', text: TAUNTS[0] });
    expect(emoteOf(STICKER_BASE)).toEqual({ kind: 'sticker', index: 0 });
    expect(emoteOf(PROP_BASE + 4)).toEqual({ kind: 'prop', index: 4 });
    expect(emoteOf(EMOTE_COUNT)).toBeNull();
    expect(STICKERS.length).toBeGreaterThanOrEqual(STICKER_COUNT);
    expect(PROPS.length).toBeGreaterThanOrEqual(PROP_COUNT);
    expect(TAUNTS.length).toBeGreaterThanOrEqual(10);
    // 只说牌局：不带"你妈""丑""胖"之类，也不提地域、性别
    for (const t of TAUNTS) expect(t).not.toMatch(/妈|爹|丑|胖|蠢|傻|笨|男|女|省|人/);
  });

  it('顺手提示只看公开出牌：我炸了对手冒"就这？"，对手炸了我方冒"等着瞧"一类，我头游冒"谢谢送分"', () => {
    const bomb = play('♠9 ♥9 ♣9 ♦9');
    expect(suggestFor({ type: 'play', seat: 0, play: bomb, left: 10 }, 1)).toContain(taunt('就这？'));
    expect(suggestFor({ type: 'play', seat: 3, play: bomb, left: 10 }, 0)).toContain(taunt('等着瞧'));
    // 领出的炸弹没压到谁；普通出牌不冒
    expect(suggestFor({ type: 'play', seat: 0, play: bomb, left: 10 }, -1)).toEqual([]);
    expect(suggestFor({ type: 'play', seat: 1, play: play('♠K'), left: 10 }, 0)).toEqual([]);
    expect(suggestFor({ type: 'finish', seat: 0, place: 1 }, -1)).toContain(taunt('谢谢送分'));
  });

  it('称号：炸弹最多的炸弹狂魔、双下的最佳搭档、输的那边末游背锅；整局按次数算', () => {
    const r: DealResult = { dealNo: 1, order: [0, 2, 1, 3], winnerTeam: 0, up: 3, doubleDown: true, levelsBefore: [2, 2], levelsAfter: [5, 2], aFailedTeam: -1, aResetTeam: -1 };
    const b = play('♠9 ♥9 ♣9 ♦9');
    const hist: PlayRecord[] = [{ seat: 1, play: b }, { seat: 1, play: b }, { seat: 0, play: b }];
    expect(dealTitles(r, hist).map((t) => [t.id, t.seat])).toEqual([['bomb_maniac', 1], ['best_partner', 0], ['scapegoat', 3]]);
    let m = emptyMatchLog();
    m = logDeal(m, r, hist);
    m = logDeal(m, { ...r, order: [0, 1, 2, 3], doubleDown: false }, hist);
    expect(matchTitles(m).map((t) => t.id)).toEqual(['first_king', 'bomb_maniac', 'scapegoat']);
  });
});

describe('屏蔽记录（0.6.4：座位 + 名字）', () => {
  it('只认这个房间；记着名字（换了人由画面比对名字失效）；认不出的旧格式不算', () => {
    const mem = new Map<string, string>();
    const g = globalThis as { sessionStorage?: unknown };
    const prev = g.sessionStorage;
    g.sessionStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    try {
      setBlocked('111111', [{ seat: 2, name: '小二' }]);
      expect(getBlocked('111111')).toEqual([{ seat: 2, name: '小二' }]);
      expect(getBlocked('222222')).toEqual([]);
      // 0.6.0–0.6.3 记的是座位号：不认，等于没屏蔽（只在这个标签页里，刷新前点一下就回来）
      mem.set(KEYS.blocked, JSON.stringify({ code: '111111', seats: [2] }));
      expect(getBlocked('111111')).toEqual([]);
    } finally {
      g.sessionStorage = prev;
    }
  });
});
