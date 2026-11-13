import { basename, extname } from './path-utils.js';
import { categoryOf } from './parsers/shared.js';
import { parseJsonRefs } from './parsers/json.js';
import { parseLiquidRefs } from './parsers/liquid.js';
import { parseCssRefs } from './parsers/css.js';
import { parseJsRefs } from './parsers/js.js';

/** 大小写不敏感地查一个 rel */
function lookupRel(site, rel) {
  if (site.byRel.has(rel)) return site.byRel.get(rel).rel;
  const lower = rel.toLowerCase();
  if (site.byRelLower?.has(lower)) return site.byRelLower.get(lower);
  return null;
}

/**
 * 把一个候选名（可能是 'hero.jpg' / 'assets/hero.jpg' / './hero.jpg'）解析成站点内的 rel
 */
export function findAsset(site, rawName) {
  if (!rawName) return null;
  let clean = String(rawName).split('?')[0].split('#')[0].trim();
  clean = clean.replace(/^\.\//, '').replace(/^\.\.\//, '').replace(/^\/+/, '');
  if (!clean) return null;

  if (clean.includes('{{') || clean.includes('{%')) return null;

  // 1. 直接命中
  let hit = lookupRel(site, clean);
  if (hit) return hit;

  // 2. 加 assets/ 前缀
  hit = lookupRel(site, `assets/${clean}`);
  if (hit) return hit;

  // 3. 去掉 assets/ 前缀
  if (clean.startsWith('assets/')) {
    hit = lookupRel(site, clean.slice('assets/'.length));
    if (hit) return hit;
  }

  // 4. 用 basename 反查（assets 是扁平目录，绝大多数情况能命中）
  const base = basename(clean).toLowerCase();
  const hits = site.byBase.get(base) || [];
  if (hits.length === 1) return hits[0];
  const assetHits = hits.filter((h) => h.startsWith('assets/'));
  if (assetHits.length === 1) return assetHits[0];
  if (assetHits.length > 1) {
    // 同名多份，优先路径尾部匹配
    const tail = clean.toLowerCase();
    const exact = assetHits.find((h) => h.toLowerCase().endsWith(tail));
    if (exact) return exact;
    return assetHits[0];
  }
  if (hits.length > 1) {
    const tail = clean.toLowerCase();
    return hits.find((h) => h.toLowerCase().endsWith(tail)) || hits[0];
  }
  return null;
}

function findLiquidByType(site, type, dirs) {
  for (const d of dirs) {
    for (const ext of ['.liquid', '.json']) {
      const hit = lookupRel(site, `${d}/${type}${ext}`);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * 解析单个引用
 */
function resolveRef(site, ref) {
  const t = String(ref.target || '').trim();
  if (!t) return { skip: true };

  switch (ref.type) {
    case 'section': {
      const rel = findLiquidByType(site, t, ['sections']);
      return rel ? { rel } : { unresolved: { kind: 'section', target: t, key: ref.key, raw: ref.raw } };
    }
    case 'block': {
      const rel = findLiquidByType(site, t, ['blocks', 'sections']);
      // block type 常常是内联在 section schema 里定义的，找不到不算错误
      return rel ? { rel } : { inlineBlock: { kind: 'block', target: t, key: ref.key } };
    }
    case 'snippet': {
      const name = t.replace(/\.liquid$/, '');
      const rel = findLiquidByType(site, name, ['snippets']);
      return rel ? { rel } : { unresolved: { kind: 'snippet', target: t, key: ref.key, raw: ref.raw } };
    }
    case 'section-group': {
      const name = t.replace(/\.json$/, '');
      const rel = findLiquidByType(site, name, ['sections']);
      return rel ? { rel } : { unresolved: { kind: 'section-group', target: t, key: ref.key, raw: ref.raw } };
    }
    case 'layout': {
      const name = t.replace(/\.liquid$/, '');
      const hit = lookupRel(site, `layout/${name}.liquid`);
      return hit ? { rel: hit } : { unresolved: { kind: 'layout', target: t, key: ref.key, raw: ref.raw } };
    }
    case 'snippet-variable':
      return { dynamic: { kind: 'snippet-variable', target: t, key: ref.key, raw: ref.raw } };
    case 'asset': {
      const rel = findAsset(site, t);
      return rel ? { rel } : { unresolved: { kind: 'asset', target: t, key: ref.key, raw: ref.raw } };
    }
    case 'shopify-file-name': {
      // 很多主题把主题资源误写成 file_url，优先在 assets 里找
      const rel = findAsset(site, t);
      return rel ? { rel } : { external: { kind: 'shopify-files', raw: t, name: t, bucket: 'files', key: ref.key } };
    }
    case 'global-asset':
      return { external: { kind: 'global-asset', raw: t, name: t, key: ref.key } };
    case 'external':
      return { external: { kind: 'external-url', raw: t, name: t, key: ref.key } };
    case 'dynamic':
      return { dynamic: { kind: 'dynamic', target: t, key: ref.key, raw: ref.raw } };
    case 'raw': {
      const c = ref.classified;
      if (!c) return { skip: true };
      switch (c.kind) {
        case 'theme-asset': {
          const rel = findAsset(site, c.name);
          return rel
            ? { rel }
            : { unresolved: { kind: 'asset', target: c.name, key: ref.key, raw: ref.raw } };
        }
        case 'cdn-asset': {
          const rel = findAsset(site, c.name);
          return rel
            ? { rel, note: '原值是 CDN 链接，已对应到主题 assets 文件' }
            : { external: { kind: 'cdn-asset', raw: ref.raw, name: c.name, key: ref.key } };
        }
        case 'shopify-file': {
          const guess = findAsset(site, c.name);
          return {
            external: {
              kind: 'shopify-files',
              bucket: c.bucket,
              raw: ref.raw,
              name: c.name,
              key: ref.key,
              suggestedAsset: guess,
            },
          };
        }
        case 'external-url':
          return { external: { kind: 'external-url', raw: ref.raw, name: ref.raw, key: ref.key } };
        case 'app':
          return { external: { kind: 'app', raw: ref.raw, name: c.name, key: ref.key } };
        case 'dynamic':
          return { dynamic: { kind: 'dynamic', target: ref.raw, key: ref.key, raw: ref.raw } };
        default:
          return { skip: true };
      }
    }
    default:
      return { skip: true };
  }
}

function normalizeEntry(site, entryRel) {
  let e = String(entryRel || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!e) return null;
  if (site.byRel.has(e)) return e;
  const lower = e.toLowerCase();
  if (site.byRelLower?.has(lower)) return site.byRelLower.get(lower);
  // 用户可能只写了文件名
  const hits = site.byBase.get(basename(lower)) || [];
  if (hits.length >= 1) return hits[0];
  return null;
}

/**
 * 分析范围（默认）：
 *   liquid  —— section / snippet / layout，是搬迁的主目标
 *   media   —— 图片 / 视频，通常走 CDN 下载而不是从仓库复制
 *   code    —— css / js / 字体 / 子 json，默认不纳入
 */
export const DEFAULT_SCOPE = { liquid: true, media: true, code: false };

function inScope(category, scope) {
  if (category === 'section' || category === 'snippet' || category === 'layout' ||
      category === 'block' || category === 'liquid' || category === 'liquid-asset') {
    return scope.liquid;
  }
  if (category === 'image' || category === 'video' || category === 'audio' || category === 'font') {
    return scope.media;
  }
  return scope.code;
}

/**
 * 主解析：BFS 展开依赖图
 */
export async function resolveDependencies(site, entryRel, options = {}) {
  const { maxFiles = 4000, maxDepth = 8 } = options;
  const scope = { ...DEFAULT_SCOPE, ...(options.scope || {}) };

  const entry = normalizeEntry(site, entryRel);
  if (!entry) {
    throw new Error(`在 A 站里找不到入口文件：${entryRel}`);
  }

  const nodes = new Map();
  const externals = new Map();
  const media = new Map();
  const unresolved = new Map();
  const dynamics = new Map();
  const notes = [];
  const multiRef = new Map();

  const queue = [{ rel: entry, via: null, refKey: 'entry', depth: 0 }];
  const queued = new Set([entry]);

  while (queue.length > 0) {
    if (nodes.size >= maxFiles) {
      notes.push({ level: 'warn', text: `依赖文件超过上限 ${maxFiles}，已停止继续展开。` });
      break;
    }
    const item = queue.shift();
    if (nodes.has(item.rel)) continue;
    const f = site.byRel.get(item.rel);
    if (!f) continue;

    const cat = categoryOf(f.rel);
    // 入口本身永远保留；其余按范围过滤
    if (f.rel !== entry && !inScope(cat, scope)) continue;

    nodes.set(f.rel, {
      rel: f.rel,
      category: cat,
      size: f.size,
      mtime: f.mtime,
      via: item.via,
      refKey: item.refKey,
      depth: item.depth,
    });

    if (item.depth >= maxDepth) {
      notes.push({ level: 'warn', text: `${f.rel} 达到最大引用深度 ${maxDepth}，未继续展开。` });
      continue;
    }

    let parsed = { refs: [], notes: [] };
    try {
      const isJson = f.base.endsWith('.json') || f.base.endsWith('.json.liquid');
      const isLiquid = f.ext === '.liquid' || f.base.endsWith('.json.liquid');
      const isCss = f.ext === '.css' || f.ext === '.scss';
      const isJs = f.ext === '.js' || f.ext === '.mjs';

      if (isJson || isLiquid || isCss || isJs) {
        const text = await site.readText(f.rel);

        if (f.base.endsWith('.json.liquid')) {
          parsed = parseLiquidRefs(f.rel, text);
          try {
            const j = parseJsonRefs(f.rel, text);
            parsed.refs.push(...j.refs);
          } catch { /* ignore */ }
        } else if (f.base.endsWith('.json')) {
          parsed = parseJsonRefs(f.rel, text);
        } else if (f.ext === '.liquid') {
          parsed = parseLiquidRefs(f.rel, text);
        } else if (isCss) {
          parsed = parseCssRefs(f.rel, text);
        } else if (isJs) {
          parsed = parseJsRefs(f.rel, text);
        }
      }
    } catch (e) {
      notes.push({ level: 'warn', text: `解析 ${f.rel} 失败：${e.message}` });
    }

    for (const n of parsed.notes) notes.push(n);

    for (const ref of parsed.refs) {
      const r = resolveRef(site, ref);

      if (r.rel) {
        if (nodes.has(r.rel)) {
          const cur = nodes.get(r.rel);
          if (cur.via !== f.rel) multiRef.set(r.rel, [...(multiRef.get(r.rel) || []), f.rel]);
          continue;
        }
        if (!queued.has(r.rel)) {
          queued.add(r.rel);
          queue.push({ rel: r.rel, via: f.rel, refKey: ref.key, depth: item.depth + 1 });
        }
      } else if (r.external) {
        const e = r.external;

        // 只有 shopify://shop_images/ 这种店内存引用需要下载
        // 其余（shopify://videos、shopify://files、CDN 完整链接）本身带地址，跨站可直接访问
        if (e.kind === 'shopify-files' && e.bucket === 'images') {
          const key = `media::${e.name}`;
          if (!media.has(key)) {
            media.set(key, {
              name: e.name,
              bucket: e.bucket,
              kind: guessMediaKind(e.name),
              raw: e.raw,
              refFrom: f.rel,
              refKey: ref.key,
              themeAsset: e.suggestedAsset || findAsset(site, e.name) || null,
            });
          }
          continue;
        }

        const key = `${e.kind}::${e.name || e.raw}`;
        if (!externals.has(key)) {
          externals.set(key, { ...e, refFrom: f.rel });
        }
      } else if (r.dynamic) {
        const key = `dyn::${r.dynamic.target}`;
        if (!dynamics.has(key)) dynamics.set(key, { ...r.dynamic, refFrom: f.rel });
      } else if (r.unresolved) {
        // 不在分析范围内的未解析项（比如 css/js）直接丢弃，避免噪音
        const cat = guessCategoryFromName(r.unresolved.target);
        if (cat && !inScope(cat, scope)) continue;
        const key = `${r.unresolved.kind}::${r.unresolved.target}`;
        if (!unresolved.has(key)) unresolved.set(key, { ...r.unresolved, refFrom: f.rel });
      }
    }
  }

  // 入口自身不参与搬迁（它就是用户指定要搬的那个）
  const list = [...nodes.values()].map((n) => ({
    ...n,
    alsoVia: multiRef.get(n.rel) ? [...new Set(multiRef.get(n.rel))] : [],
  }));

  const mediaList = [...media.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    entry,
    entryCategory: categoryOf(entry),
    scope,
    nodes: list,
    media: mediaList,
    externals: [...externals.values()],
    dynamics: [...dynamics.values()],
    unresolved: [...unresolved.values()],
    notes,
    stats: {
      total: list.length,
      byCategory: list.reduce((acc, n) => {
        acc[n.category] = (acc[n.category] || 0) + 1;
        return acc;
      }, {}),
      byGroup: {},
      media: mediaList.length,
      externals: externals.size,
      unresolved: unresolved.size,
      dynamics: dynamics.size,
      totalSize: list.reduce((s, n) => s + (n.size || 0), 0),
    },
  };
}

function guessMediaKind(name) {
  const ext = extname(String(name || '')).toLowerCase();
  if (['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.avi', '.mkv'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext)) return 'audio';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico'].includes(ext)) return 'image';
  return 'other';
}

function guessCategoryFromName(name) {
  const ext = extname(String(name || '').split('?')[0]).toLowerCase();
  if (!ext) return null;
  if (['.css', '.scss', '.sass'].includes(ext)) return 'css';
  if (['.js', '.mjs', '.cjs', '.ts'].includes(ext)) return 'js';
  if (ext === '.json') return 'json';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.avi', '.mkv'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext)) return 'audio';
  if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) return 'font';
  if (ext === '.liquid') return 'snippet';
  return 'other';
}
