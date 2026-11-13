<script setup>
import { computed } from 'vue';
import { ui, GROUP_ORDER } from '../composables/useMigration.js';

const emit = defineEmits(['export']);

const filters = [
  { key: 'all', label: '全部' },
  { key: 'missing', label: '缺失' },
  { key: 'download', label: '待下载' },
  { key: 'modified', label: '冲突' },
  { key: 'identical', label: '已存在' },
];

const allCollapsed = computed(() => ui.collapsed.length >= GROUP_ORDER.length);

function toggleAll() {
  ui.collapsed = allCollapsed.value ? [] : [...GROUP_ORDER];
}
</script>

<template>
  <div class="toolbar">
    <div class="tool-left">
      <div class="segmented">
        <button
          v-for="f in filters"
          :key="f.key"
          :class="{ active: ui.filter === f.key }"
          @click="ui.filter = f.key"
        >{{ f.label }}</button>
      </div>
      <div class="mini-search">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7" /><path d="m20 20-4.3-4.3" /></svg>
        <input v-model="ui.search" type="text" placeholder="过滤路径" spellcheck="false" />
      </div>
    </div>
    <div class="tool-right">
      <button class="btn-ghost" @click="emit('export')">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></svg>
        报告
      </button>
      <button class="btn-ghost" @click="toggleAll">{{ allCollapsed ? '展开全部' : '折叠全部' }}</button>
    </div>
  </div>
</template>
