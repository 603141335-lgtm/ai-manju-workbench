'use strict';
// UI only. Privileged license decisions are enforced by the Electron main process.
(()=>{
 const B=window.bridge,$=id=>document.getElementById(id),dialog=$('licenseDialog');
 if(!B?.licenseStatus||!dialog)return;
 let view=null,first=true,opening=false;
 const feedback=(v,kind='')=>{const el=$('licenseMessage');el.textContent=v;el.dataset.kind=kind};
 function render(s){
  view=s;
  const state=s.valid?(s.type==='permanent'?'永久授权已激活':'24小时免费试用中'):!s.configured?'当前安装版未配置授权服务器':'尚未激活 / 试用已结束';
  $('licenseState').textContent=state;
  $('licenseDevice').textContent=s.deviceLabel||'未生成';
  $('licenseCountdown').textContent=s.valid?(s.type==='permanent'?'永久免费 · 离线凭证按期续签':('剩余 '+Math.max(0,Math.ceil((s.expiresAt-Date.now())/60000))+' 分钟')):'';
  $('btnLicenseTrial').disabled=s.valid||!s.configured;
  $('btnLicenseActivate').disabled=!s.configured;
  $('licenseStatusMini').textContent=s.valid?(s.type==='permanent'?'✓ 永久授权':'试用中'):'需激活';
  feedback(s.error||(s.valid?'授权验证通过。你的漫剧项目、账号及素材始终保存在本地。':!s.configured?'需要部署独独AI授权服务并配置公钥后，才能启用免费试用和永久卡密。':s.reason||'首次使用可免费体验24小时，或加微信领取免费永久卡密。'));
 }
 async function refresh(){const v=await B.licenseStatus();render(v);return v}
 function close(){
  if(!dialog.open)return;
  dialog.close();B.setOverlay(false);
 }
 async function open(){
  if(opening)return;opening=true;
  try{
   if($('noticeDialog')?.open){$('noticeDialog').close();B.setOverlay(false)}
   if($('tutorialDialog')?.open){$('tutorialDialog').close();B.setOverlay(false)}
   await refresh();B.setOverlay(true);
   if(!dialog.open)dialog.showModal();
  }finally{opening=false}
 }
 async function action(fn){
  for(const id of ['btnLicenseTrial','btnLicenseActivate','btnLicenseRefresh'])$(id).disabled=true;
  feedback('正在验证授权，请勿重复点击…');
  try{const result=await fn();render(result);if(result.valid){feedback('✓ 授权成功。');close()}}
  catch(err){feedback('操作失败：'+String(err.message||err),'error')}
  finally{await refresh().catch(()=>{})}
 }
 if(B.onLicenseUpdated)B.onLicenseUpdated(v=>{render(v)});
 $('btnLicense').onclick=()=>open().catch(err=>feedback(err.message,'error'));
 $('btnLicenseTrial').onclick=()=>action(()=>B.licenseTrial());
 $('btnLicenseActivate').onclick=()=>action(()=>B.licenseActivate($('licenseCode').value.trim()));
 $('btnLicenseRefresh').onclick=()=>action(()=>B.licenseRefresh());
 const applyBtn=$('btnLicenseApply'),statusBtn=$('btnLicenseApplicationStatus');
 if(applyBtn)applyBtn.onclick=async()=>{try{applyBtn.disabled=true;const r=await B.licenseApplicationCreate($('licenseApplyContact').value,$('licenseApplyReason').value);feedback('申请已提交：'+r.applicationId+'，请等待人工审批。');$('licenseApplicationId').value=r.applicationId}catch(e){feedback('申请失败：'+e.message,'error')}finally{applyBtn.disabled=false}};
 if(statusBtn)statusBtn.onclick=async()=>{try{const r=await B.licenseApplicationStatus($('licenseApplicationId').value);feedback('申请状态：'+({pending:'待审批',approved:'已通过',rejected:'未通过'}[r.application.status]||r.application.status)+(r.application.reviewer_note?'；备注：'+r.application.reviewer_note:''))}catch(e){feedback('查询失败：'+e.message,'error')}};
 $('btnLicenseReadonly').onclick=close;
 $('btnLicenseWechat').onclick=()=>B.copyText('du4du44').then(()=>feedback('已复制 du4du44'));
 $('btnLicenseBackupWechat').onclick=()=>B.copyText('du6du66').then(()=>feedback('已复制 du6du66'));
 dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 async function init(){
  const v=await refresh();if(!v.valid&&first){first=false;await open();}
  return v;
 }
 setInterval(()=>{if(dialog.open)refresh().catch(()=>{})},60000);
 window.DuduLicenseUI={init,open,refresh};
})();
