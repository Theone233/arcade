import { fx } from '../balance.ts';
import { ITEMS } from './items.ts';
import type { PersonaDef } from '../hooks.ts';
import type { PersonaId } from '../types.ts';

function wan(id: string): string {
  const v = fx(id, 'account') / 10_000;
  return `${Number.isInteger(v) ? v : Math.round(v * 10) / 10} 万`;
}

/** 道具名（带引号），跟着道具表走，不写死。 */
function item(id: string): string {
  return `"${ITEMS.find((d) => d.id === id)?.name ?? id}"`;
}

/** 群友消息准不准的变化（隐藏数值，只说方向）。 */
function credText(v: number): string {
  return v > 0 ? '更准一点' : v < 0 ? '更不准' : '不变';
}

/**
 * 人设（0.3.0：5 个，id 固定，美术按 id 出图）。开局通过 RunSetup.persona 选择。
 * 数值在 BALANCE.fx[id]：account 开局账户；*Cred 群友可信度加减；billMult / surpriseMult 月供倍数。
 * unlock 为 'start' 的开局可选，其余由对应成就解锁（档案层判断，见 src/platform/profile.ts）。
 * 文案全部虚构。
 */
export const PERSONAS: readonly PersonaDef[] = [
  {
    id: 'newbie',
    name: '职场新人阿韭',
    short: '最标准的开局',
    title: '职场新人',
    desc: () => `开局 ${wan('newbie')}，能同时拿 4 只股票，没有道具（标准开局）`,
    flavor: '工作第一年，工资刚够还房租，听说炒股能财务自由。',
    items: [],
    themes: [],
    unlock: 'start',
  },
  {
    id: 'retiree',
    name: '退休老周',
    short: '老王更准，开销更小',
    title: '退休大爷',
    desc: () =>
      `开局 ${wan('retiree')}，自带${item('baima')}；金融和大消费两个风口一定会出现；老王的消息${credText(fx('retiree', 'laowangCred'))}（老同事）${billText('retiree', '退休了，开销小')}`,
    flavor: '炒了三十年股，口头禅是"拿住，别动"。',
    items: ['baima'],
    themes: ['finance', 'consumer'],
    unlock: 'start',
    rules(r) {
      r.credBonus.laowang = (r.credBonus.laowang ?? 0) + fx('retiree', 'laowangCred');
      r.billMult *= fx('retiree', 'billMult');
    },
  },
  {
    id: 'mom',
    name: '宝妈芳姐',
    short: '张姐更准，会过日子',
    title: '全职宝妈',
    desc: () =>
      `开局 ${wan('mom')}，自带${item('ipo')}；张姐的消息${credText(fx('mom', 'zhangjieCred'))}（同一个妈妈群）${billText('mom', '会过日子')}`,
    flavor: '接娃、做饭、看股票三不误，妈妈群就是她的情报站。',
    items: ['ipo'],
    themes: [],
    unlock: 'start',
    rules(r) {
      r.credBonus.zhangjie = (r.credBonus.zhangjie ?? 0) + fx('mom', 'zhangjieCred');
      r.billMult *= fx('mom', 'billMult');
    },
  },
  {
    id: 'coder',
    name: '程序员小码',
    short: 'AI 必来，每天限买',
    title: '程序员',
    desc: () =>
      `开局 ${wan('coder')}，自带${item('mood_meter')}；AI 风口一定会出现；每天只能买 ${fx('coder', 'buysCap')} 只（上班没空；就算拿到能多买的道具也没用）${billText('coder', '')}`,
    flavor: '写了个盯股票的小程序，跑起来比工作代码还稳。',
    items: ['mood_meter'],
    themes: ['ai'],
    unlock: { achievement: 'data_driven' },
    bannedItems: ['double_buy'],
    rules(r) {
      r.buysCap = r.buysCap === null ? fx('coder', 'buysCap') : Math.min(r.buysCap, fx('coder', 'buysCap'));
      r.billMult *= fx('coder', 'billMult');
    },
  },
  {
    id: 'youzi',
    name: '炒股大佬',
    short: '本钱厚，开销大，能押跌',
    title: '大户',
    desc: () =>
      `开局 ${wan('youzi')}，自带${item('yaogu')}和${item('lianban')}；每月要还的钱是别人的 ${fx('youzi', 'billMult')} 倍、突发账单是别人的 ${fx('youzi', 'surpriseMult')} 倍（排场大）；韭菜收割机盯上了你：他的消息${credText(fx('youzi', 'qunzhuCred'))}，还更爱喊你买；一开局就能押跌`,
    flavor: '营业厅门口的传说，开着二手跑车来抢涨停。',
    items: ['yaogu', 'lianban'],
    themes: [],
    unlock: { achievement: 'limitup_crew' },
    rules(r) {
      r.billMult *= fx('youzi', 'billMult');
      r.surpriseMult *= fx('youzi', 'surpriseMult');
      r.credBonus.qunzhu = (r.credBonus.qunzhu ?? 0) + fx('youzi', 'qunzhuCred');
      r.friendWeight.qunzhu = (r.friendWeight.qunzhu ?? 1) * fx('youzi', 'qunzhuWeight');
      r.canShort = true;
    },
  },
];

/** 常规月供倍数的说明（倍数为 1 时不写）。 */
function billText(id: string, why: string): string {
  const m = fx(id, 'billMult');
  if (m === 1) return '';
  return `；每月要还的钱${m < 1 ? '少' : '多'} ${Math.round(Math.abs(m - 1) * 100)}%${why ? `（${why}）` : ''}`;
}

export const PERSONA_IDS: readonly PersonaId[] = PERSONAS.map((d) => d.id);

/** 开局账户（元）。 */
export function personaAccount(id: PersonaId): number {
  return fx(id, 'account');
}
