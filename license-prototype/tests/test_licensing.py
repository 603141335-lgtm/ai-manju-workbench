import unittest, tempfile, pathlib, sys, datetime as dt
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from license_server import LicenseDB,expiry_after,UTC
class T(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.db=LicenseDB(pathlib.Path(self.tmp.name)/'test.sqlite3','pepper-'+('x'*30));self.id='abcdef'*8
 def tearDown(self):self.db.db.close();self.tmp.cleanup()
 def test_four_terms(self):
  for term in ['1d','1mo','1y','forever']:
   c=self.db.issue(term)[0]
   self.assertFalse(self.db.status(c['code'])['valid'])
   r=self.db.activate(c['code'],self.id+term)
   self.assertTrue(r['valid']);self.assertEqual(r['term'],term)
 def test_binds_first_device(self):
  c=self.db.issue('1d')[0]['code'];self.assertTrue(self.db.activate(c,self.id)['valid']);self.assertFalse(self.db.activate(c,'z'*48)['valid'])
 def test_revoked(self):
  c=self.db.issue('1d')[0];self.db.activate(c['code'],self.id);self.db.revoke_card(c['id']);self.assertFalse(self.db.status(self.id)['valid'])
 def test_owner(self):
  self.assertFalse(self.db.status(self.id)['valid']);self.db.enroll_owner(self.id);self.assertEqual(self.db.status(self.id)['role'],'admin')
 def test_calendar(self):
  d=dt.datetime(2024,1,31,tzinfo=UTC);self.assertEqual(expiry_after(d,'1mo').day,29)
  d=dt.datetime(2024,2,29,tzinfo=UTC);self.assertEqual(expiry_after(d,'1y').day,28)
 def test_invalid(self):
  with self.assertRaises(ValueError):self.db.issue('3h')
if __name__=='__main__':unittest.main()
