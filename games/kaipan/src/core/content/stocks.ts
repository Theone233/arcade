import type { Role, StockDef, ThemeDef, ThemeId } from '../types.ts';

/** 题材（M0：8 个，每局随机登场 6 个）。性格的数值在 BALANCE.themes。 */
export const THEMES: readonly ThemeDef[] = [
  { id: 'ai', name: 'AI', desc: '火得快、凉得也快，涨跌幅度大' },
  { id: 'newenergy', name: '新能源', desc: '涨跌幅度偏大，3 月开春更容易火' },
  { id: 'consumer', name: '大消费', desc: '比较稳，9 月和 11 月更容易火' },
  { id: 'pharma', name: '医药', desc: '涨跌幅度中等' },
  { id: 'finance', name: '金融', desc: '慢热，涨跌幅度小' },
  { id: 'lowalt', name: '低空经济', desc: '新风口，经常刚开始火就熄火' },
  { id: 'gaming', name: '游戏传媒', desc: '涨跌幅度大，11 月更容易火' },
  { id: 'pig', name: '养猪', desc: '很长时间没人理，一旦火起来就很猛' },
];

export const THEME_IDS: readonly ThemeId[] = THEMES.map((t) => t.id);

export const ROLES: readonly Role[] = ['leader', 'follower', 'bluechip', 'meme', 'st'];

/** 股票池（0.3.0：40 只，id 固定，美术按 id 出图）。全部虚构。前 26 只是 M0 的，后 14 只是 0.3.0 新增的。 */
export const STOCKS: readonly StockDef[] = [
  { id: 'ai_leader', name: '韭菜芯片', theme: 'ai', role: 'leader' },
  { id: 'ai_follower', name: '算力搬砖', theme: 'ai', role: 'follower' },
  { id: 'ai_meme', name: '量子波动', theme: 'ai', role: 'meme' },
  { id: 'ne_leader', name: '光伏追光', theme: 'newenergy', role: 'leader' },
  { id: 'ne_follower', name: '充电五分钟', theme: 'newenergy', role: 'follower' },
  { id: 'ne_meme', name: '永动机能源', theme: 'newenergy', role: 'meme' },
  { id: 'con_leader', name: '奶茶续命', theme: 'consumer', role: 'leader' },
  { id: 'con_blue', name: '国民辣条', theme: 'consumer', role: 'bluechip' },
  { id: 'con_meme', name: '预制菜大王', theme: 'consumer', role: 'meme' },
  { id: 'ph_leader', name: '熬夜救星药业', theme: 'pharma', role: 'leader' },
  { id: 'ph_blue', name: '板蓝根集团', theme: 'pharma', role: 'bluechip' },
  { id: 'ph_meme', name: '神药概念', theme: 'pharma', role: 'meme' },
  { id: 'fin_leader', name: '割韭菜证券', theme: 'finance', role: 'leader' },
  { id: 'fin_blue', name: '躺平银行', theme: 'finance', role: 'bluechip' },
  { id: 'fin_meme', name: '币圈信托', theme: 'finance', role: 'meme' },
  { id: 'la_leader', name: '飞天外卖', theme: 'lowalt', role: 'leader' },
  { id: 'la_follower', name: '螺旋桨精工', theme: 'lowalt', role: 'follower' },
  { id: 'la_meme', name: '会飞的车', theme: 'lowalt', role: 'meme' },
  { id: 'gm_leader', name: '氪金游戏', theme: 'gaming', role: 'leader' },
  { id: 'gm_follower', name: '电竞椅', theme: 'gaming', role: 'follower' },
  { id: 'gm_meme', name: '元宇宙', theme: 'gaming', role: 'meme' },
  { id: 'pig_leader', name: '二师兄牧业', theme: 'pig', role: 'leader' },
  { id: 'pig_follower', name: '饲料大王', theme: 'pig', role: 'follower' },
  { id: 'pig_meme', name: '风口上的猪', theme: 'pig', role: 'meme' },
  { id: 'st_lazy', name: 'ST摆烂', theme: 'consumer', role: 'st' },
  { id: 'st_bye', name: 'ST退退退', theme: 'finance', role: 'st' },
  // ---------------------------------------------------------------- 0.3.0 新增
  { id: 'ai_blue', name: '稳稳算力云', theme: 'ai', role: 'bluechip' },
  { id: 'ai_follower2', name: '提示词工坊', theme: 'ai', role: 'follower' },
  { id: 'ne_blue', name: '老实电池', theme: 'newenergy', role: 'bluechip' },
  { id: 'ne_follower2', name: '风车转转', theme: 'newenergy', role: 'follower' },
  { id: 'con_follower', name: '螺蛳粉工厂', theme: 'consumer', role: 'follower' },
  { id: 'con_follower2', name: '云养猫', theme: 'consumer', role: 'follower' },
  { id: 'ph_follower', name: '护发生发', theme: 'pharma', role: 'follower' },
  { id: 'fin_follower', name: '理财小课堂', theme: 'finance', role: 'follower' },
  { id: 'la_blue', name: '停机坪物业', theme: 'lowalt', role: 'bluechip' },
  { id: 'gm_blue', name: '像素老厂', theme: 'gaming', role: 'bluechip' },
  { id: 'gm_follower2', name: '主播经纪', theme: 'gaming', role: 'follower' },
  { id: 'pig_blue', name: '冷鲜肉铺', theme: 'pig', role: 'bluechip' },
  { id: 'st_dream', name: 'ST画大饼', theme: 'consumer', role: 'st' },
  { id: 'st_ghost', name: 'ST失联中', theme: 'finance', role: 'st' },
];
