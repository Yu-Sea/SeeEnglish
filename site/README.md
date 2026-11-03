# SeeEnglish 静态官网页

这是 SeeEnglish 的独立静态官网版本，位于项目的 `site/` 目录。

它和本地应用完全隔离：

- 没有后端
- 没有 API
- 没有构建步骤
- 没有外部字体或脚本请求
- 不需要数据库
- 可以直接上传到任何静态服务器

## 页面内容

现在官网由三个静态页面组成：

1. **index.html**：介绍页
   - 顶部品牌、介绍 / 下载 / 文档导航、GitHub 个人主页入口
   - 首屏下载入口，指向下载页
   - 原有的产品介绍、体验和功能内容继续保留
   - 底部是使用文档入口、联系我们和站点页脚
2. **download.html**：下载页
   - Windows 安装包下载按钮
   - 安装包版本、大小、系统要求
   - 安装步骤、数据说明和 SmartScreen 提示
3. **docs.html**：文档页
   - 标准文档布局，左侧目录、右侧本页目录
   - 安装、记词、复习、词库、个人设置、导入导出
   - 本地 API 约定、接口表、curl 示例和常见问题

## 本地预览

最简单的方式：直接双击 `index.html`。

也可以在本目录运行：

```powershell
python -m http.server 8899
```

然后访问 `http://127.0.0.1:8899`。

## 部署

这是纯静态站点，可以直接把 `site/` 里面的所有文件上传到 GitHub Pages、对象存储或任意静态服务器。

GitHub Pages：

- 把 `site/` 里的内容放到仓库根目录，或放到 Pages 发布目录
- 保留 `.nojekyll`
- `index.html` 会自动作为首页

目录结构：

```text
/
├─ index.html
├─ download.html
├─ docs.html
├─ official.css
├─ base.css
├─ styles.css
├─ site-v2.css
├─ app.js
├─ review-demo.js
├─ robots.txt
├─ .nojekyll
└─ assets/
```

所有站内链接都使用相对路径，不依赖域名或构建工具。

这是一个静态单页站点，不需要 Node、Python 或反向代理。

## 文件说明

```text
site/
├─ index.html          # 页面结构、产品文案和所有章节
├─ styles.css          # 基础官网样式
├─ site-v2.css         # 2026 版新增章节、复习演示、个人中心和功能详情
├─ base.css            # 从应用 design system 复制的基础样式
├─ app.js              # 导航、滚动、记词演示、演示词库、复制地址
├─ review-demo.js      # 复习演示：回想、翻开、自评、结算
├─ robots.txt
├─ .nojekyll
└─ assets/
   ├─ favicon.svg
   └─ fonts/           # 本地打包字体，不依赖 Google Fonts
```

## 修改入口

- **首页与章节文案**：`index.html`
- **复习演示状态和分数**：`review-demo.js`
- **记词演示匹配规则**：`app.js` 里的 `lemmaCandidates`、`findMatches`
- **演示词库**：`app.js` 里的 `SAMPLE_ENTRIES`
- **颜色 / 字体 / 圆角**：`base.css` 的 `:root`
- **官网页专属布局**：`styles.css` 与 `site-v2.css`
- **GitHub 地址**：
  - `index.html` 里的 `https://github.com/Yu-Sea/SeeEnglish`
  - `app.js` 里 `const url = 'https://github.com/Yu-Sea/SeeEnglish'`

> 如果应用的 `web/src/styles.css` 后续改版，可以重新复制到 `base.css`，再检查 `styles.css` 里对应的覆盖样式。

## 设计说明

- UI 组件不使用渐变，渐变只出现在固定环境背景
- 液态玻璃由透明底色、细边框、模糊和阴影组成
- 桌面端与移动端共用同一套视觉语言
- 支持 `prefers-reduced-motion`
- 所有交互都在浏览器内完成，不上传任何输入
- 品牌 S 标记、字标和颜色也保留在项目根目录的 `assets/brand/`

## 源码地址

GitHub 仓库目前还没有正式建立，地址先按项目名保留：

https://github.com/Yu-Sea/SeeEnglish

正式仓库建立后，直接使用这个地址即可，不需要再改页面。
