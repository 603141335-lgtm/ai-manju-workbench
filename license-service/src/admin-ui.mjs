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
<aside class="side"><div class="brand">独独AI · 运营中心</div><div class="sub">DUDU AI OPERATIONS · V1.3</div>
<nav class="nav">
<button class="active" data-tab="overview">▦ 总览</button><button data-tab="cards">▣ 卡密管理</button>
<button data-tab="applications">✉ 免费申请</button><button data-tab="products">◇ 商品管理</button>
<button data-tab="orders">▤ 订单管理</button><button data-tab="monitor">◉ 支付监控</button><button data-tab="finance">￥ 财务报表</button><button data-tab="refunds">↩ 退款管理</button><button data-tab="content">▧ 公告与教程</button>
<button data-tab="payments">￥ 支付配置</button><button data-tab="audit">◷ 操作日志</button>
</nav>
<div class="auth"><label>管理员令牌<input id="token" type="password" autocomplete="off" placeholder="粘贴管理员令牌"></label><div class="row"><button id="connect">连接后台</button><button class="secondary" id="clearToken">清空</button></div><p class="help">令牌仅保存在当前页面内存；关闭页面即清除。建议 Cloudflare Access + 双因素验证。</p></div>
</aside>
<main><div class="top"><div><h1 id="pageTitle">运营总览</h1><div class="help">统一管理授权、免费申请、付费订单和远程公告</div></div><div><div class="status" id="status">请先输入管理员令牌并连接</div><button class="secondary" id="refreshAll">刷新当前页面</button></div></div>

<section class="panel active" id="tab-overview"><h2>运营总览</h2><div class="grid">
<div class="stat"><small>累计卡密</small><strong id="statCards">—</strong></div><div class="stat"><small>待审批申请</small><strong id="statApps">—</strong></div><div class="stat"><small>已支付订单</small><strong id="statOrders">—</strong></div><div class="stat"><small>上架商品</small><strong id="statProducts">—</strong></div>
</div><div class="notice">付费订单只有在微信支付 / 支付宝异步通知完成验签、核对订单号和金额后才会自动发货。浏览器跳转不作为付款依据。</div>
<div class="row"><button data-go="applications">处理免费申请</button><button data-go="products" class="secondary">维护商品</button><button data-go="orders" class="secondary">查看订单</button><button data-go="finance" class="secondary">查看财务</button><button data-go="refunds" class="secondary">处理退款</button><button data-go="content" class="secondary">修改公告</button></div></section>

<section class="panel" id="tab-cards"><h2>卡密管理</h2><div class="row"><label class="field">生成数量<input id="cardCount" type="number" min="1" max="50" value="5"></label><button id="issueCards">生成永久卡密</button><button id="copyCards" class="secondary">复制本次卡密</button><button id="loadCards" class="secondary">刷新卡密列表</button></div>
<div class="code" id="issuedCodes">生成的完整卡密只展示一次；请立即点击“复制本次卡密”并保存。只有以 DUDU- 开头的完整卡密可以在工作台激活。</div><p class="help">下方的管理 ID 和尾号只用于查找、停用和解绑，不能用于激活工作台。</p><div class="tablewrap"><table><thead><tr><th>管理 ID（不能激活）</th><th>尾号</th><th>生成时间</th><th>设备绑定</th><th>状态</th><th>操作</th></tr></thead><tbody id="cardsBody"></tbody></table></div></section>

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

<section class="panel" id="tab-orders"><h2>订单管理</h2><div class="row"><button id="loadOrders">刷新订单</button><span class="help">支付成功后自动发放永久授权；全额退款成功后自动撤销该订单对应授权。</span></div>
<div class="tablewrap"><table><thead><tr><th>订单号</th><th>商品</th><th>金额</th><th>渠道</th><th>订单状态</th><th>发货状态</th><th>退款状态</th><th>时间</th><th>操作</th></tr></thead><tbody id="ordersBody"></tbody></table></div></section>

<section class="panel" id="tab-monitor"><h2>支付与自动发货监控</h2>
<div class="row"><button id="refreshPaymentMonitor">刷新监控</button><button id="runPaymentReconcile" class="secondary">立即执行一次补偿</button><span class="help">手动补偿最短间隔60秒；系统仍会按5分钟定时任务自动执行。</span></div>
<div class="grid" style="margin-top:14px">
<div class="stat"><small>待付款订单</small><strong id="monPending">—</strong></div>
<div class="stat"><small>已付款待发货</small><strong id="monUndelivered">—</strong></div>
<div class="stat"><small>发货队列异常</small><strong id="monFailedDeliveries">—</strong></div>
<div class="stat"><small>近24小时回调异常</small><strong id="monFailedWebhooks">—</strong></div>
</div>
<div class="grid" style="margin-top:12px">
<div class="stat"><small>微信最近支付回调</small><strong id="monWechatLast" style="font-size:14px">—</strong><div class="help" id="monWechatTime"></div></div>
<div class="stat"><small>微信最近退款回调</small><strong id="monWechatRefundLast" style="font-size:14px">—</strong><div class="help" id="monWechatRefundTime"></div></div>
<div class="stat"><small>支付宝最近支付回调</small><strong id="monAlipayLast" style="font-size:14px">—</strong><div class="help" id="monAlipayTime"></div></div>
<div class="stat"><small>最近自动查单</small><strong id="monReconcileTime" style="font-size:14px">—</strong><div class="help" id="monReconcileAttempts"></div></div>
<div class="stat"><small>近24小时回调总量</small><strong id="monWebhookTotal">—</strong><div class="help">按支付渠道和处理结果统计</div></div>
</div>
<div class="notice">回调日志仅保存事件编号、订单号、结果、简要原因和请求摘要，不保存原始回调内容、支付密钥或用户支付凭据。</div>
<div class="code" id="monCallbackUrls">刷新监控后显示实际支付及退款回调地址。</div>
<h3>最近支付与退款回调</h3><div class="tablewrap"><table><thead><tr><th>时间</th><th>渠道</th><th>事件编号</th><th>订单号</th><th>结果</th><th>处理说明</th><th>请求摘要</th></tr></thead><tbody id="paymentEventsBody"></tbody></table></div>
<h3 style="margin-top:22px">自动发货队列</h3><div class="tablewrap"><table><thead><tr><th>时间</th><th>订单号</th><th>商品</th><th>状态</th><th>尝试次数</th><th>失败原因</th><th>操作</th></tr></thead><tbody id="deliveriesBody"></tbody></table></div>
</section>

<section class="panel" id="tab-finance"><h2>财务报表</h2>
<div class="row">
<label class="field">开始日期<input id="financeStart" type="date"></label>
<label class="field">结束日期<input id="financeEnd" type="date"></label>
<button id="loadFinance">查询统计</button>
</div>
<div class="grid" style="margin-top:10px">
<div class="stat"><small>实收订单金额</small><strong id="financeGross">—</strong></div>
<div class="stat"><small>已完成退款</small><strong id="financeRefunds">—</strong></div>
<div class="stat"><small>净现金流</small><strong id="financeNet">—</strong></div>
<div class="stat"><small>已付款订单数</small><strong id="financeOrders">—</strong></div>
<div class="stat"><small>待核验退款</small><strong id="financePendingRefunds">—</strong></div>
</div>
<div class="notice">统计口径：实收按支付成功时间计入，退款按支付平台确认成功时间计入；净现金流 = 本期实收 - 本期成功退款。日期按当前电脑浏览器本地时区计算。</div>
<h3>支付渠道统计</h3><div class="tablewrap"><table><thead><tr><th>支付渠道</th><th>付款订单数</th><th>实收金额</th></tr></thead><tbody id="financeChannelsBody"></tbody></table></div>
<h3 style="margin-top:22px">商品销售排行</h3><div class="tablewrap"><table><thead><tr><th>商品</th><th>付款订单数</th><th>销售金额</th></tr></thead><tbody id="financeProductsBody"></tbody></table></div>
</section>

<section class="panel" id="tab-refunds"><h2>退款管理</h2>
<div class="row"><button id="loadRefunds">刷新退款记录</button><span class="help">当前只开放全额原路退款；平台确认退款成功后才撤销对应授权。</span></div>
<div class="notice">处理中或结果不确定的退款会锁定该订单的重复退款和授权补发。支付宝退款建议等待10秒后查询；微信退款优先接收异步结果通知，也可手动查单。</div>
<div class="tablewrap"><table><thead><tr><th>创建时间</th><th>退款单号</th><th>原订单</th><th>商品</th><th>渠道</th><th>退款金额</th><th>状态</th><th>平台退款号</th><th>说明/失败原因</th><th>操作</th></tr></thead><tbody id="refundsBody"></tbody></table></div>
</section>


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
<div class="notice" id="salesStatus">在线购买状态：正在检测…</div>
<div class="grid"><div class="stat"><small>微信支付</small><strong id="wechatStatus">未检测</strong><div class="help" id="wechatFields"></div></div><div class="stat"><small>支付宝</small><strong id="alipayStatus">未检测</strong><div class="help" id="alipayFields"></div></div></div>
<div class="notice">请在 license-service 目录执行 wrangler secret put，按下方变量名逐项配置。配置后点击“重新检测”。</div>
<div class="code" id="secretGuide">微信支付（必需）：WECHATPAY_MCHID、WECHATPAY_APPID、WECHATPAY_SERIAL_NO、WECHATPAY_PRIVATE_KEY_PEM、WECHATPAY_API_V3_KEY、WECHATPAY_PLATFORM_PUBLIC_KEY_PEM、WECHATPAY_PLATFORM_SERIAL
支付宝（必需）：ALIPAY_APP_ID、ALIPAY_PRIVATE_KEY_PEM、ALIPAY_PUBLIC_KEY_PEM、ALIPAY_SELLER_ID
可选：WECHATPAY_NOTIFY_URL、WECHATPAY_REFUND_NOTIFY_URL、ALIPAY_NOTIFY_URL、ALIPAY_RETURN_URL</div>
<div class="row"><button id="loadPaymentStatus">重新检测支付配置</button><button id="runPaymentSelfTest" class="secondary">运行本地密钥自检</button></div>
<div class="notice" id="paymentSelfTestResult">本地自检只检查密钥能否正确导入与签名，不会创建订单、扣款或证明商户平台在线。</div></section>
</main></div>
<script>
const $=id=>document.getElementById(id);let latestCodes=[],currentManifest=null,connected=false;
const titles={overview:"运营总览",cards:"卡密管理",applications:"免费申请审批",products:"商品管理",orders:"订单管理",monitor:"支付与发货监控",finance:"财务报表",refunds:"退款管理",content:"公告与教程",payments:"支付配置",audit:"管理员操作日志"};
function say(text,bad){$("status").textContent=text;$("status").style.color=bad?"#ff9da8":"#9edfc8"}
function token(){return $("token").value.trim()}
async function api(path,data){if(!token())throw Error("请先输入管理员令牌");const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token()},body:JSON.stringify(data||{})});const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||("HTTP "+r.status));return v}
function cell(tr,value){const td=document.createElement("td");td.textContent=value==null?"":String(value);tr.append(td);return td}
function button(text,fn,kind){const b=document.createElement("button");b.textContent=text;if(kind)b.className=kind;b.addEventListener("click",()=>safe(fn));return b}
function showTab(name){document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id==="tab-"+name));document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));$("pageTitle").textContent=titles[name]||"运营管理";if(connected)loadTab(name).catch(e=>say(e.message,true))}
async function loadTab(name){if(name==="overview")return loadOverview();if(name==="cards")return loadCards();if(name==="applications")return loadApplications();if(name==="products")return loadProducts();if(name==="orders")return loadOrders();if(name==="monitor")return loadPaymentMonitor();if(name==="finance")return loadFinance();if(name==="refunds")return loadRefunds();if(name==="content")return loadContent();if(name==="payments")return loadPaymentStatus();if(name==="audit")return loadAudit()}
async function loadOverview(){const v=await api("/v1/admin/overview");$("statCards").textContent=v.cards;$("statApps").textContent=v.pendingApplications;$("statOrders").textContent=v.paidOrders;$("statProducts").textContent=v.activeProducts}
async function loadCards(){const v=await api("/v1/admin/cards/list");const root=$("cardsBody");root.replaceChildren();v.cards.forEach(x=>{const tr=document.createElement("tr");cell(tr,x.id);cell(tr,x.last_four);cell(tr,new Date(x.issued_ms).toLocaleString());cell(tr,x.bound?"已绑定":"未绑定");cell(tr,x.revoked_ms?"已停用":(x.bound?"已激活":"未激活"));const td=document.createElement("td");td.append(button("复制管理ID",()=>navigator.clipboard.writeText(x.id)),button("停用",()=>cardAction("revoke",x.id),"danger"),button("解绑",()=>cardAction("transfer",x.id),"secondary"));tr.append(td);root.append(tr)})}
async function cardAction(action,id){if(!confirm(action==="revoke"?"确认停用这张卡？":"确认解绑设备？"))return;await api("/v1/admin/cards/"+action,{cardId:id});say("卡密操作完成");loadCards()}
async function loadApplications(){const v=await api("/v1/admin/applications/list");const root=$("applicationsBody");root.replaceChildren();v.applications.forEach(x=>{const tr=document.createElement("tr");cell(tr,new Date(x.created_ms).toLocaleString());cell(tr,x.contact);cell(tr,x.reason);cell(tr,String(x.device_hash||"").slice(0,12)+"…");const td=cell(tr,x.status==="pending"?"待审批":x.status==="approved"?"已通过":"已拒绝");const actions=document.createElement("td");if(x.status==="pending"){actions.append(button("通过并自动激活",async()=>{if(!confirm("通过后将向该设备发放永久授权，确认？"))return;await api("/v1/admin/applications/approve",{applicationId:x.application_id});say("已通过，授权自动绑定设备");loadApplications();loadOverview()}),button("拒绝",async()=>{const note=prompt("拒绝原因（可留空）","");if(note===null)return;await api("/v1/admin/applications/reject",{applicationId:x.application_id,note});loadApplications()},"danger"))}else actions.textContent=x.review_note||"—";tr.append(actions);root.append(tr)})}
function resetProduct(){["productId","productName","productPrice","productDescription"].forEach(id=>$(id).value="");$("productSort").value="0"}
async function loadProducts(){const v=await api("/v1/admin/products/list");const root=$("productsBody");root.replaceChildren();v.products.forEach(x=>{const tr=document.createElement("tr");cell(tr,x.name+" ("+x.product_id+")");cell(tr,"¥"+(x.price_cents/100).toFixed(2));cell(tr,"永久授权");cell(tr,x.enabled?"上架":"下架");const td=document.createElement("td");td.append(button("编辑",()=>{$("productId").value=x.product_id;$("productName").value=x.name;$("productPrice").value=(x.price_cents/100).toFixed(2);$("productDescription").value=x.description;$("productSort").value=x.sort_order;window.scrollTo({top:0,behavior:"smooth"})}),button(x.enabled?"下架":"上架",async()=>{await api("/v1/admin/products/toggle",{productId:x.product_id,enabled:!x.enabled});loadProducts()},"secondary"));tr.append(td);root.append(tr)})}
async function saveProduct(){const yuan=Number($("productPrice").value);if(!Number.isFinite(yuan)||yuan<=0)throw Error("售价必须大于0");const v=await api("/v1/admin/products/save",{productId:$("productId").value.trim(),name:$("productName").value.trim(),description:$("productDescription").value,priceCents:Math.round(yuan*100),sortOrder:Number($("productSort").value)||0});say("商品已保存："+v.productId);await loadProducts();await loadOverview()}
async function loadOrders(){
 const v=await api("/v1/admin/orders/list"),root=$("ordersBody");root.replaceChildren();
 v.orders.forEach(x=>{
  const tr=document.createElement("tr"),refundState=x.refund_status||"";
  cell(tr,x.order_no);cell(tr,x.product_name);cell(tr,"¥"+(x.amount_cents/100).toFixed(2));
  cell(tr,x.payment_method==="wechat"?"微信支付":"支付宝");
  cell(tr,x.status==="paid"?"已支付":x.status==="pending"?"待支付":x.status==="refunded"?"已退款":"已关闭");
  cell(tr,x.status==="refunded"?"授权已撤销":refundState==="processing"||refundState==="manual_review"?"退款处理中，暂停发货":x.delivery_status==="delivered"?"已自动发货":x.status==="paid"?"待补发":"—");
  cell(tr,refundState?refundStatusText(refundState):"—");
  cell(tr,new Date(x.created_ms).toLocaleString());
  const td=document.createElement("td");
  if(x.status==="pending"||x.status==="closed")td.append(button("查询支付状态",async()=>{
   const result=await api("/v1/admin/orders/reconcile",{orderId:x.order_id});say(result.message||("查单结果："+result.status));await loadOrders();await loadOverview();
  }));
  if(x.status==="paid"&&x.delivery_status!=="delivered"&&!["processing","manual_review","succeeded"].includes(refundState))td.append(button("补发授权",async()=>{
   await api("/v1/admin/orders/resend",{orderId:x.order_id});say("已补发授权");await loadOrders();
  },"secondary"));
  if(x.status==="paid"&&["processing","manual_review"].includes(refundState))td.append(button("查询退款",async()=>reconcileRefund(x.refund_id),"secondary"));
  if(x.status==="paid"&&!["processing","manual_review","succeeded"].includes(refundState))td.append(button("全额退款",async()=>createRefundFromOrder(x),"danger"));
  if(!td.childNodes.length)td.textContent=x.status==="paid"?"已完成":"—";
  tr.append(td);root.append(tr);
 });
}
function setContent(m){currentManifest=m;$("cHeadline").value=m.community?.headline||"";$("cSubtitle").value=m.community?.subtitle||"";$("cWechat").value=m.community?.wechat||"du4du44";$("cBackup").value=m.community?.backupWechat||"du6du66";$("cDescription").value=m.community?.description||"";$("cQrUrl").value=m.community?.qrUrl||"";$("cQrExpiry").value=m.community?.qrExpiresAt||"";$("cTutorialTitle").value=m.tutorial?.title||"";$("cTutorialVersion").value=m.tutorial?.version||"1";$("cSlides").value=JSON.stringify(m.tutorial?.slides||[],null,2);$("cReleaseVersion").value=m.release?.version||"";$("cReleaseUrl").value=m.release?.url||"";$("cReleaseNotes").value=m.release?.notes||"";$("cNoticeTitle").value=m.notice?.title||"";$("cNoticeBody").value=m.notice?.body||""}
async function loadContent(){const v=await api("/v1/admin/content/get");setContent(v.manifest);say("已读取公告配置")}
async function publishContent(){let slides;try{slides=JSON.parse($("cSlides").value||"[]")}catch{throw Error("教程步骤 JSON 格式不正确")}const m={schemaVersion:2,community:{...(currentManifest?.community||{}),headline:$("cHeadline").value,subtitle:$("cSubtitle").value,wechat:$("cWechat").value,backupWechat:$("cBackup").value,description:$("cDescription").value,qrUrl:$("cQrUrl").value,qrExpiresAt:$("cQrExpiry").value},tutorial:{...(currentManifest?.tutorial||{}),title:$("cTutorialTitle").value,version:$("cTutorialVersion").value,slides},release:{...(currentManifest?.release||{}),version:$("cReleaseVersion").value,url:$("cReleaseUrl").value,notes:$("cReleaseNotes").value},notice:{id:"notice-"+Date.now(),title:$("cNoticeTitle").value,body:$("cNoticeBody").value,showHint:true}};const v=await api("/v1/admin/content/publish",{manifest:m});say("公告已发布："+v.updatedAt);await loadContent()}
async function loadHistory(){const v=await api("/v1/admin/content/history");const sel=$("historySelect");sel.replaceChildren();v.history.forEach(x=>{const o=document.createElement("option");o.value=x.history_id;o.textContent=x.history_id+" · "+new Date(x.created_ms).toLocaleString();sel.append(o)});say("已读取历史版本")}
async function rollbackContent(){if(!$("historySelect").value)throw Error("请先选择历史版本");if(!confirm("确认回滚所选公告版本？"))return;await api("/v1/admin/content/rollback",{historyId:$("historySelect").value});say("公告已回滚");await loadContent()}
async function loadAudit(){const v=await api("/v1/admin/audit/list");const root=$("auditBody");root.replaceChildren();v.events.forEach(x=>{const tr=document.createElement("tr");cell(tr,new Date(x.occurred_ms).toLocaleString());cell(tr,x.event);cell(tr,x.card_id||"—");root.append(tr)})}
async function loadPaymentStatus(){const v=await api("/v1/admin/payments/status");$("salesStatus").textContent=v.salesEnabled?"在线购买状态：已开放；请确认微信和支付宝均已完成真实商户验收。":"在线购买状态：未开放。配置商户密钥并完成支付、退款和回调验收后，再由管理员设置 DUDU_SALES_ENABLED=true。";$("wechatStatus").textContent=v.wechat.configured?"已配置":"未配置";$("wechatStatus").style.color=v.wechat.configured?"#7ce0ba":"#f2c47f";$("wechatFields").textContent=v.wechat.configured?"必需密钥均已检测到": "缺少："+v.wechat.required.join("、");$("alipayStatus").textContent=v.alipay.configured?"已配置":"未配置";$("alipayStatus").style.color=v.alipay.configured?"#7ce0ba":"#f2c47f";$("alipayFields").textContent=v.alipay.configured?"必需密钥均已检测到":"缺少："+v.alipay.required.join("、")}

function money(cents){return "¥"+(Number(cents||0)/100).toFixed(2)}
function refundStatusText(status){return ({processing:"处理中",succeeded:"退款成功",failed:"未成功",manual_review:"待人工核对"})[status]||status||"—"}
function localDateString(date){return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0")}
function initFinanceDates(){
 const now=new Date(),start=new Date(now);start.setDate(start.getDate()-29);
 if(!$("financeStart").value)$("financeStart").value=localDateString(start);
 if(!$("financeEnd").value)$("financeEnd").value=localDateString(now);
}
async function loadFinance(){
 initFinanceDates();
 const start=new Date($("financeStart").value+"T00:00:00").getTime();
 const end=new Date($("financeEnd").value+"T00:00:00").getTime()+86400000;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error("请选择正确的统计日期范围");
 const v=await api("/v1/admin/finance/summary",{startMs:start,endMs:end});
 $("financeGross").textContent=money(v.grossCents);$("financeRefunds").textContent=money(v.refundsCents);
 $("financeNet").textContent=money(v.netCents);$("financeOrders").textContent=v.paidOrders;
 $("financePendingRefunds").textContent=v.pendingRefunds;
 const channels=$("financeChannelsBody");channels.replaceChildren();
 (v.channels||[]).forEach(x=>{const tr=document.createElement("tr");cell(tr,x.provider==="wechat"?"微信支付":"支付宝");cell(tr,x.orders);cell(tr,money(x.gross_cents));channels.append(tr)});
 if(!(v.channels||[]).length){const tr=document.createElement("tr");cell(tr,"所选日期没有付款记录");channels.append(tr)}
 const products=$("financeProductsBody");products.replaceChildren();
 (v.products||[]).forEach(x=>{const tr=document.createElement("tr");cell(tr,x.product_name);cell(tr,x.orders);cell(tr,money(x.gross_cents));products.append(tr)});
 if(!(v.products||[]).length){const tr=document.createElement("tr");cell(tr,"暂无商品销售记录");products.append(tr)}
 say("财务报表已更新");
}
async function loadRefunds(){
 const v=await api("/v1/admin/refunds/list"),root=$("refundsBody");root.replaceChildren();
 (v.refunds||[]).forEach(x=>{
  const tr=document.createElement("tr");cell(tr,formatDate(x.created_ms));cell(tr,x.refund_no);cell(tr,x.order_no);
  cell(tr,x.product_name);cell(tr,x.provider==="wechat"?"微信支付":"支付宝");cell(tr,money(x.amount_cents));
  cell(tr,refundStatusText(x.status));cell(tr,x.provider_refund_id||"—");
  cell(tr,x.last_error||x.reason||"—");
  const td=cell(tr,"—");
  if(x.status==="processing"||x.status==="manual_review")td.replaceChildren(button("查询退款状态",async()=>reconcileRefund(x.refund_id),"secondary"));
  root.append(tr);
 });
 if(!(v.refunds||[]).length){const tr=document.createElement("tr");cell(tr,"暂无退款记录");root.append(tr)}
 say("退款记录已刷新");
}
async function reconcileRefund(refundId){
 const result=await api("/v1/admin/refunds/reconcile",{refundId});
 say(result.message||("退款状态："+refundStatusText(result.status)));
 await Promise.all([loadRefunds(),loadOrders(),loadFinance()]);
}
async function createRefundFromOrder(order){
 const reason=prompt("填写退款原因（将发送给支付平台）","用户申请退款");
 if(reason===null)return;
 if(!confirm("确认对订单 "+order.order_no+" 发起全额原路退款 "+money(order.amount_cents)+"？只有支付平台确认退款成功后，系统才会撤销本订单对应授权。该操作会真实退还资金，不能当作测试。"))return;
 const result=await api("/v1/admin/refunds/create",{orderId:order.order_id,reason,confirmFullRefund:true});
 say(result.message||("退款状态："+refundStatusText(result.status)),result.status==="manual_review");
 await Promise.all([loadOrders(),loadRefunds(),loadFinance()]);
}

function formatDate(ms){return ms?new Date(ms).toLocaleString():"暂无记录"}
function outcomeText(value){return ({accepted:"成功",ignored:"已接收（非成功交易）",rejected:"验签拒绝",error:"处理异常"})[value]||value||"—"}
async function loadPaymentMonitor(){
 const [health,events,deliveries]=await Promise.all([
  api("/v1/admin/payments/health"),api("/v1/admin/payments/events/list"),api("/v1/admin/deliveries/list")
 ]);
 $("monPending").textContent=health.pendingOrders;
 $("monUndelivered").textContent=health.paidUndelivered;
 $("monFailedDeliveries").textContent=health.failedDeliveries;
 $("monFailedWebhooks").textContent=health.failedWebhooks24h;
 const wechat=health.lastWebhook.wechat,refund=health.lastWebhook.wechatRefund,alipay=health.lastWebhook.alipay;
 $("monWechatLast").textContent=(health.providers.wechat?"配置已就绪":"未配置")+" · "+(wechat?outcomeText(wechat.outcome):"暂无回调");
 $("monWechatTime").textContent=wechat?formatDate(wechat.occurred_ms):"尚未收到支付回调";
 $("monWechatRefundLast").textContent=(health.providers.wechat?"配置已就绪":"未配置")+" · "+(refund?(refund.message||outcomeText(refund.outcome)):"暂无退款回调");
 $("monWechatRefundTime").textContent=refund?formatDate(refund.occurred_ms):"尚未收到退款回调";
 $("monAlipayLast").textContent=(health.providers.alipay?"配置已就绪":"未配置")+" · "+(alipay?outcomeText(alipay.outcome):"暂无回调");
 $("monAlipayTime").textContent=alipay?formatDate(alipay.occurred_ms):"尚未收到支付回调";
 $("monCallbackUrls").textContent="微信支付回调："+health.callbacks.wechat+"\n微信退款回调："+health.callbacks.wechatRefund+"\n支付宝支付回调："+health.callbacks.alipay;
 $("monReconcileTime").textContent=formatDate(health.reconciliation.lastCheckedMs);
 $("monReconcileAttempts").textContent="累计查单 "+(health.reconciliation.totalAttempts||0)+" 次";
 $("monWebhookTotal").textContent=(health.webhookCounts24h||[]).reduce((sum,x)=>sum+Number(x.n||0),0);
 const eventRoot=$("paymentEventsBody");eventRoot.replaceChildren();
 (events.events||[]).forEach(x=>{
  const tr=document.createElement("tr");
  cell(tr,formatDate(x.occurred_ms));cell(tr,x.provider==="wechat"?"微信支付":"支付宝");
  cell(tr,x.event_id||"—");cell(tr,x.order_no||"—");cell(tr,outcomeText(x.outcome));
  cell(tr,x.message||"—");cell(tr,String(x.payload_sha256||"").slice(0,16)+"…");
  eventRoot.append(tr);
 });
 if(!(events.events||[]).length){const tr=document.createElement("tr");cell(tr,"暂无回调记录");eventRoot.append(tr)}
 const deliveryRoot=$("deliveriesBody");deliveryRoot.replaceChildren();
 (deliveries.deliveries||[]).forEach(x=>{
  const tr=document.createElement("tr");
  cell(tr,formatDate(x.created_ms));cell(tr,x.order_no||x.order_id);cell(tr,x.product_name||"—");
  cell(tr,x.status==="delivered"?"已发放":x.status==="failed"?"发放失败":"等待发放");
  cell(tr,x.attempts||0);cell(tr,x.last_error||"—");
  const action=cell(tr,"—");
  if(x.order_status==="paid"&&x.status!=="delivered"){
   action.replaceChildren(button("重试发货",async()=>{
    if(!confirm("确认重新发放该订单的授权？"))return;
    await api("/v1/admin/orders/resend",{orderId:x.order_id});
    say("授权补发完成");await loadPaymentMonitor();await loadOrders();
   },"secondary"));
  }
  deliveryRoot.append(tr);
 });
 if(!(deliveries.deliveries||[]).length){const tr=document.createElement("tr");cell(tr,"暂无发货队列记录");deliveryRoot.append(tr)}
 say("支付监控数据已刷新");
}
async function runPaymentReconcile(){
 if(!confirm("立即检查近期未完成订单，并重试已付款但未发货的订单？此操作不会创建新订单或扣款。"))return;
 const btn=$("runPaymentReconcile");btn.disabled=true;
 try{
  const v=await api("/v1/admin/payments/reconcile/run");
  say("补偿完成：查单 "+v.checked+"，确认到账 "+v.paid+"，发货恢复 "+v.deliveryRecovered+"，异常 "+v.failed);
  await loadPaymentMonitor();await loadOrders();
 }finally{btn.disabled=false}
}
async function runPaymentSelfTest(){
 const result=$("paymentSelfTestResult");result.textContent="正在执行本地密钥自检…";
 const v=await api("/v1/admin/payments/self-test");
 const lines=["微信支付："+(v.wechat.ok?"通过":"未通过")+"；"+(v.wechat.message||v.wechat.note||""),"支付宝："+(v.alipay.ok?"通过":"未通过")+"；"+(v.alipay.message||v.alipay.note||""),v.note||""];
 result.textContent=lines.join("\n");
 say("本地密钥自检已完成",!v.wechat.ok||!v.alipay.ok);
}
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
$("loadContent").onclick=()=>safe(loadContent);$("publishContent").onclick=()=>safe(publishContent);$("loadHistory").onclick=()=>safe(loadHistory);$("rollbackContent").onclick=()=>safe(rollbackContent);$("loadPaymentStatus").onclick=()=>safe(loadPaymentStatus);$("runPaymentSelfTest").onclick=()=>safe(runPaymentSelfTest);$("refreshPaymentMonitor").onclick=()=>safe(loadPaymentMonitor);$("runPaymentReconcile").onclick=()=>safe(runPaymentReconcile);$("loadFinance").onclick=()=>safe(loadFinance);$("loadRefunds").onclick=()=>safe(loadRefunds);$("loadAudit").onclick=()=>safe(loadAudit);
</script></body></html>`;
