DuduAI V1.3 - Windows staging filename fix (V3)
================================================

Observed Windows failure:
  [STAGING] C:\Users\...\Temp\DuduAI-Release-...
  [BUILD FAILED] Missing source file <garbled Chinese>Windows<...>.cmd

Root cause:
  scripts\build-release-win.ps1 contained a literal Chinese filename.
  The existing script was UTF-8 without BOM. Windows PowerShell 5.1 reads
  such scripts as the Windows ANSI code page, changing that filename.
  The old Chinese-named launcher exists in the source root but does not
  need to be copied into the temporary production build tree.

Fast apply:
  1. Close the failed build window.
  2. Unzip the V3 QUICKFIX archive to a temporary folder.
  3. Copy its 'scripts' folder into your existing
     DuduAI_Workbench_V1.3_Python312_Ready_Builder folder.
  4. Accept REPLACE only for scripts\build-release-win.ps1.
     No other source or settings are changed by the quick fix.
  5. Double-click BUILD_Windows_EXE.cmd again.

Your existing Python 3.12 fix remains intact. You will be prompted for
public Worker HTTPS URL and Ed25519 public SPKI again; this is expected.
Never provide admin tokens, payment secrets or private keys.

Full V3 ZIP:
  An alternative updated complete source builder with this fix included.
  Do not place the new builder inside an older builder folder.

This fix has been statically tested and checked on the source tree.
The final Windows installer is NOT generated or tested by this patch.
