# 安卓多开工作台 v1.0

这是 Windows 上的真实雷电模拟器多开管理工具，非安卓虚拟机本体，不是网页套壳。

功能：自动检测 ldconsole.exe、列出实际实例状态、新建/复制/启动/关闭/重命名/删除、安装 APK、备份、搜索、2/3列窗口平铺。管理界面使用 Python 自带 tkinter，Windows PyInstaller 生成独立 EXE。
独立安卓实例由已经安装的雷电模拟器提供。每个实例隔离应用数据，仍然共享宿主 PC 硬件及网络。
没有雷电时启动展示醒目的演示模式，演示卡片不对应真实实例；安装后在设置中绑定 ldconsole.exe 才能管理真实实例。
**本版不能把真实安卓渲染画面嵌入工作台内部**，而是控制并排列独立模拟器窗口。
新建的实例需分别安装应用、手动登录独立账号；不读取密码、不帮忙绕过其他平台的限制。

使用方式：从 GitHub Actions 成功运行任务中下载 AndroidMultiDesk-v1.0-Windows-EXE，解压后运行 AndroidMultiDesk.exe。
源码：android-multi-desktop/source/app.py、ldbackend.py；工作流：.github/workflows/build-multi-instance-windows.yml。
