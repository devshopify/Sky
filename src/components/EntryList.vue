<script setup>
import { computed, ref } from 'vue';
import { siteA, ui, setEntry, toast } from '../composables/useMigration.js';

const kw = ref('');

const filtered = computed(() => {
  if (!siteA.value) return [];
  const k = kw.value.trim().toLowerCase();
  const all = siteA.value.entries;
  return (k ? all.filter((e) => e.rel.toLowerCase().includes(k)) : all).slice(0, 400);
});

const more = computed(() => {
  if (!siteA.value) return 0;
  const k = kw.value.trim().toLowerCase();
  const total = k ? siteA.value.entries.filter((e) => e.rel.toLowerCase().includes(k)).length : siteA.value.entries.length;
  return Math.max(0, total - 400);
});

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function pick(rel) {
  setEntry(rel);
  kw.value = '';
}

function onEnter() {
  if (!siteA.value) return;
  const v = kw.value.trim();
  if (!v) return;
  const low = v.toLowerCase();
  const hit =
    siteA.value.entries.find((x) => x.rel.toLowerCase() === low) ||
    siteA.value.entries.find((x) => x.rel.toLowerCase().endsWith(low));
  if (hit) pick(hit.rel);
  else toast('A 站里找不到这个文件', 'error');
}
</script>

<template>
  <section class="block grow">
    <div class="block-head">
      <span class="dot dot-entry" />
      <h2>要搬迁的 JSON</h2>
    </div>

    <div class="entry-search">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7" /><path d="m20 20-4.3-4.3" /></svg>
      <input v-model="kw" type="text" placeholder="搜索文件，或输入路径后回车" spellcheck="false" @keydown.enter="onEnter" />
    </div>

    <div v-if="ui.entry" class="picked">
      <span :title="ui.entry">{{ ui.entry }}</span>
      <button title="清除选择" @click="setEntry(null)">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>

    <div class="entry-list">
      <div v-if="!siteA" class="empty-hint">先载入源站点 A</div>
      <div v-else-if="!filtered.length" class="empty-hint">没有匹配的文件</div>
      <template v-else>
        <div
          v-for="e in filtered"
          :key="e.rel"
          class="entry-item"
          :class="{ active: ui.entry === e.rel }"
          :title="e.rel"
          @click="pick(e.rel)"
        >
          <span>{{ e.rel }}</span>
          <span class="sz">{{ humanSize(e.size) }}</span>
        </div>
        <div v-if="more" class="empty-hint">还有 {{ more }} 个，请继续输入缩小范围</div>
      </template>
    </div>
  </section>
</template>
