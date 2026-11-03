Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!define APP_NAME "SeeEnglish 见词"
!define APP_ID "SeeEnglish"
!define APP_VERSION "0.6.0"
!define APP_PUBLISHER "SeeEnglish"
!define APP_EXE "SeeEnglish.exe"
!define APP_DATA "$APPDATA\SeeEnglish"

Name "${APP_NAME}"
OutFile "..\..\gui\release\SeeEnglish-Setup-${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\SeeEnglish"
InstallDirRegKey HKCU "Software\SeeEnglish" "InstallDir"
RequestExecutionLevel user
Icon "..\..\assets\seeenglish.ico"
UninstallIcon "..\..\assets\seeenglish.ico"
SetCompressor /SOLID lzma
SetCompressorDictSize 64
CRCCheck on
XPStyle on

VIProductVersion "0.6.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=2052 "FileDescription" "${APP_NAME} 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Copyright © 2026 ${APP_PUBLISHER}"

!define MUI_ABORTWARNING
!define MUI_ICON "..\..\assets\seeenglish.ico"
!define MUI_UNICON "..\..\assets\seeenglish.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "SimpChinese"

LangString DESC_Main ${LANG_SIMPCHINESE} "SeeEnglish 见词主程序、桌面运行环境和本地 API。"
LangString DESC_Desktop ${LANG_SIMPCHINESE} "在桌面创建 SeeEnglish 快捷方式。"
LangString DESC_StartMenu ${LANG_SIMPCHINESE} "在开始菜单创建 SeeEnglish 文件夹和卸载入口。"

Function .onInit
  SetShellVarContext current
  SetRegView 64
FunctionEnd

Section "SeeEnglish 见词" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  nsExec::Exec 'taskkill /F /IM "${APP_EXE}"'
  nsExec::Exec 'taskkill /F /IM "SeeEnglishBackend.exe"'
  Sleep 600
  File /r "..\..\gui\release\win-unpacked\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\SeeEnglish" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "URLInfoAbout" "http://127.0.0.1:8765/"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "NoRepair" 1
SectionEnd

Section "桌面快捷方式" SecDesktop
  CreateShortCut "$DESKTOP\SeeEnglish.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0 SW_SHOWNORMAL
SectionEnd

Section "开始菜单快捷方式" SecStartMenu
  CreateDirectory "$SMPROGRAMS\SeeEnglish"
  CreateShortCut "$SMPROGRAMS\SeeEnglish\SeeEnglish.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0 SW_SHOWNORMAL
  CreateShortCut "$SMPROGRAMS\SeeEnglish\卸载 SeeEnglish.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} $(DESC_Main)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} $(DESC_Desktop)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStartMenu} $(DESC_StartMenu)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Function un.onInit
  SetShellVarContext current
  SetRegView 64
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "卸载 SeeEnglish 会删除程序、词库、复习记录、设置和所有本地数据。$\r$\n$\r$\n这个操作不可恢复。继续吗？" IDYES uninstallConfirmed
  Abort
uninstallConfirmed:
FunctionEnd

Function un.onUninstSuccess
  HideWindow
  MessageBox MB_ICONINFORMATION|MB_OK "SeeEnglish 已卸载，所有本地数据已清除。"
FunctionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${APP_EXE}"'
  nsExec::Exec 'taskkill /F /IM "SeeEnglishBackend.exe"'
  Sleep 800

  Delete "$DESKTOP\SeeEnglish.lnk"
  Delete "$SMPROGRAMS\SeeEnglish\SeeEnglish.lnk"
  Delete "$SMPROGRAMS\SeeEnglish\卸载 SeeEnglish.lnk"
  RMDir "$SMPROGRAMS\SeeEnglish"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  DeleteRegKey HKCU "Software\SeeEnglish"
  DeleteRegKey HKCU "Software\Classes\seeenglish"

  ; Remove every piece of app-owned data, including the SQLite database.
  RMDir /r "$APPDATA\SeeEnglish"
  RMDir /r "$LOCALAPPDATA\SeeEnglish"
  RMDir /r "$APPDATA\seeenglish-gui"
  RMDir /r "$LOCALAPPDATA\seeenglish-gui"
  RMDir /r "$LOCALAPPDATA\Programs\SeeEnglish"
  RMDir /r "$INSTDIR"
SectionEnd
