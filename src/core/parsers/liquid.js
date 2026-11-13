import { classifyString } from './shared.js';

const RE = {
  render: /\{%-?\s*(?:render|include)\s+['"]([^'"]+)['"]/g,
  renderBare: /\{%-?\s*(?:render|include)\s+([a-zA-Z_][\w\-\/]*)\s*-?%\}/g,
  section: /\{%-?\s*section\s+['"]([^'"]+)['"]/g,
  sectionsGroup: /\{%-?\s*sections\s+['"]([^'"]+)['"]/g,
  layout: /\{%-?\s*layout\s+['"]([^'"]+)['"]/g,
  filter: /\{\{-?\s*['"]([^'"]+)['"]\s*\|\s*(asset_url|asset_img_url|stylesheet_tag|script_tag|file_url|file_img_url|global_asset_url|shopify_asset_url)/g,
  liquidBlock: /\{%-?\s*liquid([\s\S]*?)-?%\}/g,
  inlineStyle: /<style[^>]*>([\s\S]*?)<\/style>/gi,
  cssUrl: /url\(\s*['"]?([^'")]+?)['"]?\s*\)/g,
};

function isDynamicTarget(t) {
  return /\{\{|\{%/.test(t) || /^[a-z_][a-z0-9_]*$/i.test(t) === false ? /\{\{|\{%/.test(t) : false;
}

/**
 * 解析 Liquid 文件引用：section / snippet / layout / asset / file
 */
export function parseLiquidRefs(rel, text) {
  const refs = [];
  const notes = [];

  const add = (target, type, key, raw) => {
    if (!target) return;
    refs.push({ target: target.trim(), type, key, raw: raw ?? target });
  };

  // {% render 'x' %} / {% include 'x' %}
  for (const m of text.matchAll(RE.render)) {
    add(m[1], 'snippet', 'liquid:render');
  }
  // {% render x %}（变量形式，无法静态解析）
  for (const m of text.matchAll(RE.renderBare)) {
    add(m[1], 'snippet-variable', 'liquid:render');
  }
  // {% section 'x' %}
  for (const m of text.matchAll(RE.section)) {
    add(m[1], 'section', 'liquid:section');
  }
  // {% sections 'x' %}（section group）
  for (const m of text.matchAll(RE.sectionsGroup)) {
    add(m[1], 'section-group', 'liquid:sections');
  }
  // {% layout 'x' %}
  for (const m of text.matchAll(RE.layout)) {
    add(m[1], 'layout', 'liquid:layout');
  }
  // {{ 'x.css' | asset_url }}
  for (const m of text.matchAll(RE.filter)) {
    const filter = m[2];
    if (filter.startsWith('file')) {
      add(m[1], 'shopify-file-name', `liquid:${filter}`);
    } else if (filter === 'shopify_asset_url' || filter === 'global_asset_url') {
      add(m[1], 'global-asset', `liquid:${filter}`);
    } else {
      add(m[1], 'asset', `liquid:${filter}`);
    }
  }

  // {% liquid ... %} 代码块内部
  for (const m of text.matchAll(RE.liquidBlock)) {
    const body = m[1];
    for (const x of body.matchAll(/\b(?:render|include)\s+['"]([^'"]+)['"]/g)) {
      add(x[1], 'snippet', 'liquid:liquid-block');
    }
    for (const x of body.matchAll(/\bsection\s+['"]([^'"]+)['"]/g)) {
      add(x[1], 'section', 'liquid:liquid-block');
    }
    for (const x of body.matchAll(/['"]([^'"]+)['"]\s*\|\s*(asset_url|file_url|asset_img_url)/g)) {
      add(x[1], x[2].startsWith('file') ? 'shopify-file-name' : 'asset', 'liquid:liquid-block');
    }
  }

  // 内联 <style> 里的 url(...)（主题里很常见）
  for (const m of text.matchAll(RE.inlineStyle)) {
    for (const u of m[1].matchAll(RE.cssUrl)) {
      const c = classifyString(u[1]);
      if (c && c.kind === 'theme-asset') add(c.name, 'asset', 'liquid:inline-css');
    }
  }

  // 兜底：注释里、data-* 属性里出现的 asset 文件名
  for (const m of text.matchAll(/["']([\w\-\/\.]+\.(?:css|js|jpg|jpeg|png|gif|webp|svg|avif|mp4|webm|woff2?|ttf|otf|json))["']/gi)) {
    add(m[1], 'asset', 'liquid:literal');
  }

  return { refs, notes };
}
