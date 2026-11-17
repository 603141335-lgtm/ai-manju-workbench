# -*- coding: utf-8 -*-
import ast
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent

class V6ElectronBuildTests(unittest.TestCase):
    def test_gui_syntax(self):
        ast.parse((ROOT / 'scripts/build-gui.py').read_text(encoding='utf-8-sig'))

    def test_gui_allows_manual_offline_electron_zip(self):
        gui = (ROOT / 'scripts/build-gui.py').read_text(encoding='utf-8-sig')
        for needle in ('electron_zip_var', 'filedialog.askopenfilename', 'DUDU_ELECTRON_ZIP_PATH',
                       'self._browse_electron_zip'):
            self.assertIn(needle,gui)

    def test_gui_does_not_claim_exe_after_env_or_preflight_only(self):
        gui = (ROOT / 'scripts/build-gui.py').read_text(encoding='utf-8-sig')
        self.assertIn("self.active_mode == 'release'",gui)
        self.assertIn('未执行 EXE 构建',gui)
        self.assertIn('exe.stat().st_size >= 15_000_000',gui)

    def test_powershell_calls_pinned_node_script_not_npm_exec(self):
        ps = (ROOT / 'scripts/build-release-win.ps1').read_text(encoding='utf-8-sig')
        self.assertIn("Run-Checked $node @('scripts/ensure-electron-win.js')",ps)
        self.assertNotIn("'install-electron'",ps)
        self.assertTrue((ROOT / 'scripts/build-release-win.ps1').read_bytes().startswith(b'\xef\xbb\xbf'))

    def test_new_pinned_helper_is_staged_automatically(self):
        ps = (ROOT / 'scripts/build-release-win.ps1').read_text(encoding='utf-8-sig')
        self.assertIn("'src','scripts','tests','assets','native-core','docs'",ps)
        self.assertTrue((ROOT / 'scripts/ensure-electron-win.js').is_file())

if __name__ == '__main__': unittest.main()
