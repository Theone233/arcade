/**
 * 0.6.3 群友连载（纯画面装饰，不进规则层）：每局按种子挑一位群友，跨几个月讲一个小故事，
 * 每段出现在某个月月底算账时的群聊里，引用上一段，读起来像连续剧。
 *
 * 写法约定同 chatFluff.ts：口语、不露年份公司、不嘲弄真实个人，伤亡类不写；结尾不惨，留点温情或自嘲。
 */
import { fluffRng } from './chatFluff.ts';

interface StoryArc {
  id: string;
  friendId: string;
  /** 连载名（第一段的引用条上写"连载 · 名字"） */
  title: string;
  /** 六段，按一局的进度均匀摊开（12 个月的局每两个月一段，半年的实盘每月一段） */
  beats: readonly string[];
}

export const STORY_ARCS: readonly StoryArc[] = [
  {
    id: 'laowang_car',
    friendId: 'laowang',
    title: '老王提车记',
    beats: [
      '跟大家报个喜：换车的首付攒够了，炒完这一波就去提车',
      '车行小哥天天问我啥时候来，我说等这只再涨两天',
      '首付先挪一半进来周转，反正迟早涨回去',
      '车型从大越野改成小轿车了，城里停车方便，问题不大',
      '小轿车也先缓缓，电动车其实挺香，不用加油',
      '今天骑着新买的电动车去买菜，风吹在脸上，比坐车舒服',
    ],
  },
  {
    id: 'zhangjie_class',
    friendId: 'zhangjie',
    title: '张姐的兴趣班',
    beats: [
      '孩子下学期想报兴趣班，学费就指望这个账户了',
      '报了两个班，钢琴和编程，钱从账户里出，心里有点慌',
      '账户先亏着，钢琴改成口琴了，一样是乐器嘛',
      '编程老师说孩子有天赋，我说那你先教他涨多了别急着买',
      '孩子用口琴吹了首《好日子》，群里谁要听语音',
      '期末孩子说最喜欢口琴课。省钱还开心，这波不亏',
    ],
  },
  {
    id: 'xiaoli_intern',
    friendId: 'xiaoli',
    title: '小李实习日记',
    beats: [
      '实习第一天，工位电脑上居然装着行情软件，这是缘分',
      '开会时偷看行情被主管发现了，他说下次把手机调静音',
      '转正答辩第一页我放了张涨跌图，主管沉默了三秒',
      '转正了！工资不高，以后每月拿一点出来定投',
      '主管私下问我最近看好哪个风口，我假装没听见',
      '现在主管每天早上来问我开盘怎么样，感觉我要升职了',
    ],
  },
  {
    id: 'laozhao_wife',
    friendId: 'laozhao',
    title: '老赵和老伴',
    beats: [
      '跟老伴保证了，今年是我炒股的最后一年',
      '老伴问账户怎么样，我说这叫长期投资，你不懂',
      '老伴偷偷看了我的账户，晚饭多了一个菜，不知道是好是坏',
      '老伴现在每天问我收盘没有，比我还上心',
      '老伴开始在小本本上记风口了，字比我写得工整',
      '老伴说明年她也要开户。完了，家里要有两个老股民了',
    ],
  },
  {
    id: 'qunzhu_course',
    friendId: 'qunzhu',
    title: '收割机的炒股课',
    beats: [
      '我的炒股课第一期开始招生，前十名打八折',
      '第一期学员已经满了（一共三位，感谢支持）',
      '第三讲上线：怎么在账户发绿的时候保持微笑',
      '有学员说听完课亏得更多了，我说那是你没听第四讲',
      '第四讲的内容定了：怎么写第五讲',
      '全部结课，结业证书已发。下一期涨价，老学员不打折',
    ],
  },
];

/** 这局的连载：按种子挑一个（确定性）。讲故事的都是开局就在群里的群友，挑选不随谁进群、谁退群变。 */
export function arcFor(seed: string): StoryArc {
  const r = fluffRng(`${seed}:arc`);
  return STORY_ARCS[Math.floor(r() * STORY_ARCS.length) % STORY_ARCS.length] as StoryArc;
}

/** 第 month 个月（1 起）讲到第几段：六段按一局的月数均匀摊开；这个月不该讲新的一段为 -1。 */
export function beatAt(month: number, months: number): number {
  const at = (m: number): number => Math.min(5, Math.floor(((m - 1) * 6) / months));
  if (month < 1 || month > months) return -1;
  return month === 1 || at(month) !== at(month - 1) ? at(month) : -1;
}

/** 这个月月底算账时要发的一段连载（引用上一段）；不是讲故事的月份、这位群友不在群里时为 null。 */
export function storyBeat(o: { seed: string; month: number; months: number; friendIds: readonly string[] }): { friendId: string; quote: string; text: string } | null {
  const arc = arcFor(o.seed);
  if (!o.friendIds.includes(arc.friendId)) return null;
  const i = beatAt(o.month, o.months);
  if (i < 0) return null;
  const quote = i === 0 ? `连载 · ${arc.title}` : `上回：${arc.beats[i - 1]}`;
  return { friendId: arc.friendId, quote, text: arc.beats[i] as string };
}
