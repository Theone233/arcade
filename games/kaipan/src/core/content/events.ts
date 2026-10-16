import { fx } from '../balance.ts';
import type { EventDef } from '../hooks.ts';
import type { EventState, GameState, Stage, ThemeId } from '../types.ts';
import { formatMoney } from '../format.ts';
import { BALANCE } from '../balance.ts';
import { forwardRet } from '../real.ts';
import { COLLATERALS, collateralTerms } from './ext.ts';
import { ITEMS } from './items.ts';
import { PERSONAS } from './personas.ts';
import { STOCKS, THEMES } from './stocks.ts';

const UP_STAGES: readonly Stage[] = ['sprout', 'ferment', 'rally'];

function stockName(id: string | undefined): string {
  return STOCKS.find((d) => d.id === id)?.name ?? '？';
}

function themeName(id: ThemeId | undefined): string {
  return THEMES.find((t) => t.id === id)?.name ?? '？';
}

function yuan(v: number): string {
  return `¥${Math.round(v)}`;
}

/** 放进来的股票会占哪一格：第一个空格；没有就换掉持有收益最低的一只（同样低时取靠后的）。 */
export function eventSlot(s: Readonly<GameState>): number {
  const empty = s.slots.findIndex((h) => h === null);
  if (empty >= 0) return empty;
  let worst = 0;
  let worstValue = Infinity;
  s.slots.forEach((h, i) => {
    if (h && h.value <= worstValue) {
      worstValue = h.value;
      worst = i;
    }
  });
  return worst;
}

const TACTICS = ITEMS.filter((d) => d.kind === 'tactic' && !d.ext).map((d) => d.id);

function pctText(v: number): string {
  return `${Math.round(v * 100) / 100}%`;
}

/**
 * 事件（0.3.0：15 个，前 6 个是 M0 的）：每月领完奖励后按概率触发一个，二选一，后果简单明确。数值在 BALANCE.fx[id]。
 * 全部虚构。延后结算的事件（借钱、摆摊、理财、量化软件续费）在 prepare 时要求 month + 2 ≤ 12。
 * 第 8 级"末日"：花费和损失 × badMult（EventCtx.addAccount 自动乘），概率类的坏结果由事件自己放大。
 */
export const EVENTS: readonly EventDef[] = [
  {
    id: 'cousin',
    name: '表哥荐股',
    text: (e) => `表哥神秘兮兮地发来一只过山车股：${stockName(e.stockId)}。"这次绝对靠谱！"（表哥的消息大概只有 ${Math.round(fx('cousin', 'acc') * 100)}% 准）`,
    options(e, s) {
      const old = e.slot !== undefined ? s.slots[e.slot] : null;
      return [`买（${stockName(e.stockId)}${old ? `，换掉${stockName(old.stockId)}` : '，放进空位'}）`, '不买，表哥的话听听就好'];
    },
    prepare({ state, rng }) {
      const held = new Set(state.slots.map((h) => h?.stockId));
      const memes = STOCKS.filter((d) => d.role === 'meme' && state.stocks[d.id] && !state.stocks[d.id]?.delisted && !held.has(d.id));
      if (memes.length === 0) return null;
      const good = rng.next() < fx('cousin', 'acc');
      // 0.5 真实行情：表哥说中 = 这只接下来 3 天真的涨
      const real = state.real;
      const fits = real?.track
        ? memes.filter((d) => forwardRet(real, 'stock', d.id, state.dayIndex, 3) > 0 === good)
        : memes.filter((d) => UP_STAGES.includes(state.themes[d.theme]?.stage ?? 'cold') === good);
      const pool = fits.length > 0 ? fits : memes;
      return { stockId: pool[rng.int(pool.length)]?.id, slot: eventSlot(state) };
    },
    resolve(c, option) {
      if (option !== 0 || !c.event.stockId || c.event.slot === undefined) return '表哥：不信我？你会后悔的。';
      c.placeStock(c.event.stockId, c.event.slot);
      return `${stockName(c.event.stockId)}到手了。表哥：放心，这次稳了。`;
    },
  },
  {
    id: 'livestream',
    name: '大V直播间',
    text: (e) => `股市小诸葛开直播："家人们，${themeName(e.theme)}还能冲！"弹幕刷屏，要不要跟着买？`,
    options: (e, s) => [
      s.real?.track
        ? `跟（直播间粉丝抢着买：手里${themeName(e.theme)}的股票每一份马上多赚 ${fx('livestream', 'realBonus')}%；热度也被带起来，但涨跌照真的走）`
        : `跟（接下来 ${fx('livestream', 'days')} 天${themeName(e.theme)}每天热度 +${fx('livestream', 'dH')}；手里有它的股票才赚得到）`,
      '不跟，看看就好',
    ],
    prepare({ state }) {
      let best: ThemeId | null = null;
      let heat = -1;
      for (const id of state.themeIds) {
        const h = state.themes[id]?.heat ?? 0;
        if (h > heat) {
          heat = h;
          best = id;
        }
      }
      return best ? { theme: best } : null;
    },
    resolve(c, option) {
      if (option !== 0 || !c.event.theme) return '你关掉了直播间，世界清静了。';
      c.boostTheme(c.event.theme, fx('livestream', 'dH'), fx('livestream', 'days'));
      if (c.state.real?.track) {
        let units = 0;
        for (const h of c.state.slots) if (h && !h.short && STOCKS.find((d) => d.id === h.stockId)?.theme === c.event.theme) units += h.units ?? 1;
        const got = c.addAccount((c.state.account * units * fx('livestream', 'realBonus')) / 400);
        return got > 0 ? `你在弹幕里刷了一句"跟了"。粉丝抢着接你手里的${themeName(c.event.theme)}，多拿 ${yuan(got)}。` : `你在弹幕里刷了一句"跟了"。可你手里没有${themeName(c.event.theme)}的股票，只是凑了个热闹。`;
      }
      return `你在弹幕里刷了一句"跟了"。${themeName(c.event.theme)}的热度被直播间带了起来。`;
    },
  },
  {
    id: 'lottery_party',
    name: '年会抽奖',
    text: () => `公司年会抽奖，奖品是账户 +${fx('lottery_party', 'min')}~${fx('lottery_party', 'max')}% 的红包。`,
    options: () => ['上台抽奖', '把机会让给实习生'],
    prepare: () => ({}),
    resolve(c, option) {
      if (option !== 0) return '实习生抽中了一等奖，对你千恩万谢。';
      const lo = fx('lottery_party', 'min');
      const hi = fx('lottery_party', 'max');
      const pct = lo + c.rng.int(Math.max(1, hi - lo + 1));
      c.addAccount((c.state.account * pct) / 100);
      return `抽中了 ${pct}% 的红包！`;
    },
  },
  {
    id: 'course',
    name: '韭菜收割机卖课',
    text: (e) => `韭菜收割机私聊你："《三天学会跟紧大哥》限时特价 ${yuan(e.amount ?? 0)}，学完随机送你一招！"`,
    options: (e) => [`花 ${yuan(e.amount ?? 0)} 买课（随机学会一招买卖套路，是个道具）`, '拒绝，并把韭菜收割机设为免打扰'],
    prepare({ state }) {
      if (!TACTICS.some((id) => !state.items.includes(id))) return null;
      return { amount: Math.round((state.account * fx('course', 'cost')) / 100) };
    },
    resolve(c, option) {
      if (option !== 0) return '韭菜收割机：你会回来求我的。';
      const left = TACTICS.filter((id) => !c.state.items.includes(id));
      const id = left[c.rng.int(left.length)];
      c.addAccount(-(c.event.amount ?? 0));
      if (!id) return '课程内容是一页 PPT。';
      c.gainItem(id);
      return `你学会了${ITEMS.find((d) => d.id === id)?.name ?? id}（课程本身是一页 PPT）。`;
    },
  },
  {
    id: 'lottery',
    name: '买彩票',
    text: (e) => `路过彩票店，老板说今天奖池很大。一注 ${yuan(e.amount ?? 0)}，中了账户 +${fx('lottery', 'prize')}%。`,
    options: (e) => [`花 ${yuan(e.amount ?? 0)} 买一注`, '不买，回家看股票'],
    prepare: ({ state }) => ({ amount: Math.round((state.account * fx('lottery', 'cost')) / 100) }),
    resolve(c, option) {
      if (option !== 0) return '你省下了一注彩票钱。';
      c.addAccount(-(c.event.amount ?? 0));
      if (c.rng.next() < fx('lottery', 'chance')) {
        c.addAccount((c.state.account * fx('lottery', 'prize')) / 100);
        return `中了！账户 +${fx('lottery', 'prize')}%！老板说你印堂发亮。`;
      }
      return '没中。老板说下次一定。';
    },
  },
  {
    id: 'bonus',
    name: '公司发年终奖',
    text: () => `公司发年终奖了！账户 +${fx('bonus', 'pct')}%。`,
    options: () => ['收下', '婉拒，留给老板买游艇'],
    // 只在 1 月（刚还完 1 月月供）或 12 月（刚还完 11 月月供、进入 12 月）出现
    prepare: ({ state, month }) => (month === 1 || month === 11 ? { amount: Math.round((state.account * fx('bonus', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '老板感动得热泪盈眶，然后照常加班。';
      c.addAccount(c.event.amount ?? 0);
      return `年终奖到账 ${yuan(c.event.amount ?? 0)}。`;
    },
  },
  // ---------------------------------------------------------------- 0.3.0 新增
  {
    id: 'landlord',
    name: '房东涨租',
    text: () => '房东发来微信："下个月起房租涨一点点哈～"后面跟着三朵玫瑰。',
    options: (e) => [
      `答应（下个月要还的钱 ×${fx('landlord', 'billMult')}）`,
      `搬家（花 ${yuan(e.amount ?? 0)} 搬家费，要还的钱不变）`,
    ],
    prepare: ({ state }) => ({ amount: Math.round((state.account * fx('landlord', 'moveCost')) / 100) }),
    resolve(c, option) {
      if (option === 0) {
        c.scaleNextBill(fx('landlord', 'billMult'));
        return '房东回了句"谢谢老板"，又发了三朵玫瑰。';
      }
      const d = c.addAccount(-(c.event.amount ?? 0));
      return `搬家花了 ${yuan(-d)}，师傅把显示器磕了个角，不过房租保住了。`;
    },
  },
  {
    id: 'classmate_loan',
    name: '老同学借钱',
    text: (e) =>
      `大学室友找你借 ${yuan(e.amount ?? 0)}："${e.month + 2} 月初一定还，再多给你 ${fx('classmate_loan', 'interest')}% 利息。兄弟我什么时候骗过你？"`,
    options: (e) => [
      `借（${e.month + 2} 月初连本带利还 ${yuan(((e.amount ?? 0) * (100 + fx('classmate_loan', 'interest'))) / 100)}，前提是他记得）`,
      '不借（友谊的小船晃了一下）',
    ],
    prepare: ({ state, month }) => (month + 2 <= 12 ? { amount: Math.round((state.account * fx('classmate_loan', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '室友回了个"理解理解"，然后把你的朋友圈设成了三天可见。';
      c.addAccount(-(c.event.amount ?? 0), true);
      c.addPending(c.event.amount ?? 0, c.event.month + 2);
      return `钱转过去了。室友："${c.event.month + 2} 月初见！"`;
    },
    settle(c, amount) {
      if (c.rng.next() < fx('classmate_loan', 'forget') * c.badMult) {
        return { delta: 0, text: '室友说他"最近手头紧"，下个月一定还。你看着他新换的手机，没说话。' };
      }
      const back = Math.round((amount * (100 + fx('classmate_loan', 'interest'))) / 100);
      return { delta: back, text: `室友连本带利还了 ${yuan(back)}，附赠一句"苟富贵，勿相忘"。` };
    },
  },
  {
    id: 'side_hustle',
    name: '周末摆摊',
    text: (e) => `朋友拉你周末去夜市摆摊卖烤肠，说"稳赚不赔"。入伙要 ${yuan(e.amount ?? 0)}。`,
    options: (e) => [
      `入伙（${e.month + 2} 月初分账：拿回本金的 ${Math.round(fx('side_hustle', 'min') * 100)}%~${Math.round(fx('side_hustle', 'max') * 100)}%）`,
      '不去（周末在家研究股票）',
    ],
    prepare: ({ state, month }) => (month + 2 <= 12 ? { amount: Math.round((state.account * fx('side_hustle', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '你在家研究了一整个周末股票，研究出了黑眼圈。';
      c.addAccount(-(c.event.amount ?? 0), true);
      c.addPending(c.event.amount ?? 0, c.event.month + 2);
      return '你系上围裙，烤肠在铁板上滋滋作响。';
    },
    settle(c, amount) {
      const lo = fx('side_hustle', 'min');
      const hi = fx('side_hustle', 'max');
      const mult = (lo + c.rng.next() * (hi - lo)) / c.badMult;
      const back = Math.round(amount * mult);
      return {
        delta: back,
        text: mult >= 1 ? `夜市分账：拿回 ${yuan(back)}。烤肠真香。` : `城管来了三次，分账只拿回 ${yuan(back)}。烤肠自己吃了。`,
      };
    },
  },
  {
    id: 'cat_keyboard',
    name: '猫踩键盘',
    text: (e) => `猫从键盘上踩过去，留下一笔买单：${stockName(e.stockId)}。它回头看了你一眼，好像很有把握。`,
    options(e, s) {
      const old = e.slot !== undefined ? s.slots[e.slot] : null;
      return [`留着（${stockName(e.stockId)}${old ? `，换掉${stockName(old.stockId)}` : '，放进空位'}）`, '撤单（猫不懂炒股）'];
    },
    prepare({ state, rng }) {
      const held = new Set(state.slots.map((h) => h?.stockId));
      const pool = STOCKS.filter((d) => d.role === 'follower' && state.stocks[d.id] && !state.stocks[d.id]?.delisted && !held.has(d.id));
      if (pool.length === 0) return null;
      const random = pool[rng.int(pool.length)]?.id;
      // 0.5 真实行情：猫有 BALANCE.intel.cat 的概率踩中接下来 2 天真实涨得最多的那只小弟
      const real = state.real;
      if (real?.track && rng.next() < BALANCE.intel.cat) {
        let best = pool[0]?.id;
        let bx = -Infinity;
        for (const d of pool) {
          const x = forwardRet(real, 'stock', d.id, state.dayIndex, 2);
          if (x > bx) {
            bx = x;
            best = d.id;
          }
        }
        return { stockId: best, slot: eventSlot(state) };
      }
      return { stockId: random, slot: eventSlot(state) };
    },
    resolve(c, option) {
      if (option !== 0 || !c.event.stockId || c.event.slot === undefined) return '你撤了单。猫在键盘上睡着了，打出一行"jjjjjjjj"。';
      c.placeStock(c.event.stockId, c.event.slot);
      return `${stockName(c.event.stockId)}到手了。猫的眼光如何，开盘见分晓。`;
    },
  },
  {
    id: 'red_packet',
    name: '群里抢红包',
    text: () => '韭菜收割机在群里发了个拼手气红包："抢到的都是自己人！"',
    options: () => [
      `抢！（多半能抢到一点；要是手气最差，按群规得回发一个红包，大约是你账户的 ${pctText(fx('red_packet', 'lose'))}）`,
      '不抢（韭菜收割机的红包不好拿）',
    ],
    prepare: () => ({}),
    resolve(c, option) {
      if (option !== 0) return '你没抢。韭菜收割机："不合群。"';
      const u = c.rng.next();
      const v = c.rng.next();
      if (u < fx('red_packet', 'win') / c.badMult) {
        const lo = fx('red_packet', 'min');
        const hi = fx('red_packet', 'max');
        const d = c.addAccount((c.state.account * (lo + v * (hi - lo))) / 100);
        return `抢到 ${yuan(d)}！韭菜收割机私聊你："自己人，VIP 群了解一下？"`;
      }
      const d = c.addAccount((-c.state.account * fx('red_packet', 'lose')) / 100);
      return `手气最差，抢到 ¥0.01。按群规回发了一个 ${yuan(-d)} 的大红包，群里一片"谢谢老板"。`;
    },
  },
  {
    id: 'quant_trial',
    name: '炒股软件试用',
    text: () => '一款叫"韭菜雷达"的炒股软件邀请你免费试用一个月，说能看穿每个风口的真实状态。',
    options: (e) => [
      `试用（${e.month + 1} 月一整月有"风口温度计"；${e.month + 2} 月初自动续费 ${yuan(e.amount ?? 0)}）`,
      '不用（我信我自己）',
    ],
    prepare: ({ state, month }) =>
      month + 2 <= 12 && !state.items.includes('mood_meter') ? { amount: Math.round((state.account * fx('quant_trial', 'renew')) / 100) } : null,
    resolve(c, option) {
      if (option !== 0) return '你关掉了弹窗。弹窗又弹了三次。';
      c.gainItem('mood_meter', c.event.month + 1);
      c.addPending(c.event.amount ?? 0, c.event.month + 2);
      return '装好了。炒股软件里多了一排小字，看起来很专业。';
    },
    settle(c, amount) {
      const fee = Math.round(amount * c.badMult);
      return { delta: -fee, text: `"韭菜雷达"自动续费成功，扣了 ${yuan(fee)}。取消按钮藏在第七层菜单里。` };
    },
  },
  {
    id: 'blind_box',
    name: '炒股盲盒',
    text: (e) => `楼下新开了家"炒股盲盒"店，${yuan(e.amount ?? 0)} 一个，开出什么道具全看手气。`,
    options: (e) => [`抽一个（花 ${yuan(e.amount ?? 0)}，随机得到一个道具）`, '不抽（盲盒的尽头是破产）'],
    prepare({ state }) {
      if (blindPool(state).length === 0) return null;
      return { amount: Math.round((state.account * fx('blind_box', 'cost')) / 100) };
    },
    resolve(c, option) {
      if (option !== 0) return '你忍住了。店员在背后说"下次一定"。';
      const pool = blindPool(c.state);
      const id = pool[c.rng.int(pool.length)];
      c.addAccount(-(c.event.amount ?? 0));
      if (!id) return '盲盒是空的，里面只有一张"谢谢惠顾"。';
      c.gainItem(id);
      return `开出了「${ITEMS.find((d) => d.id === id)?.name ?? id}」！店员说你今天手气爆棚。`;
    },
  },
  {
    id: 'fund_manager',
    name: '理财经理来电',
    text: (e) =>
      `银行理财经理打来电话："稳稳理财，一个月 +${fx('fund_manager', 'ret')}%，比放着强多了！"起投 ${yuan(e.amount ?? 0)}，锁一个月。`,
    options: (e) => [
      `买（锁到 ${e.month + 2} 月初，连本带利拿回约 ${yuan(((e.amount ?? 0) * (100 + fx('fund_manager', 'ret'))) / 100)}；锁着的钱不能拿来还月底的账）`,
      '不买（稳稳的幸福自己给）',
    ],
    prepare: ({ state, month }) => (month + 2 <= 12 ? { amount: Math.round((state.account * fx('fund_manager', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '理财经理："好的，祝您生活愉快。"语气里有一丝失落。';
      c.addAccount(-(c.event.amount ?? 0), true);
      c.addPending(c.event.amount ?? 0, c.event.month + 2);
      return '签完字，理财经理送了你一桶花生油。';
    },
    settle(c, amount) {
      if (c.badMult > 1 && c.rng.next() < (c.badMult - 1) * 0.3) {
        const back = Math.round(amount * 0.9);
        return { delta: back, text: `理财产品说"晚点再还"，最后只拿回 ${yuan(back)}。花生油还在。` };
      }
      const back = Math.round((amount * (100 + fx('fund_manager', 'ret'))) / 100);
      return { delta: back, text: `理财到期，连本带利 ${yuan(back)} 到账。花生油也吃完了。` };
    },
  },
  {
    id: 'overtime',
    name: '老板喊加班',
    text: () => '老板在群里@你："这周末加个班，三倍工资。"下面是一排整齐的"收到"。',
    options: (e) => [`加班（账户 +${yuan(e.amount ?? 0)}，但下个交易日没空：不能买也不能卖）`, '拒绝（老板的脸色比跌停还难看）'],
    prepare: ({ state }) => ({ amount: Math.round((state.account * fx('overtime', 'pct')) / 100) }),
    resolve(c, option) {
      if (option !== 0) return '老板说"年轻人要有奋斗精神"，然后去钓鱼了。';
      c.addAccount(c.event.amount ?? 0);
      c.skipNextDay();
      return '三倍工资到账。下个交易日你在工位上，只能偷偷瞄一眼股价。';
    },
  },
  // ---------------------------------------------------------------- 0.4 C：押跌、抵押（只在有新机制的局里出现）
  {
    id: 'bank_manager',
    name: '银行经理上门',
    text: (e) => {
      const c = COLLATERALS.find((d) => d.id === e.collateral);
      return `银行客户经理拎着果篮上门："听说您炒股很厉害？把${c?.name ?? '东西'}押给我们，马上借您 ${yuan(e.amount ?? 0)}，利息打 ${Math.round(fx('bank_manager', 'rateMult') * 10)} 折。"`;
    },
    options: (e) => {
      const c = COLLATERALS.find((d) => d.id === e.collateral);
      return [`押${c?.name ?? '东西'}，借 ${yuan(e.amount ?? 0)}（赚亏都放大；亏多了东西会被收走）`, '不借（果篮留下，人请回）'];
    },
    prepare: ({ state, rng, month }) => {
      const x = state.ext;
      if (!x || month >= 12 || month + 1 < BALANCE.ext.bankMonth) return null;
      const free = COLLATERALS.filter((d) => !x.loans.some((l) => l.id === d.id) && !x.log.seized.includes(d.id) && collateralTerms(d.id, state.difficulty));
      const ok = free.filter((d) => {
        const amount = collateralTerms(d.id, state.difficulty)?.amount ?? 0;
        let debt = amount;
        for (const l of x.loans) debt += l.amount;
        return state.account + amount >= debt * BALANCE.ext.borrowLine;
      });
      if (ok.length === 0) return null;
      const pick = ok[rng.int(ok.length)] as (typeof ok)[number];
      return { collateral: pick.id, amount: collateralTerms(pick.id, state.difficulty)?.amount ?? 0 };
    },
    resolve(c, option) {
      if (option !== 0 || !c.event.collateral) return '经理走的时候顺手把果篮也拎走了。';
      return c.takeLoan(c.event.collateral, fx('bank_manager', 'rateMult')) ? '签字、按手印，钱到账了。经理笑得比你还开心。' : '经理看了看你的账户，说"下次一定"。';
    },
  },
  {
    id: 'bear_live',
    name: '空头大V直播',
    text: () => '一个戴墨镜的大V在直播间喊："只会买涨的都是韭菜！押跌也能赚钱！"他给你发了一张押跌体验卡。',
    options: () => [`收下（${fx('bear_live', 'months')} 个月内可以押跌，空军老周进群）`, '不要（我只会买涨，我骄傲）'],
    prepare: ({ state, month }) => (state.ext && month < 12 && !state.items.includes('short_permit') && state.difficulty < BALANCE.ext.shortLevel ? {} : null),
    resolve(c, option) {
      if (option !== 0) return '大V骂了一句"韭菜就是韭菜"，下播了。';
      c.gainItem('short_permit', c.event.month + fx('bear_live', 'months'));
      return '体验卡到手。群里多了个戴墨镜的头像。';
    },
  },
  {
    id: 'mother_in_law',
    name: '丈母娘查岗',
    text: (e) => `丈母娘突然来电："听说你把${e.collateral === 'house' ? '房子' : '金镯子'}押出去炒股了？"`,
    options: (e) => [`发个红包压压惊（${yuan(e.amount ?? 0)}）`, `老实交代（下个月家里要多交 ${Math.round((fx('mother_in_law', 'billMult') - 1) * 100)}% 生活费）`],
    prepare: ({ state, month }) => {
      const x = state.ext;
      if (!x || month >= 12) return null;
      const l = x.loans.find((l) => l.id === 'house' || l.id === 'bracelet');
      return l ? { collateral: l.id, amount: Math.round((state.account * fx('mother_in_law', 'pct')) / 100) } : null;
    },
    resolve(c, option) {
      if (option === 0) {
        c.addAccount(-(c.event.amount ?? 0));
        return '红包发过去，对面回了一个"好女婿"的表情包。';
      }
      c.scaleNextBill(fx('mother_in_law', 'billMult'));
      return '你老实交代了。丈母娘说："赚了算你的，亏了算你的。"';
    },
  },
  {
    id: 'parents_call',
    name: '爸妈打电话',
    text: () => '爸妈打来电话："钱用得还顺手吗？不够再说啊。"',
    options: () => ['"挺好的，赚了！"（报喜不报忧）', '说实话（爸妈说那笔钱不要利息了）'],
    prepare: ({ state, month }) => (state.ext?.loans.some((l) => l.id === 'pension') && month < 12 ? {} : null),
    resolve(c, option) {
      if (option === 0) return '爸妈很高兴，说要去跳广场舞庆祝。你挂了电话，看了一眼账户。';
      c.setLoanRate('pension', 0);
      return '爸妈沉默了一会儿："不着急还，利息就算了，你好好的就行。"';
    },
  },

];

/** 0.5 事件卡上一个选项：≤8 字的按钮 + 一个大数字（代价或收益；tone 决定颜色）。 */
export interface EventPick {
  label: string;
  big?: string;
  tone?: 'gain' | 'cost' | 'plain';
}

/** 0.5 事件卡的短版：一行情景（≤20 字）+ 两个选项。长句（正文、选项原文）留在悬停详情里。 */
export interface EventBrief {
  brief(e: Readonly<EventState>, s: Readonly<GameState>): string;
  picks(e: Readonly<EventState>, s: Readonly<GameState>): [EventPick, EventPick];
}

const cost = (v: number): EventPick['big'] => formatMoney(-Math.abs(v));
const gain = (v: number): EventPick['big'] => formatMoney(Math.abs(v), { sign: true });

export const EVENT_BRIEF: Readonly<Record<string, EventBrief>> = {
  cousin: {
    brief: (e) => `表哥发来一只过山车股：${stockName(e.stockId)}`,
    picks: () => [{ label: '买下', big: `${Math.round(fx('cousin', 'acc') * 100)}%准`, tone: 'plain' }, { label: '不买' }],
  },
  livestream: {
    brief: (e) => `小诸葛直播：${themeName(e.theme)}还能冲！`,
    picks: (_e, s) => [
      s.real?.track ? { label: '跟', big: `+${fx('livestream', 'realBonus')}%`, tone: 'gain' } : { label: '跟', big: `热度+${fx('livestream', 'dH')}`, tone: 'gain' },
      { label: '不跟' },
    ],
  },
  lottery_party: {
    brief: () => '公司年会抽红包',
    picks: () => [{ label: '上台抽奖', big: `+${fx('lottery_party', 'min')}~${fx('lottery_party', 'max')}%`, tone: 'gain' }, { label: '让给实习生' }],
  },
  course: {
    brief: () => '限时特价课，学完随机送你一招',
    picks: (e) => [{ label: '买课', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '拒绝' }],
  },
  lottery: {
    brief: () => `彩票奖池很大，中了账户+${fx('lottery', 'prize')}%`,
    picks: (e) => [{ label: '买一注', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不买' }],
  },
  bonus: {
    brief: () => '公司发年终奖了！',
    picks: (e) => [{ label: '收下', big: gain(e.amount ?? 0), tone: 'gain' }, { label: '婉拒' }],
  },
  landlord: {
    brief: () => '房东：下个月房租涨一点哈',
    picks: (e) => [
      { label: '答应', big: `房租×${fx('landlord', 'billMult')}`, tone: 'cost' },
      { label: '搬家', big: cost(e.amount ?? 0), tone: 'cost' },
    ],
  },
  classmate_loan: {
    brief: (e) => `室友借钱，说${e.month + 2}月初连本带利还`,
    picks: (e) => [{ label: '借给他', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不借' }],
  },
  side_hustle: {
    brief: () => '朋友拉你去夜市摆摊卖烤肠',
    picks: (e) => [{ label: '入伙', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不去' }],
  },
  cat_keyboard: {
    brief: (e) => `猫踩键盘，下单了：${stockName(e.stockId)}`,
    picks: () => [{ label: '留着' }, { label: '撤单' }],
  },
  red_packet: {
    brief: () => '收割机发了个拼手气红包',
    picks: () => [{ label: '抢！', big: '碰手气', tone: 'plain' }, { label: '不抢' }],
  },
  quant_trial: {
    brief: () => '炒股软件请你免费试用一个月',
    picks: (e) => [{ label: '试用', big: `续费${formatMoney(e.amount ?? 0)}`, tone: 'cost' }, { label: '不用' }],
  },
  blind_box: {
    brief: () => '楼下开了家炒股盲盒店',
    picks: (e) => [{ label: '抽一个', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不抽' }],
  },
  fund_manager: {
    brief: () => `理财经理：一个月稳赚+${fx('fund_manager', 'ret')}%`,
    picks: (e) => [{ label: '买', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不买' }],
  },
  overtime: {
    brief: () => '老板：周末加个班，三倍工资',
    picks: (e) => [{ label: '加班', big: gain(e.amount ?? 0), tone: 'gain' }, { label: '拒绝' }],
  },
  bank_manager: {
    brief: (e) => `银行经理上门：押${COLLATERALS.find((d) => d.id === e.collateral)?.name ?? '东西'}借钱`,
    picks: (e) => [{ label: '押了借钱', big: gain(e.amount ?? 0), tone: 'plain' }, { label: '不借' }],
  },
  bear_live: {
    brief: () => '墨镜大V送你押跌体验卡',
    picks: () => [{ label: '收下', big: `${fx('bear_live', 'months')}个月`, tone: 'plain' }, { label: '不要' }],
  },
  mother_in_law: {
    brief: () => '丈母娘查岗：东西押出去了？',
    picks: (e) => [
      { label: '发红包', big: cost(e.amount ?? 0), tone: 'cost' },
      { label: '老实交代', big: `账单+${Math.round((fx('mother_in_law', 'billMult') - 1) * 100)}%`, tone: 'cost' },
    ],
  },
  parents_call: {
    brief: () => '爸妈来电：钱够用吗？',
    picks: () => [{ label: '报喜' }, { label: '说实话', big: '免利息', tone: 'gain' }],
  },
};

/** 盲盒能开出的道具：还没有的，去掉对当前人设没用的。 */
function blindPool(s: Readonly<GameState>): string[] {
  const banned = new Set(PERSONAS.find((p) => p.id === s.persona)?.bannedItems ?? []);
  return ITEMS.filter((d) => !s.items.includes(d.id) && !banned.has(d.id) && (!d.ext || !!s.ext)).map((d) => d.id);
}
