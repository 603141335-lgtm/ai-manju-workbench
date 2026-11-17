DuduAI Workbench V1.3 - Python Detection V2 Fix
==================================================

Problem:
  CMD: py -3.12 --version => Python 3.12.10
  Existing CHECK_Build_Tools.cmd => [NO] Python 3.12

Cause being addressed:
  Legacy Windows PowerShell argument quoting when Python is checked with
  python -c containing embedded quotes. Detection could return a false NO.

How to apply the SMALL PATCH:
  1. Close the old CHECK_Build_Tools terminal.
  2. Extract this ZIP. Copy its scripts folder, tests folder, and
     VERIFY_Python312.cmd into your EXISTING
     DuduAI_Workbench_V1.3_Python312_Ready_Builder root.
     Allow Windows to replace scripts\find-python312.ps1 and
     tests\release-package.test.js. The changed test simply matches
     the new --version detector; no app behavior is changed.
     The existing source, projects, and license files are not edited.
  3. Double-click VERIFY_Python312.cmd. Expected: [OK] Python 3.12.10.
  4. Double-click CHECK_Build_Tools.cmd. Expected: [OK] Python 3.12.
  5. Double-click BUILD_Windows_EXE.cmd. Follow the prompts for the real
     HTTPS license Worker and PUBLIC Ed25519 verification key.

If VERIFY reports [NO], please send its output; do not install Python again.
Do not send admin tokens, secret keys, or payment credentials.

This patch only improves developer tool discovery. It does not build an EXE,
and does not modify the original app, production Worker, D1 or license state.
