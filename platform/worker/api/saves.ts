/**
 * 云存档（docs/platform-backend.md 5.5、15.3）。
 *
 * 平台只存不透明的 JSON 和版本号 rev，不懂内容，合并由游戏自己做。
 * 版本、10 秒间隔和空间上限都写在同一条带条件的 INSERT / UPDATE 里：并发的两次写入不会都成功，也不会一起冲破上限。
 * 没写进去（0 行）时再读一次，判断是冲突、太勤还是空间满了。
 */
import { GAME_IDS } from '../../src/games';
import { checkBodyUser, checkQueryUser, type Ctx, DAY } from './context';
import { ApiError, json } from './http';
import { hit } from './ratelimit';

/** 48 KB 数据加外层（15.1），在 keepalive 整个请求体 64 KB 之内。 */
export const SAVE_BODY_LIMIT = 52 * 1024;

const SLOT_RE = /^[a-z0-9-]{1,32}$/;
const encoder = new TextEncoder();

/** 路径参数：gameId 必须登记过（404 unknown_game），槽名 [a-z0-9-]{1,32}（422 invalid_slot）。不碰 D1。 */
export function saveParams(segments: string[]): Record<string, string> {
  const [gameId, slot] = segments;
  if (!gameId || !GAME_IDS.has(gameId)) throw new ApiError(404, 'unknown_game');
  if (slot === undefined) return { gameId };
  if (!SLOT_RE.test(slot)) throw new ApiError(422, 'invalid_slot');
  return { gameId, slot };
}

interface SaveRow {
  slot: string;
  rev: number;
  updated_at: number;
  data: string;
}

/**
 * 库里的 data 原样拼进响应，省一次解析再序列化（8 个槽最多 384 KB）。
 * 前提：saves.data 只能由 putSave 写入，而且一定是它 JSON.stringify 出来的合法 JSON。
 * 以后任何别的地方（迁移、后台脚本、新接口）要写这一列，也必须守住这一点，否则 GET 会吐出坏 JSON，甚至被注入字段。
 */
function saveJson(r: SaveRow): string {
  return `{"slot":${JSON.stringify(r.slot)},"rev":${r.rev},"updatedAt":${r.updated_at},"data":${r.data}}`;
}

/**
 * GET /api/saves/<gameId>[?userId=]：这个游戏的所有槽。写 0 行。
 * 游戏拉下来要和本地合并，所以和 PUT 一样可以带预期账号：不一致 409 wrong_user，在读库之前判断，不会带出别人的存档。
 */
export async function getSaves(c: Ctx): Promise<Response> {
  checkQueryUser(c);
  const rows = await c.db.all<SaveRow>(
    c.db.stmt(
      'SELECT slot, rev, updated_at, data FROM saves WHERE user_id = ?1 AND game_id = ?2 ORDER BY slot',
      c.session!.user.id,
      c.params.gameId,
    ),
  );
  return new Response(`{"saves":[${rows.map(saveJson).join(',')}]}`, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * PUT /api/saves/<gameId>/<slot>，体 {baseRev, data, userId?}。userId 是客户端以为的账号，和会话不一致 409 wrong_user、0 行。
 * 写入：成功 2（saves 1 + save:<userId> 1）；冲突、too_soon、空间满、停增长档覆盖变大 1（只有计数）；
 * 格式不对、账号不一致、太大、超了每天上限、停增长档新建槽 0。
 */
export async function putSave(c: Ctx): Promise<Response> {
  const { db, limits, now } = c;
  const userId = c.session!.user.id;
  const { gameId, slot } = c.params as { gameId: string; slot: string };
  checkBodyUser(c);
  const baseRev = c.body.baseRev;
  if (typeof baseRev !== 'number' || !Number.isSafeInteger(baseRev) || baseRev < 0) throw new ApiError(400, 'bad_request');
  if (!('data' in c.body) || c.body.data === undefined) throw new ApiError(400, 'bad_request');
  // 嵌套层数在 readJsonBody 里已经限过（JSON_MAX_DEPTH），这里的 stringify 不会递归爆栈
  const data = JSON.stringify(c.body.data);
  const size = encoder.encode(data).byteLength;
  if (size > limits.saveSlotBytes) throw new ApiError(413, 'too_large');
  // 停增长档（6.6）：不新建槽，覆盖也不许变大。否则囤一批号、每号先建一个小槽，到 300 MB 后一起覆盖变大，就能把库推到只读档
  const noGrowth = c.tier === 'noGrowth';
  if (baseRev === 0 && noGrowth) throw new ApiError(503, 'busy');

  await hit(db, `save:${userId}`, limits.savePerDay, DAY, now);

  const soon = now - limits.saveMinIntervalMs;
  const written = await db.first<{ rev: number; updated_at: number }>(
    baseRev === 0
      ? db.stmt(
          `INSERT INTO saves (user_id, game_id, slot, rev, data, size, updated_at)
           SELECT ?1, ?2, ?3, 1, ?4, ?5, ?6
           WHERE (SELECT COUNT(*) FROM saves WHERE user_id = ?1 AND game_id = ?2) < ?7
             AND (SELECT COALESCE(SUM(size), 0) FROM saves WHERE user_id = ?1) + ?5 <= ?8
           ON CONFLICT DO NOTHING
           RETURNING rev, updated_at`,
          userId, gameId, slot, data, size, now, limits.saveSlotsPerGame, limits.saveUserBytes,
        )
      : db.stmt(
          // 合计超了也允许改小（以后调低 saveUserBytes 时，已经超额的人还能缩）；停增长档只许不变大
          `UPDATE saves SET rev = rev + 1, data = ?4, size = ?5, updated_at = ?6
           WHERE user_id = ?1 AND game_id = ?2 AND slot = ?3 AND rev = ?7 AND updated_at <= ?8
             AND ((SELECT COALESCE(SUM(size), 0) FROM saves WHERE user_id = ?1) - size + ?5 <= ?9 OR ?5 <= size)
             AND (?10 = 0 OR ?5 <= size)
           RETURNING rev, updated_at`,
          userId, gameId, slot, data, size, now, baseRev, soon, limits.saveUserBytes, noGrowth ? 1 : 0,
        ),
  );
  if (written) return json(200, { rev: written.rev, updatedAt: written.updated_at });

  // 没写进去：读一次看是哪种情况
  const current = await db.first<SaveRow & { size: number }>(
    db.stmt('SELECT slot, rev, updated_at, data, size FROM saves WHERE user_id = ?1 AND game_id = ?2 AND slot = ?3', userId, gameId, slot),
  );
  if (current ? current.rev !== baseRev : baseRev !== 0) {
    // 云端没有这个槽却带了 baseRev（比如云端被清理过、本地还记着旧 rev）：current 为 null，游戏用 baseRev 0 重交
    const cur = current ? { rev: current.rev, updatedAt: current.updated_at, data: JSON.parse(current.data) as unknown } : null;
    throw new ApiError(409, 'conflict', { current: cur });
  }
  if (current && current.updated_at > soon) {
    const s = Math.max(1, Math.ceil((current.updated_at - soon) / 1000));
    throw new ApiError(429, 'too_soon', { retryAfter: s }, { 'retry-after': String(s) });
  }
  // 和新建槽被拒一样回 503：对游戏来说都是"暂停同步"（/api/me 的 saves 这时也是 paused）
  if (current && noGrowth && size > current.size) throw new ApiError(503, 'busy');
  throw new ApiError(413, 'quota_exceeded');
}
