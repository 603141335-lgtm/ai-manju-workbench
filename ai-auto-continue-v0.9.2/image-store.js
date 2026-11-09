/* IndexedDB image blobs: extension-origin only. No external upload. */
'use strict';
const ImageStore=(()=>{
  const DB='AAC8_ImageBlobs',TABLE='images';
  async function open(){return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(TABLE,{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });}
  async function tx(method,id,record){const db=await open();return new Promise((resolve,reject)=>{
    const tran=db.transaction(TABLE,method==='get'?'readonly':'readwrite');
    const op=tran.objectStore(TABLE)[method](method==='put'?record:id);
    op.onsuccess=()=>resolve(op.result);op.onerror=()=>reject(op.error);
    tran.oncomplete=()=>db.close();tran.onerror=()=>reject(tran.error);
  });}
  async function put(file){if(!file.type.startsWith('image/'))throw Error('只能添加图片');
    if(file.size>4*1024*1024)throw Error('单张图片不能超过4MB（建议先压缩）');
    const id='img-'+Date.now()+'-'+crypto.randomUUID();
    await tx('put',null,{id,name:file.name,size:file.size,mime:file.type,blob:file,createdAt:Date.now()});
    return {id,name:file.name,size:file.size,mime:file.type};
  }
  const get=id=>tx('get',id);const remove=id=>tx('delete',id);
  return {put,get,remove};
})();
