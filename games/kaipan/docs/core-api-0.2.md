# 《开盘》0.2 规则层接口（给画面层）

> 适用：v0.2 分支 `src/core`、`src/platform/storage.ts`。规则依据 `docs/design-0.2.md`；
> 数值都在 `src/core/balance.ts`（`BALANCE`），可能还会微调，画面不要写死数字，一律从接口取。
> 画面只从 `src/core/index.ts` 引用 core；存档从 `src/platform/storage.ts` 引用。

## 1. 基本约定

- 纯逻辑、完全确定：`createRun(seed, setup)` 开局，`dispatch(state, action) → { state, events, error }` 推进。
  同一个种子 + 同一串操作（`state.actions`）永远得到同一个局面，`replay(seed, actions, setup)` 可重建。
- `dispatch` 默认复制状态，不改传入的 `state`；`error` 非空时 `state` 原样返回、`events` 为空。
  按钮可不可用请用 `validate(state, action)`（返回原因或 `null`），不要自己判断。
- 单位：
  - 收益率、目标、进度都是**百分点**（`1.8` 表示 +1.8%），显示用 `formatPoints(v)`。
  - 基金规模是元，显示用 `formatMoney(v)`（≥1 万亿显示「万亿」）。
  - 经费是整数，显示用 `formatBudget(v)` → `◆12`。
  - 倍率用 `formatMult(v)` → `×1.5`。
- 隐藏信息（只有调试面板能看）：`StockState.regime`、`Bar.regime`、`today.mods`、`bossPlan` 里未来季度的 Boss、
  `effectiveRegime()`。卡面只能展示 `Card.hint / accuracy / headline / revealed`。

## 2. GameState 关键字段（`src/core/types.ts`）

| 字段 | 说明 |
|---|---|
| `phase` | `'trading'` 盘前（发牌、用锦囊、换一批、选卡开盘）/ `'shop'` / `'won'` / `'lost'` |
| `seed`, `setup`, `actions` | 回放三件套；`setup` 正常开局为 `null` |
| `difficulty` | 难度等级，0.2 恒为 0（0.3 的接口） |
| `fund` | 基金规模（元，只是分数），开局 100 万 |
| `budget` | 经费 ◆ |
| `dayIndex` | 全局交易日编号（= 已完成的交易日数） |
| `exam` | 本场考核：`index`(0..23)、`quarter`(0..7)、`slot`(0..2)、`kind`(`small`/`big`/`boss`)、`target`、`progress`、`day`（本期已交易天数）、`days`（本期交易日上限，延期交卷会 +1）、`redealsLeft`、`redealsUsed`、`boss`（只有 Boss 考有） |
| `today.hand` | 今天手里的牌 `Card[]`（见下） |
| `today.deals` | 今天第几手牌（1 起，换一批 +1） |
| `today.tipsUsed` | 今天已用、结算时生效的锦囊（加杠杆） |
| `stocks[stockId]` | `{ price, regime(隐藏), history: Bar[5] }`，history 旧 → 新，画迷你日 K 用 OHLC，**不要显示 `Bar.regime`** |
| `pool` | 股票池实例 `{ uid, stockId }`（0.3 增发会有同一只股票的多个实例） |
| `levels` | 各行业等级 `{ tech, consumer, pharma, finance, energy }`，初始 1 |
| `bossPlan` | 8 个季度的 Boss（开局就排好；**画面只公布当前季度**，用 `quarterBoss(state)`） |
| `strategies` | 持有的策略 `{ id, vars }`，最多 5 个；`vars` 是持久变量（连胜数、通过场数等），可用于角标 |
| `tips` | 锦囊槽（id 数组），最多 2 个 |
| `shop` | 商店：`offers: (Offer \| null)[]`（买走的位置为 null）、`rerolls` |
| `lastDay` | 最近一天的 `DayResult`（结算动画的数据源） |
| `stats` | 复盘统计：`daysTraded`、`winDays`、`examsPassed`、`redeals`、`tipsUsed`、`shopVisits`、`peakFund`、`bestDay`、`industryTrades`、`bosses`、`bought` |
| `log` | 每天一条 `DayLog { day, exam, stockId, direction, regime, r, f }` |
| `endReason` | 结束原因，0.2 只有 `'failed'` |

`Card`：`{ uid, stockId, hint: Regime | null, accuracy: 0..1, headline, revealed: Regime | null }`。
`hint` 为 `null` 表示没有消息（信息封锁）；`revealed` 非空表示真实状态已揭示（内幕人脉、内幕消息、利好/利空公告）。

`Offer`：`{ kind: 'strategy' | 'tip' | 'report', id, price }`。研报买下立即给对应行业 +1 级，不占槽。

`DayResult`（`lastDay`、`dayClosed` 事件）：

| 字段 | 说明 |
|---|---|
| `card`, `stockId`, `direction` | 选了哪张卡、什么方向 |
| `regime` | 当天真实状态（收盘后可以揭晓给玩家看） |
| `ticks` | 日内价格 49 个（下标 0 为开盘价），画走势动画 |
| `bar` | 当日 OHLC |
| `move` | 股票当日涨跌（百分点） |
| `r` | 方向收益（百分点，止损按平仓价） |
| `flips` | 高抛低吸反手次数 |
| `closedEarly`, `triggers` | 被止损等提前平仓；`triggers` 带 tick 位置 |
| `items` | 结算明细（计分动画逐项播放），见下 |
| `add`, `mult`, `loss`, `flat` | 汇总：盈利日 `f = r ×（1 + add）× mult + flat`；亏损日 `f = r × loss + flat` |
| `f` | 最终收益（百分点） |
| `progressBefore/After`, `target` | 进度条动画 |
| `fundBefore/After` | 基金规模动画 |
| `budgetGained` | 当天策略给的经费（红利、股吧大神） |

`SettlementItem { source, label, kind, value }`，`kind`：
`base`（第一项，方向收益 r）、`add`（加成 +value）、`mult`（倍率 ×value）、`loss`（亏损系数 ×value）、`flat`（固定 ±value 个百分点）。
`source` 为 `'trade'`、`'level'`（行业等级）、`'base'`（基础亏损系数，等于 1 时不出现）、策略 id、锦囊 id 或 Boss id。
盈利日只会出现 base/add/mult/flat；亏损日只会出现 base/loss/flat。展示示例：`+1.8% ×（1 + 0.6）× 2 = +5.8%`。

## 3. Action（全部）

| Action | 何时可用 | 说明 |
|---|---|---|
| `{ type: 'trade', card, direction }` | trading | 选第 `card` 张卡，`direction`：`'long'` / `'short'` / `'swing'`（高抛低吸）。没有空仓 |
| `{ type: 'redeal' }` | trading，`exam.redealsLeft > 0` 且非锁仓 | 换一批：整手牌换掉 |
| `{ type: 'useTip', slot, card? }` | 见锦囊的 `usableIn` | 用第 `slot` 个锦囊；`needsCard` 的锦囊要传 `card` |
| `{ type: 'buy', offer }` | shop | 买第 `offer` 个商品 |
| `{ type: 'sell', kind, slot }` | shop | 卖策略（`kind: 'strategy'`）或锦囊（`'tip'`），回收一半、向下取整、至少 1 |
| `{ type: 'reroll' }` | shop | 刷新：◆5 起，同一商店每次 +1 |
| `{ type: 'leaveShop' }` | shop | 离店，开始下一场考核 |

方向是否可选看 `examView(state).directions`（禁止做空时只有 `long`）。

## 4. GameEvent（全部）

| 事件 | 字段 | 何时 |
|---|---|---|
| `quarterStarted` | `quarter, boss` | 季度开始（含开局），公布本季 Boss，配 `bossById(boss).hint` 应对提示 |
| `examStarted` | `index, quarter, slot, kind, target, days, redeals, boss` | 每场考核开始 |
| `dayStarted` | `day, dayInExam` | 每个交易日开始（发牌前） |
| `dealt` | `day, deal, redeal, hand` | 发牌、换一批之后（`hand` 是副本） |
| `revealed` | `card, stockId, regime, source` | 某张卡的真实状态被揭示（`source`：`insider` / 锦囊 id） |
| `tipUsed` | `id, slot, card` | 用了锦囊（效果事件随后） |
| `levelUp` | `industry, level, source` | 行业升级（买研报） |
| `budgetGained` | `source, amount` | 策略或打新中签给经费 |
| `dayOpened` | `day, card, stockId, direction, open` | 开盘 |
| `tick` | `tick, price, r` | 48 个，盘中走势与当前方向收益 |
| `trigger` | `tick, source, message` | 盘中触发（止损平仓） |
| `dayClosed` | `result: DayResult` | 收盘结算 |
| `saved` | `source, progress, target` | 风控官救场（随后有 `examCleared`，`saved: true`） |
| `examCleared` | `index, kind, progress, target, daysLeft, saved, reward` | 本期过关，`reward = { base, days, interest, total }` |
| `shopOpened` | `offers` | 进商店 |
| `bought` / `sold` / `rerolled` | 见类型 | 商店操作 |
| `shopClosed` | — | 离店 |
| `runWon` | `fund` | 通关（第 24 场过关后，没有商店） |
| `runLost` | `reason, fund, exam, progress, target` | 出局 |

`dispatch(..., { ticks: false })` 可以不要 `tick` 事件（快进）；`{ events: false }` 什么事件都不要（模拟器用）。

## 5. 时序

**开局** `createRun(seed)` 的事件：`quarterStarted → examStarted → dayStarted → dealt (→ revealed)`。

**盘前**（phase = trading）：玩家可以任意次序
- `useTip` → `tipUsed`（→ `revealed` / `budgetGained`）
- `redeal` → `dealt(redeal: true)`（→ `revealed`，内幕人脉每手揭示一张）
- `trade` → 进入一天的结算

**一天**（`trade` 的事件）：
1. `dayOpened`
2. `tick` × 48（中间可能夹 `trigger`，例如止损平仓）
3. `budgetGained`（红利 / 股吧大神，可能没有）
4. `dayClosed { result }` —— 此时所有股票都走完了这一天（新的日 K 已写入 `stocks[*].history`）
5. 三选一：
   - 进度 ≥ 目标：`examCleared`（剩余交易日 × 1 折算经费）→ 最后一场则 `runWon`，否则 `shopOpened`
   - 用完交易日仍未达标：`saved → examCleared(saved)` → `shopOpened`（风控官），或 `runLost`
   - 否则：`dayStarted → dealt (→ revealed)`，进入下一天的盘前

**商店**（phase = shop）：`bought` / `sold` / `rerolled` / `useTip`（只有打新中签能在商店用）；
`leaveShop` → `shopClosed → (quarterStarted) → examStarted → dayStarted → dealt (→ revealed)`。

## 6. 查询函数（都不改状态）

| 函数 | 用途 |
|---|---|
| `handView(state)` | 今天的牌：`{ index, card, stock: StockDef, history: Bar[], price, level }[]` |
| `examView(state)` | 目标与进度：`{ target, progress, ratio, daysLeft, days, redealsLeft, boss, rewardIfClearToday, directions, canRedeal, ... }` |
| `rewardPreview(state)` | 今天这笔交易若达标能拿的经费（`{ base, days, interest, total }`） |
| `passReward(state, daysLeft)` | 任意剩余天数下的过关奖励 |
| `quarterBoss(state)` | 本季度公布的 Boss（`BossDef`：`name`、`desc`、`hint`），Boss 考之前也能看 |
| `previewSettle(state, card, direction, { r, move?, regime?, flips? })` | 假设方向收益为 r 时的完整结算（`items`、`f`），可用来显示“盈利 ×M / 亏损 ×L”提示 |
| `getRules(state)` | 当前规则：`handSize`、`allowShort`、`allowSwing`、`hintsBlocked`、`priceLimit` 等 |
| `allowedDirections(rules)` | 可选方向 |
| `validate(state, action)` | 操作是否可用及原因（按钮置灰、提示文字） |
| `offerView(state, offer)` | 商品名称、说明、稀有度、研报行业、买不买得起 |
| `rerollCost(state)` / `sellRefund(state, kind, slot)` | 刷新价格 / 卖出回收价 |
| `strategyById` / `tipById` / `reportById` / `bossById` / `stockById` | 内容定义（`name`、`desc`、`rarity`、`price` 等；`desc` 从 BALANCE 取数） |
| `titleFor(state)` | 称号（按最远季度；通关为「股神」） |
| `runSummary(state)` | 结束页复盘：止步场次、差多少、最佳单日、最常交易行业、致命的一天、各 Boss 结果、称号 |
| `examLabel(quarter, kind)` | 「Q3 大考」 |
| `targetFor(index, difficulty?, boss?)` | 第 index 场的目标（传 Boss id 时含该 Boss 的目标修正）；当前场以 `state.exam.target` 为准 |
| `slotLimits()` / `totalExams()` / `rewardFor(state, daysLeft)` | 槽位上限（策略 5、锦囊 2）/ 总场数 24 / 同 `passReward` |

标签：`REGIME_LABEL`、`HINT_LABEL`、`DIRECTION_LABEL`、`INDUSTRY_LABEL`、`STYLE_LABEL`、`RARITY_LABEL`（普通/稀有/传奇）、
`EXAM_KIND_LABEL`、`OFFER_KIND_LABEL`。内容列表：`STOCKS`、`STRATEGIES`、`TIPS`、`REPORTS`、`BOSSES`、`TITLES`、`HEADLINES`。

## 7. 存档与纪录（`src/platform/storage.ts`）

- 启动时调用一次 `loadSave()` → `{ state, notice }`：
  - `notice === 'legacy'`：读到 0.1 的旧存档（已原样备份到 `kaipan.save.v0.1`），显示 `LEGACY_NOTICE`（“版本大更新，旧进度无法继续”），然后开新局；
  - `notice === 'corrupt'`：存档损坏（已备份到 `kaipan.save.corrupt`），开新局；
  - `state` 非空：继续这局。
- `writeSave(state)`、`clearSave()`、`hasSave()`、`hasLegacySave()`。存档格式 `SAVE_FORMAT = 3`。
- 教程完成标记换了 key（`kaipan.tutorial.v2.done`）：`isTutorialDone()`、`markTutorialDone()`，0.1 的老玩家也会看到新教程。
- 本地纪录：`loadRecords()` → `{ bestQuarter, bestFund, wins, runs }`（`bestQuarter` 0 = Q1，8 = 通关）；
  一局结束时 `recordRun(state)` → `{ records, refreshed }`，`refreshed` 列出本局刷新的项（`bestQuarter` / `bestFund` / `wins`），同一局重复调用不会重复计。
- 设置（`kaipan.settings`）不受影响。

## 8. 教程

`TUTORIAL_SEED` + `TUTORIAL_SETUP`（固定第一个商店）+ `TUTORIAL_MOVES`（建议操作）：
第 1 天第一手第 0 张是消息利好、真实也利好的成长股，做多赚一点；第 2 天先换一批，第 0 张做多后达标收工；
第一个商店有对应行业的信仰和研报。`tests/engine.test.ts` 检查这些性质；以后改了行情数值，用
`node tools/sim-tutorial.ts` 重新找种子。

## 9. 给画面的注意事项

- 一天的过程是一次 `dispatch(trade)`，返回的事件里已包含 48 个 tick 和结算明细；动画按事件顺序播即可。
- 进度可能为负（亏损日），进度条要能画负数；过关时进度可能远超目标。
- 发牌数会变：缩量行情少 1 张、多看一只多 1 张（`today.hand.length`，2..4 张）。
- 卡面上的价格是 `stocks[stockId].price`，迷你日 K 用 `history` 的 OHLC；`hint` 为 null 时显示“没有消息”和 `headline`（封锁标题）。
- 商店锦囊位可能是研报（`kind: 'report'`），研报买下立即升级，没有使用按钮。
- 黑天鹅那天的消息仍按平时生成（不预警），收盘后 `DayResult.regime` 为 `panic`。
- 各 Boss 考的目标带各自的修正（规则越狠目标越低，例如禁止做空），可能比同季度的小考还低；一律显示 `exam.target`。
- 卡面准确率可能因消息灵通到 100%、因庄家洗盘降低；信息封锁时 `accuracy` 为 0、`hint` 为 null。
- `EndReason` 只剩 `'failed'`（0.1 的 `'liquidated'` 已删除，`src/view/audio/sfx.ts` 里引用它的两处需要改）。
- 0.1 的 `premarket`、`netWorth`、`assessment`、`intel`、`market`、`submit`、仓位与杠杆都没有了。
