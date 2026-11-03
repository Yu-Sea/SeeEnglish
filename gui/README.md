# SeeEnglish Desktop

桌面端源码。Electron 承载 React 界面，数据来自项目根目录的 FastAPI / SQLite 服务。

## 技术

- Electron 45
- React 19 + TypeScript + Vite
- 与 Web 版共用同一个本地 API 和同一个 SQLite 数据库
- 系统托盘、关闭窗口行为设置、启动预加载和沉浸模式

## 开发

在项目根目录：

```powershell
npm --prefix gui install
npm --prefix gui run build
```

启动 API：

```powershell
.\.venv\Scripts\python.exe app.py
```

另开一个终端启动 Electron：

```powershell
npm --prefix gui run desktop
```

`desktop` 会重新构建并启动 Electron；Electron 检测不到 API 时，会尝试通过根目录的 `.venv` 启动 `app.py`。

只调试 React 界面：

```powershell
npm --prefix gui run dev
```

Vite 开发地址是 `http://127.0.0.1:5174/`，`/api` 会代理到 `8765`。

## 目录

```text
gui/
├─ src/                  # React 页面、组件和 API 客户端
├─ electron/
│  ├─ main.cjs           # 主进程、窗口、托盘、API 生命周期
│  ├─ preload.cjs        # 关闭行为设置桥接
│  ├─ splash.html        # 启动预加载页
│  └─ tray.png           # 托盘图标
├─ public/               # favicon
├─ package.json
└─ vite.config.ts
```

## 本地安装包

安装包属于本地开发产物，不提交到 GitHub。构建脚本在项目根目录的 `packaging/`。

```powershell
.\.venv\Scripts\python.exe -m pip install pyinstaller
powershell -ExecutionPolicy Bypass -File packaging\build-installer.ps1
```

产物在 `gui/release/`，已被 `.gitignore` 排除。
