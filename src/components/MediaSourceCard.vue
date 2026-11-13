<script setup>
import { ui } from '../composables/useMigration.js';

/** 各站点图片地址速查页，随应用一起发布 */
const sitesUrl = `${import.meta.env.BASE_URL}sites.html`;

function onBaseInput(e) {
  ui.mediaBase = e.target.value;
  localStorage.setItem('migrator.media', ui.mediaBase);
}

function onZipInput(e) {
  ui.zipName = e.target.value;
  localStorage.setItem('migrator.zipName', ui.zipName);
}
</script>

<template>
  <section class="block">
    <div class="block-head">
      <span class="dot dot-media" />
      <h2>图片与导出</h2>
    </div>

    <div class="field-row">
      <label class="field-label">图片来源地址</label>
      <a class="mini-btn" :href="sitesUrl" target="_blank" rel="noopener">地址链接</a>
    </div>
    <input
      :value="ui.mediaBase"
      type="text"
      placeholder="https://es.dreametech.com/cdn/shop/files/"
      spellcheck="false"
      @input="onBaseInput"
    />

    <label class="field-label">导出 ZIP 名称</label>
    <input
      :value="ui.zipName"
      type="text"
      placeholder="留空则自动命名"
      spellcheck="false"
      maxlength="60"
      @input="onZipInput"
    />

    <div class="site-status">
      <span class="muted">shopify:// 的图片拼此地址下载</span>
    </div>
  </section>
</template>
