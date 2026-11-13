/** 浏览器环境下的 posix 路径工具（替代 node:path） */

export function extname(p) {
  const s = String(p == null ? '' : p);
  const slash = s.lastIndexOf('/');
  const name = slash >= 0 ? s.slice(slash + 1) : s;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return name.slice(dot);
}

export function basename(p) {
  const s = String(p == null ? '' : p);
  const slash = s.lastIndexOf('/');
  return slash >= 0 ? s.slice(slash + 1) : s;
}

export function dirname(p) {
  const s = String(p == null ? '' : p);
  const slash = s.lastIndexOf('/');
  return slash >= 0 ? s.slice(0, slash) : '';
}

export function join(...parts) {
  return parts
    .filter((x) => x != null && x !== '')
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}
