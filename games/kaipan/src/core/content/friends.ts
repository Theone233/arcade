import type { Dir, FriendDef, TurnTalk } from '../types.ts';

/**
 * 群友（M0：开局 6 个，道具或奖励可带来 2 个）。可信度、说话频率在 BALANCE.cred / BALANCE.chat。
 * 台词全部虚构；{theme} 换成风口名，{stock} 换成股票名。
 */
export const FRIENDS: readonly FriendDef[] = [
  { id: 'xiaoli', name: '小李', title: '大学生', topics: ['ai', 'gaming'], desc: '冲！起飞！', founding: true },
  { id: 'laowang', name: '老王', title: '退休教师', topics: ['finance', 'consumer'], desc: '话少，稳', founding: true },
  { id: 'zhangjie', name: '张姐', title: '宝妈', topics: ['pharma', 'consumer'], desc: '转发妈妈群的消息', founding: true },
  { id: 'qunzhu', name: '韭菜收割机', title: '群主', topics: 'all', desc: '天天喊人买股票、卖课', founding: true },
  { id: 'laozhao', name: '老赵', title: '老股民', topics: ['lowalt'], memes: true, desc: '懂的都懂', founding: true },
  { id: 'dav', name: '股市小诸葛', title: '大V', topics: 'hottest', desc: '直播口头禅不离嘴', founding: true },
  { id: 'neimu', name: '内幕哥', title: '神秘人', topics: 'random2', desc: '消息看完就撤回', founding: false },
  { id: 'zhuchang', name: '猪场老板', title: '养猪大户', topics: ['pig'], desc: '最懂猪的人', founding: false },
  // 0.4 C：能押跌之后入群；说错的时候一律唱空
  { id: 'kongjun', name: '空军老周', title: '职业唱空', topics: 'all', desc: '什么都觉得要跌', founding: false },
];

/** 风口消息台词。 */
export const MESSAGE_LINES: Record<string, Record<Dir, readonly string[]>> = {
  xiaoli: {
    up: ['{theme}要起飞了！冲冲冲！', '{theme}今天必涨，我把下个月生活费都押上了', '室友说{theme}今天有大动作，火箭已经加满油了', '{theme}！上车上车！'],
    down: ['{theme}今天要凉，先跑为敬', '{theme}有点虚，我卖了换奶茶', '{theme}今天别碰，我刚被教育了（哭）'],
    flat: ['{theme}今天应该没啥动静，我去上课了', '{theme}今天不动，像我的绩点', '{theme}今天摸鱼，我也摸鱼'],
  },
  laowang: {
    up: ['{theme}，可以。', '{theme}，看涨。', '{theme}，买点。'],
    down: ['{theme}，该走了。', '{theme}，不碰。', '{theme}，回避。'],
    flat: ['{theme}，再等等。', '{theme}，没变化。', '{theme}，不急。'],
  },
  zhangjie: {
    up: ['【转发】妈妈群里都在说{theme}今天要涨！', '幼儿园家长群都在聊{theme}，应该要涨吧？', '【转发】重磅！{theme}今天有喜事！！'],
    down: ['【转发】紧急！{theme}今天千万别碰！！', '听小区王阿姨说{theme}要跌，我信她', '【转发】速看！{theme}风险提示，看完记得转给家人'],
    flat: ['【转发】专家说{theme}今天波澜不惊', '{theme}今天平平淡淡，像我家孩子的成绩', '【转发】{theme}今天静悄悄'],
  },
  qunzhu: {
    up: ['【独家】{theme}今天要大涨！想上车的私聊我进 VIP 群', '{theme}起飞在即，听我的没错，错了算我的（不算）', '{theme}今天必涨！课程第三讲讲过！'],
    down: ['{theme}今天要跌，赶紧卖，别问为什么', '大户在{theme}偷偷卖了，课程里都讲过', '{theme}今天大跌，VIP 群早就跑了'],
    flat: ['{theme}今天不动，正是学习的好时机，课程限时 8 折', '{theme}不动，是大户在故意吓唬我们这种小散，懂？', '{theme}今天不动，适合报个班'],
  },
  laozhao: {
    up: ['{theme}，懂的都懂。', '{theme}今天有钱进来，不多说。', '{theme}，干就完了。'],
    down: ['{theme}，撤了。懂的都懂。', '{theme}的钱已经跑了。', '{theme}，别当最后一个买的人。'],
    flat: ['{theme}今天没人玩。', '{theme}，看戏。', '{theme}，没意思。'],
  },
  dav: {
    up: ['家人们！{theme}今天必须冲！点赞过万我再买！', '老铁们，{theme}这波我看到天花板之上！', '{theme}今天要涨，信我，关注不迷路'],
    down: ['家人们注意！{theme}今天风险大，先撤！', '{theme}今天要往下走，直播间的家人们别上头', '{theme}今天危险，这是我的个人观点，不构成建议'],
    flat: ['{theme}今天不动，家人们别急', '{theme}今天休息一下，下播了', '{theme}今天没方向，等我晚上直播细聊'],
  },
  neimu: {
    up: ['（看完就撤回）{theme}今天有好消息。', '表舅的同学的邻居说{theme}今天要涨。', '{theme}，今天涨，别问。'],
    down: ['（别外传）{theme}今天有坏消息。', '{theme}今天要跌，我只说一遍。', '（已撤回）{theme}，跑。'],
    flat: ['{theme}今天没消息，安静等着。', '{theme}今天平静，别乱动。', '{theme}，今天无事。'],
  },
  zhuchang: {
    up: ['猪价今天要涨，{theme}跟着涨！', '我家猪今天吃得特别香，{theme}要涨', '猪贩子都在抢货，{theme}稳了'],
    down: ['猪价要跌，{theme}快跑', '我家猪今天绝食了，不是好兆头', '猪贩子都在压价，{theme}悬了'],
    flat: ['猪价今天平稳，{theme}没啥动静', '猪在睡觉，{theme}也在睡觉', '{theme}今天平平，猪也平平'],
  },
  kongjun: {
    up: ['{theme}今天会涨，我承认。就今天。', '{theme}涨吧，涨得越高摔得越疼。', '{theme}今天我不空它。'],
    down: ['{theme}要跌，押它跌。', '{theme}？泡沫，迟早破。', '{theme}这价格，谁买谁站岗。'],
    flat: ['{theme}今天没劲，空都懒得空。', '{theme}横着，等它往下。', '{theme}，看它表演。'],
  },
};

/**
 * "要变天了"的说法：消息说的方向和眼下的公开走势相反时用（start：冷清时喊涨；top：火热时喊不动；ebb：火热时喊跌）。
 */
export const TURN_LINES: Record<string, Record<TurnTalk, readonly string[]>> = {
  xiaoli: {
    start: ['{theme}要起飞了！！我闻到了火箭燃料的味道', '{theme}冷了这么久，今天要醒了！冲！', '{theme}发射倒计时 3、2、1，点火！'],
    top: ['{theme}差不多到顶了吧？我有点恐高', '{theme}涨不动了，我先观望一下下', '{theme}好像在山顶，风好大，腿有点软'],
    ebb: ['{theme}该跑了！！室友已经跑没影了', '{theme}要凉，快跑，不跑就是下一个我（哭）', '{theme}，撤撤撤！'],
  },
  laowang: {
    start: ['{theme}，要起来了。', '{theme}，到时候了。', '{theme}，可以动了。'],
    top: ['{theme}，差不多了。', '{theme}，到顶了。', '{theme}，见好就收。'],
    ebb: ['{theme}，该跑了。', '{theme}，走。', '{theme}，别留恋。'],
  },
  zhangjie: {
    start: ['【转发】{theme}要起飞了！妈妈群已经炸了！', '王阿姨说{theme}憋了这么久终于要动了！', '【转发】重大好消息！{theme}马上要火了！！'],
    top: ['【转发】{theme}到顶了？专家说要见好就收', '妈妈群里都在晒{theme}的收益了，是不是到顶了', '【转发】{theme}涨多了，看完记得转给家人'],
    ebb: ['【转发】紧急！{theme}该跑了！！', '王阿姨已经把{theme}全卖了，我也跟了', '【转发】{theme}降温预警，速看！'],
  },
  qunzhu: {
    start: ['{theme}起飞信号出现！VIP 群已经上车！', '{theme}大户进场了，课程第五讲讲过！', '{theme}要火了，现在报名送内部票！'],
    top: ['{theme}到顶了？不，这是在攒劲，课程第四讲', '{theme}今天歇口气，大户在故意吓唬我们这种小散，懂？', '{theme}在高处不动，懂的人已经报班了'],
    ebb: ['{theme}该跑了，VIP 群昨天就跑了', '{theme}的大户在偷偷卖，不听课的人就当最后一个买的吧', '{theme}要崩，赶紧卖，卖完来听课'],
  },
  laozhao: {
    start: ['{theme}，有人要把它往上抬了。懂的都懂。', '{theme}，钱进来了。', '{theme}，起来了。'],
    top: ['{theme}，差不多了，我在找出口。', '{theme}，顶了。', '{theme}，再买就是最后一个了。'],
    ebb: ['{theme}，该跑了。', '{theme}，我已经走了。懂的都懂。', '{theme}，散了。'],
  },
  dav: {
    start: ['家人们！{theme}要起飞了！今晚直播细聊！', '{theme}跌到头了，要翻身了！家人们注意了！', '老铁们，{theme}这一波要开始了！'],
    top: ['家人们，{theme}差不多到顶了，别再追着买了', '{theme}涨到我说的价位了，家人们注意', '{theme}涨太高了，家人们管住手'],
    ebb: ['家人们快跑！{theme}要降温了！', '{theme}该跑了，直播间的家人们听我一句', '{theme}风险极大，先撤，个人观点'],
  },
  neimu: {
    start: ['（看完就撤回）{theme}要火了。', '{theme}，今天开始。别外传。', '表舅的同学说{theme}要动了。'],
    top: ['（别外传）{theme}差不多到顶了。', '{theme}，到顶了，我只说一遍。', '{theme}，该收手了。'],
    ebb: ['（已撤回）{theme}，该跑了。', '{theme}，快走。', '{theme}，里面的人都在出来。'],
  },
  zhuchang: {
    start: ['猪价要起飞了，{theme}也要起飞！', '猪贩子突然排长队，{theme}要动了', '我家猪今天特别兴奋，{theme}要起来了'],
    top: ['猪价到顶了，{theme}差不多了', '猪都吃撑了，{theme}也该歇歇了', '猪贩子不抢了，{theme}到头了'],
    ebb: ['猪价要崩，{theme}该跑了', '我家猪开始减肥了，{theme}快跑', '猪贩子都跑了，{theme}也跑吧'],
  },
  kongjun: {
    start: ['{theme}要起来？我先不空了，躲一躲。', '{theme}反弹，空头暂时撤退。', '{theme}，这波我认怂。'],
    top: ['{theme}到顶了，墨镜已经戴好。', '{theme}，我闻到了下跌的味道。', '{theme}涨不动了，准备押跌。'],
    ebb: ['{theme}开始跌了，空军出击！', '{theme}，早说了要跌。', '{theme}散了，押跌的吃肉。'],
  },
};

/** 推荐股票的理由。 */
export const REC_LINES: Record<string, readonly string[]> = {
  xiaoli: ['{stock}，名字就很有未来感，冲！', '{stock}！刷视频刷到好几次了，冲', '{stock}，宿舍全员上车'],
  laowang: ['{stock}，可以拿。', '{stock}，这家公司还行。', '{stock}，我自己也有一点。'],
  zhangjie: ['【转发】{stock}，妈妈群一致推荐', '{stock}，我家孩子很喜欢它家的东西', '{stock}，楼下超市都卖断货了'],
  qunzhu: ['{stock}！VIP 群内部票，今天免费送给大家', '{stock}能涨到现在的三倍，上车！', '{stock}，课程学员人手一只'],
  laozhao: ['{stock}，懂的都懂。', '{stock}，今天有大户要进。', '{stock}，少买点玩玩。'],
  dav: ['{stock}是今天直播间的福利票！', '{stock}，家人们一键三连！', '{stock}，我自己也买了不少（之一）'],
  neimu: ['{stock}，别问，买。', '{stock}，消息可靠，看完就删。', '{stock}，我就说这一次。'],
  zhuchang: ['{stock}，跟我家猪一样有前途', '{stock}，我自己也买了', '{stock}，猪都说好'],
  kongjun: ['{stock}，押它跌。', '{stock}涨上天了，押跌！', '{stock}，我赌它要掉下来。'],
};

/** 不分方向的得意（三个方向共用）。 */
function same(lines: readonly string[]): Record<Dir, readonly string[]> {
  return { up: lines, down: lines, flat: lines };
}

/** 收盘后说对的群友得意，按他早上说的方向分（说"不动"说对了，就不能喊"起飞"）。 */
export const BRAG_LINES: Record<string, Record<Dir, readonly string[]>> = {
  xiaoli: {
    up: ['看吧！我说什么来着！起飞！', '室友说我是股神，我谦虚地同意了', '{theme}涨了！我宣布，今天的我是全宿舍最靠谱的人'],
    down: ['看吧，我就说{theme}今天要凉，幸好我跑得快', '跌了吧！我早就说了（得意）', '{theme}跌了，我宣布，今天的我是全宿舍最靠谱的人'],
    flat: ['看吧，我就说它今天躺平', '{theme}果然在摸鱼，跟我一样', '我宣布，今天的我是全宿舍最靠谱的人'],
  },
  laowang: same(['嗯。', '正常。', '意料之中。']),
  zhangjie: same(['妈妈群果然靠谱！', '我就说王阿姨不会错', '【转发】今天的消息又对了，大家记得点赞']),
  qunzhu: {
    up: ['看到没？这就是专业！课程还有名额', '跟着我有肉吃', '今天说对的，明天收费'],
    down: ['看到没？我说跌就跌，课程还有名额', '听我的人今天都躲过去了', '今天说对的，明天收费'],
    flat: ['看到没？我说不动就不动，这就是专业', '{theme}今天就是不动，课程里讲过', '今天说对的，明天收费'],
  },
  laozhao: same(['懂的都懂。', '基本操作。', '早说了。']),
  dav: same(['家人们，我说的对不对？点个赞！', '又被我说对了，关注不迷路', '截图保存，以后都是我的战绩']),
  neimu: same(['（已撤回）', '消息准吧。', '下次还找我。']),
  zhuchang: {
    up: ['猪从来不骗人。', '我家猪说的，没错吧', '养了二十年猪，这点眼光还是有的'],
    down: ['猪从来不骗人。', '我家猪说要跌，没错吧', '养了二十年猪，这点眼光还是有的'],
    flat: ['猪从来不骗人。', '我家猪说今天没动静，没错吧', '养了二十年猪，这点眼光还是有的'],
  },
  kongjun: { up: ['涨就涨吧，我说了今天会涨。', '偶尔也要说点好听的。', '我也会看涨的。'], down: ['我说什么来着？跌了吧。', '空军永不为奴。', '墨镜戴上，开香槟。'], flat: ['横着，正如我所料。', '它不动，我就不慌。', '看吧，没劲。'] },
};

/** 收盘后说错的群友甩锅。 */
export const BLAME_LINES: Record<string, readonly string[]> = {
  xiaoli: ['这不怪我，是{theme}不争气（哭）', '我室友的消息，找他去', '{theme}辜负了我的青春'],
  laowang: ['意外。', '再看看。', '我的错。'],
  zhangjie: ['【转发】的消息有误，大家别当真', '王阿姨说她也是听别人说的', '妈妈群今天集体沉默了'],
  qunzhu: ['大户太狡猾了，这是在故意吓唬我们这种小散', '跌是给你们上车的机会，懂？', '没听课的人才会觉得我说错了'],
  laozhao: ['有人在使劲卖。', '意外，不多说。', '{theme}，看走眼了。'],
  dav: ['今天的走势超出了所有人的预期（包括我）', '家人们，这是意外中的意外！', '我说的是长期，长期！'],
  neimu: ['消息变了。', '（撤回了一条消息）', '我什么都没说过。'],
  zhuchang: ['猪也有失手的时候', '今天的猪不太对劲', '{theme}的事，猪也说不准'],
  kongjun: ['涨是暂时的，跌是永恒的。', '再涨我也不认。', '{theme}这是回光返照。'],
};

/** 持仓涨停时的道贺（任一群友）。 */
export const CHEER_LINES: readonly string[] = [
  '{stock}涨停了！发红包发红包！',
  '恭喜！{stock}涨停了，撒花！',
  '{stock}涨停！今晚加鸡腿',
  '{stock}这是要上天啊',
  '{stock}涨停了，你今天是不是穿了红袜子？',
  '{stock}涨满了！明天还请不请客？',
];

/** 持仓跌停时的调侃（任一群友）。 */
export const MOCK_LINES: readonly string[] = [
  '{stock}跌停了……喝杯奶茶压压惊',
  '{stock}：我只是躺一会儿',
  '{stock}跌停，就当交学费了',
  '别慌，{stock}只是去地下室看看',
  '{stock}跌停了，要不今晚吃顿好的安慰一下',
  '{stock}今天跌满了，明天总不会更差了吧……吧？',
];

/** 0.3.1：今天账户大赚时的道贺（任一群友）。{amount} 是赚到的钱。 */
export const BIG_WIN_LINES: readonly string[] = [
  '今天赚了{amount}？请客请客！',
  '{amount}到手，今晚的火锅你包了',
  '一天赚{amount}，比我一个月工资还多，酸了',
  '赚了{amount}，记得落袋，别又全亏回去',
  '{amount}！你是不是偷偷报了韭菜收割机的课？',
];

/** 0.3.1：今天账户大亏时的安慰（任一群友）。{amount} 是亏掉的钱。 */
export const BIG_LOSS_LINES: readonly string[] = [
  '今天亏了{amount}……抱抱，明天会好的',
  '{amount}没了，就当给市场交了学费',
  '亏了{amount}，先别看软件了，出去走走',
  '一天亏{amount}，我替你心疼了三秒',
  '没事，亏{amount}而已，还没到月底呢',
];

/** 0.3.1：某个风口涨疯了你一只都没有（任一群友）。 */
export const MISS_LINES: readonly string[] = [
  '{theme}今天涨疯了，你手里一只都没有？',
  '{theme}起飞了，你在哪儿？',
  '我早说{theme}要火，你不听',
  '{theme}热度大涨，下次记得早点上车',
  '错过{theme}没关系，下一个风口还会来',
];

/** 0.4 C：群友对重仓、押跌、抵押的反应（mood 对应头像表情）。 */
export const EXT_REACT_LINES: Record<string, readonly { friendId: string; text: string; mood: 'smug' | 'awkward' | 'normal' }[]> = {
  heavy: [
    { friendId: 'xiaoli', text: '一把梭？兄弟你这是要上天台还是上天堂', mood: 'normal' },
    { friendId: 'laowang', text: '年轻人，鸡蛋别放一个篮子里', mood: 'normal' },
    { friendId: 'dav', text: '家人们看看！这才是格局！', mood: 'smug' },
  ],
  short: [
    { friendId: 'kongjun', text: '欢迎加入空军，墨镜领一副', mood: 'smug' },
    { friendId: 'xiaoli', text: '你居然押它跌？大家都在买啊', mood: 'awkward' },
    { friendId: 'laozhao', text: '押跌，懂的都懂', mood: 'normal' },
  ],
  squeeze: [
    { friendId: 'xiaoli', text: '哈哈哈涨停了！押跌的兄弟还好吗', mood: 'smug' },
    { friendId: 'kongjun', text: '被轧了……不慌，涨得越高摔得越疼', mood: 'awkward' },
    { friendId: 'dav', text: '空头被打爆了！家人们这就是信仰的力量！', mood: 'smug' },
  ],
  shortWin: [
    { friendId: 'kongjun', text: '跌停！空军今晚加鸡腿', mood: 'smug' },
    { friendId: 'laozhao', text: '押跌押到跌停，懂的都懂', mood: 'smug' },
    { friendId: 'xiaoli', text: '别人跌停哭，你跌停笑，你是魔鬼吗', mood: 'normal' },
  ],
  borrow: [
    { friendId: 'laowang', text: '借钱炒股？你爸妈知道吗', mood: 'awkward' },
    { friendId: 'zhangjie', text: '我当年就是这么把房子炒没的', mood: 'awkward' },
    { friendId: 'qunzhu', text: '有魄力！借来的钱跟我买，稳赚', mood: 'smug' },
  ],
  call: [
    { friendId: 'laowang', text: '银行都打电话了，还不赶紧减点？', mood: 'awkward' },
    { friendId: 'xiaoli', text: '我手机也响了……哦是外卖', mood: 'normal' },
  ],
  seized: [
    { friendId: 'zhangjie', text: '抱抱，我懂这种感觉', mood: 'awkward' },
    { friendId: 'kongjun', text: '借钱炒股，涨的时候是翅膀，跌的时候是绞索', mood: 'normal' },
  ],
  redeem: [
    { friendId: 'laowang', text: '赎回来就好，知进退', mood: 'smug' },
    { friendId: 'xiaoli', text: '牛啊，空手套白狼还把狼还回去了', mood: 'smug' },
  ],
};
