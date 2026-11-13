<script setup>
import { actionStats, chosenRows, clearSelection, execute, toast, siteB, ui } from '../composables/useMigration.js';

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function onExecute() {
  const { copy, dl } = actionStats.value;
  if (dl.length && !ui.mediaBase.trim()) {
    toast('有媒体需要下载，请先填图片来源地址', 'error');
    return;
  }
  const overwrite = copy.filter((r) => r.status === 'modified').length;
  if (overwrite > 0) {
    const ok = window.confirm(`${overwrite} 个文件在 B 站已存在且内容不同，将被覆盖。\n继续？`);
    if (!ok) return;
  }
  execute();
}

function targetHint() {
  const site = siteB.value;
  if (!site) return '';
  if (site.reader.kind === 'fsa' && site.canWrite) return '直接写入 B 站目录';
  return '打包成 zip 下载（B 站目录未授权写入）';
}
</script>

<template>
  <div class="actionbar">
    <div class="action-info">
      <span>已选 {{ chosenRows.length }} 项</span>
      <span class="sep">·</span>
      <span class="muted">{{ humanSize(actionStats.size) }}</span>
      <span v-if="actionStats.dl.length" class="muted">· 待下载 {{ actionStats.dl.length }}</span>
      <span v-if="actionStats.conflicts" class="warn-text">{{ actionStats.conflicts }} 个冲突项未选</span>
      <span class="target-hint">{{ targetHint() }}</span>
    </div>
    <div class="action-btns">
      <button class="btn-ghost" @click="clearSelection">清空选择</button>
      <button class="btn-primary" :disabled="!chosenRows.length || ui.busy" @click="onExecute">
        执行（复制 {{ actionStats.copy.length }} · 下载 {{ actionStats.dl.length }}）
      </button>
    </div>
  </div>
</template>
