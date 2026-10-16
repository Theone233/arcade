/**
 * 行情段揭晓页用的真实大事。
 *
 * 来源：1999、2000、2008 三年改写自 docs/history/timeline-1999.md、timeline-2000.md、timeline-2008.md；
 * 其余年份（1996–1998、2001–2007、2009–2018）每条在行尾注释里附来源链接（当年新闻、S&P DJI / 美联储公告，或维基百科词条作二手资料），
 * 日期、数字只取来源里能对上的。
 *
 * 写法约定：
 * - 只用时间线或行尾链接里能查到的事实；标"待核对"的数字一律不写。
 * - 内容边界（story-0.4 第 0.2 节）：政治和军事冲突不写（只写行情事实，不写原因）；有人员伤亡的事件不开玩笑。
 * - text、quip 都是自己改写的大白话，不摘录原文；语气同 0.3.1：口语、短句、不说教，
 *   不拿真实亏损者开玩笑（破产、挤兑、骗局类只写事实或很轻的一句）。
 * - 公司用 docs/story-0.4.md 第 1 节的化名；大盘用"老三十"（道指口径）、"科综"（纳指口径）；
 *   美联储、格林斯潘这类非公司名可直接写。
 * - date 必须是具体日期；时间线里只到月的条目取该月 15 日，并标 approx: true。
 * - text ≤ 28 个汉字，quip ≤ 24 个汉字（按 JS 字符串长度算）。
 * - weight：3 = 载入史册，2 = 行业大事，1 = 花边。
 * - sectors：行业 id（internet software hardware semis netequip telecom media bank broker
 *   finance realestate energy materials industrial auto retail consumer pharma biotech health
 *   utility），'market' 表示全市场。
 * - 按日期升序排列。
 */
export interface SegEvent {
  /** YYYY-MM-DD，必须是具体日期（时间线里"仅到月"的条目用该月 15 日，并在 approx 标 true） */
  date: string;
  /** 一句话说发生了什么，≤ 28 个汉字，自己改写，不照抄时间线原句 */
  text: string;
  /** 一句幽默点评，≤ 24 个汉字，大白话，可以借用群友口吻但别写群友名字 */
  quip: string;
  /** 重要度 1..3：3 = 载入史册，2 = 行业大事，1 = 花边 */
  weight: 1 | 2 | 3;
  /** 可选：主要相关的行业 id，揭晓页优先挑和玩家本局风口相关的 */
  sectors?: string[];
  approx?: boolean;
}

export const SEG_EVENTS: SegEvent[] = [
  // ===== 1996 =====
  { date: '1996-02-08', text: '电信法签署，电话和有线电视可以互闯地盘', quip: '圈地令一下，大家都想进场', weight: 2, sectors: ['telecom', 'media'] }, // https://en.wikipedia.org/wiki/Telecommunications_Act_of_1996
  { date: '1996-03-08', text: '老三十一天跌171点', quip: '一份报告，吓退一屋子人', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '1996-04-03', text: '亮讯通信上市，是当时美国最大的IPO', quip: '老电话公司的孩子出来单飞', weight: 2, sectors: ['telecom', 'netequip'] }, // https://en.wikipedia.org/wiki/Lucent
  { date: '1996-04-12', text: '呀呼门户上市，首日收盘比发行价高一倍多', quip: '上网冲浪，先冲到股市', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Yahoo!
  { date: '1996-10-14', text: '老三十第一次收在六千点之上', quip: '五千点才过去不到一年', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '1996-12-05', text: '美联储主席演讲，提到市场"非理性的狂热"', quip: '一句话，大盘当场打了个嗝', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Irrational_exuberance
  { date: '1996-12-06', text: '前一晚讲话后，老三十跌了145点', quip: '大家把话听进去了，一天', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Irrational_exuberance
  { date: '1996-12-20', text: '果子电脑宣布收购一家软件公司', quip: '买了个公司，请回了个人', weight: 2, sectors: ['hardware', 'software'] }, // https://en.wikipedia.org/wiki/NeXT
  { date: '1996-12-31', text: '老三十全年涨约26%，收在6448点', quip: '一年涨了四分之一还多', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average

  // ===== 1997 =====
  { date: '1997-02-13', text: '老三十第一次收在七千点之上', quip: '数字大了，胆子也大了', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '1997-03-17', text: '老三十换了四个成员，天天低价超市入选', quip: '老成员下课，新同学报到', weight: 2, sectors: ['market', 'retail'] }, // https://money.cnn.com/1997/03/12/markets/dow/
  { date: '1997-05-15', text: '雨林书城上市，发行价18美元', quip: '卖书的，后来什么都卖', weight: 2, sectors: ['internet', 'retail'] }, // https://en.wikipedia.org/wiki/Amazon_(company)
  { date: '1997-07-02', text: '泰国放开泰铢汇率，亚洲金融危机开始', quip: '一块钱的事，传到好几个国家', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/1997_Asian_financial_crisis
  { date: '1997-07-16', text: '老三十第一次收在八千点之上', quip: '一千点，用了五个月', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '1997-08-06', text: '微硬软件宣布向果子电脑投资1.5亿美元', quip: '对手出手相救，场面很魔幻', weight: 2, sectors: ['software', 'hardware'] }, // https://en.wikipedia.org/wiki/History_of_Apple_Inc.
  { date: '1997-10-27', text: '老三十一天跌554点，触发熔断，提前收市', quip: '熔断没见过，今天见了', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '1997-10-28', text: '老三十一天反弹337点', quip: '昨天吓人，今天吓人', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '1997-11-10', text: '世界通电信宣布买下一家长途电话公司', quip: '小鱼吃大鱼，数字吓人', weight: 2, sectors: ['telecom'] }, // https://en.wikipedia.org/wiki/WorldCom
  { date: '1997-12-31', text: '老三十全年涨约23%，收在7908点', quip: '又是红红火火的一年', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average

  // ===== 1998 =====
  { date: '1998-03-27', text: '辉煌制药的一款药获批上市', quip: '药一上市，股价先蓝了', weight: 1, sectors: ['pharma'] }, // https://en.wikipedia.org/wiki/Sildenafil
  { date: '1998-04-06', text: '老三十第一次收在九千点之上', quip: '一万点，已经在门口了', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '1998-04-06', text: '花期银行与一家保险金融集团宣布合并', quip: '强强联手，名字都想好了', weight: 2, sectors: ['bank', 'finance'] }, // https://en.wikipedia.org/wiki/Citigroup
  { date: '1998-08-31', text: '老三十一天跌513点，8月收尾很惨', quip: '月底最后一天，不太体面', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '1998-09-04', text: '谷哥搜索在车库里成立', quip: '车库里的公司，后来很大', weight: 1, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Google
  { date: '1998-09-23', text: '一家大对冲基金被十几家银行联手救场', quip: '赌大了，只好让朋友收拾', weight: 3, sectors: ['finance', 'bank'] }, // https://en.wikipedia.org/wiki/Long-Term_Capital_Management
  { date: '1998-09-24', text: '易拍网上市，首日收盘比发行价高一倍多', quip: '拍卖，先从自己开始', weight: 1, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/EBay
  { date: '1998-10-15', text: '美联储在例会之外临时降息', quip: '半夜加班，只为稳住大盘', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Federal_Reserve
  { date: '1998-11-13', text: '地球圈网上市，首日涨了六倍多', quip: '聊天室出了个新贵', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Theglobe.com
  { date: '1998-11-24', text: '拨号在线宣布买下网镜浏览器', quip: '浏览器大战，换了个赢家', weight: 2, sectors: ['internet', 'software'] }, // https://en.wikipedia.org/wiki/Netscape
  { date: '1998-12-01', text: '老油库宣布与另一家石油巨头合并', quip: '油价低，大家抱团取暖', weight: 2, sectors: ['energy'] }, // https://en.wikipedia.org/wiki/ExxonMobil

  // ===== 1999 =====
  { date: '1999-01-14', text: '巴西闹货币危机，老三十大跌', quip: '巴西离我八千里，钱包却疼了', weight: 2, sectors: ['market'] },
  { date: '1999-01-15', text: '盯盘网上市，首日涨了四倍多', quip: '打新就是印钞机，直到不是', weight: 1, sectors: ['internet'] },
  { date: '1999-02-03', text: '易交易连宕三天，客户想卖卖不了', quip: '最想点的时候，偏偏点不动', weight: 1, sectors: ['broker', 'internet'] },
  { date: '1999-03-29', text: '老三十第一次收在一万点之上', quip: '一万点！群里转发都转疯了', weight: 3, sectors: ['market'] },
  { date: '1999-03-30', text: '价线旅行上市，首日涨了好几倍', quip: '你出价，它涨价', weight: 1, sectors: ['internet', 'consumer'] },
  { date: '1999-04-09', text: '康宝电脑业绩预警，股价不到高点一半', quip: '说好的好消息呢', weight: 1, sectors: ['hardware'] },
  { date: '1999-04-19', text: '资金撤出科技股，科综一天跌5.6%', quip: '刚说完永远涨，就来个下马威', weight: 2, sectors: ['internet', 'market'] },
  { date: '1999-05-03', text: '老三十首次站上一万一，只用约五周', quip: '涨得比电梯还快', weight: 2, sectors: ['market'] },
  { date: '1999-05-04', text: '高胜投行自己也上市了', quip: '帮人卖了半辈子股，轮到自己', weight: 1, sectors: ['broker'] },
  { date: '1999-06-10', text: '易拍网宕机约一天，生意停摆', quip: '拍卖会停电，没人喊价了', weight: 1, sectors: ['internet'] },
  { date: '1999-06-30', text: '美联储年内第一次加息', quip: '钱变贵了，大家假装没看见', weight: 2, sectors: ['market'] },
  { date: '1999-07-06', text: '垃圾管家预警，股价一天跌三成多', quip: '收垃圾的，被坏消息砸中', weight: 1, sectors: ['industrial'] },
  { date: '1999-08-13', text: '铱星电话申请破产保护', quip: '通话打到太空，亏损也到太空', weight: 2, sectors: ['telecom'] },
  { date: '1999-09-21', text: '台湾大地震，内存条价格猛涨', quip: '地动山摇，内存条先涨价', weight: 1, sectors: ['semis', 'hardware'] },
  { date: '1999-10-15', text: '格林斯潘提醒防大跌，老三十挨跌', quip: '老爷子一开口，大家抖三抖', weight: 2, sectors: ['market'] },
  { date: '1999-10-19', text: '摔角大联盟和女王家政同天上市', quip: '一个摔人一个烤蛋糕，都被抢', weight: 1, sectors: ['media'] },
  { date: '1999-10-29', text: '聪明加速上市，首日涨了四倍多', quip: '加速的是股价，不是网速', weight: 1, sectors: ['internet', 'netequip'] },
  { date: '1999-11-01', text: '微硬软件和因特儿芯片入选老三十', quip: '科技股终于拿到了贵宾票', weight: 2, sectors: ['software', 'semis'] },
  { date: '1999-11-05', text: '法官认定微硬软件是垄断者', quip: '块头太大，也是麻烦', weight: 2, sectors: ['software'] },
  { date: '1999-12-09', text: '企鹅服务器上市，首日涨近七倍', quip: '开盘价一出，群里直接傻眼', weight: 2, sectors: ['software', 'hardware'] },
  { date: '1999-12-29', text: '分析师喊糕通芯片千元目标，科综破四千', quip: '喊一千的人，嗓子也值钱', weight: 3, sectors: ['semis', 'market'] },
  { date: '1999-12-31', text: '千年虫没来，指数全年收在新高', quip: '虚惊一场，红包照发', weight: 2, sectors: ['market'] },

  // ===== 2000 =====
  { date: '2000-01-04', text: '新年第一周，科综一天跌了5.6%', quip: '红包还没拆，就缩水了', weight: 2, sectors: ['internet', 'market'] },
  { date: '2000-01-10', text: '拨号在线要吞下时代兄弟传媒', quip: '小鱼吃大鱼，用的是股票', weight: 2, sectors: ['internet', 'media'] },
  { date: '2000-01-14', text: '老三十创下纪录高点，多年没再超过', quip: '站在山顶的人，没带外套', weight: 3, sectors: ['market'] },
  { date: '2000-02-07', text: '黑客轮番攻击，呀呼门户等大站瘫痪', quip: '刷屏刷到网站都撑不住', weight: 1, sectors: ['internet'] },
  { date: '2000-02-15', text: '宠物点康在科综挂牌上市', quip: '袜子玩偶先出道了', weight: 1, sectors: ['internet', 'retail'], approx: true },
  { date: '2000-03-02', text: '掌心电脑上市，市值是亲妈的两倍', quip: '儿子比妈有钱，妈很尴尬', weight: 2, sectors: ['hardware'] },
  { date: '2000-03-10', text: '科综冲上5048点，泡沫的最高处', quip: '山顶风景好，但没人久留', weight: 3, sectors: ['internet', 'market'] },
  { date: '2000-03-16', text: '老三十一天大涨近五百点', quip: '资金翻脸，从新潮跑回老牌', weight: 2, sectors: ['market'] },
  { date: '2000-03-20', text: '小策略软件改账，盈利变亏损，一日跌六成', quip: '橡皮擦太用力，擦出窟窿', weight: 2, sectors: ['software'] },
  { date: '2000-03-27', text: '思铲网络市值超过微硬软件，全球第一', quip: '卖铲子的，成了首富', weight: 2, sectors: ['netequip'] },
  { date: '2000-04-03', text: '微硬软件被判违反反垄断法，科综大跌', quip: '巨人摔跤，地面都在抖', weight: 2, sectors: ['software', 'market'] },
  { date: '2000-04-05', text: '酥脆甜甜圈上市，首日涨约七成', quip: '科技股崩了，甜食还能吃', weight: 1, sectors: ['consumer'] },
  { date: '2000-04-14', text: '老三十一天跌六百多点，科综大跌近一成', quip: '报税日，先被市场收一笔', weight: 3, sectors: ['market'] },
  { date: '2000-05-16', text: '美联储一口气加息半个点', quip: '钱越来越贵，梦越来越便宜', weight: 2, sectors: ['market'] },
  { date: '2000-05-23', text: '科综一天跌6%，创年内最低收盘', quip: '底在哪儿，没人知道', weight: 2, sectors: ['internet', 'market'] },
  { date: '2000-05-30', text: '科综一天反弹近8%', quip: '过山车上，尖叫声更大', weight: 1, sectors: ['internet', 'market'] },
  { date: '2000-06-23', text: '有人说雨林书城现金撑不久，股价跌近两成', quip: '书还在卖，钱先烧完了？', weight: 2, sectors: ['internet', 'retail'] },
  { date: '2000-07-10', text: '光通一相出手买同行，科技并购新纪录', quip: '钱不够？股票来凑', weight: 2, sectors: ['netequip', 'telecom'] },
  { date: '2000-07-20', text: '亮讯通信年内第二次预警，股价大跌', quip: '灯泡一闪一闪，快没电了', weight: 2, sectors: ['netequip', 'telecom'] },
  { date: '2000-08-25', text: '假新闻来袭，仿真网卡十六分钟股价砍半', quip: '一张假通告，吓掉半个公司', weight: 2, sectors: ['hardware', 'netequip'] },
  { date: '2000-09-21', text: '因特儿芯片预警，次日股价跌两成多', quip: '龙头咳嗽，全场感冒', weight: 2, sectors: ['semis'] },
  { date: '2000-09-29', text: '果子电脑预警，一天市值腰斩', quip: '昨晚一条消息，今天半条命', weight: 2, sectors: ['hardware'] },
  { date: '2000-10-25', text: '北极电讯暴跌，老电话公司宣布拆成四家', quip: '分家之后，各过各的', weight: 1, sectors: ['telecom', 'netequip'] },
  { date: '2000-11-07', text: '宠物点康宣布清算，才上市九个月', quip: '袜子玩偶，谢幕了', weight: 2, sectors: ['internet', 'retail'] },
  { date: '2000-11-08', text: '大选结果未定，科综一天跌5.4%', quip: '数票数到股价也乱了', weight: 1, sectors: ['market'] },
  { date: '2000-12-05', text: '格林斯潘松口风，科综一天暴涨10.5%', quip: '一句话，抵得上一个季度', weight: 3, sectors: ['market'] },
  { date: '2000-12-29', text: '科综全年跌近四成，史上最差一年', quip: '新年愿望：别再跌了', weight: 3, sectors: ['market'] },

  // ===== 2001 =====
  { date: '2001-01-03', text: '美联储临时降息半个点，科综一天暴涨14%', quip: '凌晨一个电话，行情翻了面', weight: 3, sectors: ['market', 'internet'] }, // https://en.wikipedia.org/wiki/Early_2000s_recession
  { date: '2001-01-11', text: '拨号在线完成对时代兄弟传媒的合并', quip: '婚礼办完，感情另说', weight: 2, sectors: ['internet', 'media'] }, // https://en.wikipedia.org/wiki/AOL_Time_Warner
  { date: '2001-04-18', text: '美联储再次临时降息，老三十涨399点', quip: '降息像续命，每次都灵', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '2001-09-03', text: '汇普打印宣布与康宝电脑合并', quip: '两家老电脑厂，抱团过冬', weight: 2, sectors: ['hardware'] }, // https://en.wikipedia.org/wiki/Hewlett-Packard
  { date: '2001-09-11', text: '市场停市，之后一共休市4天', quip: '这几天，数字不重要', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Economic_effects_of_the_September_11_attacks
  { date: '2001-09-17', text: '市场复市，老三十一天跌685点', quip: '重新开门，大家心情沉重', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '2001-10-23', text: '果子电脑发布随身听歌的小机器', quip: '口袋里装一千首歌', weight: 2, sectors: ['hardware', 'consumer'] }, // https://en.wikipedia.org/wiki/IPod
  { date: '2001-10-25', text: '微硬软件推出新一代视窗系统', quip: '换个界面，照样重启', weight: 1, sectors: ['software'] }, // https://en.wikipedia.org/wiki/Windows_XP
  { date: '2001-12-02', text: '恩龙能源申请破产，是当时美国最大的破产案', quip: '账本里的洞，比想象深', weight: 3, sectors: ['energy', 'finance'] }, // https://en.wikipedia.org/wiki/Enron
  { date: '2001-12-11', text: '中国正式加入世界贸易组织', quip: '大市场开门，生意人先激动', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/China_and_the_World_Trade_Organization

  // ===== 2002 =====
  { date: '2002-01-22', text: '一家老牌连锁商超申请破产保护', quip: '蓝灯一闪，货架先空', weight: 1, sectors: ['retail'] }, // https://en.wikipedia.org/wiki/Kmart
  { date: '2002-05-03', text: '汇普打印完成对康宝电脑的收购', quip: '合并完了，要熬过整合', weight: 1, sectors: ['hardware'] }, // https://en.wikipedia.org/wiki/Hewlett-Packard
  { date: '2002-06-25', text: '世界通电信承认38亿美元的账目造假', quip: '一笔笔开销，全记错了地方', weight: 3, sectors: ['telecom'] }, // https://en.wikipedia.org/wiki/WorldCom_scandal
  { date: '2002-07-08', text: '易拍网宣布买下一家网上支付公司', quip: '拍卖要付款，顺手买下', weight: 1, sectors: ['internet', 'finance'] }, // https://en.wikipedia.org/wiki/PayPal
  { date: '2002-07-21', text: '世界通电信申请破产，刷新美国纪录', quip: '纪录总在不想破的时候破', weight: 3, sectors: ['telecom'] }, // https://en.wikipedia.org/wiki/WorldCom
  { date: '2002-07-24', text: '老三十一天猛涨489点', quip: '熊市里的反弹，抓得住吗', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '2002-07-30', text: '国会通过上市公司会计改革法', quip: '账要认真记，规矩写进法', weight: 2, sectors: ['market', 'finance'] }, // https://en.wikipedia.org/wiki/Sarbanes%E2%80%93Oxley_Act
  { date: '2002-10-09', text: '老三十和科综同天收在这轮熊市最低', quip: '最黑的时候，没人敢抄底', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Stock_market_downturn_of_2002
  { date: '2002-11-06', text: '美联储降息半个点，利率降到1.25%', quip: '钱便宜到快没价', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/History_of_Federal_Open_Market_Committee_actions
  { date: '2002-12-31', text: '老三十全年跌约17%，是连续第三年下跌', quip: '这笔账，三年没转正', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average

  // ===== 2003 =====
  { date: '2003-01-16', text: '微硬软件宣布第一次发股息', quip: '钱多到只好分一点', weight: 1, sectors: ['software'] }, // https://en.wikipedia.org/wiki/Microsoft
  { date: '2003-03-11', text: '老三十再次探底，收在约7524点', quip: '后来才知道，这是最后一探', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Stock_market_downturn_of_2002
  { date: '2003-04-28', text: '果子电脑上线网上音乐店，一首99美分', quip: '一首一块钱，盗版先愣了', weight: 2, sectors: ['hardware', 'media'] }, // https://en.wikipedia.org/wiki/ITunes_Store
  { date: '2003-05-28', text: '国会通过减税法案，股息税率降到15%', quip: '分红不再被收重税', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Jobs_and_Growth_Tax_Relief_Reconciliation_Act_of_2003
  { date: '2003-06-25', text: '美联储降息四分之一点，利率降到1%', quip: '一年期利率，只剩一分', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/History_of_Federal_Open_Market_Committee_actions
  { date: '2003-07-14', text: '呀呼门户宣布买下一家搜索广告公司', quip: '搜索赚钱，大家才看明白', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Yahoo!
  { date: '2003-12-31', text: '老三十全年涨约25%，科综涨约50%', quip: '熊市终于翻篇了', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average

  // ===== 2004 =====
  { date: '2004-02-04', text: '面书社交在大学宿舍里上线', quip: '宿舍夜谈，谁想得到后来', weight: 1, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Facebook
  { date: '2004-02-17', text: '一家无线电话公司宣布以410亿美元被收购', quip: '手机多了，电话公司更多', weight: 1, sectors: ['telecom'] }, // https://en.wikipedia.org/wiki/AT%26T_Wireless
  { date: '2004-04-08', text: '爱保集团、辉煌制药等三家入选老三十', quip: '老三十也要换新血', weight: 2, sectors: ['market', 'finance', 'pharma'] }, // https://money.cnn.com/2004/04/01/markets/dow/
  { date: '2004-06-30', text: '美联储四年来第一次加息，升四分之一点', quip: '利率开始爬坡，一路连升', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/History_of_Federal_Open_Market_Committee_actions
  { date: '2004-08-19', text: '谷哥搜索上市，发行价85美元，用拍卖定价', quip: '连定价都不走寻常路', weight: 3, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Google
  { date: '2004-09-30', text: '一家老牌药企宣布召回一款常用止痛药，股价跌27%', quip: '这次不开玩笑，召回要紧', weight: 2, sectors: ['pharma'] }, // https://en.wikipedia.org/wiki/Rofecoxib
  { date: '2004-10-15', text: '原油首次站上每桶50美元', quip: '加油站的牌子越改越长', weight: 2, sectors: ['energy'], approx: true }, // https://en.wikipedia.org/wiki/Price_of_oil
  { date: '2004-12-08', text: '一家蓝色电脑巨头把个人电脑业务卖给中国同行', quip: '卖了老本行，轻装上阵', weight: 2, sectors: ['hardware'] }, // https://en.wikipedia.org/wiki/Lenovo

  // ===== 2005 =====
  { date: '2005-01-28', text: '日用品巨头宣布570亿美元买剃须刀老牌', quip: '男人的胡子，价值连城', weight: 2, sectors: ['consumer'] }, // https://en.wikipedia.org/wiki/Gillette_(brand)
  { date: '2005-04-20', text: '大钟交易所宣布与一家电子交易平台合并', quip: '敲钟的，自己也要被交易', weight: 2, sectors: ['finance', 'broker'] }, // https://en.wikipedia.org/wiki/NYSE_Group
  { date: '2005-05-05', text: '通通汽车和福德汽车被评级公司降为垃圾级', quip: '两大车企，一起掉档', weight: 2, sectors: ['auto'] }, // https://en.wikipedia.org/wiki/General_Motors
  { date: '2005-06-06', text: '果子电脑宣布电脑改用因特儿芯片', quip: '昔日对手，成了供应商', weight: 3, sectors: ['hardware', 'semis'] }, // https://en.wikipedia.org/wiki/Mac_transition_to_Intel_processors
  { date: '2005-08-11', text: '呀呼门户出资10亿美元入股芝麻电商', quip: '一笔投资，几年后翻了几十倍', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Alibaba_Group
  { date: '2005-08-29', text: '飓风卡特里娜登陆，原油一度冲到每桶70美元', quip: '这次不说笑，先说平安', weight: 2, sectors: ['energy'] }, // https://en.wikipedia.org/wiki/Hurricane_Katrina
  { date: '2005-10-08', text: '一家汽车零件巨头申请破产保护', quip: '车企的供应链，先裂了', weight: 1, sectors: ['auto', 'industrial'] }, // https://en.wikipedia.org/wiki/Delphi_Corporation
  { date: '2005-11-18', text: '老三十里的电话公司买下百年老电话公司', quip: '买下老字号，连名字也拿走', weight: 2, sectors: ['telecom'] }, // https://en.wikipedia.org/wiki/AT%26T_Corporation
  { date: '2005-12-13', text: '美联储第13次加息，利率升到4.25%', quip: '加了十几次，还在加', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/History_of_Federal_Open_Market_Committee_actions

  // ===== 2006 =====
  { date: '2006-01-24', text: '一家动画巨头宣布74亿美元买下一家动画工作室', quip: '动画巨头买下动画新贵', weight: 1, sectors: ['media'] }, // https://en.wikipedia.org/wiki/Pixar
  { date: '2006-01-31', text: '执掌美联储十八年多的主席卸任', quip: '换了人，大盘先紧张', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Alan_Greenspan
  { date: '2006-03-08', text: '大钟交易所自己上市，开始公开交易', quip: '卖了一辈子票，终于轮到自己', weight: 1, sectors: ['broker', 'finance'] }, // https://en.wikipedia.org/wiki/NYSE_Group
  { date: '2006-06-29', text: '美联储连续第17次加息，利率升到5.25%', quip: '加到这儿，才算收手', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/History_of_Federal_Open_Market_Committee_actions
  { date: '2006-10-03', text: '老三十收盘创历史新高，超过2000年的纪录', quip: '等了六年多，终于回家', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2006-10-09', text: '谷哥搜索宣布16.5亿美元买下一家视频网站', quip: '一个视频站，换来一座金山', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/YouTube
  { date: '2006-10-19', text: '老三十第一次收在一万二之上', quip: '一万一刚过，又涨一千', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2006-12-29', text: '老三十全年涨约16%，收在12463点', quip: '这一年，好像怎么买都对', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average

  // ===== 2007 =====
  { date: '2007-01-09', text: '果子电脑发布手机，把电话和上网合到一起', quip: '一块屏幕，改变了手指', weight: 3, sectors: ['hardware', 'consumer'] }, // https://en.wikipedia.org/wiki/IPhone_(1st_generation)
  { date: '2007-02-27', text: '老三十一天跌416点，当年第一次大跌', quip: '一年平静，被一天打破', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '2007-04-02', text: '一家次级房贷放贷商申请破产', quip: '房贷的雷，第一声响', weight: 2, sectors: ['finance', 'realestate'] }, // https://en.wikipedia.org/wiki/New_Century_Financial_Corporation
  { date: '2007-07-19', text: '老三十第一次收在一万四之上', quip: '一万四，还有点高处不胜寒', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2007-08-09', text: '一家法国大银行冻结三只次贷基金，欧洲央行紧急放水', quip: '基金冻住，市场也冻了', weight: 3, sectors: ['bank', 'finance'] }, // https://en.wikipedia.org/wiki/Subprime_mortgage_crisis
  { date: '2007-09-18', text: '美联储降息半个点，是四年多来第一次降', quip: '风向变了，大家开心了', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/History_of_Federal_Open_Market_Committee_actions
  { date: '2007-10-09', text: '老三十收在14164点，创历史新高', quip: '后来很久，都没再见过', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2007-10-24', text: '微硬软件花2.4亿美元买下面书社交一小股', quip: '一小口股份，估值惊人', weight: 1, sectors: ['internet', 'software'] }, // https://en.wikipedia.org/wiki/Facebook
  { date: '2007-11-04', text: '花期银行预告将有巨额次贷减记', quip: '预告来了，大约还没完', weight: 2, sectors: ['bank'] }, // https://en.wikipedia.org/wiki/Citigroup
  { date: '2007-12-12', text: '美联储联手几家央行，向银行放出新贷款', quip: '圣诞前，大家先要现金', weight: 2, sectors: ['bank', 'market'] }, // https://en.wikipedia.org/wiki/Term_Auction_Facility

  // ===== 2008 =====
  { date: '2008-01-15', text: '花期银行公布巨额次贷减记，还砍了股息', quip: '花瓶里的花，蔫了', weight: 2, sectors: ['bank'] },
  { date: '2008-01-22', text: '美联储紧急降息四分之三个点', quip: '不是例会，是急诊', weight: 2, sectors: ['market'] },
  { date: '2008-02-01', text: '微硬软件开价四百多亿美元想买呀呼门户', quip: '被追的人，先端起了架子', weight: 2, sectors: ['software', 'internet'] },
  { date: '2008-03-14', text: '熊斯登投行告急，一天暴跌近半', quip: '几天前还有人说它没事', weight: 3, sectors: ['broker', 'bank'] },
  { date: '2008-03-16', text: '熊斯登周末被贱卖，每股约2美元', quip: '周末一过，价格剩了零头', weight: 2, sectors: ['broker', 'bank'] },
  { date: '2008-04-28', text: '口香糖老铺被糖果巨头收购', quip: '嚼来嚼去，被人一口吞了', weight: 1, sectors: ['consumer'] },
  { date: '2008-05-19', text: '老三十最后一次收在一万三之上', quip: '后来很久，都没回来过', weight: 2, sectors: ['market'] },
  { date: '2008-06-09', text: '雷满兄弟预告首次亏损', quip: '老铺子第一次交白卷', weight: 2, sectors: ['broker', 'bank'] },
  { date: '2008-06-30', text: '老三十六月狂跌一成，半年最差', quip: '上半年成绩单，不敢给家长看', weight: 2, sectors: ['market'] },
  { date: '2008-07-11', text: '原油冲到每桶147美元，历史纪录', quip: '加一箱油，像买件大衣', weight: 2, sectors: ['energy', 'auto'] },
  { date: '2008-07-11', text: '印第储蓄遭挤兑被关，储户排长队', quip: '排队的人，只想拿回自己的钱', weight: 2, sectors: ['bank'] },
  { date: '2008-07-15', text: '财政部喊话撑腰房地大妈和大叔', quip: '口袋里的火箭筒，先别点火', weight: 1, sectors: ['finance', 'realestate'] },
  { date: '2008-08-01', text: '通通汽车季度亏了155亿美元', quip: '油箱空了，账本也空了', weight: 1, sectors: ['auto'] },
  { date: '2008-09-07', text: '房地大妈和房地大叔被政府接管', quip: '大妈大叔，终于有人管了', weight: 3, sectors: ['finance', 'realestate'] },
  { date: '2008-09-14', text: '美利坚银行周末收下牛林证券', quip: '周末的门铃，是救命的', weight: 2, sectors: ['bank', 'broker'] },
  { date: '2008-09-15', text: '雷满兄弟申请破产，老三十大跌超4%', quip: '这一天，群里没人说话', weight: 3, sectors: ['broker', 'bank', 'market'] },
  { date: '2008-09-16', text: '政府借给爱保集团最多850亿美元', quip: '保险公司，自己需要保险了', weight: 3, sectors: ['finance'] },
  { date: '2008-09-25', text: '华互银行倒闭，美国史上最大', quip: '排行榜第一，谁也不想要', weight: 3, sectors: ['bank'] },
  { date: '2008-09-29', text: '救市法案被否决，老三十一天跌777点', quip: '议员投票，大盘用脚回答', weight: 3, sectors: ['market'] },
  { date: '2008-10-03', text: '总统签署7000亿美元救市法案', quip: '钱有了，信心还在路上', weight: 2, sectors: ['market'] },
  { date: '2008-10-10', text: '老三十单周狂跌18%，史上最差一周', quip: '这一周，别看账户', weight: 3, sectors: ['market'] },
  { date: '2008-10-13', text: '老三十一天大涨11%', quip: '跌怕了的人，涨也怕', weight: 2, sectors: ['market'] },
  { date: '2008-10-16', text: '奥马哈控股老板发文：我在买美国股票', quip: '别人都怕，他偏不怕', weight: 2, sectors: ['market', 'finance'] },
  { date: '2008-11-04', text: '奥巴马当选总统', quip: '选举日涨，隔天就跌', weight: 2, sectors: ['market'] },
  { date: '2008-11-18', text: '三大车企老总坐私人飞机去国会要钱', quip: '专机来求援，议员当场挖苦', weight: 1, sectors: ['auto'] },
  { date: '2008-11-20', text: '老三十跌到五年多来最低', quip: '回到了五年前的家', weight: 2, sectors: ['market'] },
  { date: '2008-11-23', text: '政府出手救花期银行，次日股价涨近六成', quip: '一夜之间，蔫花又浇了水', weight: 2, sectors: ['bank'] },
  { date: '2008-12-01', text: '官方确认美国早已陷入衰退', quip: '迟到的通知，早就感觉到了', weight: 2, sectors: ['market'] },
  { date: '2008-12-11', text: '麦道夫被捕，认了约500亿美元的骗局', quip: '最稳的收益，最假的账本', weight: 2, sectors: ['finance'] },
  { date: '2008-12-16', text: '美联储把利率降到几乎为零', quip: '钱，不要钱了', weight: 3, sectors: ['market'] },
  { date: '2008-12-31', text: '老三十全年跌三成多，1931年来最差', quip: '这一年，终于翻篇了', weight: 3, sectors: ['market'] },

  // ===== 2009 =====
  { date: '2009-01-22', text: '微硬软件宣布裁员5000人，是公司头一回大裁员', quip: '老牌巨头也要勒紧裤腰带', weight: 1, sectors: ['software'] }, // https://en.wikipedia.org/wiki/Microsoft
  { date: '2009-02-27', text: '政府同意把花期银行的优先股换成普通股', quip: '政府成了大股东', weight: 2, sectors: ['bank'] }, // https://en.wikipedia.org/wiki/Citigroup
  { date: '2009-03-09', text: '老三十收在6547点，是这轮熊市的最低', quip: '砸穿了所有人的底线', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Financial_crisis_of_2007%E2%80%932008
  { date: '2009-03-18', text: '美联储宣布再买入大量国债，老三十当天涨近百点', quip: '印钞厂开足马力', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Quantitative_easing
  { date: '2009-06-01', text: '通通汽车申请破产保护', quip: '百年车企，一夜换主', weight: 3, sectors: ['auto'] }, //   { date: '2009-06-08', text: '老三十换人：思铲网络等入选，通通汽车被换下', quip: '老三十也有升降级', weight: 2, sectors: ['market', 'netequip'] }, // https://money.cnn.com/2009/06/01/news/companies/dow_jones/index.htm
  { date: '2009-10-14', text: '老三十重新收在一万点之上', quip: '一年没见，一万点', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2009-11-03', text: '奥马哈控股宣布斥资数百亿美元买下铁路公司', quip: '老股神出手，买的是铁轨', weight: 2, sectors: ['industrial', 'finance'] }, // https://en.wikipedia.org/wiki/Berkshire_Hathaway
  { date: '2009-12-31', text: '科综全年涨近44%，老三十涨近19%', quip: '去年的坑，今年填平一半', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Financial_crisis_of_2007%E2%80%932008

  // ===== 2010 =====
  { date: '2010-01-27', text: '果子电脑发布平板电脑', quip: '手机放大，电脑缩小', weight: 2, sectors: ['hardware', 'consumer'] }, // https://en.wikipedia.org/wiki/IPad_(1st_generation)
  { date: '2010-04-16', text: '证监会起诉高胜投行，老三十当天跌125点', quip: '大投行吃上官司，股价先抖', weight: 2, sectors: ['broker', 'bank'] }, // https://en.wikipedia.org/wiki/Goldman_Sachs
  { date: '2010-05-06', text: '老三十盘中几分钟暴跌近千点，随后大半收回', quip: '过山车，没系安全带', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/2010_flash_crash
  { date: '2010-05-10', text: '欧洲推出7500亿欧元稳定基金，老三十涨405点', quip: '大笔资金，一针强心', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/European_debt_crisis
  { date: '2010-06-29', text: '电斯拉汽车上市，是美国车企半个世纪来首个IPO', quip: '电动车，也能上市敲钟', weight: 2, sectors: ['auto'] }, // https://en.wikipedia.org/wiki/Tesla,_Inc.
  { date: '2010-07-21', text: '金融监管改革法签署，银行业规矩大改', quip: '危机之后，补一本规矩', weight: 2, sectors: ['bank', 'finance'] }, // https://en.wikipedia.org/wiki/Dodd%E2%80%93Frank_Wall_Street_Reform_and_Consumer_Protection_Act
  { date: '2010-08-19', text: '因特儿芯片宣布77亿美元买下一家杀毒软件公司', quip: '芯片厂开始关心病毒', weight: 1, sectors: ['semis', 'software'] }, // https://en.wikipedia.org/wiki/McAfee
  { date: '2010-11-03', text: '美联储宣布再买6000亿美元国债', quip: '第二轮放水，水管子又拧开了', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Quantitative_easing
  { date: '2010-11-18', text: '通通汽车重新上市，刷新美国IPO纪录', quip: '破产出来，重新上桌', weight: 2, sectors: ['auto'] }, // https://en.wikipedia.org/wiki/General_Motors

  // ===== 2011 =====
  { date: '2011-03-11', text: '日本发生大地震，全球市场受冲击', quip: '这一天，先关心人', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/2011_T%C5%8Dhoku_earthquake_and_tsunami
  { date: '2011-03-20', text: '电话公司宣布390亿美元买另一家无线运营商', quip: '手机信号，也要并个网', weight: 1, sectors: ['telecom'] }, // https://en.wikipedia.org/wiki/AT%26T_Mobility
  { date: '2011-05-10', text: '微硬软件宣布85亿美元买下一家网络电话', quip: '一通电话，值85亿', weight: 1, sectors: ['software', 'internet'] }, // https://en.wikipedia.org/wiki/Skype
  { date: '2011-05-19', text: '职场领英网上市，首日股价翻了一倍多', quip: '简历上，又添一笔暴涨', weight: 1, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/LinkedIn
  { date: '2011-08-08', text: '老三十一天跌约635点，是金融危机后最狠一天', quip: '这个八月，真长', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/August_2011_stock_markets_fall
  { date: '2011-08-09', text: '老三十一天反弹约430点', quip: '昨天跌，今天涨，心跳不停', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/August_2011_stock_markets_fall
  { date: '2011-08-18', text: '汇普打印宣布考虑剥离个人电脑业务', quip: '卖了成名作，转身做软件', weight: 2, sectors: ['hardware', 'software'] }, // https://en.wikipedia.org/wiki/Hewlett-Packard
  { date: '2011-09-21', text: '美联储宣布扭转操作，老三十当天跌391点', quip: '宣布利好，大盘却不买账', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Operation_Twist
  { date: '2011-10-31', text: '一家期货经纪商申请破产', quip: '客户的钱，也被卷进去', weight: 2, sectors: ['broker', 'finance'] }, // https://en.wikipedia.org/wiki/MF_Global
  { date: '2011-12-30', text: '五百强指数全年几乎持平，老三十涨约5.5%', quip: '折腾一年，原地踏步', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/S%26P_500

  // ===== 2012 =====
  { date: '2012-01-19', text: '老牌胶卷巨头申请破产保护', quip: '按下快门，也留不住时代', weight: 2, sectors: ['consumer', 'hardware'] }, // https://en.wikipedia.org/wiki/Kodak
  { date: '2012-02-01', text: '面书社交递交上市申请', quip: '朋友圈，要上证券交易所了', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Initial_public_offering_of_Facebook
  { date: '2012-05-10', text: '摩登大通银行披露交易亏损20亿美元', quip: '一笔对冲，亏出个大窟窿', weight: 2, sectors: ['bank'] }, // https://en.wikipedia.org/wiki/2012_JPMorgan_Chase_trading_loss
  { date: '2012-05-18', text: '面书社交上市，发行价38美元', quip: '上市第一天，涨得没想象快', weight: 3, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Initial_public_offering_of_Facebook
  { date: '2012-07-26', text: '欧洲央行行长称将不惜一切守住欧元，股市应声上涨', quip: '一句话，抵一个基金', weight: 2, sectors: ['market', 'bank'] }, // https://en.wikipedia.org/wiki/Mario_Draghi
  { date: '2012-08-01', text: '骑士做市商电脑程序出错，45分钟亏4.4亿美元', quip: '一行代码，一夜白干', weight: 2, sectors: ['broker', 'finance'] }, // https://en.wikipedia.org/wiki/Knight_Capital_Group
  { date: '2012-08-20', text: '果子电脑市值超过微硬软件的历史纪录', quip: '换了个第一，一样大', weight: 2, sectors: ['hardware'] }, // https://en.wikipedia.org/wiki/Apple_Inc.
  { date: '2012-09-13', text: '美联储宣布第三轮放水，每月买房贷债券', quip: '这回放水，没有期限', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Quantitative_easing
  { date: '2012-09-24', text: '老三十换人：联合健保入选，一家食品公司退出', quip: '换的是一份医疗账单', weight: 1, sectors: ['market', 'health'] }, // https://www.npr.org/transcripts/161669998
  { date: '2012-10-29', text: '飓风桑迪袭击美国东岸，市场停市两天', quip: '这次先管人，再管行情', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Hurricane_Sandy

  // ===== 2013 =====
  { date: '2013-01-25', text: '老三十重新站上14000点，五年多来第一次', quip: '五年了，才爬回来', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2013-02-05', text: '代尔直销宣布以245亿美元私有化退市', quip: '不想看报价，干脆下市', weight: 2, sectors: ['hardware'] }, // https://en.wikipedia.org/wiki/Dell
  { date: '2013-02-14', text: '奥马哈控股与基金联手280亿美元买番茄酱老牌', quip: '股神出手，买的是酱', weight: 1, sectors: ['consumer', 'finance'] }, // https://en.wikipedia.org/wiki/Heinz
  { date: '2013-03-05', text: '老三十创收盘新高，收回金融危机的跌幅', quip: '五年半，终于回本', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2013-04-15', text: '黄金一天暴跌近一成，是三十年来最狠一跌', quip: '避险的，被一天吓退', weight: 2, sectors: ['materials'] }, // https://en.wikipedia.org/wiki/Gold_as_an_investment
  { date: '2013-06-20', text: '美联储透露将缩减放水，老三十当天跌353点', quip: '水龙头要拧小，大家慌了', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Taper_tantrum
  { date: '2013-09-03', text: '微硬软件宣布72亿美元买下北欧手机巨头的手机业务', quip: '手机大战，终于认了', weight: 1, sectors: ['software', 'hardware'] }, // https://en.wikipedia.org/wiki/Microsoft_Mobile
  { date: '2013-09-23', text: '老三十换了三人：高胜投行等入选，美利坚银行退出', quip: '三进三出，老三十大换血', weight: 2, sectors: ['market'] }, // https://www.nbcnews.com/businessmain/major-changes-dow-goldman-nike-alcoa-bofa-out-8c11120802
  { date: '2013-11-07', text: '叽喳短讯上市，首日股价涨了七成', quip: '一百四十字，一千亿', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Twitter
  { date: '2013-11-21', text: '老三十第一次收在一万六之上', quip: '一万六，来得好快', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2013-12-18', text: '美联储宣布开始缩减放水，老三十当天涨292点', quip: '利空落地，反倒是利好', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Tapering_(economics)
  { date: '2013-12-31', text: '老三十全年涨约26%，近二十年来最好的一年', quip: '二十年一遇的好年景', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average

  // ===== 2014 =====
  { date: '2014-01-13', text: '谷哥搜索宣布32亿美元买下智能温控器公司', quip: '连恒温器，都要联网', weight: 1, sectors: ['internet', 'hardware'] }, // https://en.wikipedia.org/wiki/Nest_Labs
  { date: '2014-02-19', text: '面书社交宣布190亿美元买下一款聊天软件', quip: '一个聊天软件，一个天价', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/WhatsApp
  { date: '2014-04-10', text: '科综一天跌3.1%，科技和生物股领跌', quip: '高估值，终于喘了口气', weight: 2, sectors: ['market', 'biotech'] }, // https://en.wikipedia.org/wiki/Nasdaq_Composite
  { date: '2014-05-28', text: '果子电脑宣布30亿美元买下时尚耳机品牌', quip: '花30亿，买了副耳机', weight: 1, sectors: ['hardware', 'consumer'] }, // https://en.wikipedia.org/wiki/Beats_Electronics
  { date: '2014-07-03', text: '老三十第一次收在一万七之上', quip: '一万七，只用了七个半月', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2014-09-19', text: '芝麻电商在纽约上市，募资约220亿美元，创纪录', quip: '芝麻开门，钱袋也开', weight: 3, sectors: ['internet', 'retail'] }, // https://en.wikipedia.org/wiki/Alibaba_Group
  { date: '2014-10-15', text: '国债盘中异动，老三十一天上下震荡约460点', quip: '一天里坐了回过山车', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Flash_crash
  { date: '2014-10-29', text: '美联储宣布结束放水计划', quip: '水龙头拧紧，大家暂时没慌', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Quantitative_easing
  { date: '2014-12-23', text: '老三十第一次收在一万八之上', quip: '圣诞前，红包拆出万八', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2014-12-31', text: '原油全年跌了四成多，是金融危机以来最惨', quip: '加油便宜了，油企哭了', weight: 2, sectors: ['energy'] }, // https://en.wikipedia.org/wiki/2014%E2%80%932016_oil_glut

  // ===== 2015 =====
  { date: '2015-01-15', text: '瑞士央行取消汇率下限，外汇市场大地震', quip: '一纸公告，汇市翻了天', weight: 2, sectors: ['market', 'finance'] }, // https://en.wikipedia.org/wiki/Swiss_National_Bank
  { date: '2015-03-19', text: '老三十换人：果子电脑入选，老电话公司退出', quip: '手机取代了电话', weight: 3, sectors: ['market', 'hardware'] }, // https://en.wikipedia.org/wiki/Historical_components_of_the_Dow_Jones_Industrial_Average
  { date: '2015-04-23', text: '科综收盘超过2000年的最高点，用了15年', quip: '十五年，等的就是这天', weight: 3, sectors: ['market', 'internet'] }, // https://en.wikipedia.org/wiki/Nasdaq_Composite
  { date: '2015-07-08', text: '大钟交易所因技术故障停了三个多小时', quip: '敲钟的，自己宕机了', weight: 2, sectors: ['market', 'broker'] }, // https://en.wikipedia.org/wiki/New_York_Stock_Exchange
  { date: '2015-08-10', text: '谷哥搜索宣布改组，母公司叫字母表控股', quip: '从搜索，一路排到字母表', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Alphabet_Inc.
  { date: '2015-08-24', text: '老三十开盘暴跌逾千点，收盘跌588点', quip: '黑色星期一，开盘就闪了', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/2015%E2%80%9316_Chinese_stock_market_turbulence
  { date: '2015-10-12', text: '代尔直销宣布670亿美元买下易存储', quip: '电脑厂买了存储厂', weight: 2, sectors: ['hardware'] }, // https://en.wikipedia.org/wiki/Dell_Technologies
  { date: '2015-11-23', text: '辉煌制药宣布1600亿美元买下一家美容药厂', quip: '全球最大药企合并', weight: 2, sectors: ['pharma'] }, // https://en.wikipedia.org/wiki/Pfizer
  { date: '2015-12-16', text: '美联储九年来第一次加息，升四分之一点', quip: '低利率，终于翻篇了', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/History_of_Federal_Open_Market_Committee_actions

  // ===== 2016 =====
  { date: '2016-01-08', text: '开年第一周，老三十跌超6%，是史上最差开局', quip: '新年第一周就想退群', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/2015%E2%80%9316_Chinese_stock_market_turbulence
  { date: '2016-02-11', text: '原油跌到每桶26美元附近，十二年来最低', quip: '油价低到不敢看', weight: 2, sectors: ['energy'] }, // https://en.wikipedia.org/wiki/2014%E2%80%932016_oil_glut
  { date: '2016-06-13', text: '微硬软件宣布262亿美元买下职场领英网', quip: '一份简历，卖了262亿', weight: 2, sectors: ['software', 'internet'] }, // https://en.wikipedia.org/wiki/LinkedIn
  { date: '2016-06-24', text: '全球股市同日大跌，老三十跌约610点', quip: '一觉醒来，账户少一截', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '2016-08-15', text: '老三十、五百强、科综同天创新高，十七年来头一回', quip: '三大指数，终于凑齐', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Stock_market
  { date: '2016-10-22', text: '电话公司宣布850亿美元买下时代兄弟传媒', quip: '管道公司，要买内容', weight: 2, sectors: ['telecom', 'media'] }, // https://en.wikipedia.org/wiki/AT%26T
  { date: '2016-11-30', text: '石油输出国达成八年来第一次减产协议', quip: '油价喘了口气', weight: 2, sectors: ['energy'] }, // https://en.wikipedia.org/wiki/OPEC
  { date: '2016-12-14', text: '美联储年内第二次加息，升四分之一点', quip: '一年只升一次，今年两次', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/History_of_Federal_Open_Market_Committee_actions

  // ===== 2017 =====
  { date: '2017-01-25', text: '老三十第一次收在两万点之上', quip: '两万点，真有这一天', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2017-03-02', text: '鬼脸相机上市，首日涨约44%', quip: '阅后即焚，赚钱不焚', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Snap_Inc.
  { date: '2017-06-16', text: '雨林书城宣布137亿美元买下有机连锁超市', quip: '书城开始卖菜了', weight: 2, sectors: ['internet', 'retail'] }, // https://en.wikipedia.org/wiki/Whole_Foods_Market
  { date: '2017-08-02', text: '老三十第一次收在两万二之上', quip: '涨得连数字都不稀奇了', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2017-09-08', text: '一家征信巨头披露数据泄露，股价跌14%', quip: '你的信息，不一定保险', weight: 2, sectors: ['finance'] }, // https://en.wikipedia.org/wiki/2017_Equifax_data_breach
  { date: '2017-11-06', text: '搏通芯片开出1000亿美元以上的价码买糕通芯片', quip: '芯片行业最大的收购戏', weight: 2, sectors: ['semis'] }, // https://en.wikipedia.org/wiki/Broadcom_Inc.
  { date: '2017-11-30', text: '老三十第一次收在两万四之上', quip: '一年涨了四千点', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2017-12-14', text: '一家动画巨头宣布524亿美元买下影业资产', quip: '家底又厚了一圈', weight: 1, sectors: ['media'] }, // https://en.wikipedia.org/wiki/The_Walt_Disney_Company
  { date: '2017-12-17', text: '比特币价格冲到近两万美元', quip: '群里比特币的话题，多于股票', weight: 2, sectors: ['finance'] }, // https://en.wikipedia.org/wiki/History_of_bitcoin
  { date: '2017-12-22', text: '国会通过减税法案，企业税率大降', quip: '企业减税，股价先笑', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Tax_Cuts_and_Jobs_Act

  // ===== 2018 =====
  { date: '2018-01-04', text: '老三十第一次收在两万五之上', quip: '一千点，只用了五周', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2018-01-26', text: '老三十创收盘新高26616点', quip: '山顶风景好，但不久', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/Milestones_of_the_Dow_Jones_Industrial_Average
  { date: '2018-01-30', text: '奥马哈控股、雨林书城、摩登大通银行联手做医保', quip: '三个大佬，管起了医药费', weight: 1, sectors: ['finance', 'health', 'internet'] }, // https://en.wikipedia.org/wiki/Haven_Healthcare
  { date: '2018-02-05', text: '老三十一天跌1175点，是史上最大的单日跌点', quip: '一天蒸发一千多点', weight: 3, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '2018-02-08', text: '老三十从高点回落超10%，进入回调', quip: '回调两个字，听着客气', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '2018-03-14', text: '玩具连锁巨头宣布关闭或出售全部美国门店', quip: '货架空了，童年也没了', weight: 1, sectors: ['retail', 'consumer'] }, // https://en.wikipedia.org/wiki/Toys_%22R%22_Us
  { date: '2018-03-19', text: '面书社交股价一天跌6.8%，数据管理遭质疑', quip: '朋友多了，麻烦也多', weight: 2, sectors: ['internet'] }, // https://en.wikipedia.org/wiki/Facebook%E2%80%93Cambridge_Analytica_data_scandal
  { date: '2018-03-21', text: '美联储年内第一次加息，升四分之一点', quip: '新厂长，第一次出手', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/History_of_Federal_Open_Market_Committee_actions
  { date: '2018-03-22', text: '关税消息再起，老三十一天跌724点', quip: '贸易，一说就跌', weight: 2, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
  { date: '2018-03-26', text: '老三十一天反弹669点', quip: '涨得和跌得一样快', weight: 1, sectors: ['market'] }, // https://en.wikipedia.org/wiki/List_of_largest_daily_changes_in_the_Dow_Jones_Industrial_Average
];
