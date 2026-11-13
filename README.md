# Shopify 资源搬迁分析

把 A 站点的某个 JSON 搬到 B 站点之前，先看清楚它到底牵出了哪些文件。

选中 A 站的一个模板 JSON，工具会顺着 Shopify 的引用结构展开 `template → section → snippet`，
逐个检查 B 站是否已有；同时把 JSON 里 `shopify://` 引用的图片按你给的 CDN 地址拼接下载。
最后给出一个可勾选的表格，确认后才动文件。

**纯前端运行**：所有解析都在浏览器里完成，主题文件不会上传到任何服务器。

## 在线使用

构建产物是纯静态文件，部署到任意静态托管即可（Vercel / Netlify / GitHub Pages / 对象存储）。
打开网址就能用。

## 本地运行

```bash
npm install
npm run dev        # 开发模式 http://localhost:5173
npm run build      # 产出 dist/
npm run preview    # 预览构建结果
```

## 使用步骤

1. **载入 A 站**：点「选择主题文件夹」，或在卡片里拖入主题的 zip。
2. **载入 B 站**：同上。Chrome / Edge 会询问是否允许写入，允许后可直接把文件写进 B 站目录；
   不允许（或拖的是 zip）时，执行结果会打包成一个增量 zip 给你。
3. **填图片来源地址**：例如 `https://es.dreametech.com/cdn/shop/files/`。
   JSON 里 `shopify://shop_images/a2-bg.jpg` 会拼成
   `https://es.dreametech.com/cdn/shop/files/a2-bg.jpg` 然后下载。
4. **选入口 JSON**：左侧列表点选，或搜索框输入路径回车。
5. **看表格、勾选、执行**：缺失和待下载默认勾上，冲突默认不勾（避免误覆盖）。

想看效果可以在首页点「载入示例」。

## 分析范围

默认只关心两类，其余目录（css / js / 字体 / 子 JSON）不纳入：

| 类型 | 处理方式 |
| --- | --- |
| **liquid**（section / snippet / layout） | 顺着 `{% render %}` `{% section %}` 递归展开，逐个比对 B 站 |
| **媒体**（图片 / 视频 / 音频） | A 站 `assets/` 里有同名文件 → 走文件比对；只有 CDN 地址 → 标记「待下载」 |

入口 JSON 自身始终在清单里。

## 四种结果

- **缺失** —— B 站没有，需要搬迁（默认勾选）
- **待下载** —— 图片在 CDN / Files 上，执行时按地址下载并打包
- **冲突** —— B 站有同名文件但内容不同（大小 + SHA-256 判定），默认不勾
- **已存在** —— 内容完全一致，不需要动

另有单独列出、不自动处理的：App 嵌入块、外部链接、`{% render some_var %}` 这类动态引用。

## 执行后拿到什么

- **B 站目录已授权写入**：文件直接写进去，并自动重新扫描 B 站。
- **拖的是 zip / 未授权写入**：生成 `migration-<模板名>-<时间戳>.zip`，解压覆盖到 B 站主题根即可。
  下载的图片放在包内 `_downloads/`，需要你上传到 B 站后台 **Files**，保持同名，
  JSON 里的 `shopify://shop_images/xxx.jpg` 就会直接生效。

## 浏览器要求

| 功能 | Chrome / Edge | Safari | Firefox |
| --- | --- | --- | --- |
| 选择文件夹 | ✅ | 部分版本 | ❌ |
| 拖入 zip | ✅ | ✅ | ✅ |
| 直接写回目录 | ✅ | 部分版本 | ❌ |

不支持目录选择的浏览器会自动降级为 zip 模式。

## 开发

```
src/core/           纯逻辑，不依赖 Node 或 DOM
  indexer.js        扫描站点、推断主题根、建索引
  resolver.js       依赖图展开（BFS）
  parsers/          json / liquid / css / js 各自的引用解析
  compare.js        A/B 比对（SHA-256）
  downloader.js     CDN 拼接与并发下载
  fsa-reader.js     两种 IO 实现：File System Access / 内存
src/composables/    状态与流程编排
src/components/     界面
server/node-reader.js  Node 环境下的 IO（跑测试用）
```

核心层不直接碰文件系统，读文件统一走 reader 接口，所以同一套解析逻辑在浏览器和 Node 里都能跑。

```bash
npm test    # 用 test/fixtures 里的 A/B 主题跑断言
```

## 已知边界

- `locales/*.schema.json` 里的翻译 key 不在解析范围内。搬的 section 若用了 `"t:"` 翻译，
  记得同步语言文件。
- `settings_data.json` 这类店铺配置不会被分析。
- JS 里拼接太深的路径抓不到——这也是默认不分析 js 的原因之一。
