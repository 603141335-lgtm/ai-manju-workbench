"""LDPlayer instance management via the documented ldconsole/dnconsole interface.
No privileged APIs, root, credential capture, APK modification, or account bypass.
"""
from __future__ import annotations
import ctypes
from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Optional


@dataclass(frozen=True)
class Instance:
    index: int
    name: str
    hwnd: int = 0
    bind_hwnd: int = 0
    running: bool = False
    pid: int = 0
    vbox_pid: int = 0
    width: int = 0
    height: int = 0
    dpi: int = 0


def parse_list2(text: str) -> list[Instance]:
    """Support the historical 7-column and newer 10-column list2 output."""
    result: list[Instance] = []
    for raw in text.splitlines():
        line = raw.strip().strip('\ufeff')
        if not line:
            continue
        columns = [part.strip() for part in line.split(',')]
        if len(columns) < 7:
            continue
        try:
            index = int(columns[0])
            if not (0 <= index < 99999):
                continue
            def n(i: int) -> int:
                try:
                    return int(columns[i]) if len(columns)>i else 0
                except ValueError:
                    return 0
            result.append(Instance(index=index,name=columns[1],hwnd=n(2),
                bind_hwnd=n(3),running=n(4)==1,pid=n(5),vbox_pid=n(6),
                width=n(7),height=n(8),dpi=n(9)))
        except (ValueError,IndexError):
            continue
    return sorted(result,key=lambda x:x.index)


class LDPlayerError(RuntimeError):
    pass


def _candidate_bases() -> list[Path]:
    roots=[]
    for key in ('ProgramFiles','ProgramFiles(x86)','LOCALAPPDATA'):
        if os.environ.get(key): roots.append(Path(os.environ[key]))
    for letter in 'CDEF':
        roots.append(Path(f'{letter}:/'))
    names=['LDPlayer','LDPlayer9','LDPlayer14','LDPlayer4',
           'leidian/LDPlayer9','leidian/LDPlayer14',
           'leidian/LDPlayer','leidian/LDPlayer4','Changzhi/LDPlayer',
           'ChangZhi/LDPlayer9','ChangZhi/LDPlayer4','dnplayer','LDPlayer/LDPlayer9']
    for root in roots:
        for name in names:
            yield root / name


def autodetect() -> Optional[Path]:
    for binary in ('ldconsole.exe','dnconsole.exe'):
        p=shutil.which(binary)
        if p and Path(p).is_file():return Path(p)
    for folder in _candidate_bases():
        for binary in ('ldconsole.exe','dnconsole.exe'):
            p=folder/binary
            if p.is_file(): return p
    return None


class LDConsole:
    def __init__(self, exe: str|Path):
        self.exe=Path(exe)

    def run(self,*args:str,timeout:int=25)->str:
        if not self.exe.is_file():
            raise LDPlayerError('没有找到雷电控制程序，请在设置中选择 ldconsole.exe。')
        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)
        try:
            p=subprocess.run([str(self.exe),*map(str,args)],cwd=str(self.exe.parent),
                capture_output=True,timeout=timeout,creationflags=creationflags)
        except subprocess.TimeoutExpired as e:
            raise LDPlayerError('操作超时：'+ ' '.join(args)) from e
        except OSError as e:
            raise LDPlayerError('无法运行雷电命令：'+str(e)) from e
        def decode(bs:bytes)->str:
            for enc in ('utf-8-sig','gb18030','cp936'):
                try: return bs.decode(enc)
                except UnicodeDecodeError: pass
            return bs.decode('utf-8',errors='replace')
        output=decode(p.stdout).strip()
        errors=decode(p.stderr).strip()
        if p.returncode!=0:
            raise LDPlayerError(f'命令执行失败 ({p.returncode})：{errors or output or "未知错误"}')
        return output

    def list_instances(self)->list[Instance]:return parse_list2(self.run('list2'))
    def add(self,name:str)->str:return self.run('add','--name',name,timeout=150)
    def copy(self,name:str,source:int)->str:return self.run('copy','--name',name,'--from',str(source),timeout=240)
    def rename(self,index:int,new_name:str)->str:return self.run('rename','--index',str(index),'--title',new_name)
    def remove(self,index:int)->str:return self.run('remove','--index',str(index),timeout=150)
    def launch(self,index:int)->str:return self.run('launch','--index',str(index),timeout=80)
    def quit(self,index:int)->str:return self.run('quit','--index',str(index),timeout=60)
    def quitall(self)->str:return self.run('quitall',timeout=80)
    def install_apk(self,index:int,path:str)->str:return self.run('installapp','--index',str(index),'--filename',path,timeout=180)
    def backup(self,index:int,path:str)->str:return self.run('backup','--index',str(index),'--file',path,timeout=900)
    def sort_windows(self)->str:return self.run('sortWnd')


class RECT(ctypes.Structure):
    _fields_=[('left',ctypes.c_long),('top',ctypes.c_long),('right',ctypes.c_long),('bottom',ctypes.c_long)]


def tile_windows(instances:list[Instance],columns:int=3)->int:
    """Arrange actual LDPlayer HWND windows on screen (not fake embedded previews)."""
    if sys.platform!='win32':return 0
    user32=ctypes.windll.user32
    user32.IsWindow.argtypes=[ctypes.c_void_p]
    user32.ShowWindow.argtypes=[ctypes.c_void_p,ctypes.c_int]
    user32.MoveWindow.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int]
    user32.SystemParametersInfoW.argtypes=[ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p,ctypes.c_uint]
    work=RECT()
    if not user32.SystemParametersInfoW(48,0,ctypes.byref(work),0):
        raise LDPlayerError('无法读取 Windows 桌面区域')
    running=[i for i in instances if i.running and i.hwnd and user32.IsWindow(i.hwnd)]
    if not running:return 0
    columns=max(1,min(columns,len(running)))
    rows=(len(running)+columns-1)//columns
    pad=8
    cw=max(240,(work.right-work.left-pad*(columns+1))//columns)
    ch=max(220,(work.bottom-work.top-pad*(rows+1))//rows)
    for j,inst in enumerate(running):
        x=work.left+pad+(j%columns)*(cw+pad)
        y=work.top+pad+(j//columns)*(ch+pad)
        user32.ShowWindow(inst.hwnd,9)  # SW_RESTORE
        user32.MoveWindow(inst.hwnd,int(x),int(y),int(cw),int(ch),True)
    return len(running)