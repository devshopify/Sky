<script setup>
import { computed, ref } from 'vue';
import { siteA, siteB, chooseFolder, loadZip, clearSite } from '../composables/useMigration.js';

const props = defineProps({ which: { type: String, required: true } });

const site = computed(() => (props.which === 'A' ? siteA.value : siteB.value));
const dragging = ref(false);
const fileInput = ref(null);

const THEME_DIRS = ['assets', 'sections', 'snippets', 'templates', 'layout', 'config', 'blocks', 'locales'];

const dirSummary = computed(() => {
  if (!site.value) return '';
  return Object.entries(site.value.stats.byDir)
    .filter(([k]) => THEME_DIRS.includes(k))
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
});

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function onDrop(e) {
  dragging.value = false;
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) loadZip(props.which, file);
}

function onFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (file) loadZip(props.which, file);
  e.target.value = '';
}
</script>

<template>
  <section class="block">
    <div class="block-head">
      <span class="dot" :class="which === 'A' ? 'dot-a' : 'dot-b'" />
      <h2>{{ which === 'A' ? '源站点 A' : '目标站点 B' }}</h2>
      <button v-if="site" class="link-btn tiny" @click="clearSite(which)">重新选择</button>
    </div>

    <template v-if="!site">
      <div class="pick-row">
        <button class="btn-ghost wide" @click="chooseFolder(which)">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h6l2 2h10v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z" /></svg>
          选择主题文件夹
        </button>
      </div>
      <div
        class="dropzone"
        :class="{ dragover: dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
        @click="fileInput.click()"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        <span>或拖入 / 选择 zip</span>
      </div>
      <input ref="fileInput" type="file" accept=".zip" hidden @change="onFileChange" />
      <div class="site-status">
        <span class="muted">{{ which === 'A' ? '选 A 站主题根目录' : '选 B 站主题根目录，可授权写入' }}</span>
      </div>
    </template>

    <template v-else>
      <div class="site-loaded" :title="site.label">
        <span class="site-name">{{ site.label }}</span>
        <span v-if="site.reader.kind === 'fsa'" class="tag-fsa">目录</span>
        <span v-else class="tag-zip">zip</span>
        <span v-if="site.canWrite && site.reader.kind === 'fsa'" class="tag-write">可写入</span>
      </div>
      <div class="site-status">
        <span class="ok-mark">✓</span> {{ site.stats.total }} 个文件 · {{ humanSize(site.stats.totalSize) }}<br />
        <span class="muted">{{ dirSummary || '—' }}</span>
        <template v-if="site.nested">
          <br /><span class="muted">主题根：<code>{{ site.themeRootName }}</code></span>
        </template>
      </div>
    </template>
  </section>
</template>
