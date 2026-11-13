<script setup>
import { ui } from '../composables/useMigration.js';

function onInput(e) {
  ui.mediaBase = e.target.value;
  localStorage.setItem('migrator.media', ui.mediaBase);
}
</script>

<template>
  <section class="block">
    <div class="block-head">
      <span class="dot dot-media" />
      <h2>图片来源地址</h2>
    </div>
    <input
      :value="ui.mediaBase"
      type="text"
      placeholder="https://es.dreametech.com/cdn/shop/files/"
      spellcheck="false"
      @input="onInput"
    />
    <div class="site-status">
      <span class="muted">JSON 里 shopify:// 的图片会拼到此地址下载</span>
    </div>
  </section>
</template>
