import { classifyString } from './shared.js';

/**
 * 解析 JS 引用。
 * JS 里的路径大多是拼接的，所以策略是：
 *  1) 抽取所有"长得像资源路径"的字符串字面量
 *  2) 由 resolver 用 A 站 assets 索引反查确认
 */
export function parseJsRefs(rel, text) {
  const refs = [];
  const notes = [];

  const add = (raw, key) => {
    if (!raw || raw.length > 300 || raw.includes('\n')) return;
    const c = classifyString(raw);
    if (!c) return;
    if (c.kind === 'theme-asset') refs.push({ target: c.name, type: 'asset', key, raw });
    else if (c.kind === 'external-url') refs.push({ target: raw, type: 'external', key, raw });
    else if (c.kind === 'dynamic') refs.push({ target: raw, type: 'dynamic', key, raw });
  };

  // 字符串字面量里的路径
  const literal = /(['"`])((?:\/|\.\/)?[\w\-\/\.%]+\.(?:json|css|jpg|jpeg|png|gif|webp|svg|avif|mp4|webm|mov|woff2?|ttf|otf|mp3))(?:\?[^'"`]*)?\1/gi;
  for (const m of text.matchAll(literal)) {
    add(m[2], 'js:literal');
  }

  // fetch('/assets/x.json') 之类
  for (const m of text.matchAll(/fetch\(\s*(['"`])([^'"`]+)\1/g)) {
    add(m[2], 'js:fetch');
  }

  // new URL('...', import.meta.url)
  for (const m of text.matchAll(/new\s+URL\(\s*(['"`])([^'"`]+)\1/g)) {
    add(m[2], 'js:url');
  }

  return { refs, notes };
}
