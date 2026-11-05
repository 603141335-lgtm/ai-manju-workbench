'use strict';
const $=id=>document.getElementById(id);
function status(text){$('status').textContent=text;}
async function test(){
 const result=await chrome.runtime.sendMessage({type:'test'});
 if(result?.ok)status('已连接到本机工作台\n当前绑定用户：'+result.profileId+
   (result.job?'\n待填入：第'+result.job.episode+'集 第'+result.job.segment+'段':'\n当前没有待填入的提示词'));
 else status(result?.error||'连接失败');
}
$('connect').onclick=async()=>{
 const token=$('token').value.trim().toLowerCase();
 if(!/^[a-f0-9]{48}$/.test(token)){status('密钥格式不正确，请从对应Edge用户的工作台复制');return;}
 await chrome.storage.local.set({token});
 status('密钥已保存在当前Edge用户的扩展中');
 await test();
};
$('test').onclick=test;
chrome.storage.local.get('token').then(({token})=>{if(token){$('token').value=token;test();}});
