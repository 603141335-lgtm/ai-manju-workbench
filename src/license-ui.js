'use strict';
// UI only. Privileged license decisions are enforced by the Electron main process.
(()=>{
 const B=window.bridge,$=id=>document.getElementById(id),dialog=$('licenseDialog');
 if(!B?.licenseStatus||!dialog)return;
 let view=null,first=true,opening=false,currentOrderId='',orderTimer=null;
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
 async function loadProducts(){
  try{
   const result=await B.licenseProducts(),select=$('licenseProduct');select.replaceChildren();
   if(!result.length){const o=document.createElement('option');o.value='';o.textContent='暂无在售商品';select.append(o);$('btnLicenseBuy').disabled=true;return}
   result.forEach(p=>{const o=document.createElement('option');o.value=p.product_id;o.textContent=p.name+' · ¥'+(Number(p.price_cents)/100).toFixed(2);select.append(o)});
   $('btnLicenseBuy').disabled=false;
  }catch(err){$('licenseProduct').innerHTML='<option value="">商品暂不可用</option>';$('btnLicenseBuy').disabled=true;$('licenseOrderStatus').textContent=err.message}
 }
 async function checkApplication(){
  try{
   const result=await B.licenseApplicationStatus(),a=result.application;
   if(!a){$('licenseApplicationStatus').textContent='尚未提交申请';return}
   const labels={pending:'已提交，等待管理员审核',approved:'审核已通过，正在同步本机授权',rejected:'申请未通过：'+(a.review_note||'可联系官方客服')};
   $('licenseApplicationStatus').textContent=labels[a.status]||a.status;
   if(a.status==='approved'){
    const state=result.license||await B.licenseRefresh();render(state);
    if(state.valid){$('licenseApplicationStatus').textContent='审核通过，永久授权已自动激活';close()}
   }
  }catch(err){$('licenseApplicationStatus').textContent=err.message}
 }
 async function submitApplication(){
  const contact=$('licenseApplyContact').value.trim(),reason=$('licenseApplyReason').value.trim();
  if(contact.length<2)throw Error('请填写微信号或联系方式');
  $('btnLicenseApply').disabled=true;$('licenseApplicationStatus').textContent='正在提交申请…';
  try{
   const result=await B.licenseApply(contact,reason);
   $('licenseApplicationStatus').textContent='申请已提交，编号：'+result.applicationId+'。请等待管理员审核。';
  }finally{$('btnLicenseApply').disabled=false}
 }
 function watchOrder(orderId,attempt=0){
  if(orderTimer)clearTimeout(orderTimer);
  if(attempt>=180){$('licenseOrderStatus').textContent='暂未收到支付结果，可点击“联网验证 / 更新授权”重新检查。';return}
  orderTimer=setTimeout(async()=>{
   try{
    const result=await B.licenseOrderStatus(orderId);
    if(result.status==='paid'){
     $('licenseOrderStatus').textContent=result.delivered?'付款成功，永久授权已自动发放，正在刷新本机授权…':'付款成功，授权正在处理…';
     const state=result.license||await B.licenseRefresh();render(state);
     if(state.valid){$('licenseOrderStatus').textContent='支付成功，永久授权已激活。';close();return}
    }else if(result.status==='closed'||result.status==='refunded'){
     $('licenseOrderStatus').textContent='订单已关闭或退款，请重新创建订单。';return
    }else $('licenseOrderStatus').textContent='订单 '+result.order_no+' · 等待付款…';
   }catch(err){$('licenseOrderStatus').textContent='订单状态检查中：'+err.message}
   watchOrder(orderId,attempt+1);
  },5000);
 }
 async function buyProduct(){
  const productId=$('licenseProduct').value,payment=$('licensePayment').value;
  if(!productId)throw Error('请选择在售商品');
  $('btnLicenseBuy').disabled=true;$('licenseOrderStatus').textContent='正在创建订单…';
  try{
   const order=await B.licenseCreateOrder(productId,payment);currentOrderId=order.orderId;
   $('licenseOrderStatus').textContent='订单已创建：'+order.orderNo+' · 正在打开收银台…';
   await B.licenseOpenCheckout(order.checkoutUrl);
   watchOrder(order.orderId);
  }finally{$('btnLicenseBuy').disabled=false}
 }
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
 $('btnLicenseApply').onclick=()=>submitApplication().catch(err=>$('licenseApplicationStatus').textContent=err.message);
 $('btnLicenseBuy').onclick=()=>buyProduct().catch(err=>$('licenseOrderStatus').textContent='购买失败：'+err.message);
 $('btnLicenseReadonly').onclick=close;
 $('btnLicenseWechat').onclick=()=>B.copyText('du4du44').then(()=>feedback('已复制 du4du44'));
 $('btnLicenseBackupWechat').onclick=()=>B.copyText('du6du66').then(()=>feedback('已复制 du6du66'));
 dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 async function init(){
  const v=await refresh();loadProducts().catch(()=>{});checkApplication().catch(()=>{});
  if(!v.valid&&first){first=false;await open();}
  return v;
 }
 setInterval(()=>{if(dialog.open){refresh().catch(()=>{});checkApplication().catch(()=>{})}},60000);
 window.DuduLicenseUI={init,open,refresh};
})();
