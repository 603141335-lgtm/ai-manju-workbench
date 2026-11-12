'use strict';
/* Create pixel-perfect 24-bit Windows MUI installer side/banner art.
 * Pure Node: no extra image dependencies, deterministic results.
 */
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const clamp=x=>Math.max(0,Math.min(255,Math.round(x)));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*Math.max(0,Math.min(1,t)));
function bg(x,y,w,h){
 const u=x/w,v=y/h;
 let c=mix([6,15,35],[13,31,67],Math.min(1,(u+v)*.43));
 const diagonal=Math.exp(-Math.pow((v-.7+.4*u)*5,2));
 c=mix(c,[30,87,138],diagonal*.48);
 const wave=Math.exp(-Math.pow((v-(.72+.09*Math.sin(7*u)))*30,2));
 c=mix(c,[20,185,175],wave*.45);
 const trail=Math.exp(-Math.pow((v-(.79+.08*Math.sin(7*u+1)))*33,2));
 c=mix(c,[45,83,170],trail*.52);
 const r2=Math.pow(u-.41,2)+Math.pow(v-.36,2);
 if(r2<.085)c=mix(c,[65,115,150],Math.exp(-r2*24)*.07);
 for(let i=0;i<7;i++){let px=((i*73+17)%w)/w,py=((i*59+31)%h)/h;const dist=Math.hypot(u-px,v-py);if(dist<.006)c=mix(c,[185,233,246],.6*(1-dist/.006))}
 return c;
}
function visual(x,y,w,h,header){
 const c=bg(x,y,w,h),u=x/w,v=y/h;
 // Two strong asymmetric pebble silhouettes; same identity as chosen bean logo.
 const cx=header?.18:.5,cy=header?.45:.42,scale=header?.75:1;
 const ix=(u-cx)/scale,iy=(v-cy)/scale;
 const ellipse=(px,py,rx,ry)=>Math.pow((ix-px)/rx,2)+Math.pow((iy-py)/ry,2);
 const cream=ellipse(-.11,-.05,.25,.23)<1;
 const black=ellipse(.115,.135,.205,.19)<1;
 const smile=ellipse(-.03,.09,.12,.06)<1;
 const limeRing=(Math.abs(Math.pow((ix-.02)/.32,2)+Math.pow((iy+.01)/.26,2)-1)<.15&&iy>.03);
 let out=c;
 if(limeRing)out=mix(out,[162,212,92],.88);
 if(cream)out=[235,236,235];
 if(smile&&cream)out=[53,66,76];
 if(black)out=[32,40,50];
 if(ellipse(-.17,-.095,.025,.043)<1||ellipse(-.067,-.09,.026,.043)<1)out=[30,38,45];
 if(ellipse(.05,.095,.025,.04)<1||ellipse(.15,.09,.025,.04)<1)out=[245,246,248];
 if(ellipse(.0,.015,.035,.034)<1)out=[156,214,74];
 if((u>.07&&u<.09)||(u>.91&&u<.93))out=mix(out,[32,86,120],.18);
 return out;
}
function bmp(file,w,h,head=false){
 const stride=(w*3+3)&~3,bytes=54+stride*h,buf=Buffer.alloc(bytes);
 buf.write('BM',0,'ascii');buf.writeUInt32LE(bytes,2);buf.writeUInt32LE(54,10);
 buf.writeUInt32LE(40,14);buf.writeInt32LE(w,18);buf.writeInt32LE(h,22);
 buf.writeUInt16LE(1,26);buf.writeUInt16LE(24,28);buf.writeUInt32LE(stride*h,34);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const [r,g,b]=visual(x,y,w,h,head).map(clamp),i=54+(h-y-1)*stride+x*3;
  buf[i]=b;buf[i+1]=g;buf[i+2]=r;
 }
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,buf);
 console.log('Installer image:',path.basename(file),w,h,'24-bit BMP',buf.length);
}
const dir=path.join(root,'assets','installer');
bmp(path.join(dir,'sidebar.bmp'),164,314);
bmp(path.join(dir,'header.bmp'),150,57,true);
