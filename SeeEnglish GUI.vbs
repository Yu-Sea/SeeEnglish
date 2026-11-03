Option Explicit

Dim shell, fso, root, pythonw, guiApp, browser, profile, url, port
Dim chrome, edge, programFiles, programFilesX86
Dim attempt, ready, browserInfo, browserName, launchArgs
Dim infoFile
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count > 0 Then
  port = WScript.Arguments(0)
Else
  port = "8765"
End If

root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
pythonw = root & "\.venv\Scripts\pythonw.exe"
guiApp = root & "\gui_app.py"

If Not fso.FileExists(pythonw) Then
  MsgBox "Python environment not found. Run start.ps1 first.", 16, "SeeEnglish"
  WScript.Quit 1
End If

If Not fso.FileExists(root & "\gui\dist\index.html") Then
  shell.Run "cmd /c npm --prefix gui run build", 1, True
End If

If Not fso.FileExists(root & "\gui\dist\index.html") Then
  MsgBox "The GUI has not been built. Run npm --prefix gui run build first.", 16, "SeeEnglish"
  WScript.Quit 1
End If

programFiles = shell.ExpandEnvironmentStrings("%ProgramFiles%")
programFilesX86 = shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%")
browserInfo = root & "\data\default-browser.txt"
chrome = programFiles & "\Google\Chrome\Application\chrome.exe"
edge = programFiles & "\Microsoft\Edge\Application\msedge.exe"

If fso.FileExists(browserInfo) Then fso.DeleteFile browserInfo, True
shell.Run """" & pythonw & """ """ & guiApp & """ --print-default-browser", 0, False
For attempt = 1 To 15
  If fso.FileExists(browserInfo) Then Exit For
  WScript.Sleep 200
Next

browser = ""
If fso.FileExists(browserInfo) Then
  On Error Resume Next
  Set infoFile = fso.OpenTextFile(browserInfo, 1)
  If Err.Number = 0 Then browser = Trim(infoFile.ReadAll)
  infoFile.Close
  Err.Clear
  On Error GoTo 0
End If

If browser = "" Or Not fso.FileExists(browser) Then
  If fso.FileExists(chrome) Then
    browser = chrome
  ElseIf fso.FileExists(programFilesX86 & "\Google\Chrome\Application\chrome.exe") Then
    browser = programFilesX86 & "\Google\Chrome\Application\chrome.exe"
  ElseIf fso.FileExists(edge) Then
    browser = edge
  ElseIf fso.FileExists(programFilesX86 & "\Microsoft\Edge\Application\msedge.exe") Then
    browser = programFilesX86 & "\Microsoft\Edge\Application\msedge.exe"
  Else
    MsgBox "No default browser and no Chrome/Edge installation was found.", 16, "SeeEnglish"
    WScript.Quit 1
  End If
End If

browserName = LCase(fso.GetFileName(browser))
If InStr(browserName, "msedge") > 0 Then
  profile = root & "\data\browser-profile-edge"
ElseIf InStr(browserName, "chrome") > 0 Then
  profile = root & "\data\browser-profile"
Else
  profile = root & "\data\browser-profile-" & Replace(browserName, ".exe", "")
End If

url = "http://127.0.0.1:" & port & "/gui/"

' Start the local API only if it is not already running.
shell.Run """" & pythonw & """ """ & guiApp & """ --server-only --port " & port, 0, False

ready = False
For attempt = 1 To 40
  If ApiReady(port) Then
    ready = True
    Exit For
  End If
  WScript.Sleep 500
Next

If Not ready Then
  MsgBox "The local API did not start. Check data\gui.log for details.", 16, "SeeEnglish"
  WScript.Quit 1
End If

browserName = LCase(fso.GetFileName(browser))
If InStr(browserName, "chrome") > 0 Or InStr(browserName, "msedge") > 0 Or InStr(browserName, "brave") > 0 Or InStr(browserName, "chromium") > 0 Or InStr(browserName, "vivaldi") > 0 Then
  launchArgs = " --app=" & url & " --window-size=1280,820 --user-data-dir=""" & profile & """ --no-first-run --no-default-browser-check"
Else
  launchArgs = " " & url
End If

shell.Run """" & browser & """" & launchArgs, 1, False

Function ApiReady(p)
  Dim request
  On Error Resume Next
  Set request = CreateObject("WinHttp.WinHttpRequest.5.1")
  request.Open "GET", "http://127.0.0.1:" & p & "/api/health", False
  request.Send
  If Err.Number <> 0 Then
    ApiReady = False
  Else
    ApiReady = (request.Status = 200)
  End If
  Err.Clear
  On Error GoTo 0
  Set request = Nothing
End Function
