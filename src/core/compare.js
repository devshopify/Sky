import { categoryGroup } from './parsers/shared.js';

const hasSubtle = typeof globalThis.crypto !== 'undefined' && Boolean(globalThis.crypto.subtle);

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 内容指纹：优先用 SHA-256，环境不支持时退化为双 FNV-1a */
export async function hashBytes(bytes) {
  if (!bytes) return null;
  if (hasSubtle) {
    try {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      return toHex(digest);
    } catch { /* fall through */ }
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i += 1) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + bytes[i] * ((i % 31) + 1)) >>> 0;
  }
  return `fnv${bytes.length}-${h1.toString(16)}-${h2.toString(16)}`;
}

async function hashSiteFile(site, rel) {
  try {
    return await hashBytes(await site.readBytes(rel));
  } catch {
    return null;
  }
}

/**
 * 把 A 站的依赖清单和 B 站做对比
 * status: missing | identical | modified
 */
export async function compareSites(aSite, bSite, deps) {
  const results = [];

  for (const node of deps.nodes) {
    const aFile = aSite.byRel.get(node.rel);
    const bFile = bSite.byRel.get(node.rel);

    const base = {
      ...node,
      group: categoryGroup(node.category),
      status: 'missing',
      b: null,
      action: 'copy',
      note: null,
    };

    if (!aFile) continue;

    if (!bFile) {
      results.push(base);
      continue;
    }

    const bInfo = { size: bFile.size, mtime: bFile.mtime, rel: bFile.rel };

    if (bFile.size === aFile.size) {
      const [ha, hb] = await Promise.all([hashSiteFile(aSite, node.rel), hashSiteFile(bSite, node.rel)]);
      if (ha && hb && ha === hb) {
        results.push({ ...base, status: 'identical', b: bInfo, action: 'skip' });
        continue;
      }
      results.push({ ...base, status: 'modified', b: bInfo, action: 'overwrite' });
      continue;
    }

    results.push({ ...base, status: 'modified', b: bInfo, action: 'overwrite' });
  }

  const counts = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      acc.total += 1;
      return acc;
    },
    { total: 0, missing: 0, identical: 0, modified: 0 }
  );

  return { items: results, counts };
}

/**
 * 媒体资源对比。
 * - A 站仓库 assets 里已有同名文件 -> 走文件比对（可复制）
 * - 只在 CDN / Files 上 -> status = 'download'，执行时按地址下载
 */
export async function compareMedia(aSite, bSite, mediaList) {
  const out = [];

  for (const m of Array.isArray(mediaList) ? mediaList : []) {
    const rel = m.themeAsset;

    if (!rel) {
      out.push({ ...m, rel: null, status: 'download', action: 'download', size: null, b: null });
      continue;
    }

    const aFile = aSite.byRel.get(rel);
    const bFile = bSite.byRel.get(rel);

    if (!aFile) {
      out.push({ ...m, rel, status: 'download', action: 'download', size: null, b: null });
      continue;
    }

    if (!bFile) {
      out.push({ ...m, rel, status: 'missing', action: 'copy', size: aFile.size, b: null });
      continue;
    }

    let identical = false;
    if (aFile.size === bFile.size) {
      const [ha, hb] = await Promise.all([hashSiteFile(aSite, rel), hashSiteFile(bSite, rel)]);
      identical = Boolean(ha && hb && ha === hb);
    }

    out.push({
      ...m,
      rel,
      status: identical ? 'identical' : 'modified',
      action: identical ? 'skip' : 'overwrite',
      size: aFile.size,
      b: { size: bFile.size, mtime: bFile.mtime },
    });
  }

  return out;
}
