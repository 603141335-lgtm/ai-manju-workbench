# -*- coding: utf-8 -*-
"""DuduAI Workbench V1.3 Windows EXE builder control panel.

Runs the existing source-only PowerShell release builder; never installs a tool,
deploys a Worker, changes Cloudflare state, or edits production user data.
"""
from __future__ import annotations
import base64
import datetime as dt
import locale
import os
from pathlib import Path
import queue
import re
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import messagebox, ttk, filedialog
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / 'build-logs'
DEFAULT_URL = 'https://dudu-ai-license.dushuaishuai089.workers.dev'
DEFAULT_PUBLIC_KEY = 'MCowBQYDK2VwAyEAoccp3lGBz/nK0tWBdV+5gtF9eA/RPszlmkYpI88gSx8='
FILENAME = 'DuduAI-Workbench-Setup-v1.3.0-x64.exe'


def check_inputs(url: str, key: str) -> tuple[str, str]:
    """Reject private network HTTP, secrets, and invalid Ed25519 SPKI keys."""
    url = url.strip().rstrip('/')
    key = key.strip()
    u = urlsplit(url)
    if (u.scheme != 'https' or not u.hostname or u.username or u.password or
            u.query or u.fragment or u.path or u.port not in (None, 443) or
            u.hostname.lower() in ('localhost', '127.0.0.1', '::1') or
            re.match(r'^(?:10\.|127\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)', u.hostname)):
        raise ValueError('授权服务器必须是正式公网 HTTPS 根地址，不能填 localhost 或本机测试地址。')
    try:
        raw = base64.b64decode(key, validate=True)
    except (ValueError, Exception) as exc:
        raise ValueError('公钥必须是有效 Base64 文本。') from exc
    # RFC 8410 DER SubjectPublicKeyInfo for Ed25519 (OID 1.3.101.112), 32-byte raw public key.
    if len(raw) != 44 or raw[:12] != bytes.fromhex('302a300506032b6570032100'):
        raise ValueError('不是 Ed25519 Base64 SPKI 公开验证公钥，不能继续。')
    return url, key


def decode_output(raw: bytes) -> str:
    # PS5.1 may emit UTF8 or the local OEM code page depending on host settings.
    for enc in ('utf-8', locale.getpreferredencoding(False), 'gbk'):
        try:
            return raw.decode(enc)
        except (UnicodeError, LookupError):
            pass
    return raw.decode('utf-8', errors='replace')


class Builder(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('独独AI工作台 V1.3 · Windows 安装包构建中心')
        self.geometry('1030x740')
        self.minsize(780, 580)
        self.configure(bg='#101a2b')
        self.q = queue.Queue()
        self.process = None
        self.working = False
        self.logfile = None
        self.url_var = tk.StringVar(value=DEFAULT_URL)
        self.key_var = tk.StringVar(value=DEFAULT_PUBLIC_KEY)
        self.electron_zip_var = tk.StringVar(value='')
        self.active_mode = None
        self.status_var = tk.StringVar(value='就绪：先检查环境，再生成 Windows EXE 安装包')
        self._build_ui()
        self.after(100, self._poll)
        self.protocol('WM_DELETE_WINDOW', self._close)

    def _build_ui(self):
        style = ttk.Style(self)
        if 'clam' in style.theme_names():
            style.theme_use('clam')
        style.configure('TButton', font=('Microsoft YaHei UI', 10), padding=(13, 11))
        style.configure('TEntry', padding=6)
        style.configure('Dudu.TLabel', background='#101a2b', foreground='#dce6f5', font=('Microsoft YaHei UI', 10))
        style.configure('DuduTitle.TLabel', background='#101a2b', foreground='#ffffff', font=('Microsoft YaHei UI', 19, 'bold'))
        style.configure('DuduInfo.TLabel', background='#101a2b', foreground='#a5b9d4', font=('Microsoft YaHei UI', 10))

        body = ttk.Frame(self, padding=(24, 20))
        body.pack(fill='both', expand=True)
        # ttk Frame's background defaults to host colors; a dark theme is purely decorative.
        ttk.Label(body, text='独独AI工作台 V1.3 | 完整安装包构建中心', style='DuduTitle.TLabel').pack(anchor='w')
        ttk.Label(body, text='源码隔离构建 · 不修改 Cloudflare / 正式数据 · 失败日志自动保存 · 本窗口不会随构建错误关闭', style='DuduInfo.TLabel').pack(anchor='w', pady=(6, 14))
        settings = ttk.LabelFrame(body, text='正式授权公开配置（仅用于构建客户端）', padding=12)
        settings.pack(fill='x')
        ttk.Label(settings, text='Cloudflare Worker HTTPS：').pack(anchor='w')
        ttk.Entry(settings, textvariable=self.url_var).pack(fill='x', pady=(4, 10))
        ttk.Label(settings, text='Ed25519 公开验证公钥（Base64 SPKI）：').pack(anchor='w')
        ttk.Entry(settings, textvariable=self.key_var).pack(fill='x', pady=(4, 5))
        ttk.Label(settings, text='只接受公钥；不要输入管理员令牌、签名私钥或支付密钥。构建脚本还会验证远端签名。').pack(anchor='w')
        offline = ttk.Frame(body)
        offline.pack(fill='x', pady=(8, 0))
        ttk.Label(offline, text='Electron 44.10.2 离线 ZIP（选填；下载失败才需要）：').pack(anchor='w')
        offline_file = ttk.Frame(offline)
        offline_file.pack(fill='x', pady=(4, 0))
        ttk.Entry(offline_file, textvariable=self.electron_zip_var).pack(side='left', fill='x', expand=True)
        ttk.Button(offline_file, text='浏览文件', command=self._browse_electron_zip).pack(side='left', padx=(8, 0))
        actions = ttk.Frame(body)
        actions.pack(fill='x', pady=(15, 10))
        self.buttons=[]
        for title, action in [('① 环境检查', lambda:self._run('env')),
                              ('② 源码与安全自检', lambda:self._run('check')),
                              ('③ 正式制作安装 EXE', lambda:self._run('release')),
                              ('打开构建日志', self._logs), ('打开安装包目录', self._release)]:
            b=ttk.Button(actions,text=title,command=action)
            b.pack(side='left',padx=(0,8))
            if action.__name__ == '<lambda>':self.buttons.append(b)
        self.stop_button=ttk.Button(actions,text='停止当前任务',command=self._stop,state='disabled')
        self.stop_button.pack(side='right')
        ttk.Label(body,textvariable=self.status_var).pack(anchor='w',pady=(0,8))
        logs = ttk.LabelFrame(body,text='构建实时日志（可复制，失败后保留）',padding=7)
        logs.pack(fill='both',expand=True)
        self.text = tk.Text(logs, wrap='word', font=('Consolas', 10),
                            bg='#0e1625', fg='#d5e8ff', insertbackground='#d5e8ff',
                            relief='flat', undo=False, height=20)
        scroll=ttk.Scrollbar(logs, orient='vertical',command=self.text.yview)
        self.text.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right',fill='y')
        self.text.pack(fill='both',expand=True)
        self._line('构建工程目录：'+str(ROOT))
        self._line('安装包目标：'+str(ROOT / 'release' / FILENAME))
        self._line('请先检查环境，再点击“正式制作安装 EXE”。')

    def _line(self, message):
        self.text.insert('end', str(message) + '\n')
        if int(self.text.index('end-1c').split('.')[0]) > 2600:
            self.text.delete('1.0', '300.0')
        self.text.see('end')

    def _run(self, mode):
        if self.working:
            return
        if not sys.platform.startswith('win'):
            messagebox.showerror('需要 Windows', '安装包必须在 Windows 10/11 x64 电脑上制作。')
            return
        ps = ROOT / 'scripts' / ('check-build-environment.ps1' if mode=='env' else 'build-release-win.ps1')
        if not ps.is_file():
            messagebox.showerror('缺少文件',str(ps))
            return
        url=key=None
        if mode == 'release':
            try:
                url,key=check_inputs(self.url_var.get(),self.key_var.get())
            except ValueError as exc:
                messagebox.showerror('公开授权配置有误',str(exc))
                return
            if not messagebox.askyesno('确认正式构建','将从源码副本生成可分享的安装包。原源码、正式账号、云端 Worker、D1 和卡密不修改。继续吗？'):
                return
        offline_zip = self.electron_zip_var.get().strip()
        if mode == 'release' and offline_zip and not Path(offline_zip).is_file():
            messagebox.showerror('Electron 文件不存在', '请选择已下载的 electron-v44.10.2-win32-x64.zip，或清空离线文件位置。')
            return
        self.active_mode = mode
        self.working=True
        for b in self.buttons:b.configure(state='disabled')
        self.stop_button.configure(state='normal')
        label={'env':'环境检查','check':'源码自检','release':'正式 Windows EXE 构建'}[mode]
        self.status_var.set('运行中：'+label)
        LOG_DIR.mkdir(parents=True,exist_ok=True)
        name='gui-'+dt.datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+mode+'.log'
        self.logfile=LOG_DIR / name
        self._line('')
        self._line('======== '+label+' ========')
        self._line('日志将持续保存：'+str(self.logfile))
        args=['-CheckOnly'] if mode=='check' else []
        # Explicit UTF-8 PS host output, and no reliance on the Windows .cmd association.
        quoted=str(ps).replace("'","''")
        powershell_cmd="[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); & '"+quoted+"' "+' '.join(args)
        command=['powershell.exe','-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-Command',powershell_cmd]
        env=os.environ.copy()
        if mode=='release':
            env['DUDU_LICENSE_URL']=url
            env['DUDU_LICENSE_PUBLIC_KEY_B64']=key
            if offline_zip:
                env['DUDU_ELECTRON_ZIP_PATH']=str(Path(offline_zip).resolve())
            else:
                env.pop('DUDU_ELECTRON_ZIP_PATH', None)
        thread=threading.Thread(target=self._worker,args=(command,env),daemon=True)
        thread.start()

    def _worker(self, command, env):
        rc=-1
        try:
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)
            self.process=subprocess.Popen(command,cwd=str(ROOT),env=env,stdout=subprocess.PIPE,
                                          stderr=subprocess.STDOUT,creationflags=creationflags)
            with self.logfile.open('w',encoding='utf-8') as log:
                assert self.process.stdout
                for raw in self.process.stdout:
                    s=decode_output(raw.rstrip(b'\r\n'))
                    log.write(s+'\n')
                    log.flush()
                    self.q.put(('line',s))
                rc=self.process.wait()
        except Exception as exc:
            self.q.put(('line','[LAUNCH ERROR] '+str(exc)))
        finally:
            self.q.put(('done',rc))

    def _poll(self):
        try:
            while True:
                kind,value=self.q.get_nowait()
                if kind=='line':self._line(value)
                elif kind=='done':
                    self.working=False
                    self.process=None
                    for b in self.buttons:b.configure(state='normal')
                    self.stop_button.configure(state='disabled')
                    if value == 0 and self.active_mode == 'release':
                        exe = ROOT / 'release' / FILENAME
                        if exe.is_file() and exe.stat().st_size >= 15_000_000:
                            self.status_var.set('EXE 已生成，请完成 Windows 实机安装验收')
                            self._line('======== [SUCCESS] 已验证安装 EXE 文件存在：'+str(exe)+' ========')
                        else:
                            self.status_var.set('构建报告成功，但没有找到完整 EXE，请检查日志')
                            self._line('======== [FAILED] 未找到有效 EXE，请检查 release 和构建日志。 ========')
                    elif value == 0:
                        msg = '环境检查通过' if self.active_mode == 'env' else '源码与安全自检通过'
                        self.status_var.set(msg + '（未执行 EXE 构建）')
                        self._line('======== [SUCCESS] '+msg+'。此步骤不会生成 EXE。 ========')
                    else:
                        self.status_var.set(f'失败（返回码 {value}），窗口与日志均已保留')
                        self._line('======== [FAILED] 已保留全部日志：'+str(self.logfile)+' ========')
        except queue.Empty:
            pass
        self.after(120,self._poll)

    def _browse_electron_zip(self):
        initial = Path.home() / 'Downloads'
        value = filedialog.askopenfilename(
            title='选择 Electron v44.10.2 的官方 Windows x64 ZIP',
            initialdir=str(initial if initial.is_dir() else ROOT),
            filetypes=[('Electron ZIP', '*.zip'), ('所有文件', '*.*')]
        )
        if value:
            self.electron_zip_var.set(value)

    def _logs(self):
        LOG_DIR.mkdir(parents=True,exist_ok=True)
        os.startfile(str(LOG_DIR))

    def _release(self):
        target=ROOT/'release'
        target.mkdir(parents=True,exist_ok=True)
        os.startfile(str(target))

    def _stop(self):
        if not self.working or not self.process:return
        if not messagebox.askyesno('停止构建','确定终止当前构建任务吗？临时构建目录可能需要手动清理。'):
            return
        pid=self.process.pid
        try:
            subprocess.run(['taskkill','/PID',str(pid),'/T','/F'],capture_output=True,timeout=20,
                           creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            self._line('[STOP] 已请求终止构建进程树。')
        except Exception as exc:
            self._line('[STOP WARNING] '+str(exc))

    def _close(self):
        if self.working:
            messagebox.showinfo('正在构建','请等待完成，或先点击“停止当前任务”。窗口不会自行关闭。')
            return
        self.destroy()

if __name__=='__main__':
    Builder().mainloop()
