import { computed, reactive, ref, shallowRef } from 'vue';
import { scanSite } from '../core/indexer.js';
import { resolveDependencies } from '../core/resolver.js';
import { compareSites, compareMedia } from '../core/compare.js';
import { downloadMedia } from '../core/downloader.js';
import {
  createFileListReader,
  createFsaReader,
  createMemoryReader,
  hasDirectoryPicker,
  pickDirectory,
} from '../core/fsa-reader.js';
import { unzipSync, zip } from 'fflate';

export const GROUP_ORDER = ['liquid', 'json', 'style', 'script', 'media', 'other'];
export const GROUP_LABEL = {
  liquid: 'Liquid 模板',
  json: 'JSON / Template',
  style: '样式',
  script: '脚本',
  media: '图片 / 视频',
  other: '其他',
};
export const ICON = { liquid: 'L', json: 'J', style: 'C', script: 'S', media: 'M', other: '?' };
export const STATUS_META = {
  missing: { label: '缺失', cls: 'missing', rank: 0 },
  download: { label: '待下载', cls: 'download', rank: 1 },
  modified: { label: '冲突', cls: 'modified', rank: 2 },
  identical: { label: '已存在', cls: 'identical', rank: 3 },
};

export const siteA = shallowRef(null);
export const siteB = shallowRef(null);
export const analysis = shallowRef(null);
export const selected = ref(new Set());

export const ui = reactive({
  entry: null,
  mediaBase: localStorage.getItem('migrator.media') || '',
  filter: 'all',
  search: '',
  collapsed: [],
  busy: false,
  busyText: '',
  progress: null,
  error: '',
  toast: '',
  toastType: 'info',
  result: null,
  pickerSupport: hasDirectoryPicker(),
});

let toastTimer = null;
export function toast(msg, type = 'info') {
  ui.toast = msg;
  ui.toastType = type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = '';
  }, 3200);
}

/* ---------------- 派生数据 ---------------- */
export const allRows = computed(() => {
  const res = analysis.value;
  if (!res) return [];
  const fileRows = res.items.map((it) => ({
    ...it,
    rowType: 'file',
    key: it.rel,
    group: it.group,
    display: it.rel,
  }));
  const mediaRows = (res.media || []).map((m) => ({
    ...m,
    rowType: 'media',
    key: `media::${m.name}`,
    group: 'media',
    category: m.kind === 'video' ? 'video' : m.kind === 'audio' ? 'audio' : 'image',
    display: m.status === 'download' ? m.name : m.rel || m.name,
  }));
  return [...fileRows, ...mediaRows];
});

export const filteredRows = computed(() => {
  let out = allRows.value;
  if (ui.filter !== 'all') out = out.filter((r) => r.status === ui.filter);
  const kw = ui.search.trim().toLowerCase();
  if (kw) {
    out = out.filter((r) =>
      [r.display, r.via, r.refFrom, r.refKey].some((v) => String(v || '').toLowerCase().includes(kw))
    );
  }
  return out;
});

export const groupedRows = computed(() => {
  const groups = {};
  for (const r of filteredRows.value) {
    (groups[r.group] = groups[r.group] || []).push(r);
  }
  return GROUP_ORDER.filter((g) => groups[g] && groups[g].length).map((g) => {
    const list = [...groups[g]].sort(
      (a, b) => (STATUS_META[a.status]?.rank ?? 9) - (STATUS_META[b.status]?.rank ?? 9) ||
        String(a.display).localeCompare(String(b.display))
    );
    const cnt = { missing: 0, modified: 0, identical: 0, download: 0 };
    list.forEach((r) => { if (cnt[r.status] !== undefined) cnt[r.status] += 1; });
    return { key: g, label: GROUP_LABEL[g], rows: list.slice(0, 300), total: list.length, cnt };
  });
});

export const chosenRows = computed(() => allRows.value.filter((r) => selected.value.has(r.key)));

export const actionStats = computed(() => {
  const chosen = chosenRows.value;
  const copy = chosen.filter((r) => r.rowType === 'file' || r.status !== 'download');
  const dl = chosen.filter((r) => r.rowType === 'media' && r.status === 'download');
  return {
    copy,
    dl,
    size: chosen.reduce((s, r) => s + (r.size || 0), 0),
    conflicts: allRows.value.filter((r) => r.status === 'modified' && !selected.value.has(r.key)).length,
  };
});

/* ---------------- 载入站点 ---------------- */
async function mountSite(which, reader) {
  ui.busy = true;
  ui.busyText = `正在索引 ${which} 站点…`;
  ui.progress = null;
  ui.error = '';
  try {
    const site = await scanSite(reader);
    const wrapped = site;
    if (which === 'A') siteA.value = wrapped;
    else siteB.value = wrapped;
    analysis.value = null;
  } catch (e) {
    ui.error = e.message;
    toast(e.message, 'error');
  } finally {
    ui.busy = false;
    ui.busyText = '';
  }
}

export async function chooseFolder(which) {
  try {
    const handle = await pickDirectory(which === 'B' ? 'readwrite' : 'read');
    const reader = await createFsaReader(handle, {
      writable: which === 'B',
      onProgress: (p) => { ui.progress = p; },
    });
    ui.progress = null;
    await mountSite(which, reader);
    toast(which === 'B' ? '目标站点已授权，可直接写入' : '源站点已载入');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    ui.error = e.message;
    toast(e.message, 'error');
  }
}

/** 原生文件夹选择（webkitdirectory），不弹任何授权框，只读 */
export async function loadFileList(which, fileList) {
  if (!fileList || !fileList.length) return;
  try {
    const reader = createFileListReader(fileList);
    await mountSite(which, reader);
    toast(`已读取 ${fileList.length} 个文件${which === 'B' ? '（只读，执行时打包 zip）' : ''}`);
  } catch (e) {
    ui.error = e.message;
    toast(e.message, 'error');
  }
}

export async function loadZip(which, file) {
  ui.busy = true;
  ui.busyText = `正在解压 ${file.name}…`;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const entries = unzipSync(buf);
    const map = new Map();
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith('/') || name.startsWith('__MACOSX/') || name.includes('/._')) continue;
      const rel = name.replace(/\\/g, '/');
      if (rel.split('/').some((s) => s === '..')) continue;
      map.set(rel, data);
    }
    if (map.size === 0) throw new Error('zip 里没有文件');
    const reader = createMemoryReader(file.name.replace(/\.zip$/i, ''), map);
    await mountSite(which, reader);
    toast(`已解压 ${map.size} 个文件`);
  } catch (e) {
    ui.error = e.message;
    toast(`解压失败：${e.message}`, 'error');
  } finally {
    ui.busy = false;
    ui.busyText = '';
  }
}

export function clearSite(which) {
  if (which === 'A') siteA.value = null;
  else siteB.value = null;
  analysis.value = null;
  selected.value = new Set();
}

export function setEntry(rel) {
  ui.entry = rel;
}

/** 载入内置示例（用于试用与自动化验证） */
export async function loadDemo() {
  ui.busy = true;
  ui.busyText = '正在载入示例主题…';
  try {
    const [aRes, bRes] = await Promise.all([
      fetch('./demo/A-theme.zip'),
      fetch('./demo/B-theme.zip'),
    ]);
    if (!aRes.ok || !bRes.ok) throw new Error('示例文件缺失');
    const [aBlob, bBlob] = await Promise.all([aRes.blob(), bRes.blob()]);
    await loadZip('A', new File([aBlob], 'A-theme.zip'));
    await loadZip('B', new File([bBlob], 'B-theme.zip'));
    ui.entry = 'templates/product.a2-3000.json';
    await runAnalyze();
  } catch (e) {
    toast(`示例载入失败：${e.message}`, 'error');
  } finally {
    ui.busy = false;
    ui.busyText = '';
  }
}

/* ---------------- 分析 ---------------- */
export async function runAnalyze() {
  if (!siteA.value || !siteB.value || !ui.entry || ui.busy) return;
  ui.busy = true;
  ui.busyText = '正在解析依赖…';
  try {
    const deps = await resolveDependencies(siteA.value, ui.entry);
    ui.busyText = '正在对比目标站点…';
    const cmp = await compareSites(siteA.value, siteB.value, deps);
    const media = await compareMedia(siteA.value, siteB.value, deps.media);
    const mediaCounts = media.reduce(
      (acc, m) => { acc[m.status] = (acc[m.status] || 0) + 1; return acc; },
      { download: 0, missing: 0, modified: 0, identical: 0 }
    );

    analysis.value = {
      entry: deps.entry,
      items: cmp.items,
      counts: cmp.counts,
      media,
      mediaCounts,
      externals: deps.externals,
      unresolved: deps.unresolved,
      dynamics: deps.dynamics,
      notes: deps.notes,
      scope: deps.scope,
    };

    ui.filter = 'all';
    ui.search = '';
    ui.collapsed = [];

    const sel = new Set();
    cmp.items.filter((i) => i.status === 'missing').forEach((i) => sel.add(i.rel));
    media
      .filter((m) => m.status === 'download' || m.status === 'missing')
      .forEach((m) => sel.add(`media::${m.name}`));
    selected.value = sel;
  } catch (e) {
    ui.error = e.message;
    toast(e.message, 'error');
  } finally {
    ui.busy = false;
    ui.busyText = '';
  }
}

/* ---------------- 选择 ---------------- */
export function toggleRow(key) {
  const next = new Set(selected.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selected.value = next;
}

export function toggleGroup(keys, on) {
  const next = new Set(selected.value);
  keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
  selected.value = next;
}

export function clearSelection() {
  selected.value = new Set();
}

export function selectAllVisible() {
  selected.value = new Set(filteredRows.value.map((r) => r.key));
}

/* ---------------- 执行 ---------------- */
function zipAsync(files) {
  return new Promise((resolve, reject) => {
    zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function downloadBlob(data, name) {
  const blob = new Blob([data], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_');
}

export async function execute() {
  const { copy, dl } = actionStats.value;
  if (!copy.length && !dl.length) return;
  if (dl.length && !ui.mediaBase.trim()) {
    toast('选中的媒体需要下载，请先填写图片来源地址', 'error');
    return;
  }

  const direct = Boolean(siteB.value && siteB.value.reader.kind === 'fsa' && siteB.value.canWrite);
  const entrySlug = (analysis.value?.entry || 'bundle').replace(/[\\/]/g, '_').replace(/\.json$/i, '');
  const stamp = Date.now();

  const themeBundle = {};
  const zipQueue = [];
  const report = {
    copied: [],
    failed: [],
    downloads: null,
    zips: [],
    savedTo: direct ? 'target' : 'zip',
  };

  ui.busy = true;
  ui.busyText = direct ? '正在写入目标站点…' : '正在收集文件…';

  try {
    /* 1. 主题文件：能写就直接写，不能写就攒着打包 */
    for (let i = 0; i < copy.length; i += 1) {
      const row = copy[i];
      ui.busyText = `复制 ${i + 1}/${copy.length}：${row.rel}`;
      try {
        // eslint-disable-next-line no-await-in-loop
        const bytes = await siteA.value.readBytes(row.rel);
        if (direct) {
          // eslint-disable-next-line no-await-in-loop
          await siteB.value.writeBytes(row.rel, bytes);
        } else {
          themeBundle[row.rel] = bytes;
        }
        report.copied.push(row.rel);
      } catch (e) {
        report.failed.push({ rel: row.rel, reason: e.message });
      }
    }

    /* 2. 媒体下载：不管目标目录能不能写，都单独打一个 zip 给浏览器 */
    if (dl.length) {
      ui.busyText = '正在下载图片 / 视频…';
      const res = await downloadMedia({
        items: dl.map((r) => ({ name: r.name })),
        baseUrl: ui.mediaBase.trim(),
        onProgress: (p) => { ui.busyText = `下载 ${p.done}/${p.total}：${p.name}`; },
      });

      report.downloads = {
        total: res.total,
        success: res.success,
        failed: res.failed,
        totalSize: res.totalSize,
        results: res.results.map((r) => ({
          name: r.name,
          resolvedName: r.resolvedName,
          ok: r.ok,
          size: r.size,
          reason: r.reason,
          url: r.url,
        })),
      };

      const ok = res.results.filter((r) => r.ok);
      if (ok.length) {
        const mediaBundle = {};
        // Files 是扁平命名空间，保持原文件名，解压后直接拖进后台上传
        ok.forEach((r) => { mediaBundle[safeName(r.name)] = r.bytes; });
        zipQueue.push({
          name: `media-${entrySlug}-${stamp}.zip`,
          kind: 'media',
          count: ok.length,
          files: mediaBundle,
        });
      }
    }

    /* 3. 主题文件打包（仅目标目录不可写时） */
    if (!direct && Object.keys(themeBundle).length) {
      zipQueue.push({
        name: `theme-${entrySlug}-${stamp}.zip`,
        kind: 'theme',
        count: Object.keys(themeBundle).length,
        files: themeBundle,
      });
    }

    /* 4. 依次触发下载（间隔一下，避免浏览器把第二个当成弹窗拦截） */
    for (let i = 0; i < zipQueue.length; i += 1) {
      const q = zipQueue[i];
      ui.busyText = `正在打包 ${i + 1}/${zipQueue.length}：${q.name}`;
      // eslint-disable-next-line no-await-in-loop
      const data = await zipAsync(q.files);
      if (i > 0) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 700));
      }
      downloadBlob(data, q.name);
      report.zips.push({ name: q.name, kind: q.kind, count: q.count, size: data.length });
    }

    if (direct) {
      // 目标站点已变化，重新索引
      const fresh = await scanSite(siteB.value.reader);
      siteB.value = fresh;
      await runAnalyze();
    }

    ui.result = report;
  } catch (e) {
    ui.error = e.message;
    toast(e.message, 'error');
  } finally {
    ui.busy = false;
    ui.busyText = '';
  }
}

export function exportSiteZip() {
  const site = siteB.value;
  if (!site) return;
  const files = site.reader.exportFiles ? site.reader.exportFiles() : null;
  if (!files) {
    toast('只有 zip 载入的站点支持导出', 'error');
    return;
  }
  zipAsync(Object.fromEntries(files))
    .then((data) => downloadBlob(data, `${site.label}-updated.zip`))
    .catch((e) => toast(e.message, 'error'));
}

/* ---------------- 报告 ---------------- */
export function exportReport() {
  const res = analysis.value;
  if (!res) return;
  const lines = [];
  lines.push('# 搬迁分析报告');
  lines.push('');
  lines.push(`- 生成时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`- 源站点：${siteA.value?.label || ''}`);
  lines.push(`- 目标站点：${siteB.value?.label || ''}`);
  lines.push(`- 入口文件：\`${res.entry}\``);
  if (ui.mediaBase) lines.push(`- 图片下载地址：\`${ui.mediaBase}\``);
  lines.push('');
  lines.push('## 概览');
  lines.push('');
  lines.push('| 项目 | 数量 |');
  lines.push('| --- | --- |');
  lines.push(`| 依赖文件 | ${res.counts.total} |`);
  lines.push(`| 缺失 | ${res.counts.missing} |`);
  lines.push(`| 已存在相同 | ${res.counts.identical} |`);
  lines.push(`| 已存在不同 | ${res.counts.modified} |`);
  lines.push(`| 媒体待下载 | ${res.mediaCounts.download || 0} |`);
  lines.push('');

  const groups = {};
  for (const it of allRows.value) (groups[it.group] = groups[it.group] || []).push(it);
  for (const g of GROUP_ORDER) {
    if (!groups[g]) continue;
    lines.push(`## ${GROUP_LABEL[g]}（${groups[g].length}）`);
    lines.push('');
    lines.push('| 状态 | 路径 | 大小 | 引用来源 |');
    lines.push('| --- | --- | --- | --- |');
    for (const it of groups[g]) {
      const st = STATUS_META[it.status]?.label || it.status;
      lines.push(`| ${st} | \`${it.display}\` | ${it.size || '-'} | \`${it.via || it.refFrom || '入口'}\` |`);
    }
    lines.push('');
  }
  if (res.unresolved.length) {
    lines.push('## 未解析引用');
    lines.push('');
    for (const u of res.unresolved) lines.push(`- \`${u.target}\` ← \`${u.refFrom}\``);
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${Date.now()}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
