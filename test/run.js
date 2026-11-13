import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSite } from '../src/core/indexer.js';
import { createNodeReader } from '../server/node-reader.js';
import { resolveDependencies } from '../src/core/resolver.js';
import { compareSites, compareMedia } from '../src/core/compare.js';
import { buildMediaUrl } from '../src/core/downloader.js';
import { classifyString } from '../src/core/parsers/shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const A_DIR = path.join(__dirname, 'fixtures/A-theme');
const B_DIR = path.join(__dirname, 'fixtures/B-theme');
const ENTRY = process.argv[2] || 'templates/product.a2-3000.json';

const A = await scanSite(createNodeReader(A_DIR));
const B = await scanSite(createNodeReader(B_DIR));

console.log(`A: ${A.label}  (${A.stats.total} files)`);
console.log(`B: ${B.label}  (${B.stats.total} files)`);
console.log(`entry: ${ENTRY}`);

const deps = await resolveDependencies(A, ENTRY);
console.log(`scope: ${JSON.stringify(deps.scope)}
`);
const cmp = await compareSites(A, B, deps);
const media = await compareMedia(A, B, deps.media);

const pad = (s, n) => String(s).padEnd(n);
console.log('== 主题文件 ==');
console.log(pad('STATUS', 11) + pad('CATEGORY', 12) + pad('PATH', 46) + 'VIA');
console.log('-'.repeat(118));
for (const it of cmp.items) {
  console.log(pad(it.status, 11) + pad(it.category, 12) + pad(it.rel, 46) + (it.via || '(entry)'));
}

console.log('\n== 媒体资源 ==');
console.log(pad('STATUS', 11) + pad('KIND', 8) + pad('NAME', 34) + 'REF');
for (const m of media) {
  console.log(pad(m.status, 11) + pad(m.kind, 8) + pad(m.name, 34) + `${m.refFrom} (${m.refKey || '-'})`);
}
if (!media.length) console.log('  (无)');

if (deps.externals.length) {
  console.log('\n== 其他外部引用 ==');
  for (const e of deps.externals) console.log(`  [${e.kind}] ${e.name}  <- ${e.refFrom}`);
}
if (deps.unresolved.length) {
  console.log('\n== 未解析 ==');
  for (const u of deps.unresolved) console.log(`  [${u.kind}] ${u.target}  <- ${u.refFrom}`);
}
if (deps.dynamics.length) {
  console.log('\n== 动态引用 ==');
  for (const d of deps.dynamics) console.log(`  ${d.target}  <- ${d.refFrom}`);
}

// CDN 拼接
console.log('\n== 下载地址拼接 ==');
const base = 'https://es.dreametech.com/cdn/shop/files/';
for (const m of media) console.log('  ' + buildMediaUrl(base, m.name));

if (ENTRY !== 'templates/product.a2-3000.json') {
  console.log('\n(自定义入口，跳过断言)');
  process.exit(0);
}

// 断言
let fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) fail += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  期望 ${expected} / 实际 ${actual}`);
};

console.log('\n== 断言：只查 liquid + 媒体 ==');
const fileStatus = (rel) => cmp.items.find((i) => i.rel === rel)?.status || 'NOT FOUND';
const mediaStatus = (name) => media.find((m) => m.name === name)?.status || 'NOT FOUND';

check('sections/product-specs-comparison.liquid', fileStatus('sections/product-specs-comparison.liquid'), 'missing');
check('snippets/product-card.liquid', fileStatus('snippets/product-card.liquid'), 'missing');
check('snippets/icon-arrow.liquid', fileStatus('snippets/icon-arrow.liquid'), 'identical');
check('assets/hero-banner.jpg', fileStatus('assets/hero-banner.jpg'), 'identical');
check('assets/hero-banner-mobile.jpg', fileStatus('assets/hero-banner-mobile.jpg'), 'identical');
check('assets/icon-arrow.svg', fileStatus('assets/icon-arrow.svg'), 'identical');
check('assets/product-video.mp4', fileStatus('assets/product-video.mp4'), 'missing');

console.log('\n== 断言：css/js/子json 不应进入清单 ==');
check('assets/theme.css 未纳入', fileStatus('assets/theme.css'), 'NOT FOUND');
check('assets/theme.js 未纳入', fileStatus('assets/theme.js'), 'NOT FOUND');
check('assets/a2-3000-specs.json 未纳入', fileStatus('assets/a2-3000-specs.json'), 'NOT FOUND');
check('assets/font-inter.woff2 未纳入', fileStatus('assets/font-inter.woff2'), 'NOT FOUND');

console.log('\n== 断言：page_css 展开成 css 文件 ==');
check('product-s9-pro.css', fileStatus('assets/product-s9-pro.css'), 'missing');
check('product-s9-diff.css', fileStatus('assets/product-s9-diff.css'), 'missing');
check(
  'page_css 总数（含去重）',
  String(cmp.items.filter((i) => i.refKey === 'sections.main.settings.page_css' || i.refKey === 'sections.specs_bottom.settings.page_css').length),
  '2'
);

console.log('\n== 断言：shopify:// 协议引用都要下载 ==');
check('a2-bg.jpg (shop_images)', mediaStatus('a2-bg.jpg'), 'download');
check('a2-3000-promo.mp4 (videos)', mediaStatus('a2-3000-promo.mp4'), 'download');
check('媒体总数', String(media.length), '2');

console.log('\n== 断言：带完整地址的不下载 ==');
{
  const cdnCls = classifyString('https://cdn.shopify.com/s/files/1/0553/1320/3405/files/remote-only.png?v=1');
  check('CDN 完整链接 -> http 来源', cdnCls && cdnCls.scheme, 'http');
  const fileCls = classifyString('shopify://files/manual.pdf');
  check('shopify://files -> shopify 来源', fileCls && fileCls.scheme, 'shopify');
  const vidCls = classifyString('shopify://videos/a.mp4');
  check('shopify://videos -> shopify 来源', vidCls && vidCls.scheme, 'shopify');
}

console.log('\n== 断言：CDN 拼接 ==');
check('a2-bg.jpg URL', buildMediaUrl(base, 'a2-bg.jpg'), 'https://es.dreametech.com/cdn/shop/files/a2-bg.jpg');
check('base 无斜杠', buildMediaUrl('https://es.dreametech.com/cdn/shop/files', 'x.png'), 'https://es.dreametech.com/cdn/shop/files/x.png');

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
