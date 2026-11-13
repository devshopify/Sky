<script setup>
import { computed } from 'vue';
import { analysis } from '../composables/useMigration.js';

const cells = computed(() => {
  const res = analysis.value;
  if (!res) return [];
  const c = res.counts;
  const mc = res.mediaCounts || { download: 0 };
  return [
    { label: '依赖文件', value: c.total, cls: '' },
    { label: '缺失 · 需搬迁', value: c.missing, cls: 'missing' },
    { label: '冲突 · 内容不同', value: c.modified, cls: 'modified' },
    { label: '已存在 · 相同', value: c.identical, cls: 'identical' },
    { label: '媒体 · 待下载', value: mc.download || 0, cls: 'download' },
    { label: '未解析引用', value: res.unresolved.length, cls: 'external' },
  ];
});
</script>

<template>
  <div class="summary">
    <div v-for="c in cells" :key="c.label" class="sum-cell" :class="[c.cls, { zero: !c.value }]">
      <div class="sum-label">{{ c.label }}</div>
      <div class="sum-value">{{ c.value }}</div>
    </div>
  </div>
</template>
