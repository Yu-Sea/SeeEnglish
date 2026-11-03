# Packaging

This folder builds the Windows desktop distribution.

## Outputs

- `gui/release/win-unpacked/` — packaged Electron app used as the installer payload
- `gui/release/SeeEnglish-Setup-0.6.0.exe` — per-user installer
- The installer creates `Uninstall.exe` in the installed app folder

## Build

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File packaging/build-installer.ps1
```

The installer is per-user:

- install directory: `%LOCALAPPDATA%\Programs\SeeEnglish`
- app data: `%APPDATA%\SeeEnglish`
- no administrator rights required

## Installer behavior

- standard NSIS setup wizard
- install directory selection
- desktop shortcut option
- start menu shortcut option
- launch after install option
- uninstaller with the same standard NSIS pages

## Uninstall behavior

The uninstaller deliberately removes all app-owned data:

- `%APPDATA%\SeeEnglish` (SQLite database, settings, logs, Electron profile)
- `%LOCALAPPDATA%\SeeEnglish`
- legacy `seeenglish-gui` data folders
- the installation directory
- desktop and start-menu shortcuts
- the uninstall registry key and legacy `seeenglish://` registration

There is no “keep my data” option, by design.
