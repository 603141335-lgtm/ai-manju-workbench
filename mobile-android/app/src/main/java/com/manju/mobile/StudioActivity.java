package com.manju.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.content.*;
import android.database.Cursor;
import android.graphics.*;
import android.graphics.drawable.*;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.widget.Toast;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;
import org.json.*;

/** A native offline Android companion with a bundled HTML UI and a narrow SAF/MediaStore bridge. */
public class StudioActivity extends Activity {
    static final int PROMPT=11, FOLDER=12, VIDEO=13, BACKUP_IN=14, BACKUP_OUT=15, DESKTOP_WORKSPACE=16;
    static final String PREF="manju_v2", ALBUM="Pictures/AI漫剧待上传/";
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ArrayList<Asset> assets=new ArrayList<>();
    private final ArrayList<Asset> cloudAssets=new ArrayList<>();
    private final Object assetLock=new Object();
    private WebView web;
    private String pendingVideoKey="", backupJSON="";
    private static final Pattern CODE=Pattern.compile("(?<![A-Z0-9])(AG|BL|[ABCDE])\\s*[-_ ]?\\s*(\\d{1,4})(?:\\s*[-_－]\\s*(\\d{1,3}))?(?![A-Z0-9])");
    static class Asset {
        final String code,name,type;
        final Uri uri;
        Asset(String c,String n,String t,Uri u){code=c;name=n;type=t;uri=u;}
        JSONObject json(int i) throws JSONException {
            JSONObject j=new JSONObject();j.put("id",i);j.put("code",code);j.put("name",name);return j;
        }
    }
    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(247,249,253));
        getWindow().setNavigationBarColor(Color.rgb(255,255,255));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        web=new WebView(this);web.setBackgroundColor(Color.rgb(247,249,253));
        // Android 15 enforces edge-to-edge for targetSdk 35; reserve actual status bar insets.
        if(Build.VERSION.SDK_INT>=35){
            web.setOnApplyWindowInsetsListener((v,insets)->{
                int top=insets.getInsets(WindowInsets.Type.statusBars()).top;
                if(v.getPaddingTop()!=top)v.setPadding(0,top,0,0);
                return insets;
            });
        }
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
                return !"appassets.androidplatform.net".equals(r.getUrl().getHost());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest req){
                Uri uri=req.getUrl();String p=uri.getPath();
                if(!"https".equals(uri.getScheme())||!"appassets.androidplatform.net".equals(uri.getHost())||p==null||!p.startsWith("/assets/studio/"))return null;
                if(p.contains(".."))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
                String file="studio/"+p.substring("/assets/studio/".length());
                String mime=file.endsWith(".css")?"text/css":file.endsWith(".js")?"application/javascript":"text/html";
                try{return new WebResourceResponse(mime,"UTF-8",getAssets().open(file));}
                catch(Exception ex){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
            }
        });
        web.addJavascriptInterface(new Bridge(),"Native");
        setContentView(web);web.loadUrl("https://appassets.androidplatform.net/assets/studio/index.html");
        String cloudUid=getSharedPreferences(PREF,0).getString("cloud_uid","");
        synchronized(assetLock){cloudAssets.addAll(CloudCache.scan(getFilesDir(),cloudUid));}
        String saved=getSharedPreferences(PREF,0).getString("tree","");
        if(!saved.isEmpty())rescan(Uri.parse(saved));
    }
    private static String canonical(String src){
        if(src==null)return "";
        String s=Normalizer.normalize(src,Normalizer.Form.NFKC).toUpperCase(Locale.ROOT);
        Matcher m=CODE.matcher(s);
        if(!m.find())return "";
        String base=m.group(2);
        if(base.length()<2)base="0"+base;
        String sub=m.group(3);
        if(sub!=null && sub.length()<2)sub="0"+sub;
        return m.group(1)+base+(sub==null?"":"-"+sub);
    }
    private File promptsFile(){return new File(getFilesDir(),"manju_v2_prompts.txt");}
    private File desktopWorkspaceFile(){return new File(getFilesDir(),"doubao_v03_workspace.json");}
    private File cloudWorkspaceFile(){return new File(getFilesDir(),"cloud_user_project.json");}
    private String readAll(InputStream in,int limit)throws IOException{
        if(in==null)throw new IOException("没有读取权限");
        ByteArrayOutputStream dst=new ByteArrayOutputStream();byte[] buf=new byte[32768];int count;
        while((count=in.read(buf))>=0){dst.write(buf,0,count);if(dst.size()>limit)throw new IOException("文件大小超限");}
        return dst.toString("UTF-8");
    }
    private String fileName(Uri uri){
        try(Cursor cur=getContentResolver().query(uri,new String[]{android.provider.OpenableColumns.DISPLAY_NAME},null,null,null)){
            if(cur!=null&&cur.moveToFirst())return cur.getString(0);
        }catch(Exception ignored){} return "未命名文件";
    }
    private void send(JSONObject data){
        runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.receiveNative("+data.toString()+")",null);});
    }
    private void emit(String type,String message){
        try{JSONObject j=new JSONObject();j.put("type",type);j.put("message",message);send(j);}catch(Exception ignored){}
    }
    private void rescan(Uri tree){
        emit("notice","正在扫描参考图…");
        worker.execute(()->{
            ArrayList<Asset> found=new ArrayList<>();
            try {
                scan(tree,DocumentsContract.getTreeDocumentId(tree),found,0,new int[]{25000});
                found.sort(Comparator.comparing((Asset a)->a.code).thenComparing(a->a.name));
                synchronized(assetLock){assets.clear();assets.addAll(found);}
                emit("assets","扫描完成，共 "+found.size()+" 张图片");
            }catch(Exception e){emit("error","素材扫描失败："+e.getMessage());}
        });
    }
    private void scan(Uri tree,String node,List<Asset> out,int depth,int[] budget) {
        if(depth>24||budget[0]<=0)return;
        Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,node);
        String[] cols={DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE};
        ArrayList<String> dirs=new ArrayList<>();
        try(Cursor c=getContentResolver().query(children,cols,null,null,null)){
            if(c==null)return;
            while(c.moveToNext() && budget[0]-->0){
                String id=c.getString(0),name=c.getString(1),mime=c.getString(2);
                if(DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)){dirs.add(id);continue;}
                if(name==null||!name.matches("(?i).+\\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$"))continue;
                String code=canonical(name);
                if(!code.isEmpty())out.add(new Asset(code,name,mime,DocumentsContract.buildDocumentUriUsingTree(tree,id)));
            }
        }catch(Exception ignored){}
        for(String d:dirs)scan(tree,d,out,depth+1,budget);
    }
    private JSONArray filesJSON(){
        JSONArray array=new JSONArray();
        synchronized(assetLock){for(int i=0;i<cloudAssets.size();i++){try{array.put(cloudAssets.get(i).json(i));}catch(Exception ignored){}}for(int i=0;i<assets.size();i++){try{array.put(assets.get(i).json(i+cloudAssets.size()));}catch(Exception ignored){}}}
        return array;
    }
    private Bitmap bitmap(Uri u,int max)throws Exception{
        try(InputStream in=getContentResolver().openInputStream(u)){
            BitmapFactory.Options opt=new BitmapFactory.Options();opt.inJustDecodeBounds=true;BitmapFactory.decodeStream(in,null,opt);
            int sample=1;while(opt.outWidth/sample>max*2||opt.outHeight/sample>max*2)sample*=2;
            opt.inJustDecodeBounds=false;opt.inSampleSize=sample;opt.inPreferredConfig=Bitmap.Config.RGB_565;
            try(InputStream real=getContentResolver().openInputStream(u)){
                Bitmap b=BitmapFactory.decodeStream(real,null,opt);if(b==null)throw new IOException("图片无法解码");
                int mx=Math.max(b.getWidth(),b.getHeight());
                if(mx>max){double k=(double)max/mx;Bitmap small=Bitmap.createScaledBitmap(b,Math.max(1,(int)(b.getWidth()*k)),Math.max(1,(int)(b.getHeight()*k)),true);if(b!=small)b.recycle();return small;}
                return b;
            }
        }
    }
    private String imageData(int index,int px){
        try{
            Asset a; synchronized(assetLock){if(index<0||index>=assets.size()+cloudAssets.size())return "";a=index<cloudAssets.size()?cloudAssets.get(index):assets.get(index-cloudAssets.size());}
            Bitmap bmp=bitmap(a.uri,Math.max(110,Math.min(1400,px)));
            ByteArrayOutputStream out=new ByteArrayOutputStream();bmp.compress(Bitmap.CompressFormat.JPEG,78,out);bmp.recycle();
            return "data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);
        }catch(Exception e){return "";}
    }
    private static String safe(String s){return s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_").replaceAll("\\s+","_");}
    private static String mime(String name){
        String s=name.toLowerCase(Locale.ROOT);
        if(s.endsWith(".png"))return "image/png";
        if(s.endsWith(".webp"))return "image/webp";
        if(s.endsWith(".gif"))return "image/gif";
        if(s.endsWith(".avif"))return "image/avif";
        if(s.endsWith(".heic")||s.endsWith(".heif"))return "image/heic";
        if(s.endsWith(".bmp"))return "image/bmp";
        return "image/jpeg";
    }
    private boolean existing(String folder,String name){
        try(Cursor c=getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.Images.Media._ID},
                MediaStore.Images.Media.RELATIVE_PATH+"=? AND "+MediaStore.Images.Media.DISPLAY_NAME+"=?",
                new String[]{folder,name},null)){return c!=null&&c.moveToFirst();}
        catch(Exception ignored){return false;}
    }
    private int[] saveBatch(JSONArray tasks) {
        int copied=0,skipped=0,failed=0;
        for(int k=0;k<tasks.length();k++){
            try{
                JSONObject task=tasks.getJSONObject(k);
                String episode=safe(task.optString("episode","1")),seg=safe(task.optString("segment","1"));
                String folder=ALBUM+"第"+episode+"集/第"+seg+"段/";
                JSONArray ids=task.getJSONArray("ids");
                for(int i=0;i<ids.length();i++){
                    int id=ids.getInt(i);Asset asset;
                    synchronized(assetLock){if(id<0||id>=assets.size()+cloudAssets.size()){failed++;continue;}asset=id<cloudAssets.size()?cloudAssets.get(id):assets.get(id-cloudAssets.size());}
                    String name=String.format(Locale.ROOT,"%02d_%s_%s",i+1,asset.code,safe(asset.name));
                    if(existing(folder,name)){skipped++;continue;}
                    Uri inserted=null;
                    try{
                        ContentValues c=new ContentValues();c.put(MediaStore.Images.Media.DISPLAY_NAME,name);
                        c.put(MediaStore.Images.Media.MIME_TYPE,mime(asset.name));c.put(MediaStore.Images.Media.RELATIVE_PATH,folder);
                        c.put(MediaStore.Images.Media.IS_PENDING,1);
                        inserted=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,c);
                        if(inserted==null)throw new IOException("无法写入相册");
                        try(InputStream in=getContentResolver().openInputStream(asset.uri);
                            OutputStream out=getContentResolver().openOutputStream(inserted)){
                            if(in==null||out==null)throw new IOException("图片读取失败");
                            byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);
                        }
                        ContentValues done=new ContentValues();done.put(MediaStore.Images.Media.IS_PENDING,0);
                        getContentResolver().update(inserted,done,null,null);copied++;
                    }catch(Exception e){
                        if(inserted!=null)getContentResolver().delete(inserted,null,null);failed++;
                    }
                }
            }catch(Exception e){failed++;}
        }
        return new int[]{copied,skipped,failed};
    }
    public class Bridge {
        @JavascriptInterface public String version(){return "2.2.0";}
        @JavascriptInterface public void restorePrompts(String source){worker.execute(()->{try(OutputStream out=new FileOutputStream(promptsFile())){out.write(source.getBytes(StandardCharsets.UTF_8));}catch(Exception e){emit("error","恢复原始提示词失败："+e.getMessage());}});}
        @JavascriptInterface public String getPrompts(){
            try(InputStream in=new FileInputStream(promptsFile())){return readAll(in,25*1024*1024);}
            catch(Exception ignored){return "";}
        }
        @JavascriptInterface public String getAssets(){return filesJSON().toString();}
        @JavascriptInterface public String getDesktopWorkspace(){try(InputStream in=new FileInputStream(desktopWorkspaceFile())){return readAll(in,40*1024*1024);}catch(Exception ignored){return "";}}
        @JavascriptInterface public String getCloudWorkspaceForUid(String uid){if(!uid.equals(getSharedPreferences(PREF,0).getString("cloud_uid","")))return "";try(InputStream in=new FileInputStream(cloudWorkspaceFile())){return readAll(in,40*1024*1024);}catch(Exception ignored){return "";}}
        @JavascriptInterface public String getCloudOwner(){return getSharedPreferences(PREF,0).getString("cloud_uid","");}
        @JavascriptInterface public void saveCloudWorkspace(String json,String uid){
            worker.execute(()->{try{
                if(!CloudCache.validUid(uid))throw new IOException("用户ID格式错误");
                JSONObject data=new JSONObject(json);if(data.optJSONArray("episodes")==null)throw new IOException("项目数据没有剧集");
                String existing=getSharedPreferences(PREF,0).getString("cloud_uid","");
                if(!existing.isEmpty()&&!existing.equals(uid))throw new IOException("本机已保存另一用户的云端资料，请先退出并清理云缓存");
                File temp=new File(getFilesDir(),"cloud_user_project.json.tmp");
                try(OutputStream out=new FileOutputStream(temp)){out.write(json.getBytes(StandardCharsets.UTF_8));}
                if(!temp.renameTo(cloudWorkspaceFile()))throw new IOException("保存失败");
                getSharedPreferences(PREF,0).edit().putString("cloud_uid",uid).apply();
                JSONObject ev=new JSONObject();ev.put("type","desktopWorkspace");ev.put("workspace",data);send(ev);
            }catch(Exception ex){emit("error","保存云端剧集失败："+ex.getMessage());}});
        }
        @JavascriptInterface public void clearCloudWorkspace(){worker.execute(()->{
            cloudWorkspaceFile().delete();CloudCache.wipe(CloudCache.base(getFilesDir()));
            synchronized(assetLock){cloudAssets.clear();}
            getSharedPreferences(PREF,0).edit().remove("cloud_uid").apply();
            emit("assets","云端私有缓存已清理");
        });}
        @JavascriptInterface public void cacheCloudAsset(String uid,String project,String code,String digest,String mime,String url){
            worker.execute(()->{
                try{
                    if(!uid.equals(getSharedPreferences(PREF,0).getString("cloud_uid","")))throw new IOException("账号不匹配");
                    File file=CloudCache.fetch(getFilesDir(),uid,project,code,digest,mime,url);
                    synchronized(assetLock){
                        cloudAssets.removeIf(a->a.code.equals(code));
                        cloudAssets.add(new Asset(code,file.getName(),mime,Uri.fromFile(file)));
                    }
                    emit("assets","云端参考图已缓存："+code);
                }catch(Exception ex){emit("error","缓存参考图 "+code+" 失败："+ex.getMessage());}
            });
        }
        @JavascriptInterface public void chooseDesktopWorkspace(){runOnUiThread(()->{Intent in=new Intent(Intent.ACTION_OPEN_DOCUMENT);in.addCategory(Intent.CATEGORY_OPENABLE);in.setType("*/*");startActivityForResult(in,DESKTOP_WORKSPACE);});}
        @JavascriptInterface public String getFolder(){
            return getSharedPreferences(PREF,0).getString("treeName","未选择参考图文件夹");
        }
        @JavascriptInterface public String thumb(int index,int size){return imageData(index,size);}
        @JavascriptInterface public void choosePrompts(){
            runOnUiThread(()->{
                Intent in=new Intent(Intent.ACTION_OPEN_DOCUMENT);in.addCategory(Intent.CATEGORY_OPENABLE);in.setType("*/*");
                startActivityForResult(in,PROMPT);
            });
        }
        @JavascriptInterface public void chooseFolder(){
            runOnUiThread(()->{
                Intent in=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                in.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                startActivityForResult(in,FOLDER);
            });
        }
        @JavascriptInterface public void refreshAssets(){
            String tree=getSharedPreferences(PREF,0).getString("tree","");
            if(!tree.isEmpty())rescan(Uri.parse(tree));else emit("error","请先选择参考图文件夹");
        }
        @JavascriptInterface public void copyText(String content){
            runOnUiThread(()->{
                android.content.ClipboardManager cm=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("AI漫剧完整提示词",content));
                emit("copied","已复制全部 "+content.length()+" 字");
            });
        }
        @JavascriptInterface public void saveImages(String payload){
            worker.execute(()->{
                try {
                    JSONObject j=new JSONObject(payload);JSONArray tasks=j.getJSONArray("tasks");
                    int[] result=saveBatch(tasks);JSONObject response=new JSONObject();
                    response.put("type","saved");response.put("copied",result[0]);response.put("skipped",result[1]);response.put("failed",result[2]);
                    send(response);
                }catch(Exception e){emit("error","保存图片失败："+e.getMessage());}
            });
        }
        @JavascriptInterface public void openDoubao(){
            runOnUiThread(()->{
                try{
                    Intent appIntent=getPackageManager().getLaunchIntentForPackage("com.larus.nova");
                    if(appIntent!=null)startActivity(appIntent);
                    else emit("error","没有检测到豆包APP，请确认已安装豆包");
                }catch(Exception e){emit("error","无法启动豆包APP："+e.getMessage());}
            });
        }
        @JavascriptInterface public void pickVideo(String key){
            pendingVideoKey=key;
            runOnUiThread(()->{
                Intent in=new Intent(Intent.ACTION_OPEN_DOCUMENT);in.addCategory(Intent.CATEGORY_OPENABLE);in.setType("video/*");
                in.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                startActivityForResult(in,VIDEO);
            });
        }
        @JavascriptInterface public void playVideo(String uri){
            runOnUiThread(()->{
                try{
                    Intent in=new Intent(Intent.ACTION_VIEW);in.setDataAndType(Uri.parse(uri),"video/*");
                    in.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(Intent.createChooser(in,"播放本段视频"));
                }catch(Exception e){emit("error","无法打开视频："+e.getMessage());}
            });
        }
        @JavascriptInterface public void exportBackup(String json){
            backupJSON=json;
            runOnUiThread(()->{
                Intent in=new Intent(Intent.ACTION_CREATE_DOCUMENT);in.addCategory(Intent.CATEGORY_OPENABLE);
                in.setType("application/json");in.putExtra(Intent.EXTRA_TITLE,"AI漫剧_v2_项目备份.json");
                startActivityForResult(in,BACKUP_OUT);
            });
        }
        @JavascriptInterface public void importBackup(){
            runOnUiThread(()->{
                Intent in=new Intent(Intent.ACTION_OPEN_DOCUMENT);in.addCategory(Intent.CATEGORY_OPENABLE);
                in.setType("application/json");startActivityForResult(in,BACKUP_IN);
            });
        }
    }
    @Override protected void onActivityResult(int req,int code,Intent data){
        super.onActivityResult(req,code,data);
        if(code!=RESULT_OK||data==null||data.getData()==null)return;
        Uri uri=data.getData();
        if(req==FOLDER){
            try{
                getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getSharedPreferences(PREF,0).edit().putString("tree",uri.toString()).putString("treeName",uri.getLastPathSegment()).apply();
                rescan(uri);
            }catch(Exception e){emit("error","文件夹授权失败："+e.getMessage());}
        }else if(req==PROMPT){
            worker.execute(()->{
                try(InputStream in=getContentResolver().openInputStream(uri)){
                    String raw=readAll(in,25*1024*1024);
                    if(desktopWorkspaceFile().exists())desktopWorkspaceFile().delete();
                    try(OutputStream out=new FileOutputStream(promptsFile())){out.write(raw.getBytes(StandardCharsets.UTF_8));}
                    JSONObject j=new JSONObject();j.put("type","prompts");j.put("text",raw);j.put("filename",fileName(uri));send(j);
                }catch(Exception e){emit("error","提示词导入失败："+e.getMessage());}
            });
        }else if(req==DESKTOP_WORKSPACE){
            worker.execute(()->{
                try(InputStream in=getContentResolver().openInputStream(uri)){
                    String raw=readAll(in,40*1024*1024);
                    JSONObject original=new JSONObject(raw);
                    JSONObject projectData=original.optJSONObject("workspace")!=null?original.getJSONObject("workspace"):original;
                    if(!projectData.has("episodes")||projectData.optJSONArray("episodes")==null||!projectData.has("version"))
                        throw new IOException("这不是豆包创作舱 v0.3 的项目备份 JSON");
                    if(projectData.optInt("version")<2||projectData.optInt("version")>3)
                        throw new IOException("仅支持豆包创作舱 v0.2/v0.3 的 workspace.json");
                    try(OutputStream out=new FileOutputStream(desktopWorkspaceFile())){
                        out.write(projectData.toString().getBytes(StandardCharsets.UTF_8));
                    }
                    JSONObject event=new JSONObject();event.put("type","desktopWorkspace");event.put("workspace",projectData);
                    send(event);
                }catch(Exception e){emit("error","导入电脑项目失败："+e.getMessage());}
            });
        }else if(req==VIDEO){
            try{
                getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);
                JSONObject j=new JSONObject();j.put("type","video");j.put("key",pendingVideoKey);j.put("uri",uri.toString());
                j.put("filename",fileName(uri));send(j);
            }catch(Exception e){emit("error","视频选择失败："+e.getMessage());}
        }else if(req==BACKUP_OUT){
            worker.execute(()->{
                try(OutputStream out=getContentResolver().openOutputStream(uri)){
                    out.write(backupJSON.getBytes(StandardCharsets.UTF_8));emit("notice","项目备份已导出");
                }catch(Exception e){emit("error","备份失败："+e.getMessage());}
            });
        }else if(req==BACKUP_IN){
            worker.execute(()->{
                try(InputStream in=getContentResolver().openInputStream(uri)){
                    String raw=readAll(in,26*1024*1024);JSONObject j=new JSONObject();
                    j.put("type","backup");j.put("payload",new JSONObject(raw));send(j);
                }catch(Exception e){emit("error","备份读取失败："+e.getMessage());}
            });
        }
    }
    @Override public void onBackPressed(){
        if(web!=null)web.evaluateJavascript("window.backFromAndroid && window.backFromAndroid()",null);
        else super.onBackPressed();
    }
    @Override public void onDestroy(){super.onDestroy();worker.shutdown();if(web!=null){web.removeJavascriptInterface("Native");web.destroy();}}
}
