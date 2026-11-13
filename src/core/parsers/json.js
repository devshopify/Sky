import { classifyString } from './shared.js';

/**
 * Shopify 导出的模板 JSON 会在开头带一段块注释，标准 JSON.parse 会失败。
 * 这里安全地剥掉字符串以外的注释。
 */
export function stripJsonComments(src) {
  let out = '';
  let i = 0;
  let inString = false;

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (inString) {
      into: {
        if (c === '\\') {
          out += c + (next ?? '');
          i += 2;
          break into;
        }
        out += c;
        if (c === '"') inString = false;
        i += 1;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }

    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) return out;
      i = end + 2;
      out += ' ';
      continue;
    }

    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      i = end === -1 ? src.length : end;
      out += ' ';
      continue;
    }

    out += c;
    i += 1;
  }

  return out;
}

/** 宽松解析：先试标准 parse，失败再剥注释 */
export function parseJsonLoose(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(stripJsonComments(raw));
    } catch {
      return null;
    }
  }
}

/**
 * 遍历 JSON 里所有字符串值
 */
function walkStrings(value, keyPath, out, depth = 0) {
  if (depth > 30) return;
  if (typeof value === 'string') {
    out.push({ value, key: keyPath });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${keyPath}[${i}]`, out, depth + 1));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      walkStrings(v, keyPath ? `${keyPath}.${k}` : k, out, depth + 1);
    }
  }
}

/**
 * 解析 Shopify JSON 模板 / section group / 普通数据 JSON 的引用
 */
export function parseJsonRefs(rel, raw) {
  const refs = [];
  const notes = [];

  let json;
  try {
    json = parseJsonLoose(raw);
  } catch (e) {
    json = null;
  }
  if (json === null) {
    notes.push({ level: 'warn', text: `${rel} 无法解析为 JSON，已跳过` });
    return { refs, notes };
  }

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { refs, notes };
  }

  // 1) Shopify 模板 / section group：sections 里每项有 type
  const sections = json.sections;
  const isTemplate =
    sections &&
    typeof sections === 'object' &&
    !Array.isArray(sections) &&
    Object.values(sections).some((s) => s && typeof s === 'object' && typeof s.type === 'string');

  if (isTemplate) {
    for (const [sid, sec] of Object.entries(sections)) {
      if (!sec || typeof sec !== 'object') continue;

      if (typeof sec.type === 'string') {
        refs.push({
          target: sec.type,
          type: 'section',
          key: `sections.${sid}.type`,
          raw: sec.type,
        });
      }

      // theme block（新版本 block 独立文件）
      if (sec.blocks && typeof sec.blocks === 'object') {
        for (const [bid, blk] of Object.entries(sec.blocks)) {
          if (!blk || typeof blk !== 'object') continue;
          if (typeof blk.type === 'string' && !blk.type.includes('/')) {
            refs.push({
              target: blk.type,
              type: 'block',
              key: `sections.${sid}.blocks.${bid}.type`,
              raw: blk.type,
            });
          }
        }
      }
    }
    notes.push({
      level: 'info',
      text: `${rel} 识别为 Shopify 模板/section group，共 ${Object.keys(sections).length} 个 section。`,
    });
  }

  // 2) 全量字符串扫描（settings 里的图片、视频、css、js、子 json 都在这里）
  const strings = [];
  walkStrings(json, '', strings);

  for (const { value, key } of strings) {
    const c = classifyString(value);
    if (!c) continue;

    // 跳过 section/block 的 type 字段本身（已单独处理），避免把 'hero-banner' 当资源
    if (key.endsWith('.type') || key === 'type') continue;

    refs.push({
      target: c.name || value,
      type: 'raw',
      key,
      raw: value,
      classified: c,
    });
  }

  return { refs, notes };
}
