import type { QuipMoment, Role } from '../types.ts';

/**
 * 0.3.1 股票小人的台词：涨停、连续涨停、跌停、退市、被买入、被卖出时冒一句。
 * 抽取时把这只股票自己的台词和它角色的通用台词合在一起抽（见 quips 的抽取函数）。
 * 占位：{stock} 股票名，{n} 连续涨停的天数。全部虚构。
 */
type Lines = Partial<Record<QuipMoment, readonly string[]>>;

export const STOCK_QUIPS: Record<string, Lines> = {
  ai_leader: {
    limitUp: ['今天谁也别想割我。'],
    limitDown: ['我是芯片，不是韭菜……吧？'],
    bought: ['放心，这次我长得很快。'],
    sold: ['割了又长，长了又割，我习惯了。'],
  },
  ai_follower: {
    limitUp: ['搬砖搬出了涨停，感动。'],
    limitDown: ['今天的砖有点重。'],
    bought: ['新老板好，我能加班。'],
    sold: ['砖还没搬完，你就走了？'],
  },
  ai_meme: {
    limitUp: ['我同时处在"涨"和"更涨"两种状态。'],
    limitDown: ['都怪你看了我一眼，我就跌了。'],
    bought: ['买我之前，谁也不知道我是涨是跌。'],
    sold: ['你卖掉的只是我的一个平行宇宙。'],
  },
  ne_leader: {
    limitUp: ['太阳出来了，我也出来了。'],
    limitDown: ['今天阴天，别找我。'],
    bought: ['跟着我，前途一片光明。'],
    sold: ['你走了，光还在。'],
  },
  ne_follower: {
    limitUp: ['充电五分钟，涨停一整天！'],
    limitDown: ['电量不足，请及时充电。'],
    bought: ['已连接，开始充电。'],
    sold: ['充电已断开，记得带走充电线。'],
  },
  ne_meme: {
    limitUp: ['看，我说我能一直转吧。'],
    limitDown: ['永动机……也需要休息。'],
    bought: ['买了我，你就不用再买别的了。'],
    sold: ['我会继续转的，只是不带你了。'],
  },
  con_leader: {
    limitUp: ['全糖、加冰、涨停！'],
    limitDown: ['今天的奶茶有点苦。'],
    bought: ['第二杯半价，你先把第一杯买了。'],
    sold: ['喝完就扔，你好狠的心。'],
  },
  con_blue: {
    limitUp: ['辣条也有春天。'],
    limitDown: ['跌一点没事，辣条一直有人买。'],
    bought: ['老朋友，又见面了。'],
    sold: ['饿了再来找我。'],
  },
  con_meme: {
    limitUp: ['三分钟出锅，三秒涨停。'],
    limitDown: ['加热过头了，糊了。'],
    bought: ['开袋即食，开盘即涨（不保证）。'],
    sold: ['保质期到了是吧。'],
  },
  ph_leader: {
    limitUp: ['熬夜的人越多，我越精神。'],
    limitDown: ['我也熬不住了。'],
    bought: ['一天一粒，精神百倍。'],
    sold: ['记得早点睡。'],
  },
  ph_blue: {
    limitUp: ['换季了，又到我的季节。'],
    limitDown: ['大家身体都太好了，我很欣慰，也很难过。'],
    bought: ['多喝热水，多拿板蓝根。'],
    sold: ['感冒了记得回来。'],
  },
  ph_meme: {
    limitUp: ['包治百病，包涨停。'],
    limitDown: ['说明书上写了：效果因人而异。'],
    bought: ['一个疗程见效。'],
    sold: ['疗程还没结束呢！'],
  },
  fin_leader: {
    limitUp: ['今天不割别人，今天被人抬。'],
    limitDown: ['割别人的人，也会被割。'],
    bought: ['欢迎开户，手续费照收。'],
    sold: ['慢走，下次再来交手续费。'],
  },
  fin_blue: {
    limitUp: ['躺着也能涨，这就是银行。'],
    limitDown: ['躺平的时候被踩了一脚。'],
    bought: ['存进来，安心睡觉。'],
    sold: ['利息不多，但你走得也太快了。'],
  },
  fin_meme: {
    limitUp: ['一夜暴富！第二夜呢？'],
    limitDown: ['钱包密码忘了。'],
    bought: ['富贵险中求。'],
    sold: ['跑得好，跑得妙。'],
  },
  la_leader: {
    limitUp: ['外卖起飞！五分钟送达。'],
    limitDown: ['迫降了，汤洒了。'],
    bought: ['请系好安全带。'],
    sold: ['您已下机，欢迎再次乘坐。'],
  },
  la_follower: {
    limitUp: ['大哥一飞，我就转。'],
    limitDown: ['转不动了，螺丝松了。'],
    bought: ['加满油，开转！'],
    sold: ['转了这么久，你就这么走了。'],
  },
  la_meme: {
    limitUp: ['我真的飞起来了！'],
    limitDown: ['飞是飞起来了，忘了怎么降落。'],
    bought: ['上车吧，这次是真的会飞。'],
    sold: ['下车请注意脚下（和高度）。'],
  },
  gm_leader: {
    limitUp: ['今天全服玩家一起充值。'],
    limitDown: ['服务器维护中，请稍后再来。'],
    bought: ['首充双倍！'],
    sold: ['不玩了？你的账号还在。'],
  },
  gm_follower: {
    limitUp: ['坐着也能涨停，舒服。'],
    limitDown: ['椅子塌了。'],
    bought: ['坐稳了，开局。'],
    sold: ['起身的时候记得活动活动腰。'],
  },
  gm_meme: {
    limitUp: ['虚拟的涨停，真实的快乐。'],
    limitDown: ['我只是暂时下线了。'],
    bought: ['欢迎来到元宇宙，请戴好眼镜。'],
    sold: ['你退出了元宇宙，现实世界见。'],
  },
  pig_leader: {
    limitUp: ['二师兄今天要上天了。'],
    limitDown: ['师父，我又被妖怪抓走了。'],
    bought: ['大师兄说你有眼光。'],
    sold: ['高老庄见。'],
  },
  pig_follower: {
    limitUp: ['猪吃得多，我就涨得多。'],
    limitDown: ['猪减肥了，我也瘦了。'],
    bought: ['饲料管够。'],
    sold: ['你走了，猪还要吃饭。'],
  },
  pig_meme: {
    limitUp: ['站在风口上，猪也能飞。'],
    limitDown: ['风停了。'],
    bought: ['一起飞吧！'],
    sold: ['风还会再来的。'],
  },
  st_lazy: {
    limitUp: ['我也不知道为什么涨了。'],
    limitDown: ['躺着也中枪。'],
    bought: ['你确定？我自己都不确定。'],
    sold: ['随便，我无所谓。'],
    delisted: ['摆烂摆到头了，拜拜。'],
  },
  st_bye: {
    limitUp: ['退退退……啊不，涨涨涨！'],
    limitDown: ['退！退！退！'],
    bought: ['勇气可嘉。'],
    sold: ['退得好。'],
    delisted: ['我说到做到。'],
  },
  ai_blue: {
    limitUp: ['稳稳地涨，稳稳的幸福。'],
    limitDown: ['稳稳地跌了一点。'],
    bought: ['稳了。'],
    sold: ['不稳的是你。'],
  },
  ai_follower2: {
    limitUp: ['请输入：涨停。已完成。'],
    limitDown: ['提示词写错了。'],
    bought: ['你好，有什么可以帮你？'],
    sold: ['对话已结束。'],
  },
  ne_blue: {
    limitUp: ['老实人也有出头的一天。'],
    limitDown: ['老实人吃了点小亏。'],
    bought: ['我不会突然没电的。'],
    sold: ['电量还剩不少呢。'],
  },
  ne_follower2: {
    limitUp: ['风来了，转起来！'],
    limitDown: ['风去哪儿了？'],
    bought: ['转啊转。'],
    sold: ['转了一圈，又回到原点。'],
  },
  con_follower: {
    limitUp: ['闻着臭，涨得香。'],
    limitDown: ['今天味道有点冲。'],
    bought: ['加辣还是加臭？'],
    sold: ['开窗通风，送客。'],
  },
  con_follower2: {
    limitUp: ['猫主子赏了个涨停。'],
    limitDown: ['猫把键盘踩了，跌了。'],
    bought: ['铲屎官，欢迎上岗。'],
    sold: ['猫不会想你的。'],
  },
  ph_follower: {
    limitUp: ['头发和股价，一起往上长。'],
    limitDown: ['又掉了一把。'],
    bought: ['坚持用，会有效果的。'],
    sold: ['头发要靠你自己了。'],
  },
  fin_follower: {
    limitUp: ['今天这节课免费。'],
    limitDown: ['今天这节课叫"风险"。'],
    bought: ['交了学费，开始上课。'],
    sold: ['这就毕业了？还没结课呢。'],
  },
  la_blue: {
    limitUp: ['飞的越多，停的越多。'],
    limitDown: ['今天没人来停。'],
    bought: ['停稳了，不收你停车费。'],
    sold: ['欢迎下次停靠。'],
  },
  gm_blue: {
    limitUp: ['老游戏，新高度。'],
    limitDown: ['怀旧也有怀不动的时候。'],
    bought: ['我出道的时候，你还没出生吧。'],
    sold: ['存档已保存。'],
  },
  gm_follower2: {
    limitUp: ['家人们，涨停了！'],
    limitDown: ['今天直播翻车了。'],
    bought: ['欢迎新粉丝！'],
    sold: ['取关了？下次再见。'],
  },
  pig_blue: {
    limitUp: ['今天的肉特别新鲜。'],
    limitDown: ['肉降价了，便宜卖。'],
    bought: ['称多少？'],
    sold: ['肉还没卖完呢。'],
  },
  st_dream: {
    limitUp: ['看，我画的饼成真了一点。'],
    limitDown: ['饼画大了，掉了。'],
    bought: ['饼很快就画好。'],
    sold: ['饼还没画完呢。'],
    delisted: ['饼没画完，人先走了。'],
  },
  st_ghost: {
    limitUp: ['……（突然上线）'],
    limitDown: ['……（继续失联）'],
    bought: ['您买的股票暂时无法接通。'],
    sold: ['已读不回。'],
    delisted: ['从此彻底失联。'],
  },
};

/** 各角色的通用台词（每个时机都有）。 */
export const ROLE_QUIPS: Record<Role, Record<QuipMoment, readonly string[]>> = {
  leader: {
    limitUp: ['跟我冲！', '带头大哥就是要带头。'],
    limitDown: ['大哥也有扛不住的时候。', '今天先让一让。'],
    streak: ['连续涨停 {n} 天，谁敢挡我？', '第 {n} 个涨停，小弟们跟上！'],
    delisted: ['我走了，江湖再见。'],
    bought: ['跟着我，有肉吃。', '眼光不错。'],
    sold: ['大哥你都敢卖？', '后悔了记得回来。'],
  },
  follower: {
    limitUp: ['沾大哥的光，涨停了！', '小弟也有春天。'],
    limitDown: ['大哥跑了，我也跑不动了。', '小弟今天受伤了。'],
    streak: ['跟着大哥连续涨停 {n} 天！', '{n} 天了，大哥还在带我飞。'],
    delisted: ['小弟先走一步。'],
    bought: ['老板好，我跟大哥混的。', '小弟报到。'],
    sold: ['我走了，大哥保重。', '跟谁混都一样。'],
  },
  bluechip: {
    limitUp: ['老实股也能涨停，没想到吧。', '慢慢来，比较快。'],
    limitDown: ['老实人也有跌的时候。', '跌得少，也是跌。'],
    streak: ['老实股连续涨停 {n} 天？我自己都吓到了。'],
    delisted: ['老实人也会走的。'],
    bought: ['拿着我，睡得香。', '不求暴富，只求安稳。'],
    sold: ['慢是慢了点，但我没骗过你。', '走吧，我还在这儿。'],
  },
  meme: {
    limitUp: ['坐稳了，要起飞了！', '刺激吧？'],
    limitDown: ['刺激吧？', '过山车也有下坡。'],
    streak: ['连续涨停 {n} 天！下一站，月球！', '{n} 天了，你敢下车吗？'],
    delisted: ['这一趟坐到头了。'],
    bought: ['系好安全带。', '上了我的车，就别想太多。'],
    sold: ['你下车了，车还在开。', '胆小鬼。'],
  },
  st: {
    limitUp: ['我还能抢救一下。', '回光返照？'],
    limitDown: ['又跌了，习惯了。', '别看我，我也不想。'],
    streak: ['连续涨停 {n} 天，我要翻身了！'],
    delisted: ['再见了，各位。', '我走了，别想我。'],
    bought: ['你胆子真大。', '买我？好吧。'],
    sold: ['跑得对。', '你是对的。'],
  },
};
