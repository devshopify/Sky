/**
 * 把 CDN 基地址和文件名拼成完整 URL
 *   base: https://es.dreametech.com/cdn/shop/files/
 *   name: a2-bg.jpg  ->  https://es.dreametech.com/cdn/shop/files/a2-bg.jpg
 */
export function buildMediaUrl(baseUrl, name) {
  const base = String(baseUrl || '').trim();
  if (!base) return null;
  const b = base.endsWith('/') ? base : `${base}/`;
  const clean = String(name || '').split('?')[0].split('#')[0].replace(/^\/+/, '');
  if (!clean) return null;
  // 只转义中文/空格等，保留 % 与常见安全字符，避免二次编码
  const encoded = clean
    .split('/')
    .map((seg) => seg.replace(/[^\w\-.:~!$&'()*+,;=@%]/g, (c) => encodeURIComponent(c)))
    .join('/');
  return b + encoded;
}

/**
 * Shopify CDN 的尺寸 / 裁剪后缀，去掉后就是原图。
 * 形如 xxx_1600x.png、xxx_1600x900.png、xxx_x900.png、xxx_crop_center.png、xxx_grande.png、xxx@2x.png
 */
export function originalName(name) {
  return String(name)
    .replace(
      /_(?:\d+x\d+|\d+x|x\d+|crop_[a-z]+|grande|medium|small|compact|large|thumb|icon|pico)(?=\.[a-z0-9]+$)/i,
      ''
    )
    .replace(/@\d+x(?=\.[a-z0-9]+$)/i, '');
}

async function fetchOne(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // 不要声明 avif/webp：CDN 会据此转码，拿到的就不是原图了
        Accept: '*/*',
      },
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, url };

    // 有些托管/CDN 对不存在的文件返回 200 + HTML 错误页，靠内容类型挡掉
    const ctype = res.headers.get('content-type') || '';
    if (/text\/html/i.test(ctype)) {
      return { ok: false, reason: '返回的是 HTML 页面（文件可能不存在）', url };
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) return { ok: false, reason: '返回空文件', url };
    return { ok: true, bytes: buf, size: buf.length, contentType: res.headers.get('content-type') || '', url };
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return { ok: false, reason: aborted ? '下载超时' : String(e && e.message ? e.message : e).slice(0, 200), url };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 并发下载媒体，结果里带原始字节（由调用方决定写盘还是打包）
 */
export async function downloadMedia({ items, baseUrl, concurrency = 5, timeout = 60000, onProgress }) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let cursor = 0;
  let finished = 0;

  async function worker() {
    for (;;) {
      const idx = cursor;
      cursor += 1;
      if (idx >= list.length) return;

      const it = list[idx];
      // 原图优先：先去尺寸后缀，404 再退回带后缀的地址
      const candidates = [];
      const orig = originalName(it.name);
      if (orig && orig !== it.name) candidates.push(orig);
      candidates.push(it.name);

      let last = { ok: false, reason: '未配置下载地址' };
      for (const candidate of candidates) {
        const url = buildMediaUrl(baseUrl, candidate);
        if (!url) break;
        // eslint-disable-next-line no-await-in-loop
        const r = await fetchOne(url, timeout);
        last = r;
        if (r.ok) {
          results[idx] = { name: it.name, resolvedName: candidate, ...r };
          break;
        }
      }
      if (!results[idx]) {
        results[idx] = { name: it.name, ...last };
      }

      finished += 1;
      if (onProgress) onProgress({ done: finished, total: list.length, name: it.name });
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, list.length || 1)) }, worker);
  await Promise.all(workers);

  return {
    baseUrl: String(baseUrl || ''),
    total: list.length,
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    totalSize: results.reduce((s, r) => s + (r.ok ? r.size : 0), 0),
    results,
  };
}
