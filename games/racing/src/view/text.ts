/**
 * 给玩家看的文字和配色（中文大白话，DESIGN.md 第 1 节的术语）。换游戏名只改 GAME_NAME 和平台登记。
 */
import type { Level } from '../core/types.ts';

export const GAME_NAME = '飞驰';

/** 六辆车的颜色（座位号），深浅两种：车身、描边 */
export const CAR_COLORS: readonly { body: string; dark: string; name: string }[] = [
  { body: '#e5484d', dark: '#8c1d22', name: '红' },
  { body: '#3e7bfa', dark: '#163c8c', name: '蓝' },
  { body: '#f5c400', dark: '#7a6100', name: '黄' },
  { body: '#2fb36b', dark: '#105a32', name: '绿' },
  { body: '#a46ae8', dark: '#4d2380', name: '紫' },
  { body: '#ff8a3d', dark: '#8a3a05', name: '橙' },
];

export const LEVEL_NAME: Record<Level, string> = { easy: '新手', normal: '普通', hard: '老手', mix: '混着来' };

export const ASK_TEXT: Record<'boost' | 'adren' | 'slip' | 'discard', string> = {
  boost: '冲刺？付 1 张热量，翻一张速度牌加到速度上',
  adren: '拼劲：多走 1 格？（速度也算 +1）',
  slip: '吸尾流？再往前 2 格（不算速度）',
  discard: '弃牌？点要弃的牌（热量、手抖不能弃）',
};

/** 规则拒了操作时的话（apply 的错误码） */
export const MOVE_ERROR: Record<string, string> = {
  bad_gear: '挡位一次最多升降 2 挡',
  no_heat: '引擎里没热量了，不能跳两挡',
  bad_cards: '出的张数要和挡位一样，热量不能打',
  bad_discard: '热量、手抖不能弃',
  planned: '这回合已经出过牌了',
  not_plan: '现在不是出牌的时候',
  not_your_turn: '还没轮到你',
  not_asked: '现在不用回答这个',
  not_racing: '你已经冲线了',
  race_over: '这一场已经结束了',
  stale: '局面变了，按新的来',
};

/** 快捷短语（编号 0 起，下标和 game/emotes.ts 的 PHRASE 一致；只说比赛不说人） */
export const PHRASES: readonly string[] = [
  '让一让！',
  '吸到了！',
  '这弯稳了',
  '刹不住了！',
  '下圈见',
  '好车技！',
  '热量见底了……',
  '冲啊！',
  '跟紧我',
  '就差一点！',
  '承让承让',
  '再来一场！',
  '别吸我尾流！',
  '哼，下个弯见',
  '快点出牌呀',
  '稳住，我们能赢',
];
