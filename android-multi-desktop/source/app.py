"""安卓多开工作台 v1.0 — native Windows LDPlayer multi-instance dashboard.

This is NOT an Android emulator. It connects to the user's installed LDPlayer,
shows the real instances, and controls their lifecycle via official ldconsole CLI.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
from tkinter import ttk
from typing import Optional

from ldbackend import LDConsole, LDPlayerError, Instance, autodetect, tile_windows

BG = '#F4F7FD'
WHITE = '#FFFFFF'
NAV = '#111C37'
NAVLIGHT = '#233153'
PRIMARY = '#386FF5'
PRIMARYHOVER = '#235CE8'
INK = '#17233D'
TEXT2 = '#75839C'
LINE = '#E6EBF4'
SOFT = '#EAF0FF'
MINT = '#15A57A'
RED = '#D7526C'
FONT = 'Microsoft YaHei UI' if sys.platform=='win32' else 'Noto Sans CJK SC'


def cfg_file() -> Path:
    folder = Path(os.environ.get('APPDATA') or Path.home()/'.config')/'VirtualMobileDesk'
    folder.mkdir(parents=True,exist_ok=True)
    return folder/'settings.json'


def read_cfg() -> dict:
    try: return json.loads(cfg_file().read_text(encoding='utf-8'))
    except (OSError,ValueError,TypeError): return {}


def save_cfg(value:dict) -> None:
    cfg_file().write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')


class CTA(tk.Canvas):
    def __init__(self,parent,text,command,kind='primary',width=116,height=36,font_size=11):
        bg=PRIMARY if kind=='primary' else (SOFT if kind=='secondary' else WHITE)
        fg=WHITE if kind=='primary' else (PRIMARY if kind=='secondary' else TEXT2)
        border=PRIMARY if kind=='primary' else (SOFT if kind=='secondary' else LINE)
        super().__init__(parent,width=width,height=height,highlightthickness=0,bg=parent.cget('bg'),cursor='hand2')
        self.command=command;self.colors=(bg,fg,border);self.size=(width,height)
        self.bind('<Button-1>',lambda _e:self.command())
        self.bind('<Enter>',self.on_enter);self.bind('<Leave>',self.on_leave)
        self.draw(bg,fg,border,text,font_size)
        self.label=text;self.fs=font_size
    def draw(self,bg,fg,border,txt,fs):
        self.delete('all');w,h=self.size;r=11
        self.create_polygon(r,0,w-r,0,w, r,w,h-r,w-r,h,r,h,0,h-r,0,r,smooth=True,fill=bg,outline=border,width=1)
        self.create_text(w/2,h/2,text=txt,fill=fg,font=(FONT,fs,'bold'))
    def on_enter(self,_e):
        self.draw(PRIMARYHOVER if self.colors[0]==PRIMARY else '#DDE8FF',WHITE if self.colors[0]==PRIMARY else PRIMARY,self.colors[2],self.label,self.fs)
    def on_leave(self,_e):self.draw(*self.colors,self.label,self.fs)


class MobileDesk:
    def __init__(self,root:tk.Tk,demo:bool=False):
        self.root=root
        self.root.title('云端分身台 · 安卓多开工作台 v1.0')
        self.root.geometry('1310x840')
        self.root.minsize(980,680)
        self.root.configure(bg=BG)
        self.config=read_cfg()
        self.exe=Path(self.config['ldconsole']) if self.config.get('ldconsole') else autodetect()
        if self.exe and not self.exe.is_file():self.exe=None
        self.demo=demo or self.exe is None
        self.instances:list[Instance]=[]
        self.filtered:list[Instance]=[]
        self.search=tk.StringVar()
        self.search.trace_add('write',lambda *_:self.render_cards())
        self.busy=False
        self.active_page='overview'
        self.status=tk.StringVar(value='正在准备管理器…')
        self.active_columns=3
        self._initialize()
        if self.demo:
            self.instances=self.demo_instances()
            self.status.set('演示模式：以下为模拟数据。连接雷电模拟器后才能真实操作。')
            self.refresh_ui()
        else:self.refresh()

    def demo_instances(self):
        names=['豆包 · 主账号','豆包 · 工作号','豆包 · 素材号','可灵 · 创作号','即梦 · 视频号','豆包 · 备用号']
        return [Instance(i,n, running=(i<2),width=540,height=960,dpi=240) for i,n in enumerate(names)]

    def _label(self,parent,text,size=11,fg=INK,bold=False,**kw):
        return tk.Label(parent,text=text,font=(FONT,size,'bold' if bold else 'normal'),bg=parent.cget('bg'),fg=fg,**kw)

    def _initialize(self):
        self.layout=tk.Frame(self.root,bg=BG)
        self.layout.pack(fill='both',expand=True)
        self.sidebar=tk.Frame(self.layout,bg=NAV,width=234)
        self.sidebar.pack(side='left',fill='y')
        self.sidebar.pack_propagate(False)
        brand=tk.Frame(self.sidebar,bg=NAV)
        brand.pack(fill='x',padx=22,pady=(28,30))
        logo=tk.Canvas(brand,width=43,height=43,bg=NAV,highlightthickness=0)
        logo.pack(side='left',padx=(0,10))
        logo.create_rectangle(3,3,38,38,fill=PRIMARY,outline='',width=0)
        logo.create_text(21,20,text='▣',font=(FONT,23,'bold'),fill=WHITE)
        l=tk.Frame(brand,bg=NAV);l.pack(side='left',fill='x')
        self._label(l,'安卓多开',15,WHITE,True).pack(anchor='w')
        self._label(l,'虚拟手机工作台',9,'#9DACCB').pack(anchor='w',pady=(2,0))
        nav=tk.Frame(self.sidebar,bg=NAV)
        nav.pack(fill='x',padx=12)
        self.nav_buttons=[]
        for name,key,icon in [('实例总览','overview','▦'),('窗口平铺','tile','⊞'),('软件设置','settings','⚙')]:
            row=tk.Frame(nav,bg=NAVLIGHT if key=='overview' else NAV,cursor='hand2')
            row.pack(fill='x',pady=4)
            row.bind('<Button-1>',lambda e,k=key:self.navigate(k))
            tk.Label(row,text=icon,bg=row.cget('bg'),fg='#CFE0FF',font=(FONT,17),width=3).pack(side='left',padx=(8,0),pady=13)
            lab=self._label(row,name,11,WHITE if key=='overview' else '#BCCBE3',key=='overview');lab.pack(side='left')
            lab.bind('<Button-1>',lambda e,k=key:self.navigate(k))
            self.nav_buttons.append((key,row,lab))
        foot=tk.Frame(self.sidebar,bg=NAV)
        foot.pack(side='bottom',fill='x',padx=22,pady=25)
        self._label(foot,'本地运行 · 数据留在电脑',9,'#9FB0CB').pack(anchor='w')
        self._label(foot,'v1.0  原生 Windows 管理器',9,'#7385A4').pack(anchor='w',pady=(7,0))

        self.main=tk.Frame(self.layout,bg=BG)
        self.main.pack(side='left',fill='both',expand=True)
        self.header=tk.Frame(self.main,bg=WHITE,height=93)
        self.header.pack(fill='x')
        self.header.pack_propagate(False)
        self.titles=tk.Frame(self.header,bg=WHITE)
        self.titles.pack(side='left',padx=32,pady=19)
        self._label(self.titles,'虚拟手机管理',20,INK,True).pack(anchor='w')
        self._label(self.titles,'统一管理多个独立安卓实例，登录互不干扰',10,TEXT2).pack(anchor='w',pady=(3,0))
        self.right_header=tk.Frame(self.header,bg=WHITE)
        self.right_header.pack(side='right',padx=25)
        CTA(self.right_header,'＋ 新建虚拟机',self.new_instance,'primary',width=148,height=38).pack(side='right',padx=(8,0))
        CTA(self.right_header,'⟳  刷新',self.refresh,'secondary',width=90,height=38).pack(side='right')

        self.area=tk.Frame(self.main,bg=BG)
        self.area.pack(fill='both',expand=True,padx=30,pady=(19,11))
        self.banner=tk.Frame(self.area,bg=SOFT,height=53)
        self.banner.pack(fill='x',pady=(0,16))
        self.banner.pack_propagate(False)
        self.banner_var=tk.StringVar()
        self.banner_text=tk.Label(self.banner,textvariable=self.banner_var,font=(FONT,10),bg=SOFT,fg='#41619C',anchor='w')
        self.banner_text.pack(fill='both',expand=True,padx=16)

        stats=tk.Frame(self.area,bg=BG)
        stats.pack(fill='x',pady=(0,17))
        self.stat_widgets=[]
        for t in ['全部实例','运行中','未启动']:
            f=tk.Frame(stats,bg=WHITE,highlightbackground=LINE,highlightthickness=1)
            f.pack(side='left',fill='x',expand=True,padx=(0,12))
            self._label(f,t,10,TEXT2).pack(anchor='w',padx=18,pady=(13,1))
            value=self._label(f,'0',23,INK,True)
            value.pack(anchor='w',padx=18,pady=(0,13))
            self.stat_widgets.append(value)

        toolbar=tk.Frame(self.area,bg=BG)
        toolbar.pack(fill='x',pady=(0,14))
        left=tk.Frame(toolbar,bg=BG);left.pack(side='left')
        self._label(left,'分身实例',16,INK,True).pack(side='left',padx=(0,12))
        self._label(left,'真实实例列表',10,TEXT2).pack(side='left')
        right=tk.Frame(toolbar,bg=BG);right.pack(side='right')
        self.searchbox=tk.Entry(right,textvariable=self.search,font=(FONT,10),bg=WHITE,fg=INK,
            relief='flat',width=20,insertbackground=INK,highlightbackground=LINE,highlightthickness=1)
        self.searchbox.pack(side='left',ipady=9,padx=(0,10))
        CTA(right,'▦  平铺窗口',lambda:self.tile(3),'secondary',width=114,height=36).pack(side='left',padx=(0,8))
        CTA(right,'2 列',lambda:self.tile(2),'outline',width=57,height=36).pack(side='left',padx=(0,7))
        CTA(right,'3 列',lambda:self.tile(3),'outline',width=57,height=36).pack(side='left')

        body=tk.Frame(self.area,bg=BG)
        body.pack(fill='both',expand=True)
        self.canvas=tk.Canvas(body,bg=BG,highlightthickness=0)
        self.canvas.pack(side='left',fill='both',expand=True)
        scrollbar=ttk.Scrollbar(body,orient='vertical',command=self.canvas.yview)
        scrollbar.pack(side='right',fill='y')
        self.canvas.configure(yscrollcommand=scrollbar.set)
        self.cards=tk.Frame(self.canvas,bg=BG)
        self.scroll_window=self.canvas.create_window((0,0),window=self.cards,anchor='nw')
        self.cards.bind('<Configure>',lambda e:self.canvas.configure(scrollregion=self.canvas.bbox('all')))
        self.canvas.bind('<Configure>',self._on_canvas_resize)
        self.canvas.bind_all('<MouseWheel>',self._wheel)

        self.statusbar=tk.Frame(self.main,bg=WHITE,height=31)
        self.statusbar.pack(side='bottom',fill='x')
        self._label(self.statusbar,'●',9,MINT).pack(side='left',padx=(25,8))
        self.status_label=tk.Label(self.statusbar,textvariable=self.status,bg=WHITE,fg=TEXT2,font=(FONT,9),anchor='w')
        self.status_label.pack(side='left',fill='x',expand=True,pady=6)
        self.root.after(8000,self.periodic_refresh)

    def navigate(self,key):
        if key=='settings':return self.settings_dialog()
        if key=='tile':return self.tile(3)
        self.render_cards()

    def _wheel(self,e):
        if self.canvas.winfo_exists():self.canvas.yview_scroll(-1*(e.delta//120),'units')

    def _on_canvas_resize(self,event):
        self.canvas.itemconfigure(self.scroll_window,width=event.width)
        if event.width>1090:cols=4
        elif event.width>720:cols=3
        else:cols=2
        if cols!=self.active_columns:
            self.active_columns=cols
            self.root.after_idle(self.render_cards)

    def refresh_ui(self):
        total=len(self.instances)
        running=sum(x.running for x in self.instances)
        for lab,num in zip(self.stat_widgets,[total,running,total-running]):lab.config(text=str(num))
        if self.demo:
            self.banner_var.set('演示模式  ·  这里展示的是示例界面。安装雷电并绑定 ldconsole.exe 后，才会连接真实虚拟机。')
        else:
            self.banner_var.set('已连接雷电引擎  ·  各实例独立运行 Android。单击启动或关闭；平铺会调整真实的雷电窗口。')
        self.render_cards()

    def render_cards(self):
        if not hasattr(self,'cards'):return
        for ch in self.cards.winfo_children():ch.destroy()
        query=self.search.get().strip().lower()
        rows=[i for i in self.instances if query in i.name.lower() or query in str(i.index)]
        cols=self.active_columns
        for c in range(cols):self.cards.columnconfigure(c,weight=1,uniform='devices')
        for i,item in enumerate(rows):self._render_card(item,i//cols,i%cols)
        if not rows:
            empty=tk.Frame(self.cards,bg=WHITE,highlightbackground=LINE,highlightthickness=1)
            empty.grid(row=0,column=0,columnspan=cols,sticky='nsew',padx=5,pady=7,ipady=40)
            self._label(empty,'还没有虚拟手机',17,INK,True).pack(pady=(12,8))
            self._label(empty,'点击“新建虚拟机”，或者在设置中连接雷电模拟器。',10,TEXT2).pack()

    def _render_card(self,inst:Instance,r:int,c:int):
        card=tk.Frame(self.cards,bg=WHITE,highlightbackground=LINE,highlightthickness=1)
        card.grid(row=r,column=c,sticky='nsew',padx=6,pady=7)
        top=tk.Frame(card,bg=WHITE)
        top.pack(fill='x',padx=16,pady=(13,6))
        self._label(top,f'实例 {inst.index+1:02d}',9,TEXT2).pack(side='left')
        badge=tk.Label(top,text=' ● 运行中 ' if inst.running else ' ○ 未启动 ',font=(FONT,9),
            bg='#E3F8F0' if inst.running else '#EDF1F7',fg=MINT if inst.running else TEXT2)
        badge.pack(side='right')
        preview=tk.Canvas(card,height=113,bg='#F4F8FF',highlightthickness=0)
        preview.pack(fill='x',padx=16,pady=6)
        preview.bind('<Configure>',lambda e,v=preview,ins=inst:self._draw_device(v,e.width,ins))
        self._label(card,inst.name,13,INK,True).pack(anchor='w',padx=17,pady=(8,4))
        subtitle=f'Android 独立实例 · 索引 {inst.index}'
        self._label(card,subtitle,9,TEXT2).pack(anchor='w',padx=17,pady=(0,12))
        actions=tk.Frame(card,bg=WHITE)
        actions.pack(fill='x',padx=15,pady=(0,15))
        action='关闭' if inst.running else '启动'
        CTA(actions,action,lambda i=inst:self.toggle(i),'primary',width=88,height=34).pack(side='left')
        CTA(actions,'更多 ···',lambda i=inst:self.show_actions(i),'secondary',width=98,height=34).pack(side='right')

    def _draw_device(self,canvas,w,inst):
        canvas.delete('all')
        cx=w/2;cy=56
        canvas.create_oval(cx-76,cy-42,cx+76,cy+43,fill='#EAF1FF',outline='')
        canvas.create_rectangle(cx-23,cy-45,cx+23,cy+45,fill='#FFFFFF',outline='#91ACEC',width=2)
        canvas.create_rectangle(cx-19,cy-35,cx+19,cy+29,fill='#E1EBFF',outline='')
        canvas.create_oval(cx-12,cy-20,cx+12,cy+3,fill='#9BBEFF',outline='')
        canvas.create_arc(cx-14,cy-6,cx+14,cy+20,start=188,extent=160,outline=PRIMARY,width=4,style='arc')
        canvas.create_oval(cx-2,cy+35,cx+2,cy+39,fill='#A9B8CF',outline='')
        if inst.running:
            canvas.create_oval(cx+32,cy+19,cx+50,cy+37,fill=MINT,outline=WHITE,width=2)
            canvas.create_text(cx+41,cy+28,text='✓',fill=WHITE,font=(FONT,10,'bold'))

    def _set_busy(self,busy:bool,text:str=''):
        self.busy=busy
        if text:self.status.set(text)

    def async_task(self,fn,done_message='已完成',refresh=True):
        if self.demo:
            messagebox.showinfo('演示模式','当前只是界面预览。请在软件设置里指定雷电 ldconsole.exe。')
            return
        if self.busy:
            self.status.set('已有操作正在执行，请先完成上一次操作。')
            return
        self._set_busy(True,'正在执行命令，请勿关闭工作台…')
        def work():
            try:
                outcome=fn()
                def success():
                    self._set_busy(False,done_message)
                    if refresh:self.refresh()
                self.root.after(0,success)
            except Exception as exc:
                message=str(exc)
                def failure():
                    self._set_busy(False,'操作失败')
                    messagebox.showerror('操作失败',message)
                self.root.after(0,failure)
        threading.Thread(target=work,daemon=True).start()

    def refresh(self):
        if self.demo:
            self.status.set('当前为演示模式，请到“软件设置”选择雷电模拟器。')
            self.refresh_ui();return
        if self.busy:return
        self._set_busy(True,'正在读取雷电实例…')
        def work():
            try:
                items=LDConsole(self.exe).list_instances()
                def ok():
                    self.instances=items
                    self._set_busy(False,f'已刷新 · 共 {len(items)} 台虚拟机')
                    self.refresh_ui()
                self.root.after(0,ok)
            except Exception as exc:
                problem=str(exc)
                def fail():
                    self._set_busy(False,'读取实例失败：'+problem)
                    messagebox.showerror('连接失败',problem)
                self.root.after(0,fail)
        threading.Thread(target=work,daemon=True).start()

    def periodic_refresh(self):
        # Refresh only while idle, without overwriting current user's dialogs.
        if not self.demo and not self.busy and self.root.winfo_exists():self.refresh()
        if self.root.winfo_exists():self.root.after(13000,self.periodic_refresh)

    def new_instance(self):
        if self.demo:return self.async_task(lambda:None)
        name=simpledialog.askstring('新建安卓虚拟机','分身名称（例如：豆包01）：',parent=self.root)
        if not name:return
        if len(name)>50:
            messagebox.showwarning('名称太长','请将名称控制在50字符以内。');return
        self.async_task(lambda:LDConsole(self.exe).add(name),'已创建新分身')

    def toggle(self,inst:Instance):
        command='关闭' if inst.running else '启动'
        self.async_task(lambda:LDConsole(self.exe).quit(inst.index) if inst.running
            else LDConsole(self.exe).launch(inst.index),f'已发送{command}命令：{inst.name}')

    def show_actions(self,inst:Instance):
        menu=tk.Menu(self.root,tearoff=0,font=(FONT,10))
        menu.add_command(label='▶ 启动实例',command=lambda:self.toggle(inst) if not inst.running else None)
        menu.add_command(label='■ 关闭实例',command=lambda:self.toggle(inst) if inst.running else None)
        menu.add_separator()
        menu.add_command(label='复制为新分身',command=lambda:self.clone_instance(inst))
        menu.add_command(label='重命名',command=lambda:self.rename_instance(inst))
        menu.add_command(label='安装 APK 到此实例',command=lambda:self.install_apk(inst))
        menu.add_command(label='备份整个安卓实例',command=lambda:self.backup_instance(inst))
        menu.add_separator()
        menu.add_command(label='删除实例及其数据',command=lambda:self.delete_instance(inst))
        x=self.root.winfo_pointerx();y=self.root.winfo_pointery()
        try: menu.tk_popup(x,y)
        finally: menu.grab_release()

    def clone_instance(self,inst:Instance):
        if self.demo:return self.async_task(lambda:None)
        name=simpledialog.askstring('复制虚拟机','新分身名称：',initialvalue=inst.name+' - 副本',parent=self.root)
        if not name:return
        if not messagebox.askyesno('复制确认','复制会连同原有应用数据、登录状态一起复制。\n如需独立新账号，建议“新建虚拟机”后手动安装应用。\n\n继续复制吗？'):
            return
        self.async_task(lambda:LDConsole(self.exe).copy(name,inst.index),'复制完成')

    def rename_instance(self,inst:Instance):
        if self.demo:return self.async_task(lambda:None)
        name=simpledialog.askstring('重命名',f'实例 {inst.index} 的新名称：',initialvalue=inst.name,parent=self.root)
        if name:self.async_task(lambda:LDConsole(self.exe).rename(inst.index,name),'重命名完成')

    def install_apk(self,inst:Instance):
        if self.demo:return self.async_task(lambda:None)
        filename=filedialog.askopenfilename(parent=self.root,title='选择安卓 APK',filetypes=[('Android APK','*.apk')])
        if filename:self.async_task(lambda:LDConsole(self.exe).install_apk(inst.index,filename),'APK 已提交安装')

    def backup_instance(self,inst:Instance):
        if self.demo:return self.async_task(lambda:None)
        filename=filedialog.asksaveasfilename(parent=self.root,title='备份安卓实例',defaultextension='.ldbk',
          initialfile=f'{inst.name}.ldbk',filetypes=[('雷电备份','*.ldbk')])
        if filename:self.async_task(lambda:LDConsole(self.exe).backup(inst.index,filename),'备份完成',False)

    def delete_instance(self,inst:Instance):
        if self.demo:return self.async_task(lambda:None)
        if not messagebox.askyesno('永久删除','将彻底删除实例 “'+inst.name+'” 及其中的应用、账号数据。\n这不可撤销，请先备份。\n\n确定要删除吗？',icon='warning'):
            return
        confirm=simpledialog.askstring('再次确认删除','请输入 DELETE 以确认永久删除：',parent=self.root)
        if confirm=='DELETE':self.async_task(lambda:LDConsole(self.exe).remove(inst.index),'实例已删除')

    def tile(self,columns):
        if self.demo:return self.async_task(lambda:None)
        if self.busy:return
        self._set_busy(True,'正在排列真实安卓模拟器窗口…')
        def work():
            try:
                items=LDConsole(self.exe).list_instances()
                moved=tile_windows(items,columns)
                if moved==0 and columns==3:
                    LDConsole(self.exe).sort_windows()
                def done():
                    self._set_busy(False,f'窗口已整理：{moved} 台；若仍未显示请先启动实例')
                    self.refresh()
                self.root.after(0,done)
            except Exception as exc:
                problem=str(exc)
                self.root.after(0,lambda:messagebox.showerror('平铺失败',problem))
                self.root.after(0,lambda:self._set_busy(False,'窗口平铺未完成'))
        threading.Thread(target=work,daemon=True).start()

    def settings_dialog(self):
        dlg=tk.Toplevel(self.root)
        dlg.title('连接雷电模拟器')
        dlg.geometry('705x315')
        dlg.resizable(False,False)
        dlg.configure(bg=WHITE)
        dlg.transient(self.root);dlg.grab_set()
        pad=tk.Frame(dlg,bg=WHITE);pad.pack(fill='both',expand=True,padx=23,pady=20)
        self._label(pad,'雷电模拟器连接设置',17,INK,True).pack(anchor='w')
        self._label(pad,'选择安装目录中的 ldconsole.exe / dnconsole.exe。首次使用请先安装雷电模拟器。',10,TEXT2).pack(anchor='w',pady=(8,16))
        row=tk.Frame(pad,bg=WHITE);row.pack(fill='x')
        selected=tk.StringVar(value=str(self.exe) if self.exe else '')
        entry=tk.Entry(row,textvariable=selected,font=(FONT,10),bg=BG,fg=INK,relief='flat',highlightbackground=LINE,highlightthickness=1)
        entry.pack(side='left',fill='x',expand=True,ipady=10)
        def choose():
            f=filedialog.askopenfilename(parent=dlg,title='选择雷电控制程序',filetypes=[('雷电命令行程序','ldconsole.exe dnconsole.exe'),('EXE','*.exe')])
            if f:selected.set(f)
        CTA(row,'浏览…',choose,'secondary',width=90).pack(side='left',padx=(9,0))
        self._label(pad,'常见位置：C:\\leidian\\LDPlayer9\\ldconsole.exe  或  D:\\leidian\\LDPlayer14\\ldconsole.exe',9,TEXT2).pack(anchor='w',pady=(10,20))
        def connected():
            p=Path(selected.get().strip('" '))
            if not p.is_file() or p.name.lower() not in ('ldconsole.exe','dnconsole.exe'):
                messagebox.showerror('路径错误','必须选择真实存在的 ldconsole.exe 或 dnconsole.exe',parent=dlg);return
            self.exe=p
            self.config['ldconsole']=str(p);save_cfg(self.config)
            self.demo=False
            dlg.destroy();self.refresh()
        buttons=tk.Frame(pad,bg=WHITE);buttons.pack(fill='x')
        CTA(buttons,'保存并连接',connected,'primary',width=138).pack(side='right')
        CTA(buttons,'自动检测',lambda:selected.set(str(autodetect() or '')),'secondary',width=112).pack(side='right',padx=9)
        dlg.lift()


def main():
    if sys.platform=='win32':
        try:ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:pass
    root=tk.Tk()
    ico=Path(getattr(sys,'_MEIPASS',Path(__file__).parent))/'icon.ico'
    if ico.is_file():
        try:root.iconbitmap(str(ico))
        except Exception:pass
    app=MobileDesk(root,demo='--demo' in sys.argv)
    root.mainloop()


if __name__=='__main__':
    import ctypes
    main()
