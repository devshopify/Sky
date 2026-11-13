<script setup>
import { computed, ref } from 'vue';
import { analysis } from '../composables/useMigration.js';

const open = ref({ ext: true, unres: false, dyn: false });

const res = computed(() => analysis.value);

const kindLabel = {
  app: 'App 嵌入',
  'global-asset': 'Shopify 内置',
  'cdn-asset': 'CDN 资源',
  'external-url': '外部链接',
};

const kindHint = {
  app: '由 App 生成，无需搬迁',
  'global-asset': 'Shopify 全局资源，无需搬迁',
  'cdn-asset': 'CDN 上的资源，视需要手动处理',
  'external-url': '外部链接，视需要手动处理',
};
</script>

<template>
  <div v-if="res && res.externals.length" class="extra">
    <div class="extra-head" @click="open.ext = !open.ext">
      <h3>其他外部引用</h3><span class="cnt">{{ res.externals.length }}</span>
      <span class="caret" :class="{ closed: !open.ext }">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6" /></svg>
      </span>
    </div>
    <div v-show="open.ext" class="extra-body">
      <div v-for="e in res.externals" :key="e.kind + e.name" class="ext-row">
        <div class="ext-kind">{{ kindLabel[e.kind] || e.kind }}</div>
        <div class="ext-name" :title="e.name || e.raw">{{ e.name || e.raw }}</div>
        <div class="ext-hint">{{ kindHint[e.kind] || '' }} · {{ e.refFrom }}</div>
      </div>
    </div>
  </div>

  <div v-if="res && res.unresolved.length" class="extra">
    <div class="extra-head" @click="open.unres = !open.unres">
      <h3>未解析的引用</h3><span class="cnt">{{ res.unresolved.length }}</span>
      <span class="caret" :class="{ closed: !open.unres }">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6" /></svg>
      </span>
    </div>
    <div v-show="open.unres" class="extra-body">
      <div v-for="u in res.unresolved" :key="u.kind + u.target" class="ext-row">
        <div class="ext-kind">{{ u.kind }}</div>
        <div class="ext-name" :title="u.target">{{ u.target }}</div>
        <div class="ext-hint">找不到对应文件 · {{ u.refFrom }} {{ u.key }}</div>
      </div>
    </div>
  </div>

  <div v-if="res && res.dynamics.length" class="extra">
    <div class="extra-head" @click="open.dyn = !open.dyn">
      <h3>动态引用（需人工确认）</h3><span class="cnt">{{ res.dynamics.length }}</span>
      <span class="caret" :class="{ closed: !open.dyn }">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6" /></svg>
      </span>
    </div>
    <div v-show="open.dyn" class="extra-body">
      <div v-for="d in res.dynamics" :key="d.target" class="ext-row">
        <div class="ext-kind">动态引用</div>
        <div class="ext-name" :title="d.target">{{ d.target }}</div>
        <div class="ext-hint">变量拼接，无法静态解析 · {{ d.refFrom }}</div>
      </div>
    </div>
  </div>

  <div v-if="res && res.notes.length" class="notes">
    <div v-for="(n, i) in res.notes" :key="i" class="note-bar">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></svg>
      <span>{{ n.text }}</span>
    </div>
  </div>
</template>
