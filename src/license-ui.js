'use strict';
// UI only. License decisions, payment verification and device binding remain in the main process/Worker.
(()=>{
 const B=window.bridge,$=id=>document.getElementById(id),dialog=$('licenseDialog');
 if(!B?.licenseStatus||!dialog)return;
 let view=null,first=true,opening=false,products=[],activeApplicationId='',activeOrderId='',activeQrText='',orderTimer=null;
 const storage={get(k){try{return localStorage.getItem(k)||''}catch{return ''}},set(k,v){try{localStorage.setItem(k,String(v))}catch{}},del(k){try{localStorage.removeItem(k)}catch{}}};
 activeApplicationId=storage.get('dudu-license-application');
 activeOrderId=storage.get('dudu-license-order');
 const feedback=(v,kind='')=>{const el=$('licenseMessage');el.textContent=v;el.dataset.kind=kind};
 const applicationText=s=>({pending:'待管理员审核',approved:'申请已通过',rejected:'申请未通过',approving:'正在处理'}[s]||s||'未知状态');
 function render(s){
  view=s;
  const state=s.valid?(s.type==='permanent'?'永久授权已激活':'24小时免费试用中'):!s.configured?'当前安装版未配置授权服务器':'尚未激活 / 试用已结束';
  $('licenseState').textContent=state;
  $('licenseDevice').textContent=s.deviceLabel||'未生成';
  $('licenseCountdown').textContent=s.valid?(s.type==='permanent'?'永久免费 · 离线凭证按期续签':('剩余 '+Math.max(0,Math.ceil((s.expiresAt-Date.now())/60000))+' 分钟')):'';
  $('btnLicenseTrial').disabled=s.valid||!s.configured;
  $('btnLicenseActivate').disabled=!s.configured;
  $('licenseStatusMini').textContent=s.valid?(s.type==='permanent'?'✓ 永久授权':'试用中'):'需激活';
  $('licenseApplicationPane').hidden=s.type==='permanent';
  $('licensePurchasePane').hidden=s.type==='permanent';
  feedback(s.error||(s.valid?'授权验证通过。你的漫剧项目、账号及素材始终保存在本地。':!s.configured?'需要部署独独AI授权服务器并配置公钥后，才能启用授权功能。':s.reason||'可免费申请永久卡密，或购买永久授权。'));
 }
 async function refresh(){const v=await B.licenseStatus();render(v);return v}
 function close(){
  if(!dialog.open)return;
  dialog.close();B.setOverlay(false);
  if(orderTimer){clearInterval(orderTimer);orderTimer=null}
 }
 async function open(){
  if(opening)return;opening=true;
  try{
   if($('noticeDialog')?.open){$('noticeDialog').close();B.setOverlay(false)}
   if($('tutorialDialog')?.open){$('tutorialDialog').close();B.setOverlay(false)}
   await refresh();B.setOverlay(true);
   if(!dialog.open)dialog.showModal();
   loadProducts().catch(e=>{$('licensePayResult').textContent=e.message});
   if(activeApplicationId)checkApplication().catch(()=>{});
   if(activeOrderId)checkOrder().catch(()=>{});
  }finally{opening=false}
 }
 async function action(fn){
  for(const id of ['btnLicenseTrial','btnLicenseActivate','btnLicenseRefresh'])$(id).disabled=true;
  feedback('正在验证授权，请勿重复点击…');
  try{const result=await fn();render(result);if(result.valid){feedback('✓ 授权成功。');close()}}
  catch(err){feedback('操作失败：'+String(err.message||err),'error')}
  finally{await refresh().catch(()=>{})}
 }
 async function loadProducts(){
  const result=await B.licenseProducts();products=result.products||[];
  const select=$('licenseProductSelect');select.replaceChildren();
  for(const p of products){const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.name+' · ¥'+(Number(p.price_fen)/100).toFixed(2);select.append(opt)}
  if(!products.length){const opt=document.createElement('option');opt.value='';opt.textContent='暂无可购买商品';select.append(opt)}
  const provider=$('licensePayProvider');
  for(const opt of provider.options){opt.disabled=!result.payments?.[opt.value]}
  if(provider.selectedOptions[0]?.disabled){const next=[...provider.options].find(o=>!o.disabled);if(next)provider.value=next.value}
  $('btnLicenseBuy').disabled=!products.length||![...provider.options].some(o=>!o.disabled);
  $('licensePayResult').textContent=products.length?'请选择商品和已开通的支付方式。':'商品暂未上架，请联系管理员。';
 }
 async function submitApplication(){
  $('btnLicenseApply').disabled=true;
  try{
   const result=await B.licenseApplicationCreate($('licenseApplyContact').value,$('licenseApplyReason').value);
   activeApplicationId=result.applicationId;storage.set('dudu-license-application',activeApplicationId);
   $('licenseApplyResult').textContent='申请已提交，编号：'+activeApplicationId+'；当前状态：'+applicationText(result.status);
   feedback('免费卡密申请已提交，等待管理员审核。');
  }catch(e){$('licenseApplyResult').textContent=e.message;feedback(e.message,'error')}
  finally{$('btnLicenseApply').disabled=false}
 }
 async function checkApplication(){
  if(!activeApplicationId){$('licenseApplyResult').textContent='尚未提交申请';return}
  const result=await B.licenseApplicationStatus(activeApplicationId);
  $('licenseApplyResult').textContent='申请编号：'+result.applicationId+'；状态：'+applicationText(result.status)+(result.cardLastFour?'；卡密尾号：'+result.cardLastFour:'')+(result.reviewNote?'；备注：'+result.reviewNote:'');
  if(result.status==='approved'){
   const state=await B.licenseRefresh();
   if(state.valid&&state.type==='permanent'){render(state);feedback('✓ 申请通过，当前设备已自动获得永久授权。');close()}
  }
 }
 function renderQr(text){
  activeQrText=text;const root=$('licensePayQr');root.replaceChildren();
  try{
   if(typeof QRCode!=='undefined')new QRCode(root,{text,width:204,height:204,colorDark:'#071321',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
   else root.textContent=text;
  }catch{root.textContent=text}
 }
 async function createOrder(){
  const productId=$('licenseProductSelect').value,provider=$('licensePayProvider').value;
  if(!productId)throw Error('请先选择已上架商品');
  $('btnLicenseBuy').disabled=true;$('licensePayResult').textContent='正在创建支付订单…';
  try{
   const result=await B.licenseOrderCreate(productId,provider);
   activeOrderId=result.orderId;storage.set('dudu-license-order',activeOrderId);
   $('licensePayArea').hidden=false;
   $('licensePayTitle').textContent='订单 '+result.orderNo;
   $('licensePayInfo').textContent='金额 ¥'+(result.amountFen/100).toFixed(2)+' · '+(provider==='wechat'?'微信支付':'支付宝')+' · 请在15分钟内完成付款';
   $('licensePayResult').textContent='请使用'+(provider==='wechat'?'微信':'支付宝')+'扫描二维码。付款成功后会自动激活当前电脑。';
   renderQr(result.qrText);
   if(orderTimer)clearInterval(orderTimer);
   orderTimer=setInterval(()=>checkOrder().catch(()=>{}),5000);
  }catch(e){$('licensePayResult').textContent=e.message;throw e}
  finally{$('btnLicenseBuy').disabled=false}
 }
 async function checkOrder(){
  if(!activeOrderId)return;
  const result=await B.licenseOrderStatus(activeOrderId);
  const labels={pending:'等待付款',processing:'正在处理付款',paid:'付款成功',expired:'订单已过期',failed:'下单失败'};
  $('licensePayResult').textContent='订单 '+result.orderNo+'：'+(labels[result.paymentStatus]||result.paymentStatus)+'；发货状态：'+result.deliveryStatus;
  if(result.paymentStatus==='paid'&&result.deliveryStatus==='delivered'){
   if(orderTimer){clearInterval(orderTimer);orderTimer=null}
   $('licensePayTitle').textContent='付款成功，正在激活授权…';
   const state=await B.licenseRefresh();
   if(state.valid&&state.type==='permanent'){render(state);feedback('✓ 付款成功，永久授权已自动绑定当前电脑。');storage.del('dudu-license-order');activeOrderId='';close()}
   else $('licensePayResult').textContent='付款已确认，授权正在同步，请点击“联网验证 / 更新授权”。';
  }else if(['expired','failed'].includes(result.paymentStatus)){
   if(orderTimer){clearInterval(orderTimer);orderTimer=null}
   activeOrderId='';storage.del('dudu-license-order');
  }
 }
 if(B.onLicenseUpdated)B.onLicenseUpdated(v=>{render(v)});
 $('btnLicense').onclick=()=>open().catch(err=>feedback(err.message,'error'));
 $('btnLicenseTrial').onclick=()=>action(()=>B.licenseTrial());
 $('btnLicenseActivate').onclick=()=>action(()=>B.licenseActivate($('licenseCode').value.trim()));
 $('btnLicenseRefresh').onclick=()=>action(()=>B.licenseRefresh());
 $('btnLicenseReadonly').onclick=close;
 $('btnLicenseWechat').onclick=()=>B.copyText('du4du44').then(()=>feedback('已复制 du4du44'));
 $('btnLicenseBackupWechat').onclick=()=>B.copyText('du6du66').then(()=>feedback('已复制 du6du66'));
 $('btnLicenseApply').onclick=submitApplication;
 $('btnLicenseApplyStatus').onclick=()=>checkApplication().catch(e=>{$('licenseApplyResult').textContent=e.message});
 $('btnLicenseProducts').onclick=()=>loadProducts().catch(e=>{$('licensePayResult').textContent=e.message});
 $('btnLicenseBuy').onclick=()=>createOrder().catch(e=>feedback('创建订单失败：'+e.message,'error'));
 $('btnLicenseCheckOrder').onclick=()=>checkOrder().catch(e=>{$('licensePayResult').textContent=e.message});
 $('btnLicenseCopyPay').onclick=()=>activeQrText?B.copyText(activeQrText).then(()=>{$('licensePayResult').textContent='已复制支付二维码内容'}):Promise.resolve();
 dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 async function init(){
  const v=await refresh();if(!v.valid&&first){first=false;await open()}
  return v;
 }
 setInterval(()=>{if(dialog.open)refresh().catch(()=>{})},60000);
 window.DuduLicenseUI={init,open,refresh,loadProducts,checkApplication,checkOrder};
})();
