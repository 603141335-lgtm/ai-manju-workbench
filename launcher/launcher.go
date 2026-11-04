// Windows Electron runtime bootstrapper for AI漫剧素材工作台.
// First run downloads official Electron runtime; subsequent launches work offline.
// Application source is embedded. No Node/npm/Python required on Windows.
package main

import (
    "archive/zip"
    "context"
    "crypto/sha256"
    "encoding/hex"
    "embed"
    "errors"
    "fmt"
    "io"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "strings"
    "time"
)

const version="45.2.2"
const appVersion="1.0.0"
const electronArchive="electron-v"+version+"-win32-x64.zip"
const electronSHA256="a234388419ccbcb18dd2feec856e4ae1832499e200837f23f8e653bd51ff3be5"
//go:embed app/*
var application embed.FS

func logf(format string,a ...any){fmt.Printf(format+"\n",a...)}
func exists(p string)bool{s,e:=os.Stat(p);return e==nil&&!s.IsDir()}
func copyApp(dir string)error{
    if err:=os.MkdirAll(dir,0700);err!=nil{return err}
    names:=[]string{"package.json","main.js","preload.js","parser.js","index.html","style.css","renderer.js","drag-test.html","drag.png"}
    for _,n:=range names{
        b,err:=application.ReadFile("app/"+n);if err!=nil{return err}
        dst:=filepath.Join(dir,n)
        if err:=os.WriteFile(dst,b,0600);err!=nil{return err}
    }
    return nil
}
func downloadFile(url,dest string)error{
    logf("尝试下载：%s",url)
    ctx,cancel:=context.WithTimeout(context.Background(),9*time.Minute);defer cancel()
    req,err:=http.NewRequestWithContext(ctx,"GET",url,nil);if err!=nil{return err}
    req.Header.Set("User-Agent","AIManjuWorkbench/1.0")
    client:=&http.Client{Timeout:0}
    resp,err:=client.Do(req);if err!=nil{return err};defer resp.Body.Close()
    if resp.StatusCode!=200{return fmt.Errorf("服务器返回 HTTP %d",resp.StatusCode)}
    f,err:=os.Create(dest);if err!=nil{return err};defer f.Close()
    buf:=make([]byte,512*1024);var total int64;nextMB:=int64(20)*1024*1024
    for{
        n,readErr:=resp.Body.Read(buf)
        if n>0{if _,err=f.Write(buf[:n]);err!=nil{return err};total+=int64(n)
          if total>=nextMB{logf("已下载 %d MB",total/(1024*1024));nextMB+=20*1024*1024}
        }
        if readErr==io.EOF{break};if readErr!=nil{return readErr}
    }
    if total<30*1024*1024{return fmt.Errorf("下载文件只有 %d 字节，可能不是 Electron 压缩包",total)}
    if err:=f.Sync();err!=nil{return err}
    logf("下载完成：%d MB",total/(1024*1024));return nil
}
func verifySHA256(file string)error{
    fd,err:=os.Open(file);if err!=nil{return err};defer fd.Close()
    h:=sha256.New();if _,err:=io.Copy(h,fd);err!=nil{return err}
    got:=hex.EncodeToString(h.Sum(nil))
    if got!=electronSHA256{return fmt.Errorf("Electron 官方 SHA256 校验失败（期望 %s，实际 %s）",electronSHA256,got)}
    logf("官方 SHA256 校验通过")
    return nil
}
func extractZip(archive, dest string)error{
    r,err:=zip.OpenReader(archive);if err!=nil{return fmt.Errorf("不是有效的 ZIP：%w",err)};defer r.Close()
    if len(r.File)>10000{return errors.New("运行库文件数量异常")}
    for _,file:=range r.File{
        name:=filepath.FromSlash(file.Name)
        if filepath.IsAbs(name)||strings.Contains(file.Name,"../")||strings.Contains(file.Name,"..\\") {return errors.New("安装包包含非法文件路径")}
        target:=filepath.Join(dest,name)
        rel,err:=filepath.Rel(dest,target)
        if err!=nil||rel==".."||strings.HasPrefix(rel,".."+string(filepath.Separator)){return errors.New("文件路径越界")}
        if file.FileInfo().IsDir(){if err:=os.MkdirAll(target,0700);err!=nil{return err};continue}
        if file.UncompressedSize64>2*1024*1024*1024{return errors.New("单个文件体积过大")}
        if err:=os.MkdirAll(filepath.Dir(target),0700);err!=nil{return err}
        reader,err:=file.Open();if err!=nil{return err}
        out,err:=os.OpenFile(target,os.O_WRONLY|os.O_CREATE|os.O_TRUNC,0600)
        if err!=nil{reader.Close();return err}
        _,cpErr:=io.Copy(out,io.LimitReader(reader,2*1024*1024*1024+1));closeErr:=out.Close();reader.Close()
        if cpErr!=nil{return cpErr};if closeErr!=nil{return closeErr}
    }
    if !exists(filepath.Join(dest,"electron.exe")){return errors.New("ZIP 解压后未找到 electron.exe")}
    return nil
}
func installRuntime(root,exeDir string)(string,error){
    runtimeDir:=filepath.Join(root,"runtime","v"+version);runtimeExe:=filepath.Join(runtimeDir,"electron.exe")
    if exists(runtimeExe){return runtimeExe,nil}
    if err:=os.MkdirAll(filepath.Dir(runtimeDir),0700);err!=nil{return "",err}
    archive:=filepath.Join(root,electronArchive)
    if exists(filepath.Join(exeDir,electronArchive)){
        archive=filepath.Join(exeDir,electronArchive)
        logf("找到与启动器放在一起的 Electron 运行库 ZIP，将使用本地文件")
    }else{
        if !exists(archive){
           mirrors:=[]string{
             "https://npmmirror.com/mirrors/electron/"+version+"/"+electronArchive,
             "https://registry.npmmirror.com/-/binary/electron/"+version+"/"+electronArchive,
             "https://github.com/electron/electron/releases/download/v"+version+"/"+electronArchive,
           }
           var last error
           for _,url:=range mirrors{
             tmp:=archive+".partial";_ = os.Remove(tmp)
             if err:=downloadFile(url,tmp);err!=nil{last=err;logf("下载源失败：%v",err);_ = os.Remove(tmp);continue}
             if err:=os.Rename(tmp,archive);err!=nil{return "",err}
             last=nil;break
           }
           if last!=nil{return "",fmt.Errorf("所有下载源都不可用：%w",last)}
        }
    }
    if err:=verifySHA256(archive);err!=nil{return "",err}
    staging:=runtimeDir+"_installing";_ = os.RemoveAll(staging)
    if err:=os.MkdirAll(staging,0700);err!=nil{return "",err}
    logf("正在解压运行库，首次需要一些磁盘空间……")
    if err:=extractZip(archive,staging);err!=nil{_ = os.RemoveAll(staging);return "",err}
    _ = os.RemoveAll(runtimeDir)
    if err:=os.Rename(staging,runtimeDir);err!=nil{return "",err}
    logf("运行库安装完成，后续启动不再下载")
    return runtimeExe,nil
}
func main(){
    fmt.Println("==========================================")
    fmt.Println(" AI漫剧素材工作台 Windows 启动器 v"+appVersion)
    fmt.Println("==========================================")
    root:=filepath.Join(os.Getenv("LOCALAPPDATA"),"AIManjuWorkbench")
    if root=="AIManjuWorkbench"{if d,e:=os.UserConfigDir();e==nil{root=filepath.Join(d,"AIManjuWorkbench")}}
    if err:=os.MkdirAll(root,0700);err!=nil{logf("无法创建软件目录：%v",err);pause();return}
    exe,_:=os.Executable();exeDir:=filepath.Dir(exe)
    appDir:=filepath.Join(root,"app",appVersion)
    if err:=copyApp(appDir);err!=nil{logf("无法安装工作台文件：%v",err);pause();return}
    runtimeExe,err:=installRuntime(root,exeDir)
    if err!=nil{
        logf("\n首次安装失败：%v",err)
        logf("可从官方发布页手动获取 %s",electronArchive)
        logf("把 ZIP 放在启动器 EXE 旁边，再重新双击即可。")
        logf("官方地址：https://github.com/electron/electron/releases/tag/v%s",version)
        pause();return
    }
    logf("正在打开 AI漫剧素材工作台……")
    cmd:=exec.Command(runtimeExe,appDir)
    cmd.Dir=appDir
    if err:=cmd.Start();err!=nil{logf("程序启动失败：%v",err);pause();return}
    logf("已启动。可以关闭本窗口，软件会独立运行。")
}
func pause(){fmt.Println("按回车退出……");fmt.Scanln()}
