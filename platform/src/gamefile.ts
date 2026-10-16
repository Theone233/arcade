/**
 * 读游戏自己公开的 JSON 文件（/games/<id>/<文件>，同域）：称号名字 titles.json（0.10.3）、每日榜分数写法 daily.json（0.10.18）。
 * 这是平台和游戏之间的公开接口，不读游戏的代码。读不到（游戏拆走了、404、超时、太大、不是 JSON 对象）一律给 null，
 * 由调用方当"没有"处理，不报错。一个页面里同一个文件只读一次。
 */
const MAX_BYTES = 32 * 1024;
const TIMEOUT_MS = 3_000;
const cache = new Map<string, Promise<Record<string, unknown> | null>>();

async function fetchObject(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return null;
    const raw = JSON.parse(new TextDecoder().decode(buf)) as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function loadGameFile(game: string, file: string): Promise<Record<string, unknown> | null> {
  const url = `/games/${encodeURIComponent(game)}/${file}`;
  let p = cache.get(url);
  if (!p) {
    p = fetchObject(url);
    cache.set(url, p);
  }
  return p;
}
