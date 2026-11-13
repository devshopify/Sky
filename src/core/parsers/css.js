import { classifyString } from './shared.js';

/**
 * 解析 CSS 引用：url(...) 与 @import
 */
export function parseCssRefs(rel, text) {
  const refs = [];
  const notes = [];

  const add = (raw, key) => {
    if (!raw) return;
    const t = raw.trim();
    if (!t || t.startsWith('data:')) return;
    const c = classifyString(t);
    if (!c) return;
    if (c.kind === 'theme-asset') {
      refs.push({ target: c.name, type: 'asset', key, raw: t });
    } else if (c.kind === 'external-url') {
      refs.push({ target: t, type: 'external', key, raw: t });
    } else if (c.kind === 'cdn-asset') {
      refs.push({ target: c.name, type: 'asset', key, raw: t });
    } else if (c.kind === 'dynamic') {
      refs.push({ target: t, type: 'dynamic', key, raw: t });
    }
  };

  for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    add(m[2], 'css:url');
  }
  for (const m of text.matchAll(/@import\s+(?:url\(\s*)?(['"]?)([^'");]+)\1/g)) {
    add(m[2], 'css:import');
  }

  return { refs, notes };
}
