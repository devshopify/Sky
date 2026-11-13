<script setup>
import { computed } from 'vue';
import { ui, siteB, exportSiteZip } from '../composables/useMigration.js';

const res = computed(() => ui.result);

const failedDownloads = computed(() => (res.value && res.value.downloads ? res.value.downloads.results.filter((r) => !r.ok) : []));

function humanSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function close() {
  ui.result = null;
}

const isZipMode = computed(() => res.value && res.value.savedTo === 'zip');
</script>

<template>
  <div v-if="res" class="modal" @click.self="close">
    <div class="modal-box narrow">
      <div class="modal-head">
        <h3>{{ res.failed.length || (res.downloads && res.downloads.failed) ? '执行完成（有失败项）' : '执行完成' }}</h3>
        <button class="btn-icon" @click="close">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="res-section-title">主题文件</div>
        <div class="stat-line"><span>成功</span><b class="ok">{{ res.copied.length }}</b></div>
        <div class="stat-line"><span>失败</span><b :class="{ danger: res.failed.length }">{{ res.failed.length }}</b></div>
        <div v-for="f in res.failed" :key="f.rel" class="stat-line">
          <span class="mono-small">{{ f.rel }}</span><b class="danger">{{ f.reason }}</b>
        </div>

        <template v-if="res.downloads">
          <div class="res-section-title">媒体下载</div>
          <div class="stat-line"><span>成功</span><b class="ok">{{ res.downloads.success }}</b></div>
          <div class="stat-line"><span>失败</span><b :class="{ danger: res.downloads.failed }">{{ res.downloads.failed }}</b></div>
          <div class="stat-line"><span>总大小</span><b>{{ humanSize(res.downloads.totalSize) }}</b></div>
          <div v-for="d in failedDownloads" :key="d.name" class="stat-line">
            <span class="mono-small">{{ d.name }}</span><b class="danger">{{ d.reason }}</b>
          </div>
        </template>

        <div v-if="isZipMode && res.zipName" class="path-box">
          已生成增量包：{{ res.zipName }}<br />
          <span class="muted">解压覆盖到 B 站主题根即可；<code>_downloads/</code> 里的图片是需要上传到后台 Files 的。</span>
        </div>
        <div v-else-if="!isZipMode" class="path-box">
          已直接写入目标站点的主题目录。
        </div>
      </div>

      <div class="modal-foot">
        <span class="muted">{{ ui.mediaBase }}</span>
        <div class="row-gap">
          <button v-if="siteB && siteB.reader.kind === 'memory'" class="btn-ghost" @click="exportSiteZip">
            导出整个站点 zip
          </button>
          <button class="btn-primary" @click="close">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>
