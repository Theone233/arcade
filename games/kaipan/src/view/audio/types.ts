/**
 * 音频接口约定（0.3）：画面层只通过这里的类型与音频交互。
 * 画面层在「播放到」相应时刻时发 cue（不是 dispatch 时），音频层决定发什么声音；
 * 背景音乐按 Mood 切换（交易时跟着大盘的牛 / 平 / 熊走），音频层负责平滑过渡。
 */
import type { AutoSellReason, Mood as MarketMood, RewardKind } from '../../core/index.ts';
import type { Settings } from '../../platform/settings.ts';

export type UiSound = 'hover' | 'click' | 'select' | 'denied' | 'open' | 'close' | 'toggle';

export type Cue =
  | { type: 'ui'; name: UiSound }
  /** 群聊冒出一条消息（盘前消息、推荐卡、收盘吐槽）；index 为当天第几条（0 起，音高轻微变化） */
  | { type: 'chat'; index: number }
  /** 买入一只股票（放进持仓格） */
  | { type: 'buy' }
  /** 卖出（手动卖出或被替换） */
  | { type: 'sell' }
  /** 开盘钟声 */
  | { type: 'marketOpen' }
  /** 大盘天气变化：to 为新的大盘状态（熊市带一声闷雷） */
  | { type: 'weather'; to: MarketMood }
  /** 雷雨天偶发的闪电（纯氛围） */
  | { type: 'thunder' }
  /** 题材热度变化（6 个题材同时动，只发一次）：up 为升温题材数，down 为降温 / 退潮题材数，max 为最大 |ΔH| */
  | { type: 'heat'; up: number; down: number; max: number }
  /** 持仓小人揭晓：move 为个股涨跌（百分点，音高随涨跌），limit 为涨停 / 跌停；index 为第几格（0 起） */
  | { type: 'reveal'; move: number; limit: 'up' | 'down' | null; index: number }
  /** 龙头带动连线：index 为第几条（0 起，音高逐条上行） */
  | { type: 'chain'; index: number }
  /** 涨停烟花 */
  | { type: 'limitUp' }
  /** 跌停雨云 */
  | { type: 'limitDown' }
  /** 道具触发：id 为道具 id，delta 为这一下的改动（正为加成） */
  | { type: 'item'; id: string; delta: number }
  /** ST 消息、止损 / 止盈 / 退市自动卖出 */
  | { type: 'news'; kind: 'uncap' | 'warning' | 'delisted' }
  | { type: 'autoSold'; reason: AutoSellReason }
  /** 账户数字滚动，每跳一次发一次；progress 为 0..1 */
  | { type: 'countUp'; progress: number }
  /** 账户收益落定：ret 为当日账户收益（百分点），用于分档 */
  | { type: 'settle'; ret: number }
  /** 收盘揭晓群聊消息：hit 为说中 */
  | { type: 'judge'; hit: boolean }
  /** 月底账单滑入 */
  | { type: 'bill' }
  /** 账单印章：paid 已还清 / 逾期；credit 为信用卡代还 */
  | { type: 'stamp'; paid: boolean; credit: boolean }
  /** 三选一奖励卡亮相 */
  | { type: 'rewardShow' }
  /** 选中奖励（kind 为卡的种类），或都不要（kind 为 null） */
  | { type: 'reward'; kind: RewardKind | null }
  /** 事件出现 */
  | { type: 'event' }
  /** 事件结果：delta 为账户变化（元，正负决定音色） */
  | { type: 'eventResult'; delta: number }
  /** 新月份开场（日历事件与月供公布） */
  | { type: 'monthStart' }
  /** 新群友入群 */
  | { type: 'friendJoin' }
  | { type: 'runWon' }
  | { type: 'runLost' }
  /** 第一天引导气泡切换 */
  | { type: 'guide' };

/**
 * 背景音乐情绪：title 开始菜单；bull / flat / bear 交易时跟着大盘（晴 / 阴 / 雷雨）；
 * payday 月底账单、三选一与事件；victory / defeat 结束页。
 */
export type Mood = 'title' | 'bull' | 'flat' | 'bear' | 'payday' | 'victory' | 'defeat' | 'silent';

export interface AudioApi {
  /** 在首次用户手势（点击、按键）时调用；浏览器自动播放策略要求，此前不会出声 */
  unlock(): void;
  cue(c: Cue): void;
  setMood(m: Mood): void;
  applySettings(s: Settings): void;
  /** 页面隐藏时暂停，恢复时继续 */
  setPaused(paused: boolean): void;
  dispose(): void;
}
