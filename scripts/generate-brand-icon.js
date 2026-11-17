'use strict';
/** Deterministic Windows icon build from a single source SVG.
 * Generated assets are ephemeral CI outputs, NOT manually maintained binaries.
 * Multisize PNG-in-ICO is supported by Windows 10/11.
 */
const fs=require('node:fs'),path=require('node:path');
const {Resvg}=require('@resvg/resvg-js');
const root=path.join(__dirname,'..');
const source=path.join(root,'assets','branding','dudu-icon.svg');
const svg=fs.readFileSync(source,'utf8');
if(!svg.startsWith('<svg')||!/viewBox="0 0 1024 1024"/.test(svg))throw Error('独独图标 SVG 缺少有效标记');
function render(size){
 const png=new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng();
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 if(width!==size||height!==size)throw Error('错误的图标尺寸 '+size);
 return png;
}
const sizes=[16,24,32,48,64,128,256];
const images=sizes.map(render),entries=[];
const header=Buffer.alloc(6);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);
let offset=6+images.length*16;
for(let i=0;i<sizes.length;i++){
 const entry=Buffer.alloc(16);entry[0]=sizes[i]===256?0:sizes[i];entry[1]=sizes[i]===256?0:sizes[i];
 entry.writeUInt16LE(1,4);entry.writeUInt16LE(32,6);entry.writeUInt32LE(images[i].length,8);
 entry.writeUInt32LE(offset,12);offset+=images[i].length;entries.push(entry);
}
const ico=Buffer.concat([header,...entries,...images]);
const out=path.join(root,'assets','app.ico');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,ico);
fs.writeFileSync(path.join(root,'assets','branding','dudu-icon-256.png'),images.at(-1));
console.log('独独AI工作台图标已生成:',{icoBytes:ico.length,png256Bytes:images.at(-1).length});
