const { app, BrowserWindow, dialog, Menu, shell, Tray, nativeImage, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.SEEENGLISH_PORT || 8765);
const DEV_URL = process.env.SEEENGLISH_GUI_DEV || '';
const UI_URL = `http://127.0.0.1:${PORT}/gui/`;

const DATA_DIR = path.join(app.getPath('appData'), 'SeeEnglish');
fs.mkdirSync(DATA_DIR, { recursive: true });
app.setPath('userData', DATA_DIR);
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const BOOT_LOG = path.join(DATA_DIR, 'electron-boot.log');
fs.mkdirSync(path.dirname(BOOT_LOG), { recursive: true });

function boot(message) {
  try {
    fs.appendFileSync(BOOT_LOG, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Logging must never prevent the app from starting.
  }
}

boot(`main loaded; electron=${process.versions.electron}; node=${process.versions.node}; packaged=${app.isPackaged}`);
process.on('uncaughtException', (error) => boot(`uncaught: ${error.stack || error}`));
process.on('unhandledRejection', (error) => boot(`unhandled rejection: ${error}`));

let backendProcess = null;
let backendLog = null;
let ownsBackend = false;
let mainWindow = null;
let tray = null;
let quitting = false;
let closePromptOpen = false;
let settings = readSettings();

function projectRoot() {
  return app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..', '..');
}

function backendRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.resolve(__dirname, '..', '..');
}

function frontendPath(name) {
  return app.isPackaged
    ? path.join(process.resourcesPath, name)
    : path.resolve(__dirname, '..', '..', name, 'dist');
}

function apiUrl() {
  return `http://127.0.0.1:${PORT}`;
}

function readSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const behavior = parsed.closeBehavior;
    return {
      closeBehavior: ['ask', 'tray', 'quit'].includes(behavior) ? behavior : 'ask',
    };
  } catch {
    return { closeBehavior: 'ask' };
  }
}

function writeSettings(next) {
  settings = { closeBehavior: next.closeBehavior };
  try {
    fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  } catch (error) {
    boot(`settings write failed: ${error}`);
  }
}

function healthCheck() {
  return new Promise((resolve) => {
    const request = http.get(`${apiUrl()}/api/health`, { timeout: 1200 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function waitForApi(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthCheck()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function startBackend() {
  const root = backendRoot();
  const packaged = app.isPackaged;
  const executable = packaged
    ? path.join(root, 'SeeEnglishBackend.exe')
    : path.join(root, '.venv', 'Scripts', 'python.exe');
  const args = packaged ? ['--port', String(PORT)] : ['app.py', '--port', String(PORT)];
  const logPath = path.join(DATA_DIR, 'backend.log');
  backendLog = fs.createWriteStream(logPath, { flags: 'a' });

  backendProcess = spawn(executable, args, {
    cwd: packaged ? root : root,
    windowsHide: true,
    env: {
      ...process.env,
      SEEENGLISH_DB: path.join(DATA_DIR, 'seeenglish.db'),
      SEEENGLISH_GUI_DIST: frontendPath('gui'),
      SEEENGLISH_WEB_DIST: frontendPath('web'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  ownsBackend = true;
  backendProcess.stdout.pipe(backendLog);
  backendProcess.stderr.pipe(backendLog);
  backendProcess.on('exit', (code) => {
    if (!quitting) backendLog?.write(`\n[electron] api exited with ${code}\n`);
    backendProcess = null;
  });
}

function stopBackend() {
  if (ownsBackend && backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  backendLog?.end();
  backendLog = null;
  ownsBackend = false;
}

function trayIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tray.png')
    : path.join(__dirname, 'tray.png');
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow().catch((error) => boot(`recreate window failed: ${error}`));
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  mainWindow.setSkipTaskbar(true);
  if (tray) {
    tray.displayBalloon?.({
      title: 'SeeEnglish 仍在运行',
      content: '窗口已缩小到系统托盘，本地 API 和数据继续保留。',
    });
  }
}

function quitApp() {
  quitting = true;
  app.quit();
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '打开 SeeEnglish', click: showWindow },
    { type: 'separator' },
    {
      label: '关闭窗口时',
      submenu: [
        {
          label: '每次询问',
          type: 'radio',
          checked: settings.closeBehavior === 'ask',
          click: () => writeSettings({ closeBehavior: 'ask' }),
        },
        {
          label: '最小化到托盘',
          type: 'radio',
          checked: settings.closeBehavior === 'tray',
          click: () => writeSettings({ closeBehavior: 'tray' }),
        },
        {
          label: '直接退出',
          type: 'radio',
          checked: settings.closeBehavior === 'quit',
          click: () => writeSettings({ closeBehavior: 'quit' }),
        },
      ],
    },
    { type: 'separator' },
    { label: '退出程序', click: quitApp },
  ]);
}

function createTray() {
  if (tray) return;
  const icon = nativeImage.createFromPath(trayIconPath());
  if (icon.isEmpty()) {
    boot(`tray icon missing: ${trayIconPath()}`);
    return;
  }
  tray = new Tray(icon);
  tray.setToolTip('SeeEnglish · 见词');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}

async function askCloseAction() {
  if (!mainWindow || closePromptOpen) return;
  closePromptOpen = true;
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: '关闭 SeeEnglish',
      message: '要缩小到系统托盘，还是退出程序？',
      detail: '缩小后窗口会隐藏，本地 API 和复习数据仍在后台运行。',
      buttons: ['最小化到托盘', '退出程序', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      checkboxLabel: '记住我的选择，以后不再询问',
      checkboxChecked: false,
    });
    if (result.response === 2) return;
    const next = result.response === 0 ? 'tray' : 'quit';
    if (result.checkboxChecked) writeSettings({ closeBehavior: next });
    if (next === 'tray') hideToTray();
    else quitApp();
  } finally {
    closePromptOpen = false;
  }
}

function handleClose(event) {
  if (quitting) return;
  event.preventDefault();
  if (settings.closeBehavior === 'tray') {
    hideToTray();
    return;
  }
  if (settings.closeBehavior === 'quit') {
    quitApp();
    return;
  }
  void askCloseAction();
}

async function createWindow() {
  const SPLASH_MIN_MS = 4500;
  let splashShownAt = null;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1060,
    minHeight: 700,
    show: false,
    title: 'SeeEnglish · 见词',
    backgroundColor: '#eaf5ff',
    autoHideMenuBar: true,
    icon: trayIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    splashShownAt = Date.now();
    mainWindow?.show();
  });
  mainWindow.on('close', handleClose);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(apiUrl())) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Show the main window immediately, with the splash as its first page.
  await mainWindow.loadFile(path.join(__dirname, 'splash.html'));

  const backendReady = (async () => {
    if (await healthCheck()) return true;
    startBackend();
    return waitForApi();
  })();

  const splashMinimum = (async () => {
    while (splashShownAt === null) {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const remaining = SPLASH_MIN_MS - (Date.now() - splashShownAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  })();

  const [ready] = await Promise.all([backendReady, splashMinimum]);
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (!ready) {
    await mainWindow.webContents.executeJavaScript(
      "window.showSplashError('本地服务没有启动成功。请查看 %APPDATA%\\\\SeeEnglish\\\\backend.log。')",
    );
    boot('splash backend timeout');
    return;
  }

  // Give the loading line a moment to settle, then dim into the main UI.
  await mainWindow.webContents.executeJavaScript('window.setSplashReady()');
  await new Promise((resolve) => setTimeout(resolve, 520));
  if (!mainWindow || mainWindow.isDestroyed()) return;

  await mainWindow.webContents.executeJavaScript('window.finishSplash()');
  await new Promise((resolve) => setTimeout(resolve, 850));
  if (!mainWindow || mainWindow.isDestroyed()) return;

  await mainWindow.loadURL(DEV_URL || UI_URL);
  createTray();
}

ipcMain.handle('settings:get-close-behavior', () => settings.closeBehavior);
ipcMain.handle('settings:set-close-behavior', (_event, value) => {
  if (!['ask', 'tray', 'quit'].includes(value)) return settings.closeBehavior;
  writeSettings({ closeBehavior: value });
  if (tray) tray.setContextMenu(buildTrayMenu());
  return settings.closeBehavior;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(async () => {
    boot('app ready');
    app.setAppUserModelId('com.seeenglish.gui');
    await createWindow();
    app.on('activate', showWindow);
  });
}

app.on('before-quit', () => {
  quitting = true;
  tray?.destroy();
  tray = null;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (!tray) app.quit();
});
