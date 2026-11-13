# Shopify 资源搬迁分析

把 A 站点的某个 JSON 搬到 B 站点之前，先看清楚它牵出了哪些 liquid 文件、引用了哪些图片。

给定两个主题仓库，选中 A 站的一个 JSON，工具会顺着 Shopify 的引用结构展开：
`template → section → snippet`，逐个检查 B 站是否已有；同时把 JSON 里 `shopify://`
引用的图片、视频按你给的 CDN 地址拼接下载。最后给出一个可勾选的表格，确认后才动文件。

## 启动

```bash
node server.js
```

浏览器打开 http://localhost:4321 （零依赖，不需要 npm install）

## 使用

1. **填两个仓库路径**——指到主题根（含 `assets/` `sections/` `templates/` 的那一层），
   指到仓库外层也行，会自动往下找到主题根。也可以「从 Git 仓库拉取」浅克隆，或拖入 zip。
2. **填图片来源地址**——比如 `https://es.dreametech.com/cdn/shop/files/`。
   JSON 里 `shopify://shop_images/a2-bg.jpg` 会被拼成
   `https://es.dreametech.com/cdn/shop/files/a2-bg.jpg` 然后下载。
3. **选入口 JSON**——左侧列表点选，或搜索框输入路径回车。
4. **看表格、勾选、执行**——缺失和待下载默认勾上，冲突默认不勾（避免误覆盖）。

## 分析范围

默认只关心两类，其余目录（css / js / 字体 / 子 JSON）暂时不纳入：

| 类型 | 处理方式 |
| --- | --- |
| **liquid**（section / snippet / layout） | 顺着 `{% render %}` `{% section %}` 递归展开，逐个比对 B 站 |
| **媒体**（图片 / 视频 / 音频） | 在 A 站 `assets/` 里有同名文件 → 走文件比对；只有 CDN 地址 → 标记「待下载」 |

入口 JSON 自身始终在清单里（它也要复制到 B 站）。

## 四种结果

- **缺失** —— B 站没有，需要搬迁（默认勾选）
- **待下载** —— 图片在 CDN / Files 上，执行时按地址下载到 `data/downloads/<批次>/`
- **冲突** —— B 站有同名文件但内容不同（size + md5 判定），默认不勾，需你决定是否覆盖
- **已存在** —— B 站有且内容完全一致，不需要动

另有单独列出、不自动处理的：App 嵌入块、外部链接、`{% render some_var %}` 这类动态引用。

## 图片下载

- 地址拼接：`基地址` + 文件名，基地址末尾有无 `/` 都行，中文和空格会自动转义
- 并发 4 个，单个超时 60 秒，404 会单独标红并给出原因
- 下载目录：`data/downloads/<批次号>/`，文件名保持原样
- 下载完把图片传到 B 站后台 **Files**，保持同名，JSON 里的 `shopify://shop_images/xxx.jpg` 就能直接生效

## 安全

- 覆盖前把 B 站原文件复制到 `data/backup/<批次号>/`，并记 manifest
- 执行完可以点「撤销本次搬迁」：覆盖的还原、新建的删除
- 只写主题目录内的相对路径，越界路径直接拒绝

## 已知边界

- `locales/*.schema.json` 里的翻译 key 不在解析范围内。搬的 section 若用了 `"t:"` 翻译，
  记得同步语言文件。
- `settings_data.json` 这类店铺配置不会被分析。
- JS 里拼接太深的路径抓不到——这也是默认不分析 js 的原因之一。

## 自测

```bash
node test/run.js                              # 默认入口，含断言
node test/run.js assets/a2-3000-specs.json    # 换成自定义入口
```

`test/fixtures/` 下是一对构造好的 A/B 主题，覆盖同名相同、同名不同、缺失、
二级依赖、外部 Files、CDN 拼接等场景。
