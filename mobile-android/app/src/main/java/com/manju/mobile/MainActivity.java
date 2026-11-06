package com.manju.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.content.*;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.view.View;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;

public class MainActivity extends Activity {
    private static final int IMPORT_PROMPT=1, IMPORT_IMAGES=2;
    private static final Pattern EP=Pattern.compile("^\\s*(?:#{1,6}\\s*)?(?:《[^》]+》\\s*)?第([0-9一二三四五六七八九十百零]+)集(?:[｜|:：—\\-].*)?$");
    private static final Pattern SEG=Pattern.compile("^\\s*(?:#{1,6}\\s*)?第([0-9一二三四五六七八九十百零]+)(?:段|镜头|镜)(?:[｜|:：—\\-].*)?$");
    private static final Pattern CODE=Pattern.compile("(?<![A-Z0-9])(?:AG[0-9]{2}|BL[0-9]{2}|A[0-9]{2}(?:-[0-9]{2})?|B[0-9]{2}|C[0-9]{2}|E[0-9]{2}(?:-[0-9]{2})?)(?![0-9-])");
    private static final Pattern FILE_CODE=Pattern.compile("^(?:AG[0-9]{2}|BL[0-9]{2}|A[0-9]{2}(?:-[0-9]{2})?|B[0-9]{2}|C[0-9]{2}|E[0-9]{2}(?:-[0-9]{2})?)(?![0-9-])");
    private static final Pattern REF=Pattern.compile("^\\s*(?:[*#]+\\s*)?(?:需要参考图|使用参考图|本段参考图|参考图清单|参考图片)\\s*(?:[*#]+)?\\s*[:：]?");
    private static final Pattern STOP=Pattern.compile("^\\s*(?:[*#]+\\s*)?(?:连续性参考|场景与站位|画风|限制|音效|分镜|动作|人物站位|场景|镜头|台词|对白|0\\s*[-—~～至]|[1-9][0-9]?\\s*[-—~～至])\\s*(?:[:：｜|]|$)");
    private final ArrayList<Segment> segments=new ArrayList<>();
    private final LinkedHashMap<String,Uri> images=new LinkedHashMap<>();
    private final java.util.concurrent.ExecutorService executor=java.util.concurrent.Executors.newSingleThreadExecutor();
    private Spinner spinner; private TextView info, refs, preview, status; private Button save,copy;
    private int selected=0; private boolean loading=false, busy=false;

    static class Segment {
        String episode,title,text;ArrayList<String> codes;
        Segment(String e,String t,String s){episode=e;title=t;text=s;codes=extractCodes(s);}
        public String toString(){return "第"+episode+"集｜"+title;}
    }
    static ArrayList<String> extractCodes(String s) {
        LinkedHashSet<String> result=new LinkedHashSet<>();
        boolean in=false;int count=0;
        for(String line:s.split("\\R",-1)){
            Matcher header=REF.matcher(line);
            if(header.find()){in=true;count=0;addCodes(result,line.substring(header.end()));continue;}
            if(in) {
                if(STOP.matcher(line).find()||count++>35){in=false;continue;}
                addCodes(result,line);
            }
        }
        return new ArrayList<>(result);
    }
    static void addCodes(Set<String> into,String line) {
        Matcher m=CODE.matcher(line.toUpperCase(Locale.ROOT));while(m.find())into.add(m.group());
    }
    private void parse(String input) {
        segments.clear();
        String episode="1",title=null;
        StringBuilder body=new StringBuilder();
        for(String line:input.replace("\uFEFF","").split("(?<=\\n)",-1)) {
            String t=line.trim();
            Matcher em=EP.matcher(t),sm=SEG.matcher(t);
            if(sm.matches()){
                if(title!=null)segments.add(new Segment(episode,title,body.toString()));
                title=t.replaceFirst("^#{1,6}\\s*","");body.setLength(0);body.append(line);
            }else if(em.matches()){
                if(title!=null){segments.add(new Segment(episode,title,body.toString()));title=null;body.setLength(0);}
                episode=em.group(1);
            }else if(title!=null)body.append(line);
        }
        if(title!=null)segments.add(new Segment(episode,title,body.toString()));
        if(segments.isEmpty()&&!input.trim().isEmpty())segments.add(new Segment("1","完整提示词",input));
    }
    private TextView text(String value,int size,boolean bold) {
        TextView t=new TextView(this);t.setText(value);t.setTextColor(Color.rgb(36,45,59));t.setTextSize(size);
        t.setPadding(0,12,0,12);if(bold)t.setTypeface(null,Typeface.BOLD);return t;
    }
    private Button button(String label){
        Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(17);b.setMinHeight(64);return b;
    }
    private void add(LinearLayout parent,View v){parent.addView(v,new LinearLayout.LayoutParams(-1,-2));}
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll=new ScrollView(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setPadding(22,36,22,45);
        add(root,text("AI漫剧 · 手机制作台",26,true));
        add(root,text("选择素材一次，之后每段只按两个按钮",14,false));
        Button importText=button("首次设置①：导入 TXT/MD 提示词");
        Button importFolder=button("首次设置②：选择参考图文件夹");
        add(root,importText);add(root,importFolder);
        add(root,text("当前段落",18,true));
        spinner=new Spinner(this);add(root,spinner);
        LinearLayout arrows=new LinearLayout(this);arrows.setOrientation(0);
        Button prev=button("上一段"),next=button("下一段");
        arrows.addView(prev,new LinearLayout.LayoutParams(0,-2,1));
        arrows.addView(next,new LinearLayout.LayoutParams(0,-2,1));add(root,arrows);
        info=text("请先导入提示词",14,false);add(root,info);
        refs=text("需要参考图：—",15,false);add(root,refs);
        save=button("⬇ 一键保存本段全部图片");add(root,save);
        copy=button("▣ 一键复制完整提示词");add(root,copy);
        status=text("图片保存至手机相册：Pictures/AI漫剧待上传",14,false);add(root,status);
        add(root,text("完整提示词预览",18,true));
        preview=text("导入提示词后显示",14,false);preview.setTextIsSelectable(true);add(root,preview);
        scroll.addView(root);setContentView(scroll);
        importText.setOnClickListener(v->{
            Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");startActivityForResult(i,IMPORT_PROMPT);
        });
        importFolder.setOnClickListener(v->{
            Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(i,IMPORT_IMAGES);
        });
        prev.setOnClickListener(v->jump(-1));next.setOnClickListener(v->jump(1));
        save.setOnClickListener(v->saveImages());copy.setOnClickListener(v->copyPrompt());
        spinner.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){
            public void onItemSelected(android.widget.AdapterView<?> p,View v,int pos,long id){
                if(loading)return;selected=pos;getPreferences(0).edit().putInt("last",pos).apply();update();
            }
            public void onNothingSelected(android.widget.AdapterView<?> p){}
        });
        File f=new File(getFilesDir(),"prompts.txt");
        if(f.exists())executor.execute(()->{
            try(InputStream in=new FileInputStream(f)){String raw=read(in);runOnUiThread(()->load(raw,false));}
            catch(Exception ex){notice("恢复提示词失败："+ex.getMessage());}
        });
        String tree=getPreferences(0).getString("folder",null);
        if(tree!=null)scan(Uri.parse(tree));
        update();
    }
    private void jump(int offset){
        if(segments.isEmpty())return;
        selected=Math.min(segments.size()-1,Math.max(0,selected+offset));spinner.setSelection(selected);update();
    }
    private void update(){
        if(segments.isEmpty()){
            info.setText("请先导入 TXT/MD 提示词");refs.setText("需要参考图：—");
            save.setEnabled(false);copy.setEnabled(false);return;
        }
        Segment s=segments.get(Math.min(selected,segments.size()-1));
        ArrayList<String> missing=new ArrayList<>();for(String c:s.codes)if(!images.containsKey(c))missing.add(c);
        info.setText("第"+(selected+1)+"/"+segments.size()+"段 · "+s.text.length()+"字 · 图片"+(s.codes.size()-missing.size())+"/"+s.codes.size());
        refs.setText("需要参考图："+String.join("、",s.codes)+(missing.isEmpty()?"":"\n缺图："+String.join("、",missing)));
        preview.setText(s.text.length()>2400?s.text.substring(0,2400)+"\n……（显示截断，复制为完整原文）":s.text);
        save.setEnabled(!busy&&!s.codes.isEmpty()&&missing.isEmpty());copy.setEnabled(true);
        if(!missing.isEmpty())status.setText("请检查缺图编号；为避免漏传，未齐全时不允许批量保存。");
    }
    private void load(String raw,boolean reset){
        parse(raw);loading=true;
        ArrayList<String> labels=new ArrayList<>();for(Segment s:segments)labels.add(s.toString());
        if(labels.isEmpty())labels.add("没有识别到提示词");
        spinner.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,labels));
        selected=reset?0:Math.min(Math.max(0,getPreferences(0).getInt("last",0)),Math.max(0,segments.size()-1));
        spinner.setSelection(selected);loading=false;update();notice("已读取 "+segments.size()+" 段，原文完整保留");
    }
    private String read(InputStream input)throws Exception{
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[16384];int n;
        while((n=input.read(b))!=-1){out.write(b,0,n);if(out.size()>25*1024*1024)throw new IOException("文件太大，请分集导入");}
        return out.toString("UTF-8");
    }
    @Override protected void onActivityResult(int request,int result,Intent intent){
        super.onActivityResult(request,result,intent);
        if(result!=RESULT_OK||intent==null||intent.getData()==null)return;
        Uri uri=intent.getData();
        if(request==IMPORT_PROMPT){
            executor.execute(()->{
                try(InputStream in=getContentResolver().openInputStream(uri)){
                    String raw=read(in);
                    try(OutputStream out=openFileOutput("prompts.txt",MODE_PRIVATE)){out.write(raw.getBytes(StandardCharsets.UTF_8));}
                    runOnUiThread(()->load(raw,true));
                }catch(Exception e){notice("导入失败："+e.getMessage());}
            });
        }else if(request==IMPORT_IMAGES){
            try{
                getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getPreferences(0).edit().putString("folder",uri.toString()).apply();scan(uri);
            }catch(Exception e){notice("图片文件夹授权失败："+e.getMessage());}
        }
    }
    private void scan(Uri tree){
        notice("正在扫描参考图……");
        executor.execute(()->{
            LinkedHashMap<String,Uri> found=new LinkedHashMap<>();
            try{
                scanDir(tree,DocumentsContract.getTreeDocumentId(tree),found,0,new int[]{20000});
                runOnUiThread(()->{images.clear();images.putAll(found);update();notice("已识别 "+images.size()+" 个编号");});
            }catch(Exception e){notice("参考图扫描失败："+e.getMessage());}
        });
    }
    private void scanDir(Uri tree,String id,Map<String,Uri> found,int depth,int[] budget){
        if(depth>18||budget[0]<=0)return;
        Uri child=DocumentsContract.buildChildDocumentsUriUsingTree(tree,id);
        ArrayList<String> dirs=new ArrayList<>();
        String[] columns={DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE};
        try(Cursor c=getContentResolver().query(child,columns,null,null,null)){
            if(c==null)return;
            while(c.moveToNext()&&budget[0]-->0){
                String doc=c.getString(0),name=c.getString(1),type=c.getString(2);
                if(DocumentsContract.Document.MIME_TYPE_DIR.equals(type)){dirs.add(doc);continue;}
                if(name==null||!name.matches("(?i).*\\.(png|jpg|jpeg|webp|bmp|gif|avif|heic|heif)$"))continue;
                Matcher m=FILE_CODE.matcher(name.toUpperCase(Locale.ROOT));
                if(m.find()&&!found.containsKey(m.group()))found.put(m.group(),DocumentsContract.buildDocumentUriUsingTree(tree,doc));
            }
        }catch(Exception ignored){}
        for(String folder:dirs)scanDir(tree,folder,found,depth+1,budget);
    }
    private void copyPrompt(){
        if(segments.isEmpty())return;
        String original=segments.get(selected).text;
        ClipboardManager cb=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
        cb.setPrimaryClip(ClipData.newPlainText("AI漫剧提示词",original));
        notice("已复制完整提示词（"+original.length()+"字），可直接去豆包粘贴");
    }
    private void saveImages(){
        if(busy||segments.isEmpty())return;
        Segment s=segments.get(selected);
        LinkedHashMap<String,Uri> refs=new LinkedHashMap<>();
        for(String code:s.codes){Uri u=images.get(code);if(u==null){notice("缺少参考图："+code);return;}refs.put(code,u);}
        if(refs.isEmpty()){notice("本段无参考图");return;}
        busy=true;update();notice("正在准备 "+refs.size()+" 张图片……");
        executor.execute(()->{
            int success=0,skipped=0;ArrayList<String> bad=new ArrayList<>();
            String dir="Pictures/AI漫剧待上传/第"+s.episode+"集_第"+(selected+1)+"段/";
            for(Map.Entry<String,Uri> e:refs.entrySet()){
                try{
                    String original=filename(e.getValue());
                    String extension=".jpg";
                    int dot=original.lastIndexOf('.');
                    if(dot>=0)extension=original.substring(dot).toLowerCase(Locale.ROOT);
                    String name=e.getKey()+"_"+original.replaceAll("[\\\\/:*?\"<>|]","_");
                    if(exists(dir,name)){skipped++;continue;}
                    ContentValues values=new ContentValues();
                    values.put(MediaStore.Images.Media.DISPLAY_NAME,name);
                    values.put(MediaStore.Images.Media.MIME_TYPE,mime(extension));
                    values.put(MediaStore.Images.Media.RELATIVE_PATH,dir);
                    values.put(MediaStore.Images.Media.IS_PENDING,1);
                    Uri dest=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
                    if(dest==null)throw new IOException("无法写入手机相册");
                    try(InputStream in=getContentResolver().openInputStream(e.getValue());
                        OutputStream out=getContentResolver().openOutputStream(dest)){
                        if(in==null||out==null)throw new IOException("读取或写入失败");
                        byte[] buffer=new byte[65536];int count;
                        while((count=in.read(buffer))!=-1)out.write(buffer,0,count);
                    }catch(Exception err){getContentResolver().delete(dest,null,null);throw err;}
                    ContentValues v=new ContentValues();v.put(MediaStore.Images.Media.IS_PENDING,0);
                    getContentResolver().update(dest,v,null,null);success++;
                }catch(Exception err){bad.add(e.getKey());}
            }
            int ok=success,old=skipped;String errors=String.join("、",bad);
            runOnUiThread(()->{
                busy=false;update();
                notice(errors.isEmpty()?"保存成功："+(ok+old)+"张（新保存"+ok+"张），打开豆包相册选择即可":"成功"+ok+"张，失败编号："+errors);
            });
        });
    }
    private boolean exists(String dir,String name){
        try(Cursor c=getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            new String[]{MediaStore.Images.Media._ID},
            MediaStore.Images.Media.RELATIVE_PATH+"=? AND "+MediaStore.Images.Media.DISPLAY_NAME+"=?",
            new String[]{dir,name},null)){return c!=null&&c.moveToFirst();}
        catch(Exception e){return false;}
    }
    private String filename(Uri uri){
        try(Cursor c=getContentResolver().query(uri,new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){
            if(c!=null&&c.moveToFirst())return c.getString(0);
        }catch(Exception ignored){}
        return "参考图.jpg";
    }
    private String mime(String ext){
        if(ext.equals(".png"))return "image/png";
        if(ext.equals(".webp"))return "image/webp";
        if(ext.equals(".gif"))return "image/gif";
        if(ext.equals(".avif"))return "image/avif";
        if(ext.equals(".heic")||ext.equals(".heif"))return "image/heic";
        return "image/jpeg";
    }
    private void notice(String s){runOnUiThread(()->{if(status!=null)status.setText(s);Toast.makeText(this,s,Toast.LENGTH_SHORT).show();});}
    @Override protected void onDestroy(){super.onDestroy();executor.shutdown();}
}
