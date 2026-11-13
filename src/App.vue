<script setup>
import { computed, onMounted } from 'vue';
import {
  siteA, siteB, analysis, ui, runAnalyze, exportReport, loadDemo, execute,
} from './composables/useMigration.js';
import SiteCard from './components/SiteCard.vue';
import MediaSourceCard from './components/MediaSourceCard.vue';
import EntryList from './components/EntryList.vue';
import SummaryBar from './components/SummaryBar.vue';
import ResultToolbar from './components/ResultToolbar.vue';
import ResultTable from './components/ResultTable.vue';
import ExtrasPanel from './components/ExtrasPanel.vue';
import ActionBar from './components/ActionBar.vue';
import ResultDialog from './components/ResultDialog.vue';

const canAnalyze = computed(() => Boolean(siteA.value && siteB.value && ui.entry && !ui.busy));
const hasResult = computed(() => Boolean(analysis.value));

onMounted(async () => {
  const q = new URLSearchParams(location.search);
  if (q.get('demo') !== '1') return;

  await loadDemo();

  // 自动化验证钩子：?demo=1&selftest=1 会跑一遍执行流程并把结果写进 title
  if (q.get('selftest') === '1') {
    if (!ui.mediaBase) ui.mediaBase = './demo/';
    await new Promise((r) => setTimeout(r, 400));
    await execute();
    const r = ui.result;
    const dl = r && r.downloads;
    document.title = [
      'SELFTEST',
      `ok=${r ? 1 : 0}`,
      `copied=${r ? r.copied.length : 0}`,
      `copyFail=${r ? r.failed.length : 0}`,
      `dlOk=${dl ? dl.success : 0}`,
      `dlFail=${dl ? dl.failed : 0}`,
      `zips=${r ? r.zips.length : 0}`,
      `err=${ui.error || '-'}`,
    ].join(' ');
  }
});
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="logo">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7h11l-2.5 3.5L15 14H4z" /><path d="M4 4v16" />
        </svg>
      </span>
      <div>
        <h1>Shopify 资源搬迁分析</h1>
        <p>解析 JSON 依赖 → 对比目标站点 → 勾选搬迁</p>
      </div>
    </div>
    <div class="topbar-right">
      <span class="env">纯前端 · 文件不出本机</span>
    </div>
  </header>

  <main class="layout">
    <aside class="sidebar">
      <SiteCard which="A" />
      <SiteCard which="B" />
      <MediaSourceCard />
      <EntryList />

      <div class="sidebar-foot">
        <button class="btn-primary" :disabled="!canAnalyze" @click="runAnalyze">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="m13 2-9 12h7l-1 8 9-12h-7z" /></svg>
          {{ ui.busy && ui.busyText.includes('解析') ? '分析中…' : '开始分析' }}
        </button>
      </div>
    </aside>

    <section class="content">
      <div v-if="!hasResult" class="empty-state">
        <div class="empty-art">
          <svg viewBox="0 0 120 90" width="120" height="90" fill="none" stroke="currentColor" stroke-width="1.4">
            <rect x="8" y="18" width="42" height="54" rx="4" />
            <rect x="70" y="18" width="42" height="54" rx="4" />
            <path d="M50 45h20" stroke-dasharray="3 3" />
            <path d="m64 40 6 5-6 5" />
            <path d="M17 30h24M17 38h18M17 46h24M17 54h14" opacity=".45" />
            <path d="M79 30h24M79 38h18M79 46h24M79 54h14" opacity=".45" />
          </svg>
        </div>
        <h2>选一个 JSON，看看它牵出多少文件</h2>
        <p>工具会顺着 Shopify 模板结构往下钻：section → snippet，再和 B 站逐个比对；图片按你给的 CDN 地址拼接下载。</p>
        <ul class="empty-list">
          <li><b>1</b> 选择 A、B 两个主题文件夹（或拖入 zip）</li>
          <li><b>2</b> 在左侧选中要搬的 JSON</li>
          <li><b>3</b> 查看对比表格，勾选确认后执行</li>
        </ul>
        <p v-if="!ui.pickerSupport" class="browser-warn">
          当前浏览器不支持选择文件夹，请使用 Chrome / Edge，或把主题目录压缩成 zip 拖进来。
        </p>
        <button class="btn-ghost demo-btn" @click="loadDemo">载入示例看看效果</button>
      </div>

      <template v-else>
        <SummaryBar />
        <ResultToolbar @export="exportReport" />
        <div class="scroll-area">
          <ResultTable />
          <ExtrasPanel />
        </div>
      </template>
    </section>
  </main>

  <ActionBar v-if="hasResult" />
  <ResultDialog />

  <div v-if="ui.toast" class="toast show" :class="{ err: ui.toastType === 'error' }">{{ ui.toast }}</div>

  <div v-if="ui.busy" class="busy-overlay">
    <div class="busy-box">
      <span class="spinner" />
      <span>{{ ui.busyText || '处理中…' }}</span>
    </div>
  </div>
</template>
