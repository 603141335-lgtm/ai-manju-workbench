# 安卓多开工作台 v1.0 | Windows EXE 构建记录

- 构建日期：2026-11-05
- 仓库：`603141335-lgtm/ai-manju-workbench`
- 独立分支：`android-multi-instance-workbench`
- 源码：`android-multi-desktop/`
- 编译源码 commit：`225931b6b6713233f41b467d8c81da334165eb5b`
- Windows 构建任务：https://github.com/603141335-lgtm/ai-manju-workbench/actions/runs/42018093547
- CI 结果：**success**；Windows 单元测试、PyInstaller 单文件 EXE、PE 文件校验和 Artifact 上传全部通过
- Artifact：`AndroidMultiDesk-v1.0-Windows-EXE` (ID `13410606250`)，包含 `AndroidMultiDesk.exe`
- EXE：10.71 MB，SHA256 `4f1635f42bcd2b87ff9fcb9061f9d51fbc6828f82df1a3768488ea10b1bfe014`
- 项目没有连接用户电脑真实安装的雷电，也没有真机测试；CI 只能证明 Windows 打包成功，不能证明不同版本模拟器兼容性。

## 第一个版本已实现
- Tkinter 桌面图形界面、六实例演示布局
- 自动查找 ldconsole.exe / dnconsole.exe；手动选取并保存雷电路径
- 通过 ldconsole 命令查询、启动、关闭、新建、复制、重命名、删除实例
- APK 安装、LDPlayer .ldbk 整机备份
- 使用 list2 真实窗口句柄按 2 / 3 列平铺（真实窗口独立于主工作台）
- 演示模式明确标注，避免把演示卡片误当作真实虚拟机

## 限制与下一步
- 必须先在 Windows 安装雷电模拟器，工具本身不包含模拟器内核。
- 目前为窗口管理器，不是将虚拟手机的实际视频画面嵌入主窗口。
- 软件可创建多实例，但同时运行数量取决于电脑 RAM/CPU 和模拟器配置。
- 每个安卓实例保存独立应用数据，但硬件与外网仍共享。
- 建议先测试创建两台豆包实例并分别登录，再增加批量操作。
