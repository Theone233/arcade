/**
 * keepalive 记账（0.5.11）：浏览器给一个页面所有在途的 keepalive 请求合计只留 64 KB 请求体，超了那一个直接发不出去（fetch 报错）。
 * 云存档补传和交分都走 keepalive，各自发之前看这里还剩多少，发出去时记上、回来了再还回去。
 */

/** 64 KB 留点余量 */
export const KEEPALIVE_BYTES = 60 * 1024;

let used = 0;

const bodyBytes = (s: string): number => new TextEncoder().encode(s).length;

/** 现在还能发多大的 keepalive 请求体 */
export function keepaliveLeft(): number {
  return KEEPALIVE_BYTES - used;
}

/** 发一个 keepalive 请求：记上它的字节，回来（成功失败都算）就还回去。send 要同步调起 fetch，记账才和别处的判断对得上。 */
export function keepaliveSend<T>(body: string, send: () => Promise<T>): Promise<T> {
  const n = bodyBytes(body);
  used += n;
  let p: Promise<T>;
  try {
    p = send();
  } catch (e) {
    used -= n;
    throw e;
  }
  return p.finally(() => {
    used -= n;
  });
}

/** 测试用：清掉没回来的请求留下的账 */
export function resetKeepalive(): void {
  used = 0;
}
