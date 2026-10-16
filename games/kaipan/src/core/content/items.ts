import { BALANCE, fx } from '../balance.ts';
import type { ItemDef } from '../hooks.ts';
import { STOCKS } from './stocks.ts';

function n(id: string, key: string): string {
  const v = fx(id, key);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/** 倍数说成"多 / 少百分之几"：1.08 → "8%"（用绝对值）。 */
function diff(mult: number): string {
  return `${Math.round(Math.abs(mult - 1) * 100)}%`;
}

/** 0.7 → "七成"，0.9 → "九成"，0.5 → "一半"。 */
function cheng(x: number): string {
  const k = Math.round(x * 10);
  if (k === 5) return '一半';
  return `${['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][k] ?? k}成`;
}

/**
 * 道具（0.3.0：24 个，id 固定，美术按 id 出图）。每个道具只改规则表的一格。
 * 数值在 BALANCE.fx[id]，desc() 从那里取数。前 16 个是 M0 的，后 8 个是 0.3.0 新增的。
 */
export const ITEMS: readonly ItemDef[] = [
  // ---------------------------------------------------------------- 打法
  {
    id: 'longtou',
    name: '跟紧大哥',
    kind: 'tactic',
    rarity: 'common',
    desc: () => `手里的带头大哥涨停时，同一个风口的其他股票再多涨 ${n('longtou', 'bonus')}%`,
    flavor: '擒贼先擒王，炒股先跟大哥。',
    onHolding(c) {
      if (!c.leaderUp.has(c.stock.theme) || c.stock.role === 'leader') return;
      c.ret += fx('longtou', 'bonus');
      c.trigger(`带头大哥涨停，${c.stock.name}再 +${n('longtou', 'bonus')}%`);
    },
  },
  {
    id: 'genfeng',
    name: '小弟也吃肉',
    kind: 'tactic',
    rarity: 'common',
    desc: () =>
      `大哥涨停时，你手里同风口的小弟本来会多涨 ${BALANCE.chain}%，现在变成多涨 ${Math.round(BALANCE.chain * fx('genfeng', 'mult') * 10) / 10}%`,
    flavor: '大哥吃肉，我喝汤，汤要两碗。',
    onHolding(c) {
      // 0.5 真实行情：小弟不再被大哥"带"着多涨（chain 恒为 0），改成识别出的跟涨（follow）那天直接多赚 chain × mult
      if (c.move.follow && c.move.chain <= 0) {
        const extra = BALANCE.chain * fx('genfeng', 'mult');
        c.ret += extra;
        c.trigger(`${c.stock.name}跟着大哥涨，再 +${Math.round(extra * 10) / 10}%`);
        return;
      }
      if (c.move.chain <= 0) return;
      const extra = c.move.chain * (fx('genfeng', 'mult') - 1);
      c.ret += extra;
      c.trigger(`${c.stock.name}跟着大哥再 +${Math.round(extra * 10) / 10}%`);
    },
  },
  {
    id: 'baima',
    name: '老实人信仰',
    kind: 'tactic',
    rarity: 'common',
    desc: () => `手里的老实股下跌时，只亏${cheng(fx('baima', 'lossMult'))}`,
    flavor: '跌了？那是打折。',
    onHolding(c) {
      if (c.stock.role !== 'bluechip' || c.ret >= 0) return;
      const before = c.ret;
      c.ret *= fx('baima', 'lossMult');
      c.trigger(`${c.stock.name}亏损减半：${fmt(before)} → ${fmt(c.ret)}`);
    },
  },
  {
    id: 'yaogu',
    name: '过山车爱好者',
    kind: 'tactic',
    rarity: 'uncommon',
    desc: () => `手里的过山车股涨停的那天，按 +${n('yaogu', 'limitUpAs')}% 算（比涨停多赚一截）`,
    flavor: '别人害怕我上车，别人上车我坐第一排。',
    onHolding(c) {
      if (c.stock.role !== 'meme' || !c.move.limitUp) return;
      c.ret += fx('yaogu', 'limitUpAs') - c.move.move;
      c.trigger(`${c.stock.name}涨停，按 +${n('yaogu', 'limitUpAs')}% 算`);
    },
  },
  {
    id: 'lianban',
    name: '连续涨停梦',
    kind: 'tactic',
    rarity: 'uncommon',
    desc: () => '手里的股票连续涨停后更赚：第二天更容易接着涨停（真实行情里改成：第二个起每个涨停再多赚一截）；但涨停后被砸下来时亏得更多',
    flavor: '梦想还是要有的，万一天天涨停呢？',
    rules(r) {
      r.momentumMult *= fx('lianban', 'momentumMult');
      r.blowMult *= fx('lianban', 'blowMult');
    },
    // 0.5 真实行情：走势不能改，改成结算规则——连续涨停（第 2 个起）+realBonus，炸板 −realBlow
    onHolding(c) {
      if (!c.state.real?.track) return;
      if (c.move.limitUp && c.move.boards >= 2) {
        c.ret += fx('lianban', 'realBonus');
        c.trigger(`${c.stock.name}连续 ${c.move.boards} 天涨停，再 +${n('lianban', 'realBonus')}%`);
      } else if (c.move.blown) {
        c.ret -= fx('lianban', 'realBlow');
        c.trigger(`${c.stock.name}涨停后被砸下来，多亏 ${n('lianban', 'realBlow')}%`);
      }
    },
  },
  {
    id: 'dixi',
    name: '抄底大师',
    kind: 'tactic',
    rarity: 'common',
    desc: () => `在风口"冷清"或"降温"时买的股票，之后这个风口正火的日子，每天再多涨 ${n('dixi', 'bonus')}%`,
    flavor: '别人追涨我抄底，抄在半山腰也算底。',
    onHolding(c) {
      if (!c.holding.lowBuy || c.stage !== 'rally') return;
      c.ret += fx('dixi', 'bonus');
      c.trigger(`${c.stock.name}抄底成功，赶上风口正火，+${n('dixi', 'bonus')}%`);
    },
  },
  {
    id: 'zhisun',
    name: '跌多了就跑',
    kind: 'tactic',
    rarity: 'common',
    desc: () => `手里某只股票一天跌超过 ${-fx('zhisun', 'stop')}% 时，自动按 ${n('zhisun', 'stop')}% 卖掉，换成现金（当天买的不算）`,
    flavor: '舍得认赔的韭菜，才能长得更久。',
    onExit(c) {
      const stop = fx('zhisun', 'stop');
      if (c.sell || c.boughtToday || c.ret >= stop) return;
      c.trigger(`${c.stock.name}跌太多，自动卖掉：${fmt(c.ret)} → ${fmt(stop)}`);
      c.ret = stop;
      c.sell = 'stop';
    },
  },
  {
    id: 'zhiying',
    name: '赚够就跑',
    kind: 'tactic',
    rarity: 'common',
    desc: () => `某只股票已经赚了 ${n('zhiying', 'take')}% 以上，哪天一跌就自动帮你卖掉，卖的时候额外送你 ${n('zhiying', 'bonus')}%（当天买的不算）`,
    flavor: '落袋为安，袋子要大。',
    onExit(c) {
      if (c.sell || c.boughtToday || c.ret >= 0) return;
      if ((c.holding.value - 1) * 100 <= fx('zhiying', 'take')) return;
      c.ret += fx('zhiying', 'bonus');
      c.sell = 'take';
      c.trigger(`${c.stock.name}从高处往下掉，自动卖掉，再 +${n('zhiying', 'bonus')}%`);
    },
  },
  // ---------------------------------------------------------------- 工具
  {
    id: 'extra_slot',
    name: '多开一格',
    kind: 'tool',
    rarity: 'rare',
    desc: () =>
      `多 ${n('extra_slot', 'slots')} 个格子，最多拿 ${BALANCE.slots + fx('extra_slot', 'slots')} 只。拿满时相当于多借了一点钱一起炒；多出来的格子空着也不亏`,
    flavor: '鸡蛋不要放在一个篮子里，篮子要多买一个。',
    rules(r) {
      r.slots += fx('extra_slot', 'slots');
    },
  },
  {
    id: 'double_buy',
    name: '手快',
    kind: 'tool',
    rarity: 'uncommon',
    desc: () => `每天可以多买 ${n('double_buy', 'buys')} 只`,
    flavor: '单身三十年的手速。',
    rules(r) {
      r.buysPerDay += fx('double_buy', 'buys');
    },
  },
  {
    id: 'margin',
    name: '借钱炒股',
    kind: 'tool',
    rarity: 'rare',
    desc: () => `每天赚的钱多 ${diff(fx('margin', 'mult'))}，亏的钱也多 ${diff(fx('margin', 'mult'))}`,
    flavor: '借钱炒股，快乐加倍，眼泪也加倍。',
    rules(r) {
      r.leverage *= fx('margin', 'mult');
    },
  },
  {
    id: 'ipo',
    name: '抽中新股',
    kind: 'tool',
    rarity: 'common',
    desc: () => `每个月初账户 +${n('ipo', 'pct')}%（新股上市，白捡一笔）`,
    flavor: '万里挑一的手气，每个月都有。',
    onMonthStart(c) {
      const amount = (c.state.account * fx('ipo', 'pct')) / 100;
      c.addAccount(amount, `抽中新股，账户 +${n('ipo', 'pct')}%`);
    },
  },
  {
    id: 'credit',
    name: '信用卡',
    kind: 'tool',
    rarity: 'uncommon',
    desc: () => `有一个月钱不够还时，自动帮你垫上（只能用一次）；代价是下个月要还的钱多 ${diff(fx('credit', 'nextBillMult'))}`,
    flavor: '先享受，后还款，再还款，还在还款。',
  },
  // ---------------------------------------------------------------- 人脉
  {
    id: 'paid_group',
    name: '付费群',
    kind: 'network',
    rarity: 'uncommon',
    desc: () => `群里多一个内幕哥：每局只盯两个风口，说得很准（大约${cheng(BALANCE.cred.neimu?.[0] ?? 0.9)}对）`,
    flavor: '群费 99 元，消息无价。',
    excludesFriend: 'neimu',
    onGain(c) {
      c.addFriend('neimu');
    },
  },
  {
    id: 'notebook',
    name: '老王的小本本',
    kind: 'network',
    rarity: 'uncommon',
    desc: () => '老王在群里说的话，句句都准（必中）',
    flavor: '上面密密麻麻，全是红笔。',
    rules(r) {
      r.credOverride.laowang = fx('notebook', 'cred');
    },
  },
  {
    id: 'mood_meter',
    name: '风口温度计',
    kind: 'network',
    rarity: 'rare',
    desc: () => '看板上每个风口下面多一行：它昨天收盘时真正在哪一档（冷清、要火、快正火、正火、太火、降温）。看板自己的状态是猜的，这个是准的',
    flavor: '市场情绪，一目了然（大概）。',
    rules(r) {
      r.revealStages = true;
    },
  },
  // ---------------------------------------------------------------- 0.3.0 新增
  {
    id: 'hot_money',
    name: '大户专座',
    kind: 'tactic',
    rarity: 'uncommon',
    desc: () => `每天第一只买的股票，如果当天就涨停，再多赚 ${n('hot_money', 'bonus')}%`,
    flavor: '营业厅门口排队的大爷，都是你的同行。',
    onHolding(c) {
      if (!c.holding.firstBuy || c.holding.boughtDay !== c.state.today.day || !c.move.limitUp) return;
      c.ret += fx('hot_money', 'bonus');
      c.trigger(`${c.stock.name}买入当天就涨停，大户专座再 +${n('hot_money', 'bonus')}%`);
    },
  },
  {
    id: 'value_eye',
    name: '价值眼光',
    kind: 'tactic',
    rarity: 'common',
    desc: () => `每个月底还钱前，手里的老实股每只多涨 ${n('value_eye', 'bonus')}%（公司给股东发的钱）`,
    flavor: '别人盯着涨跌，我盯着公司发钱的到账短信。',
    onMonthEnd(c) {
      c.state.slots.forEach((h, slot) => {
        if (!h || stockRole(h.stockId) !== 'bluechip') return;
        c.addToHolding(slot, fx('value_eye', 'bonus'), `${stockName(h.stockId)}给股东发钱，+${n('value_eye', 'bonus')}%`);
      });
    },
  },
  {
    id: 'fan_qunzhu',
    name: '反着信韭菜收割机',
    kind: 'network',
    rarity: 'uncommon',
    desc: () => `韭菜收割机的消息会标上"反着看"：他说涨就当跌，说跌就当涨，这样看大约${cheng(fx('fan_qunzhu', 'acc'))}准`,
    flavor: '他说东，我往西，十次有七次走对。',
    rules(r) {
      r.reverseQunzhu = true;
    },
  },
  {
    id: 'diversify',
    name: '分散投资',
    kind: 'tactic',
    rarity: 'common',
    desc: () => `手里的股票分在 ${n('diversify', 'themes')} 个或更多风口时，亏钱的日子只亏${cheng(fx('diversify', 'lossMult'))}`,
    flavor: '东边不亮西边亮，四边都不亮就当看风景。',
    onAccount(c) {
      if (c.themes < fx('diversify', 'themes') || c.ret >= 0) return;
      const before = c.ret;
      c.ret *= fx('diversify', 'lossMult');
      c.trigger(`股票分在 ${c.themes} 个风口，亏损变少：${fmt(before)} → ${fmt(c.ret)}`);
    },
  },
  {
    id: 'fomo',
    name: '怕错过体质',
    kind: 'tool',
    rarity: 'uncommon',
    desc: () => `今天买的今天就能卖、能换掉（"跌多了就跑""赚够就跑"当天就生效）；群友每天还多推荐 ${n('fomo', 'recs')} 只`,
    flavor: '别人吃肉我看着，比亏钱还难受。',
    rules(r) {
      r.noT1 = true;
      r.extraRecs += fx('fomo', 'recs');
    },
  },
  {
    id: 'night_review',
    name: '熬夜复盘',
    kind: 'network',
    rarity: 'uncommon',
    desc: () => '每天收盘后，随机告诉你一个风口今天真正在哪一档，在看板上一直标到第二天开盘前',
    flavor: '凌晨三点的走势图，比白天的诚实。',
    rules(r) {
      r.reviewOne = true;
    },
  },
  {
    id: 'crowd_fund',
    name: '众筹炒股',
    kind: 'tool',
    rarity: 'uncommon',
    desc: () => `从下个月起，每月要还的钱少 ${diff(fx('crowd_fund', 'billMult'))}（亲戚帮你凑了点；突发账单不算）`,
    flavor: '二舅、三姨、楼下小卖部老板，都是你的股东。',
    rules(r) {
      r.billMult *= fx('crowd_fund', 'billMult');
    },
  },
  {
    id: 'rumor_mill',
    name: '小道消息',
    kind: 'network',
    rarity: 'common',
    desc: () =>
      fx('rumor_mill', 'messages') === 1
        ? '群里每天多一个人说说某个风口今天涨还是跌（不一定准）'
        : `群里每天多 ${n('rumor_mill', 'messages')} 个人说说某个风口今天涨还是跌（不一定准）`,
    flavor: '听说，据说，有人说。',
    rules(r) {
      r.extraMessages += fx('rumor_mill', 'messages');
    },
  },
  // ---------------------------------------------------------------- 0.4 C：押跌、抵押、仓位（只在有新机制的局里出现）
  {
    id: 'short_permit',
    name: '押跌许可证',
    kind: 'tool',
    rarity: 'uncommon',
    ext: true,
    desc: () => '解锁押跌：它跌你赚、它涨你亏；它涨停时你亏得更狠（被轧）。空军老周会进群',
    flavor: '别人恐惧我贪婪，别人贪婪我押跌。',
    rules(r) {
      r.canShort = true;
    },
    onGain(c) {
      if (c.state.ext) c.addFriend('kongjun');
    },
  },
  {
    id: 'sunglasses',
    name: '空军墨镜',
    kind: 'tactic',
    rarity: 'uncommon',
    ext: true,
    desc: () => `押跌的股票涨停时，被轧多亏的那一截少 ${Math.round((1 - fx('sunglasses', 'squeezeMult')) * 100)}%`,
    flavor: '戴上墨镜，涨停就看不清了。',
    rules(r) {
      r.squeezeMult *= fx('sunglasses', 'squeezeMult');
    },
  },
  {
    id: 'banker',
    name: '银行有熟人',
    kind: 'network',
    rarity: 'common',
    ext: true,
    desc: () => `以后押东西借钱，每月利息少 ${Math.round((1 - fx('banker', 'interestMult')) * 100)}%（已经借了的不变）`,
    flavor: '"自己人，利息好商量。"',
    rules(r) {
      r.interestMult *= fx('banker', 'interestMult');
    },
  },
  {
    id: 'pyramid',
    name: '越涨越加',
    kind: 'tactic',
    rarity: 'common',
    ext: true,
    desc: () => '给手里的股票加仓不算当天的买入次数',
    flavor: '赚钱的那只，才配得上更多的钱。',
    rules(r) {
      r.freeAdd = true;
    },
  },
];

/**
 * 0.5 道具卡的短版：一个大数字（可缺）+ 一行（≤14 字）。三选一、图鉴卡片默认显示短版，desc() 原句留在悬停详情里。
 */
export const ITEM_BRIEF: Readonly<Record<string, () => { big?: string; line: string }>> = {
  longtou: () => ({ big: `+${n('longtou', 'bonus')}%`, line: '大哥涨停，同风口的再多涨' }),
  genfeng: () => ({ big: `×${n('genfeng', 'mult')}`, line: '大哥涨停，小弟多吃一碗' }),
  baima: () => ({ big: `×${n('baima', 'lossMult')}`, line: '老实股下跌只亏这么多' }),
  yaogu: () => ({ big: `+${n('yaogu', 'limitUpAs')}%`, line: '过山车股涨停按这个算' }),
  lianban: () => ({ line: '涨停后更容易接着涨停' }),
  dixi: () => ({ big: `+${n('dixi', 'bonus')}%`, line: '冷门时买，正火时每天多涨' }),
  zhisun: () => ({ big: `${n('zhisun', 'stop')}%`, line: '一天跌这么多就自动卖' }),
  zhiying: () => ({ big: `+${n('zhiying', 'bonus')}%`, line: `赚够${n('zhiying', 'take')}%一跌就卖` }),
  extra_slot: () => ({ big: `+${n('extra_slot', 'slots')}格`, line: '多拿一只股票' }),
  double_buy: () => ({ big: `+${n('double_buy', 'buys')}只`, line: '每天多买一只' }),
  margin: () => ({ big: `×${n('margin', 'mult')}`, line: '赚亏都多一点' }),
  ipo: () => ({ big: `+${n('ipo', 'pct')}%`, line: '每月初白捡一笔' }),
  credit: () => ({ big: '垫1次', line: '钱不够还时帮你垫上' }),
  paid_group: () => ({ big: cheng(BALANCE.cred.neimu?.[0] ?? 0.9), line: '内幕哥进群，说得很准' }),
  notebook: () => ({ big: '必中', line: '老王说的话句句都准' }),
  mood_meter: () => ({ line: '看板显示风口真实状态' }),
  hot_money: () => ({ big: `+${n('hot_money', 'bonus')}%`, line: '首只当天涨停再多赚' }),
  value_eye: () => ({ big: `+${n('value_eye', 'bonus')}%`, line: '月底老实股每只多涨' }),
  fan_qunzhu: () => ({ big: cheng(fx('fan_qunzhu', 'acc')), line: '收割机的话反着看' }),
  diversify: () => ({ big: `×${n('diversify', 'lossMult')}`, line: `分在${n('diversify', 'themes')}个风口，亏得少` }),
  fomo: () => ({ big: `+${n('fomo', 'recs')}只`, line: '当天买的当天能卖' }),
  night_review: () => ({ line: '每晚透露一个风口真状态' }),
  crowd_fund: () => ({ big: `-${diff(fx('crowd_fund', 'billMult'))}`, line: '每月要还的钱变少' }),
  rumor_mill: () => ({ big: `+${n('rumor_mill', 'messages')}条`, line: '群里每天多一条消息' }),
  short_permit: () => ({ line: '解锁押跌：它跌你赚' }),
  sunglasses: () => ({ big: `-${Math.round((1 - fx('sunglasses', 'squeezeMult')) * 100)}%`, line: '被轧时少亏一截' }),
  banker: () => ({ big: `-${Math.round((1 - fx('banker', 'interestMult')) * 100)}%`, line: '以后借钱利息更少' }),
  pyramid: () => ({ line: '加仓不占当天买入次数' }),
};

function stockRole(id: string): string {
  return STOCKS.find((d) => d.id === id)?.role ?? '';
}

function stockName(id: string): string {
  return STOCKS.find((d) => d.id === id)?.name ?? id;
}

function fmt(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}%`;
}
