import ast, pathlib, subprocess, unittest, base64, sys
ROOT=pathlib.Path(__file__).resolve().parent.parent
GUI=ROOT/'scripts'/'build-gui.py'
class ReleaseGuiTests(unittest.TestCase):
 def test_python_syntax(self):
  ast.parse(GUI.read_text(encoding='utf-8-sig'))
 def test_public_key_is_der_ed25519(self):
  text=GUI.read_text(encoding='utf-8-sig')
  self.assertIn('302a300506032b6570032100',text)
 def test_release_script_is_bom_utf8(self):
  self.assertTrue((ROOT/'scripts'/'build-release-win.ps1').read_bytes().startswith(b'\xef\xbb\xbf'))
 def test_launcher_present(self):
  self.assertIn(b'py -3.12', (ROOT/'OPEN_DUDUAI_BUILD_CENTER.cmd').read_bytes())
 def test_no_explicit_prod_deploy(self):
  ps=(ROOT/'scripts'/'build-release-win.ps1').read_text(encoding='utf-8-sig')
  self.assertNotIn('wrangler deploy',ps)
 def test_v3_chinese_cmd_no_longer_required(self):
  ps=(ROOT/'scripts'/'build-release-win.ps1').read_text(encoding='utf-8-sig')
  self.assertNotIn('一键打包Windows安装版.cmd',ps)
if __name__=='__main__': unittest.main()
