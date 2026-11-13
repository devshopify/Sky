const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '.idea', '.vscode',
  '.cache', '__pycache__', '.workbuddy', '.sass-cache', 'dist', 'build',
]);

/**
 * 从文件清单里推断主题根。
 * 判定依据：该目录下同时存在 assets / sections / templates 这类子目录。
 */
export function detectThemeRootFromList(files) {
  const dirs = new Map();

  for (const f of files) {
    const parts = String(f.rel || '').split('/');
    if (parts.length < 2) continue;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const dir = parts.slice(0, i).join('/');
      const child = parts[i];
      if (!dirs.has(dir)) dirs.set(dir, new Set());
      dirs.get(dir).add(child);
    }
  }

  let best = null;
  for (const [dir, children] of dirs) {
    let score = 0;
    if (children.has('assets')) score += 3;
    if (children.has('sections')) score += 2;
    if (children.has('templates')) score += 2;
    if (children.has('layout')) score += 1;
    if (children.has('config')) score += 1;
    if (children.has('snippets')) score += 1;
    if (score < 6) continue;
    if (!best || score > best.score || (score === best.score && dir.length < best.dir.length)) {
      best = { dir, score };
    }
  }

  return best;
}

function splitInfo(rel, size, mtime) {
  const name = rel.slice(rel.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
  return {
    rel,
    size,
    mtime,
    ext,
    dir: rel.includes('/') ? rel.split('/')[0] : '',
    base: name,
  };
}

/**
 * 扫描站点。reader 提供 list / readText 能力，Node 与浏览器各有一套实现。
 */
export async function scanSite(reader) {
  const raw = await reader.list();
  if (!raw.length) {
    throw new Error(`${reader.label} 里没有找到任何文件`);
  }

  const detected = detectThemeRootFromList(raw);
  if (!detected) {
    throw new Error(
      `${reader.label} 下没有找到 Shopify 主题结构（assets / sections / templates）。请确认选的是主题仓库。`
    );
  }

  const prefix = detected.dir;
  const files = [];

  for (const f of raw) {
    let rel = f.rel;
    if (prefix) {
      if (!rel.startsWith(`${prefix}/`)) continue;
      rel = rel.slice(prefix.length + 1);
    }
    const segs = rel.split('/');
    if (segs.some((s) => s.startsWith('.') || SKIP_DIRS.has(s))) continue;
    files.push(splitInfo(rel, f.size, f.mtime));
  }

  const byRel = new Map();
  const byRelLower = new Map();
  const byBase = new Map();
  const byDir = {};

  for (const f of files) {
    byRel.set(f.rel, f);
    byRelLower.set(f.rel.toLowerCase(), f.rel);
    const key = f.base.toLowerCase();
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key).push(f.rel);
    const d = f.dir || '(root)';
    byDir[d] = (byDir[d] || 0) + 1;
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  const entryRank = (r) => {
    if (r.startsWith('templates/')) return 0;
    if (r.startsWith('sections/')) return 1;
    if (r.startsWith('config/')) return 2;
    if (r.startsWith('snippets/')) return 3;
    if (r.startsWith('layout/')) return 4;
    if (r.startsWith('blocks/')) return 5;
    return 6;
  };

  const entries = files
    .filter((f) => f.base.endsWith('.json') || f.base.endsWith('.json.liquid') || f.ext === '.liquid')
    .sort((a, b) => entryRank(a.rel) - entryRank(b.rel) || a.rel.localeCompare(b.rel))
    .map((f) => ({ rel: f.rel, size: f.size, mtime: f.mtime, ext: f.ext }));

  const withPrefix = (rel) => (prefix ? `${prefix}/${rel}` : rel);

  return {
    label: reader.label,
    prefix,
    themeRootName: prefix ? prefix.split('/').pop() : reader.label,
    nested: Boolean(prefix),
    files,
    byRel,
    byRelLower,
    byBase,
    entries,
    reader,
    stats: { total: files.length, totalSize, byDir },
    readText(rel) {
      return reader.readText(withPrefix(rel));
    },
    readBytes(rel) {
      return reader.readBytes(withPrefix(rel));
    },
    async writeBytes(rel, bytes) {
      if (!reader.writeBytes) throw new Error('当前环境不支持写文件');
      return reader.writeBytes(withPrefix(rel), bytes);
    },
    canWrite: Boolean(reader.writeBytes),
  };
}

export function summarizeSite(site) {
  return {
    label: site.label,
    themeRootName: site.themeRootName,
    nested: site.nested,
    canWrite: site.canWrite,
    stats: site.stats,
    entries: site.entries,
  };
}
