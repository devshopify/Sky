import { extname } from '../path-utils.js';

export const IMAGE_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico', '.tif', '.tiff',
]);
export const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.avi', '.mkv']);
export const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
export const FONT_EXT = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot', '.ttc']);
export const CODE_EXT = new Set(['.css', '.scss', '.js', '.mjs', '.json', '.liquid']);
export const KNOWN_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT, ...AUDIO_EXT, ...FONT_EXT, ...CODE_EXT]);

/** 中文/英文分类标签 */
export const CATEGORY_META = {
  section: { label: 'Section', group: 'liquid', icon: 'S' },
  snippet: { label: 'Snippet', group: 'liquid', icon: 'N' },
  layout: { label: 'Layout', group: 'liquid', icon: 'L' },
  block: { label: 'Block', group: 'liquid', icon: 'B' },
  'liquid-asset': { label: 'Liquid(assets)', group: 'liquid', icon: 'L' },
  liquid: { label: 'Liquid', group: 'liquid', icon: 'L' },
  template: { label: 'Template JSON', group: 'json', icon: 'T' },
  'section-group': { label: 'Section Group', group: 'json', icon: 'G' },
  config: { label: 'Config', group: 'json', icon: 'C' },
  locale: { label: 'Locale', group: 'json', icon: 'i' },
  json: { label: 'JSON 数据', group: 'json', icon: 'J' },
  css: { label: 'CSS', group: 'style', icon: 'C' },
  js: { label: 'JS', group: 'script', icon: 'J' },
  image: { label: '图片', group: 'media', icon: 'I' },
  video: { label: '视频', group: 'media', icon: 'V' },
  audio: { label: '音频', group: 'media', icon: 'A' },
  font: { label: '字体', group: 'media', icon: 'F' },
  other: { label: '其他', group: 'other', icon: '?' },
};

export const GROUP_ORDER = ['liquid', 'json', 'style', 'script', 'media', 'other'];

export const GROUP_LABEL = {
  liquid: 'Liquid 模板',
  json: 'JSON 数据',
  style: '样式',
  script: '脚本',
  media: '媒体资源',
  other: '其他',
};

export function categoryOf(rel) {
  const ext = extname(rel).toLowerCase();
  const dir = rel.includes('/') ? rel.split('/')[0] : '';

  if (ext === '.liquid') {
    if (dir === 'sections') return 'section';
    if (dir === 'snippets') return 'snippet';
    if (dir === 'layout') return 'layout';
    if (dir === 'blocks') return 'block';
    if (dir === 'assets') return 'liquid-asset';
    return 'liquid';
  }
  if (ext === '.json') {
    if (dir === 'templates') return 'template';
    if (dir === 'sections') return 'section-group';
    if (dir === 'config') return 'config';
    if (dir === 'locales') return 'locale';
    return 'json';
  }
  if (ext === '.css' || ext === '.scss' || ext === '.sass') return 'css';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.ts') return 'js';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (FONT_EXT.has(ext)) return 'font';
  return 'other';
}

export function categoryGroup(cat) {
  return (CATEGORY_META[cat] || CATEGORY_META.other).group;
}

/** 从 Shopify CDN 地址里抽出资源归属（主题 asset 还是 Files） */
export function parseCdnUrl(raw) {
  let u;
  try {
    u = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!/(^|\.)cdn\.shopify\.com$/.test(host) && !/(^|\.)shopifycdn\.com$/.test(host)) {
    return { kind: 'external', host, url: raw };
  }
  const parts = u.pathname.split('/').filter(Boolean);
  const ai = parts.indexOf('assets');
  if (ai >= 0 && ai < parts.length - 1) {
    return { kind: 'theme-asset', name: parts.slice(ai + 1).join('/'), url: raw };
  }
  const fi = parts.indexOf('files');
  if (fi >= 0 && fi < parts.length - 1) {
    return { kind: 'files', name: parts.slice(fi + 1).join('/'), url: raw };
  }
  return { kind: 'cdn-other', name: parts[parts.length - 1] || '', url: raw };
}

/**
 * 把任意字符串值判定为一种引用。
 * 返回 null 表示这个字符串不是资源引用。
 */
export function classifyString(raw) {
  const t = String(raw).trim();
  if (!t || t.length > 600) return null;
  if (t.includes('\n') || t.includes('\r')) return null;

  if (t.startsWith('data:') || t.startsWith('mailto:') || t.startsWith('tel:') || t.startsWith('#') || t.startsWith('javascript:')) {
    return null;
  }

  // HTML 片段（settings 里的自定义 HTML）不是资源路径
  if (t.length > 20 && (t.includes('<') || t.includes('>'))) return null;

  // Shopify 协议：shopify://shop_images/、shopify://videos/、shopify://files/ 都是店内存引用
  if (t.startsWith('shopify://')) {
    const m = t.match(/^shopify:\/\/([a-z_]+)\/(.+)$/i);
    if (!m) return { kind: 'unknown', text: t };
    const bucket = m[1].toLowerCase();
    const name = m[2];
    if (bucket === 'apps') return { kind: 'app', bucket, name, text: t };
    return {
      kind: 'shopify-file',
      bucket: bucket === 'shop_images' ? 'images' : bucket,
      name,
      text: t,
      scheme: 'shopify',
    };
  }

  // 绝对 URL
  if (/^(https?:)?\/\//i.test(t)) {
    const cdn = parseCdnUrl(t);
    if (cdn && cdn.kind === 'theme-asset') {
      return { kind: 'cdn-asset', name: cdn.name, text: t, scheme: 'http' };
    }
    if (cdn && cdn.kind === 'files') {
      // 完整地址，跨站可直接访问，不需要下载
      return { kind: 'shopify-file', bucket: 'files', name: cdn.name, text: t, scheme: 'http' };
    }
    return { kind: 'external-url', text: t, scheme: 'http' };
  }

  // Liquid 模板拼接 / JS 模板字符串 -> 动态
  if (t.includes('{{') || t.includes('{%') || t.includes('${')) {
    return { kind: 'dynamic', text: t };
  }

  // 主题内的相对路径 / 文件名
  const clean = t.split('?')[0].split('#')[0];
  const ext = extname(clean).toLowerCase();
  if (ext && KNOWN_EXT.has(ext)) {
    return { kind: 'theme-asset', name: clean, text: t };
  }

  return null;
}

export function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
