-- 0001：账号、会话、凭证、好友、屏蔽、云存档、限流计数、计量。设计见仓库根 docs/platform-backend.md 第 7 节。
-- 迁移只增不删。全部用 WITHOUT ROWID：主键是 TEXT 或多列的普通表会另建一个自动唯一索引，每次插入多写 1 行（7.1）。
-- 时间一律是 Unix 毫秒整数。

-- id：128 位随机数（base64url 22 位）；username：归一化后的小写用户名，只用来登录，不给别人看。
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  friend_code TEXT NOT NULL UNIQUE,
  avatar_json TEXT,
  catchphrase_id INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
) WITHOUT ROWID;

-- token_hash：会话令牌的 HMAC（带 kid），库里不存令牌原文。
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  renewed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX sessions_user ON sessions (user_id);

-- 每个账号每种类型一条：密码哈希、恢复码 HMAC。以后多个 passkey、第三方登录另建表（7.1）。
CREATE TABLE credentials (
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('password', 'recovery')),
  secret TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, type)
) WITHOUT ROWID;

-- 一对人一行，user_a < user_b；requested_by 是发请求的一方。
CREATE TABLE friendships (
  user_a TEXT NOT NULL,
  user_b TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  requested_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
) WITHOUT ROWID;
CREATE INDEX friendships_b ON friendships (user_b);

CREATE TABLE blocks (
  blocker TEXT NOT NULL,
  blocked TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
) WITHOUT ROWID;

-- data 是游戏给的不透明 JSON；size 是它的 UTF-8 字节数，用来算每人合计。
CREATE TABLE saves (
  user_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  rev INTEGER NOT NULL,
  data TEXT NOT NULL,
  size INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_id, slot)
) WITHOUT ROWID;

-- 固定窗口计数；blocked_until 只给失败计数的指数延迟用（5.4）。
CREATE TABLE rate_counters (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- 6.6 的计量：每个 UTC 小时一行；rows_* 是各类别的 D1 写入行数，db_size 取最近一次 meta.size_after。
CREATE TABLE meter_hourly (
  hour TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_reg INTEGER NOT NULL DEFAULT 0,
  rows_auth INTEGER NOT NULL DEFAULT 0,
  rows_save INTEGER NOT NULL DEFAULT 0,
  rows_social INTEGER NOT NULL DEFAULT 0,
  rows_acct INTEGER NOT NULL DEFAULT 0,
  rows_sys INTEGER NOT NULL DEFAULT 0,
  login_attempts INTEGER NOT NULL DEFAULT 0,
  recover_attempts INTEGER NOT NULL DEFAULT 0,
  db_size INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
