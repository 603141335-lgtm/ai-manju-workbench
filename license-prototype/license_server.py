"""Local evaluation backend for card-based entitlement. Not production Internet service.
Uses only Python standard library, SQLite, UTC, random secrets.
Start with HUB_ADMIN_PASSWORD and HUB_CARD_PEPPER env vars set; bind localhost.
"""
import calendar
import datetime as dt
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

DURATIONS = {'1d':'1天','1mo':'1个月','1y':'1年','forever':'永久'}
UTC=dt.timezone.utc

def current(): return dt.datetime.now(tz=UTC)
def iso(d): return d.isoformat(timespec='seconds') if d else None

def expiry_after(when, term):
    if term=='forever': return None
    if term=='1d': return when+dt.timedelta(days=1)
    if term=='1mo':
        y = when.year + (when.month // 12); m = when.month % 12 + 1
        return when.replace(year=y,month=m,day=min(when.day,calendar.monthrange(y,m)[1]))
    if term=='1y':
        y=when.year+1
        return when.replace(year=y,day=min(when.day,calendar.monthrange(y,when.month)[1]))
    raise ValueError('Unsupported term')

class LicenseDB:
    def __init__(self, db_path, pepper):
        if not pepper or len(pepper)<24: raise ValueError('HUB_CARD_PEPPER needs at least 24 characters')
        self.db_path=str(db_path); self.pepper=pepper.encode(); self.lock=threading.RLock()
        self.db=sqlite3.connect(self.db_path, check_same_thread=False)
        self.db.row_factory=sqlite3.Row
        with self.db:
            self.db.execute('PRAGMA journal_mode=WAL')
            self.db.execute('''CREATE TABLE IF NOT EXISTS cards (
              id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, term TEXT NOT NULL,
              created_at TEXT NOT NULL, first_activated_at TEXT, expires_at TEXT,
              device_hash TEXT, revoked_at TEXT)''')
            self.db.execute('''CREATE TABLE IF NOT EXISTS owners (
              device_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, revoked_at TEXT)''')
            self.db.execute('''CREATE TABLE IF NOT EXISTS events (
              id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, card_id TEXT,
              at TEXT NOT NULL)''')
    def digest(self, kind, value):
        return hmac.new(self.pepper, (kind+':'+str(value)).encode(), hashlib.sha256).hexdigest()
    def log(self, event, card_id=None):
        self.db.execute('INSERT INTO events(event, card_id, at) VALUES(?,?,?)',(event,card_id,iso(current())))
    def issue(self, term, count=1):
        if term not in DURATIONS: raise ValueError('Unsupported term')
        if not isinstance(count,int) or count<1 or count>50: raise ValueError('count must be between 1 and 50')
        issued=[]
        with self.lock,self.db:
            for _ in range(count):
                raw='DHUB-'+''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for i in range(5))+'-'+''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for i in range(5))+'-'+''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for i in range(5))+'-'+''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for i in range(5))
                cid=secrets.token_hex(8)
                self.db.execute('INSERT INTO cards(id,code_hash,term,created_at) VALUES (?,?,?,?)',(cid,self.digest('card',raw),term,iso(current())))
                self.log('issue',cid);issued.append({'id':cid,'code':raw,'term':term})
        return issued
    def enroll_owner(self, device_id):
        if not isinstance(device_id,str) or len(device_id)<32: raise ValueError('device_id must be long random string')
        device=self.digest('device',device_id)
        with self.lock,self.db:
            self.db.execute('INSERT INTO owners(device_hash,created_at,revoked_at) VALUES(?,?,NULL) ON CONFLICT(device_hash) DO UPDATE SET revoked_at=NULL',(device,iso(current())))
            self.log('owner_enroll')
        return {'role':'admin','valid':True,'note':'Owner device enrolled. Production should use public-key challenge.'}
    def activate(self, card_code, device_id):
        if not isinstance(card_code,str) or len(card_code)>200: raise ValueError('Invalid card')
        if not isinstance(device_id,str) or len(device_id)<32 or len(device_id)>256: raise ValueError('Invalid device')
        ch=self.digest('card',card_code.strip().upper());dh=self.digest('device',device_id)
        with self.lock,self.db:
            card=self.db.execute('SELECT * FROM cards WHERE code_hash=?',(ch,)).fetchone()
            if not card: return {'valid':False,'error':'卡密无效'}
            if card['revoked_at']: return {'valid':False,'error':'卡密已停用'}
            if card['device_hash'] and card['device_hash']!=dh: return {'valid':False,'error':'卡密已绑定其他设备'}
            now=current()
            if not card['device_hash']:
                exp=expiry_after(now,card['term'])
                self.db.execute('UPDATE cards SET first_activated_at=?, expires_at=?, device_hash=? WHERE id=?',(iso(now),iso(exp),dh,card['id']))
                self.log('activate',card['id'])
            return self.status(device_id)
    def status(self, device_id):
        if not isinstance(device_id,str) or len(device_id)<32: return {'valid':False,'role':'guest','error':'无设备凭据'}
        dh=self.digest('device',device_id)
        with self.lock:
            owner=self.db.execute('SELECT * FROM owners WHERE device_hash=? AND revoked_at IS NULL',(dh,)).fetchone()
            if owner: return {'valid':True,'role':'admin','term':'owner','expires_at':None}
            cards=self.db.execute('SELECT * FROM cards WHERE device_hash=? ORDER BY first_activated_at DESC',(dh,)).fetchall()
            valid=[]
            for c in cards:
                if c['revoked_at']: continue
                expires=dt.datetime.fromisoformat(c['expires_at']) if c['expires_at'] else None
                if expires is None or current()<expires: valid.append(c)
            if valid:
                chosen=next((c for c in valid if c['term']=='forever'), valid[0]);return {'valid':True,'role':'member','term':chosen['term'],'expires_at':chosen['expires_at']}
            return {'valid':False,'role':'guest','error':'尚未激活或已到期'}
    def revoke_card(self, card_id):
        with self.lock,self.db:
            changed=self.db.execute('UPDATE cards SET revoked_at=? WHERE id=? AND revoked_at IS NULL',(iso(current()),card_id)).rowcount
            if changed:self.log('revoke',card_id)
        return {'revoked':bool(changed)}
    def list_cards(self):
        with self.lock:
            rows=self.db.execute('SELECT id,term,created_at,first_activated_at,expires_at,device_hash,revoked_at FROM cards ORDER BY created_at DESC').fetchall()
        return [dict(id=r['id'],term=r['term'],created_at=r['created_at'],activated_at=r['first_activated_at'],expires_at=r['expires_at'],bound=bool(r['device_hash']),revoked=bool(r['revoked_at'])) for r in rows]

class ApiHandler(BaseHTTPRequestHandler):
    db=None; admin_password=None; rate_lock=threading.Lock(); failures={}
    def log_message(self,*args): pass
    def send_json(self,status,obj):
        body=json.dumps(obj,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        route=urlparse(self.path).path
        if route=='/health':return self.send_json(200,{'status':'ok','local_demo':True})
        if route=='/':
            content=(Path(__file__).parent/'dashboard.html').read_bytes()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content);return
        return self.send_json(404,{'error':'Not found'})
    def admin(self):
        password=self.headers.get('X-Admin-Password','')
        return bool(self.admin_password) and hmac.compare_digest(password.encode(),self.admin_password.encode())
    def do_POST(self):
        if self.headers.get('Content-Type','').split(';')[0].strip()!='application/json':return self.send_json(415,{'error':'Expected application/json'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<4096: return self.send_json(413,{'error':'Request body too large'})
            obj=json.loads(self.rfile.read(length)); assert isinstance(obj,dict)
            route=urlparse(self.path).path
            if route.startswith('/admin/') and not self.admin():return self.send_json(403,{'error':'管理员凭据无效'})
            if route=='/admin/issue':out={'cards':self.db.issue(obj.get('term'),obj.get('count',1))}
            elif route=='/admin/enroll-owner':out=self.db.enroll_owner(obj.get('device_id'))
            elif route=='/admin/revoke':out=self.db.revoke_card(obj.get('card_id'))
            elif route=='/admin/cards':out={'cards':self.db.list_cards()}
            elif route=='/activate':out=self.db.activate(obj.get('code'),obj.get('device_id'))
            elif route=='/status':out=self.db.status(obj.get('device_id'))
            else:return self.send_json(404,{'error':'Unknown endpoint'})
            return self.send_json(200,out)
        except (ValueError,AssertionError,TypeError) as e:return self.send_json(400,{'error':str(e)})
        except Exception: return self.send_json(500,{'error':'Internal error'})

def serve():
    password=os.environ.get('HUB_ADMIN_PASSWORD','')
    pepper=os.environ.get('HUB_CARD_PEPPER','')
    if len(password)<12 or len(pepper)<24:raise SystemExit('请先设置 HUB_ADMIN_PASSWORD(≥12位) 和 HUB_CARD_PEPPER(≥24位)，不要使用示例密码上线')
    data=Path(os.environ.get('HUB_DATA_DIR',Path(__file__).parent/'private-data'));data.mkdir(parents=True,exist_ok=True)
    ApiHandler.db=LicenseDB(data/'cards.sqlite3',pepper);ApiHandler.admin_password=password
    server=ThreadingHTTPServer(('127.0.0.1',8765),ApiHandler)
    print('本地验证服务器：http://127.0.0.1:8765  (仅本机访问，不具备公网商用部署条件)')
    server.serve_forever()
if __name__=='__main__':serve()
