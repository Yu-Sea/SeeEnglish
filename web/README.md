# SeeEnglish Web

浏览器端 React UI。

## 开发

在项目根目录：

```powershell
npm --prefix web install
npm --prefix web run dev
```

Vite 开发地址是 `http://127.0.0.1:5173/`，`/api` 会代理到 `8765`。先启动本地 API：

```powershell
.\.venv\Scripts\python.exe app.py
```

## 构建

```powershell
npm --prefix web run build
```

构建产物在 `web/dist/`，由 FastAPI 在 `/` 提供。

## 目录

```text
web/src/
├─ pages/          # 记词、复习、词库、个人
├─ components/     # 导航、背景、匹配面板、关联词选择
├─ api.ts          # 本地 API 客户端
├─ types.ts
├─ preferences.ts
└─ navigation.ts
```

Web 端和桌面端共用同一个 FastAPI 服务和同一个 SQLite 数据库。
