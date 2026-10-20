/**
 * B 手绘绘本风的色板（DESIGN.md 第 4 节，ASSETS.md）：远景淡、低对比；玩法层实色、深褐粗线。
 * 精修交给美术，这里只定 M1 用到的。
 */
export const INK = '#46291a';
export const PAPER = '#fffaf0';
export const RED = '#e2432a';
export const GOLD = '#ffbf1a';
/** 两队：蓝队圆标、黄队星标（不只靠颜色区分） */
export const TEAM = ['#2f78e0', '#f5ad00'] as const;
export const TEAM_TEXT = ['#1d58b0', '#8f5a00'] as const;
export const TEAM_NAME = ['蓝队', '黄队'] as const;
export const STAMINA = '#3f9a4a';

/** 面团：从上到下四档、表皮、炸开的焦边 */
export const DOUGH = { grad: ['#fdeccb', '#f8dfb2', '#efc78c', '#d99a5c'], crust: '#eba650', rim: '#e08f3e' } as const;

export const WALL = { base: '#efe8dc', wash: '#d6cab6', window: '#c9dde3', mist: '#c9c6cf', mistDeep: '#9fa3b8', fog: '#f4f2f6', desk: '#33251f', deskLine: '#4a362c' } as const;

export const FONT = "-apple-system,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif";

/** 1 米 = 多少世界单位（画面外小牌写"约几米"；角色约 44 高） */
export const METER = 44;
