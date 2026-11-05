import unittest
from ldbackend import parse_list2

class ParseTests(unittest.TestCase):
    def test_old(self):
        xs=parse_list2('0,LDPlayer,2032678,1704928,1,7456,3500\n1,豆包02,0,0,0,0,0\n')
        self.assertEqual(len(xs),2)
        self.assertTrue(xs[0].running)
        self.assertEqual(xs[1].name,'豆包02')
    def test_new(self):
        xs=parse_list2('2,豆包三号,12345,67890,1,222,333,540,960,240')
        self.assertEqual(xs[0].width,540)
        self.assertEqual(xs[0].dpi,240)
    def test_skip_invalid(self):
        self.assertEqual(parse_list2('invalid\n99999,bad,0,0,0,0,0\n'),[])

if __name__=='__main__':unittest.main()
