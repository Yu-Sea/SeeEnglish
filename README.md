# SeeEnglish · 见词

一个本地优先的英语语言索引。记下遇见的单词、它出现的句子，以及只属于你的理解。

没有每日任务，没有标准答案。你学到什么，就记什么；记了什么，就复习什么。数据保存在本机 SQLite 数据库里，不需要账号，也不会上传到云端。

当前版本：`0.6.0`

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web UI | React 19 + TypeScript + Vite |
| 桌面 UI | React 19 + TypeScript + Vite + Electron |
| 本地 API | Python + FastAPI |
| 数据 | SQLite（Python 标准库） |
| 字体 | Manrope + Newsreader（本地打包） |

Web UI 和桌面 UI 共用同一个 FastAPI 服务、同一个 SQLite 数据库，不存在两套数据或同步逻辑。

## 环境要求

- Windows 10 / 11（开发本身也支持其他能运行 Python、Node.js 的系统）
- Python 3.11 或更高
- Node.js 20 或更高
- npm

## 从源码运行

以下命令在项目根目录执行。

### 1. Python 环境

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

如果 PowerShell 禁止执行脚本，可以直接使用绝对路径：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 2. 构建前端

```powershell
npm --prefix web install
npm --prefix web run build

npm --prefix gui install
npm --prefix gui run build
```

### 3. 启动

```powershell
.\.venv\Scripts\python.exe app.py --open
```

浏览器会打开：

```text
http://127.0.0.1:8765
```

默认地址：

```text
Web UI     http://127.0.0.1:8765/
GUI        http://127.0.0.1:8765/gui/
Local API  http://127.0.0.1:8765/api
API Docs   http://127.0.0.1:8765/docs
OpenAPI    http://127.0.0.1:8765/openapi.json
```

常用参数：

```powershell
.\.venv\Scripts\python.exe app.py --port 9000 --open
.\.venv\Scripts\python.exe app.py --host 0.0.0.0 --port 9000
```

`--host 0.0.0.0` 会把开发服务暴露到局域网。API 没有内置鉴权，公开发布前请自行加反向代理、鉴权和 HTTPS。

### 4. 启动桌面 GUI

先保持 API 运行，另开一个终端：

```powershell
npm --prefix gui run desktop
```

`desktop` 会重新构建 GUI 并启动 Electron。Electron 主进程检测不到 API 时，也会尝试通过项目根目录的 `.venv` 启动 `app.py`。

只调试 React 界面：

```powershell
npm --prefix gui run dev
```

Vite 开发地址是 `http://127.0.0.1:5174/`，`/api` 会代理到 `8765`。

## API

API 是开放的本地 HTTP API，适合外部脚本、编辑器插件和 AI 工具接入。

- 静态文档：[site/docs.html](site/docs.html)
- 服务运行后：`http://127.0.0.1:8765/docs`
- OpenAPI JSON：`http://127.0.0.1:8765/openapi.json`

```text
Base URL   http://127.0.0.1:8765/api
格式       JSON
鉴权       无（仅本机）
CORS       localhost / 127.0.0.1
```

主要能力：

- 词库：读取、新建、修改、删除
- 词条：读取、搜索、词形匹配、新建、补充、修改、归档、删除
- 复习：随机取词、提交结果、总览和分数
- 数据：导入 / 导出 JSON
- 统计：词库摘要、个人进度和 30 天趋势

示例：

```powershell
Invoke-RestMethod http://127.0.0.1:8765/api/health
Invoke-RestMethod "http://127.0.0.1:8765/api/words?library_id=1&limit=20"
Invoke-RestMethod "http://127.0.0.1:8765/api/words/match?q=apples&library_id=1"
```

新建词条：

```powershell
Invoke-RestMethod "http://127.0.0.1:8765/api/words?library_id=1" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"word":"serendipity","note":"意外的发现","sentence":"It was pure serendipity.","related_ids":[]}'
```

外部 AI 接入时，建议先通过 `/api/libraries` 和 `/api/words` 读取上下文，再通过写接口保存结果；复习接口可以读取 `review/next` 并使用 `review/{id}` 提交结果。所有读写都直接落在本地数据库，不需要中间同步层。

## 目录

```text
SeeEnglish/
├─ app.py                  # CLI 启动器，启动 FastAPI 并托管前端
├─ requirements.txt
├─ server/                 # FastAPI、SQLite、复习与匹配逻辑
├─ web/                    # Web React UI
├─ gui/                    # 桌面 React UI + Electron 主进程
│  ├─ src/
│  └─ electron/
├─ site/                   # 官方静态网站（介绍 / 下载 / 文档）
├─ assets/                 # 品牌图标和应用图标
├─ packaging/              # 本地安装包构建脚本，构建产物不提交
├─ _local/                 # 本地草稿、截图、旧文档、测试文件，不进入 Git
└─ .gitignore
```

## 本地安装包

安装包构建属于本地开发流程，不建议提交发布文件。

需要额外安装 PyInstaller：

```powershell
.\.venv\Scripts\python.exe -m pip install pyinstaller
```

然后执行：

```powershell
powershell -ExecutionPolicy Bypass -File packaging\build-installer.ps1
```

产物在 `gui/release/`，已经加入 `.gitignore`，不会进入 GitHub 提交。

## 静态网站

`site/` 是不需要构建的静态站点，可以直接部署到 GitHub Pages：

- `site/index.html`：产品介绍
- `site/download.html`：Windows 下载页
- `site/docs.html`：使用文档和 API 文档

保留 `site/.nojekyll`，把 `site/` 里的文件作为静态站点根目录上传即可。

## GitHub 上传范围

提交前可以直接查看：

```powershell
git status
```

以下内容不会进入 Git：

- `.venv/`
- `web/node_modules/`、`gui/node_modules/`
- `web/dist/`、`gui/dist/`
- `gui/release/`
- `data/`
- `_local/`

源码、`packaging/` 构建脚本、`site/` 静态网站和文档会正常提交。

## 检查

```powershell
.\.venv\Scripts\python.exe -m compileall server app.py

npm --prefix web run build
npm --prefix gui run build
```

## 数据

默认数据库：

```text
data/seeenglish.db
```

首次启动时自动创建；删除该文件即可得到一份全新的空白词库。词条、复习记录和设置都保存在这里。
