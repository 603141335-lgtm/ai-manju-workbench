package com.manju.mobile;

import android.net.Uri;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.*;

/** Cloud images are private app cache only, never published or sent to other users. */
public final class CloudCache {
    private CloudCache(){}
    public static File base(File filesDir) { return new File(filesDir, "cloud_images_v1"); }
    public static boolean validUid(String u){return u!=null && u.matches("[A-Za-z0-9_-]{8,128}");}
    public static boolean validProject(String p){return p!=null && p.matches("[a-fA-F0-9-]{36}");}
    public static void wipe(File f){
        if(f.isDirectory()){File[] kids=f.listFiles();if(kids!=null)for(File c:kids)wipe(c);}
        if(f.exists())f.delete();
    }
    private static String sha256(File file)throws Exception{
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(InputStream in=new FileInputStream(file)){byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)digest.update(buf,0,n);}
        StringBuilder b=new StringBuilder();for(byte x:digest.digest())b.append(String.format(Locale.ROOT,"%02x",x&255));return b.toString();
    }
    public static File fetch(File filesDir,String uid,String project,String code,String digest,String mime,String signedUrl)throws Exception{
        if(!validUid(uid)||!validProject(project)||!code.matches("(AG|BL|[ABCDE])[0-9]{2,4}(-[0-9]{2,3})?")||!digest.matches("[a-fA-F0-9]{64}"))throw new IOException("云端图片参数无效");
        URL endpoint=new URL(signedUrl);
        if(!"https".equals(endpoint.getProtocol()))throw new IOException("云图片下载仅允许HTTPS");
        String ext="image/png".equals(mime)?".png":"image/webp".equals(mime)?".webp":".jpg";
        File dir=new File(new File(base(filesDir),uid),project);
        if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("无法创建私有缓存目录");
        File target=new File(dir,code+"_"+digest.substring(0,20)+ext);
        if(target.exists()&&target.length()>0){if(sha256(target).equalsIgnoreCase(digest))return target;target.delete();}
        File partial=new File(dir,target.getName()+".part");
        HttpURLConnection http=(HttpURLConnection)endpoint.openConnection();
        http.setConnectTimeout(16000);http.setReadTimeout(60000);http.setInstanceFollowRedirects(false);
        try {
            if(http.getResponseCode()!=200)throw new IOException("图片下载失败 HTTP "+http.getResponseCode());
            try(InputStream in=http.getInputStream();FileOutputStream out=new FileOutputStream(partial)){
                int n;long total=0;byte[] buffer=new byte[65536];
                while((n=in.read(buffer))!=-1){total+=n;if(total>20L*1024*1024)throw new IOException("图片超过20MB");out.write(buffer,0,n);}
                out.getFD().sync();
            }
            if(!sha256(partial).equalsIgnoreCase(digest))throw new IOException("参考图片校验失败，已拒绝保存");
            if(!partial.renameTo(target))throw new IOException("缓存文件写入失败");
            return target;
        }finally {http.disconnect();partial.delete();}
    }
    public static ArrayList<StudioActivity.Asset> scan(File filesDir,String uid){
        ArrayList<StudioActivity.Asset> result=new ArrayList<>();
        if(!validUid(uid))return result;
        File user=new File(base(filesDir),uid);
        File[] projects=user.listFiles();
        if(projects==null)return result;
        Pattern pattern=Pattern.compile("^((?:AG|BL|[ABCDE])[0-9]{2,4}(?:-[0-9]{2,3})?)_([0-9a-fA-F]{20})\\.(png|webp|jpg)$");
        for(File p:projects){
            if(!p.isDirectory())continue;
            File[] images=p.listFiles();if(images==null)continue;
            for(File f:images){
                Matcher m=pattern.matcher(f.getName());
                if(!f.isFile()||!m.matches())continue;
                String ext=m.group(3),mime=ext.equals("png")?"image/png":ext.equals("webp")?"image/webp":"image/jpeg";
                result.add(new StudioActivity.Asset(m.group(1),f.getName(),mime,Uri.fromFile(f)));
            }
        }
        return result;
    }
}