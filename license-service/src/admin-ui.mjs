// Single-owner PC operations console. Admin token remains in page memory only.
export const adminHtml = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>独独AI运营管理中心</title>
<style>
:root{color-scheme:dark;--bg:#081323;--panel:#12233a;--panel2:#172b46;--line:#2c486b;--ink:#edf4ff;--muted:#9bb1cf;--blue:#4778ed;--green:#25b58b;--red:#e46c79}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 "Microsoft YaHei",system-ui,sans-serif}
button,input,textarea,select{font:inherit}button{border:1px solid #42628b;border-radius:8px;background:#285f88;color:#fff;padding:9px 14px;cursor:pointer}button:hover{filter:brightness(1.13)}button.secondary{background:#203955}button.danger{background:#713b4b;border-color:#a85a6a}button:disabled{opacity:.5;cursor:not-allowed}
input,textarea,select{width:100%;border:1px solid #3a587c;border-radius:8px;background:#091a2e;color:#edf4ff;padding:10px 12px;min-width:0}textarea{min-height:110px;resize:vertical}
.shell{max-width:1440px;margin:auto;padding:22px;display:grid;grid-template-columns:230px minmax(0,1fr);gap:20px}
.side{background:#0e1d31;border:1px solid var(--line);border-radius:16px;padding:18px;height:calc(100vh - 44px);position:sticky;top:22px;display:flex;flex-direction:column}
.brand{font-size:20px;font-weight:800;margin-bottom:4px}.sub{font-size:11px;color:var(--muted);margin-bottom:18px}
.nav{display:grid;gap:7px}.nav button{text-align:left;background:transparent;border-color:transparent;color:#b8cbe4}.nav button.active{background:#203b60;border-color:#456a9c;color:white}
.auth{margin-top:auto;border-top:1px solid var(--line);padding-top:14px}.auth label,.field{display:block;color:#b7cbe5;font-size:12px;margin:10px 0}.auth input{margin:6px 0}
main{min-width:0}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:4px 0 18px}.top h1{margin:0;font-size:24px}.status{color:#9edfc8;font-size:12px;min-height:20px}
.panel{display:none;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:16px}.panel.active{display:block}.panel h2{margin:0 0 14px;font-size:18px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.stat{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:16px}.stat small{color:var(--muted)}.stat strong{display:block;font-size:26px;margin-top:4px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.row>*{flex:0 0 auto}.row .grow{flex:1 1 220px}
.formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px}.wide{grid-column:1/-1}
.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:10px;margin-top:14px}
table{width:100%;border-collapse:collapse;min-width:700px}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #29415f;vertical-align:top}th{color:#aac3e4;background:#102039;font-size:12px}td{font-size:12px}tr:last-child td{border-bottom:0}
.pill{display:inline-block;padding:2px 8px;border-radius:20px;background:#244b60;color:#9de4cf;font-size:11px}.pill.warn{background:#5c482b;color:#f4d69b}.pill.bad{background:#5d2e3d;color:#ffc0c8}
.help{color:var(--muted);font-size:12px}.code{font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#08182b;border:1px solid var(--line);border-radius:9px;padding:12px;max-height:260px;overflow:auto}
.notice{background:#10263b;border:1px solid #31577c;border-radius:10px;padding:12px;color:#bfd2ea;margin:12px 0}
@media(max-width:900px){.shell{grid-template-columns:1fr}.side{height:auto;position:static}.nav{grid-template-columns:repeat(3,minmax(0,1fr))}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.shell{padding:10px}.nav{grid-template-columns:repeat(2,minmax(0,1fr))}.formgrid{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}.top{align-items:flex-start;flex-direction:column}}
</style></head>
<body><div class="shell">
<aside class="side"><div class="brand">独独AI · 运营中心</div><div class="sub">DUDU AI OPERATIONS · V1.0</div>
<nav class="nav">
<button class="active" data-tab="overview">▦ 总览</button><button data-tab="cards">▣ 卡密管理</button>
<button data-tab="applications">✉ 免费申请</button><button data-tab="products">◇ 商品管理</button>
<button data-tab="orders">▤ 订单管理</button><button data-tab="content">▧ 公告与教程</button>
<button data-tab="payments">￥ 支付配置</button><button data-tab="audit">◷ 操作日志</button>
</nav>
<div class="auth"><label>管理员令牌<input id="token" type="password" autocomplete="off" placeholder="粘贴管理员令牌"></label><div class="row"><button id="connect">连接后台</button><button class="secondary" id="clearToken">清空</button></div><p class="help">令牌仅保存在当前页面内存；关闭页面即清除。建议 Cloudflare Access + 双因素验证。</p></div>
</aside>
<main><div class="top"><div><h1 id="pageTitle">运营总览</h1><div class="help">统一管理授权、免费申请、付费订单和远程公告</div></div><div><div class="status" id="status">请先输入管理员令牌并连接</div><button class="secondary" id="refreshAll">刷新当前页面</button></div></div>

<section class="panel active" id="tab-overview"><h2>运营总览</h2><div class="grid">
<div class="stat"><small>累计卡密</small><strong id="statCards">—</strong></div><div class="stat"><small>待审批申请</small><strong id="statApps">—</strong></div><div class="stat"><small>已支付订单</small><strong id="statOrders">—</strong></div><div class="stat"><small>上架商品</small><strong id="statProducts">—</strong></div>
</div><div class="notice">付费订单只有在微信支付 / 支付宝异步通知完成验签、核对订单号和金额后才会自动发货。浏览器跳转不作为付款依据。</div>
<div class="row"><button data-go="applications">处理免费申请</button><button data-go="products" class="secondary">维护商品</button><button data-go="orders" class="secondary">查看订单</button><button data-go="content" class="secondary">修改公告</button></div></section>

<section class="panel" id="tab-cards"><h2>卡密管理</h2><div class="row"><label class="field">生成数量<input id="cardCount" type="number" min="1" max="50" value="5"></label><button id="issueCards">生成永久卡密</button><button id="copyCards" class="secondary">复制本次卡密</button><button id="loadCards" class="secondary">刷新卡密列表</button></div>
<div class="code" id="issuedCodes">生成的卡密只展示一次；请立即复制保存。</div><div class="tablewrap"><table><thead><tr><th>卡密ID</th><th>尾号</th><th>生成时间</th><th>设备绑定</th><th>状态</th><th>操作</th></tr></thead><tbody id="cardsBody"></tbody></table></div></section>

<section class="panel" id="tab-applications"><h2>免费永久授权申请</h2><p class="help">用户在工作台提交后出现在这里。通过后自动绑定申请设备，不需要手动复制卡密。</p><div class="row"><button id="loadApplications">刷新申请</button><span class="help">每次最多显示最近200条</span></div>
<div class="tablewrap"><table><thead><tr><th>申请时间</th><th>联系方式</th><th>申请原因</th><th>设备编号</th><th>状态</th><th>审核操作</th></tr></thead><tbody id="applicationsBody"></tbody></table></div></section>

<section class="panel" id="tab-products"><h2>商品管理</h2><div class="formgrid">
<label class="field">商品ID（留空自动生成）<input id="productId" placeholder="例如 workbench-lifetime"></label>
<label class="field">商品名称<input id="productName" placeholder="独独AI工作台永久授权"></label>
<label class="field">售价（元）<input id="productPrice" type="number" min="0.01" step="0.01" placeholder="99.00"></label>
<label class="field">排序（数字越小越靠前）<input id="productSort" type="number" value="0"></label>
<label class="field wide">商品说明<textarea id="productDescription" placeholder="购买后自动绑定当前设备，永久使用"></textarea></label>
</div><div class="row"><button id="saveProduct">保存商品</button><button id="resetProduct" class="secondary">新增商品</button><button id="loadProducts" class="secondary">刷新商品</button></div>
<div class="tablewrap"><table><thead><tr><th>商品</th><th>售价</th><th>授权类型</th><th>状态</th><th>操作</th></tr></thead><tbody id="productsBody"></tbody></table></div>
<p class="help">当前授权核心只支持永久授权。月卡、季卡、年卡暂不开放，避免商品卖出后授权系统无法按期到期。</p></section>

<section class="panel" id="tab-orders"><h2>订单管理</h2><div class="row"><button id="loadOrders">刷新订单</button><span class="help">支付成功后自动生成永久授权并绑定购买设备。</span></div>
<div class="tablewrap"><table><thead><tr><th>订单号</th><th>商品</th><th>金额</th><th>渠道</th><th>订单状态</th><th>发货状态</th><th>时间</th><th>操作</th></tr></thead><tbody id="ordersBody"></tbody></table></div></section>

<section class="panel" id="tab-content"><h2>公告、社群与教程</h2><p class="help">修改后发布到授权 Worker 的 /manifest.json；新版本工作台从该地址读取。教程图片请先上传到可信 HTTPS 图床，再填写图片地址。</p>
<div class="formgrid">
<label class="field">宣传标题<input id="cHeadline"></label><label class="field">副标题<input id="cSubtitle"></label>
<label class="field">主微信号<input id="cWechat"></label><label class="field">备用微信号<input id="cBackup"></label>
<label class="field wide">社群介绍<textarea id="cDescription"></textarea></label>
<label class="field">二维码 HTTPS 地址<input id="cQrUrl" placeholder="https://..."></label><label class="field">二维码到期时间<input id="cQrExpiry" placeholder="2027-01-01T23:59:59+08:00"></label>
<label class="field">新手教程标题<input id="cTutorialTitle"></label><label class="field">教程版本<input id="cTutorialVersion"></label>
<label class="field wide">教程步骤 JSON（数组；每项含 id/title/description/imageUrl/sha256/target）<textarea id="cSlides" style="min-height:190px"></textarea></label>
<label class="field">最新版本号<input id="cReleaseVersion"></label><label class="field">新版下载 HTTPS 地址<input id="cReleaseUrl"></label>
<label class="field wide">更新说明<textarea id="cReleaseNotes"></textarea></label>
<label class="field">公告标题<input id="cNoticeTitle"></label><label class="field wide">公告正文<textarea id="cNoticeBody"></textarea></label>
</div><div class="row"><button id="loadContent">读取已发布内容</button><button id="publishContent">发布公告与教程</button><button id="loadHistory" class="secondary">历史版本</button><select id="historySelect" style="max-width:300px"></select><button id="rollbackContent" class="secondary">回滚所选版本</button></div></section>

<section class="panel" id="tab-audit"><h2>管理员操作日志</h2><div class="row"><button id="loadAudit">刷新日志</button><span class="help">最近200条，记录卡密、审批、商品和公告操作</span></div><div class="tablewrap"><table><thead><tr><th>时间</th><th>操作</th><th>关联卡密ID</th></tr></thead><tbody id="auditBody"></tbody></table></div></section>
<section class="panel" id="tab-payments"><h2>官方支付配置</h2><p class="help">密钥只通过 Cloudflare Worker Secrets 配置，不在网页显示，也不进入 GitHub 源码或桌面安装包。</p>
<div class="grid"><div class="stat"><small>微信支付</small><strong id="wechatStatus">未检测</strong><div class="help" id="wechatFields"></div></div><div class="stat"><small>支付宝</small><strong id="alipayStatus">未检测</strong><div class="help" id="alipayFields"></div></div></div>
<div class="notice">请在 license-service 目录执行 wrangler secret put，按下方变量名逐项配置。配置后点击“重新检测”。</div>
<div class="code" id="secretGuide">微信支付：WECHATPAY_MCHID、WECHATPAY_APPID、WECHATPAY_SERIAL_NO、WECHATPAY_PRIVATE_KEY_PEM、WECHATPAY_API_V3_KEY、WECHATPAY_PLATFORM_PUBLIC_KEY_PEM、WECHATPAY_PLATFORM_SERIAL
支付宝：ALIPAY_APP_ID、ALIPAY_PRIVATE_KEY_PEM、ALIPAY_PUBLIC_KEY_PEM
可选：ALIPAY_SELLER_ID、WECHATPAY_NOTIFY_URL、ALIPAY_NOTIFY_URL、ALIPAY_RETURN_URL</div>
<button id="loadPaymentStatus">重新检测支付配置</button></section>
</main></div>
<script>
const $=id=>document.getElementById(id);let latestCodes=[],currentManifest=null,connected=false;
const titles={overview:"运营总览",cards:"卡密管理",applications:"免费申请审批",products:"商品管理",orders:"订单管理",content:"公告与教程",payments:"支付配置",audit:"管理员操作日志"};
function say(text,bad){$("status").textContent=text;$("status").style.color=bad?"#ff9da8":"#9edfc8"}
function token(){return $("token").value.trim()}
async function api(path,data){if(!token())throw Error("请先输入管理员令牌");const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token()},body:JSON.stringify(data||{})});const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||("HTTP "+r.status));return v}
function cell(tr,value){const td=document.createElement("td");td.textContent=value==null?"":String(value);tr.append(td);return td}
function button(text,fn,kind){const b=document.createElement("button");b.textContent=text;if(kind)b.className=kind;b.addEventListener("click",()=>safe(fn));return b}
function showTab(name){document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id==="tab-"+name));document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));$("pageTitle").textContent=titles[name]||"运营管理";if(connected)loadTab(name).catch(e=>say(e.message,true))}
async function loadTab(name){if(name==="overview")return loadOverview();if(name==="cards")return loadCards();if(name==="applications")return loadApplications();if(name==="products")return loadProducts();if(name==="orders")return loadOrders();if(name==="content")return loadContent();if(name==="payments")return loadPaymentStatus();if(name==="audit")return loadAudit()}
async function loadOverview(){const v=await api("/v1/admin/overview");$("statCards").textContent=v.cards;$("statApps").textContent=v.pendingApplications;$("statOrders").textContent=v.paidOrders;$("statProducts").textContent=v.activeProducts}
async function loadCards(){const v=await api("/v1/admin/cards/list");const root=$("cardsBody");root.replaceChildren();v.cards.forEach(x=>{const tr=document.createElement("tr");cell(tr,x.id);cell(tr,x.last_four);cell(tr,new Date(x.issued_ms).toLocaleString());cell(tr,x.bound?"已绑定":"未绑定");cell(tr,x.revoked_ms?"已停用":(x.bound?"已激活":"未激活"));const td=document.createElement("td");td.append(button("复制ID",()=>navigator.clipboard.writeText(x.id)),button("停用",()=>cardAction("revoke",x.id),"danger"),button("解绑",()=>cardAction("transfer",x.id),"secondary"));tr.append(td);root.append(tr)})}
async function cardAction(action,id){if(!confirm(action==="revoke"?"确认停用这张卡？":"确认解绑设备？"))return;await api("/v1/admin/cards/"+action,{cardId:id});say("卡密操作完成");loadCards()}
async function loadApplications(){const v=await api("/v1/admin/applications/list");const root=$("applicationsBody");root.replaceChildren();v.applications.forEach(x=>{const tr=document.createElement("tr");cell(tr,new Date(x.created_ms).toLocaleString());cell(tr,x.contact);cell(tr,x.reason);cell(tr,String(x.device_hash||"").slice(0,12)+"…");const td=cell(tr,x.status==="pending"?"待审批":x.status==="approved"?"已通过":"已拒绝");const actions=document.createElement("td");if(x.status==="pending"){actions.append(button("通过并自动激活",async()=>{if(!confirm("通过后将向该设备发放永久授权，确认？"))return;await api("/v1/admin/applications/approve",{applicationId:x.application_id});say("已通过，授权自动绑定设备");loadApplications();loadOverview()}),button("拒绝",async()=>{const note=prompt("拒绝原因（可留空）","");if(note===null)return;await api("/v1/admin/applications/reject",{applicationId:x.application_id,note});loadApplications()},"danger"))}else actions.textContent=x.review_note||"—";tr.append(actions);root.append(tr)})}
function resetProduct(){["productId","productName","productPrice","productDescription"].forEach(id=>$(id).value="");$("productSort").value="0"}
async function loadProducts(){const v=await api("/v1/admin/products/list");const root=$("productsBody");root.replaceChildren();v.products.forEach(x=>{const tr=document.createElement("tr");cell(tr,x.name+" ("+x.product_id+")");cell(tr,"¥"+(x.price_cents/100).toFixed(2));cell(tr,"永久授权");cell(tr,x.enabled?"上架":"下架");const td=document.createElement("td");td.append(button("编辑",()=>{$("productId").value=x.product_id;$("productName").value=x.name;$("productPrice").value=(x.price_cents/100).toFixed(2);$("productDescription").value=x.description;$("productSort").value=x.sort_order;window.scrollTo({top:0,behavior:"smooth"})}),button(x.enabled?"下架":"上架",async()=>{await api("/v1/admin/products/toggle",{productId:x.product_id,enabled:!x.enabled});loadProducts()},"secondary"));tr.append(td);root.append(tr)})}
async function saveProduct(){const yuan=Number($("productPrice").value);if(!Number.isFinite(yuan)||yuan<=0)throw Error("售价必须大于0");const v=await api("/v1/admin/products/save",{productId:$("productId").value.trim(),name:$("productName").value.trim(),description:$("productDescription").value,priceCents:Math.round(yuan*100),sortOrder:Number($("productSort").value)||0});say("商品已保存："+v.productId);await loadProducts();await loadOverview()}
async function loadOrders(){const v=await api("/v1/admin/orders/list");const root=$("ordersBody");root.replaceChildren();v.orders.forEach(x=>{const tr=document.createElement("tr");cell(tr,x.order_no);cell(tr,x.product_name);cell(tr,"¥"+(x.amount_cents/100).toFixed(2));cell(tr,x.payment_method==="wechat"?"微信支付":"支付宝");cell(tr,x.status==="paid"?"已支付":x.status==="pending"?"待支付":x.status==="refunded"?"已退款":"已关闭");cell(tr,x.delivery_status==="delivered"?"已自动发货":x.status==="paid"?"待补发":"—");cell(tr,new Date(x.created_ms).toLocaleString());const td=document.createElement("td");if((x.status==="pending"||x.status==="closed"))td.append(button("查询支付状态",async()=>{const result=await api("/v1/admin/orders/reconcile",{orderId:x.order_id});say(result.message||("查单结果："+result.status));await loadOrders();await loadOverview()}));if(x.status==="paid"&&x.delivery_status!=="delivered")td.append(button("补发授权",async()=>{await api("/v1/admin/orders/resend",{orderId:x.order_id});say("已补发授权");await loadOrders()},"secondary"));if(!td.childNodes.length)td.textContent=x.status==="paid"?"已完成":"—";tr.append(td);root.append(tr)})}
function setContent(m){currentManifest=m;$("cHeadline").value=m.community?.headline||"";$("cSubtitle").value=m.community?.subtitle||"";$("cWechat").value=m.community?.wechat||"du4du44";$("cBackup").value=m.community?.backupWechat||"du6du66";$("cDescription").value=m.community?.description||"";$("cQrUrl").value=m.community?.qrUrl||"";$("cQrExpiry").value=m.community?.qrExpiresAt||"";$("cTutorialTitle").value=m.tutorial?.title||"";$("cTutorialVersion").value=m.tutorial?.version||"1";$("cSlides").value=JSON.stringify(m.tutorial?.slides||[],null,2);$("cReleaseVersion").value=m.release?.version||"";$("cReleaseUrl").value=m.release?.url||"";$("cReleaseNotes").value=m.release?.notes||"";$("cNoticeTitle").value=m.notice?.title||"";$("cNoticeBody").value=m.notice?.body||""}
async function loadContent(){const v=await api("/v1/admin/content/get");setContent(v.manifest);say("已读取公告配置")}
async function publishContent(){let slides;try{slides=JSON.parse($("cSlides").value||"[]")}catch{throw Error("教程步骤 JSON 格式不正确")}const m={schemaVersion:2,community:{...(currentManifest?.community||{}),headline:$("cHeadline").value,subtitle:$("cSubtitle").value,wechat:$("cWechat").value,backupWechat:$("cBackup").value,description:$("cDescription").value,qrUrl:$("cQrUrl").value,qrExpiresAt:$("cQrExpiry").value},tutorial:{...(currentManifest?.tutorial||{}),title:$("cTutorialTitle").value,version:$("cTutorialVersion").value,slides},release:{...(currentManifest?.release||{}),version:$("cReleaseVersion").value,url:$("cReleaseUrl").value,notes:$("cReleaseNotes").value},notice:{id:"notice-"+Date.now(),title:$("cNoticeTitle").value,body:$("cNoticeBody").value,showHint:true}};const v=await api("/v1/admin/content/publish",{manifest:m});say("公告已发布："+v.updatedAt);await loadContent()}
async function loadHistory(){const v=await api("/v1/admin/content/history");const sel=$("historySelect");sel.replaceChildren();v.history.forEach(x=>{const o=document.createElement("option");o.value=x.history_id;o.textContent=x.history_id+" · "+new Date(x.created_ms).toLocaleString();sel.append(o)});say("已读取历史版本")}
async function rollbackContent(){if(!$("historySelect").value)throw Error("请先选择历史版本");if(!confirm("确认回滚所选公告版本？"))return;await api("/v1/admin/content/rollback",{historyId:$("historySelect").value});say("公告已回滚");await loadContent()}
async function loadAudit(){const v=await api("/v1/admin/audit/list");const root=$("auditBody");root.replaceChildren();v.events.forEach(x=>{const tr=document.createElement("tr");cell(tr,new Date(x.occurred_ms).toLocaleString());cell(tr,x.event);cell(tr,x.card_id||"—");root.append(tr)})}
async function loadPaymentStatus(){const v=await api("/v1/admin/payments/status");$("wechatStatus").textContent=v.wechat.configured?"已配置":"未配置";$("wechatStatus").style.color=v.wechat.configured?"#7ce0ba":"#f2c47f";$("wechatFields").textContent=v.wechat.configured?"必需密钥均已检测到": "缺少："+v.wechat.required.join("、");$("alipayStatus").textContent=v.alipay.configured?"已配置":"未配置";$("alipayStatus").style.color=v.alipay.configured?"#7ce0ba":"#f2c47f";$("alipayFields").textContent=v.alipay.configured?"必需密钥均已检测到":"缺少："+v.alipay.required.join("、")}
async function connect(){await loadOverview();connected=true;say("已连接运营后台");await loadTab(document.querySelector("[data-tab].active")?.dataset.tab||"overview")}
async function safe(fn){try{await fn()}catch(e){say(e.message,true)}}
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.go)));
$("connect").onclick=()=>safe(connect);$("clearToken").onclick=()=>{$("token").value="";connected=false;say("管理员令牌已清空")};
$("refreshAll").onclick=()=>safe(()=>loadTab(document.querySelector("[data-tab].active")?.dataset.tab||"overview"));
$("loadCards").onclick=()=>safe(loadCards);$("loadApplications").onclick=()=>safe(loadApplications);$("loadProducts").onclick=()=>safe(loadProducts);$("loadOrders").onclick=()=>safe(loadOrders);
$("issueCards").onclick=()=>safe(async()=>{const n=Number($("cardCount").value);const v=await api("/v1/admin/cards/issue",{count:n});latestCodes=v.codes||[];$("issuedCodes").textContent=latestCodes.join("\n")||"没有生成卡密";say("已生成 "+latestCodes.length+" 张卡密");await loadCards()});
$("copyCards").onclick=()=>safe(async()=>{if(!latestCodes.length)throw Error("本次没有可复制的卡密");await navigator.clipboard.writeText(latestCodes.join("\n"));say("卡密已复制")});
$("saveProduct").onclick=()=>safe(saveProduct);$("resetProduct").onclick=resetProduct;
$("loadContent").onclick=()=>safe(loadContent);$("publishContent").onclick=()=>safe(publishContent);$("loadHistory").onclick=()=>safe(loadHistory);$("rollbackContent").onclick=()=>safe(rollbackContent);$("loadPaymentStatus").onclick=()=>safe(loadPaymentStatus);$("loadAudit").onclick=()=>safe(loadAudit);
</script></body></html>`;