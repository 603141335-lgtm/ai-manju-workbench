package com.kuaidi.quickscan

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.net.Uri
import android.text.Editable
import android.text.InputType
import android.text.TextUtils
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import java.io.File
import java.util.Locale
import java.util.concurrent.ExecutorService

internal interface SettlementHost {
  val viewCtx: Context
  val palette: ScanTheme
  val scanDb: ScanDb
  val cloud: CloudSyncClient
  val ioExecutor: ExecutorService
  fun runUi(block: () -> Unit)
  fun showToast(msg: String)
  fun renderSettlementPage()
  fun pickGalleryImage(onPicked: (Uri) -> Unit)
  fun openExternalWeb(url: String)
  fun triggerSyncAll()
}

internal class SettlementViewHelper(private val host: SettlementHost) {
  private var subTab: String = "buyers" // buyers | anomaly | products
  private var dashboard: CloudDashboard? = null
  private var loading: Boolean = false
  private var lastError: String = ""
  private var selectedBuyerId: Long? = null
  private var buyerSearch: String = ""
  private var onlyPayable: Boolean = false
  private val selectedOrderIds = mutableSetOf<Long>()
  private var smartProductInput: String = ""
  private var smartProductTag: String = "latest"

  fun hasSubPageOpen(): Boolean = selectedBuyerId != null

  fun popSubPage(): Boolean {
    if (selectedBuyerId != null) {
      selectedBuyerId = null
      selectedOrderIds.clear()
      host.renderSettlementPage()
      return true
    }
    return false
  }

  fun openAnomalyTab() {
    subTab = "anomaly"
    selectedBuyerId = null
    selectedOrderIds.clear()
    refreshDashboard(silent = false)
  }

  fun refreshDashboard(silent: Boolean = false) {
    if (!host.cloud.isAdminLoggedIn()) {
      dashboard = null
      loading = false
      host.renderSettlementPage()
      return
    }
    loading = true
    lastError = ""
    if (!silent) host.renderSettlementPage()
    host.ioExecutor.execute {
      try {
        val d = host.cloud.fetchDashboard()
        host.runUi {
          dashboard = d
          loading = false
          lastError = ""
          host.renderSettlementPage()
        }
      } catch (e: Exception) {
        host.runUi {
          loading = false
          lastError = e.message ?: "加载云端账本失败"
          host.showToast(lastError)
          host.renderSettlementPage()
        }
      }
    }
  }

  private fun dp(n: Int): Int = (n * host.viewCtx.resources.displayMetrics.density).toInt()
  private fun shape(color: Int, radius: Int = 14) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dp(radius).toFloat()
  }
  private fun ripple(fill: Int, radius: Int = 14, fg: Int = host.palette.ink) = RippleDrawable(
    ColorStateList.valueOf((fg and 0x00ffffff) or 0x22000000),
    shape(fill, radius),
    shape(Color.WHITE, radius)
  )
  private fun container(vertical: Boolean = true) = LinearLayout(host.viewCtx).apply {
    orientation = if (vertical) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
  }
  private fun margins(bottom: Int = 10) = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(bottom) }
  private fun label(t: String, size: Float = 14f, c: Int = host.palette.ink, bold: Boolean = false) = TextView(host.viewCtx).apply {
    text = t
    textSize = size
    setTextColor(c)
    gravity = Gravity.CENTER_VERTICAL
    if (bold) setTypeface(null, Typeface.BOLD)
  }
  private fun pill(t: String, bg: Int, fg: Int) = TextView(host.viewCtx).apply {
    text = t
    textSize = 11f
    setTextColor(fg)
    setTypeface(null, Typeface.BOLD)
    background = shape(bg, 99)
    setPadding(dp(8), dp(3), dp(8), dp(3))
  }
  private fun btn(t: String, main: Boolean = false, action: () -> Unit) = label(
    t, 13f, if (main) host.palette.onPrimary else host.palette.primary, true
  ).apply {
    gravity = Gravity.CENTER
    background = ripple(if (main) host.palette.primary else host.palette.accentSurface, 12, if (main) host.palette.onPrimary else host.palette.primary)
    minHeight = dp(42)
    setPadding(dp(10), dp(8), dp(10), dp(8))
    setOnClickListener { action() }
  }
  private fun dangerBtn(t: String, action: () -> Unit) = label(t, 13f, 0xffdc2626.toInt(), true).apply {
    gravity = Gravity.CENTER
    background = ripple(if (host.palette.isDark) 0xff3b1d22.toInt() else 0xfffef2f2.toInt(), 12, 0xffdc2626.toInt())
    minHeight = dp(42)
    setPadding(dp(10), dp(8), dp(10), dp(8))
    setOnClickListener { action() }
  }
  private fun card(parent: LinearLayout): LinearLayout = container().apply {
    setPadding(dp(15), dp(14), dp(15), dp(14))
    background = shape(host.palette.surface, 16).apply { setStroke(dp(1), host.palette.outline) }
    parent.addView(this, margins(11))
  }
  private fun input(hint: String, value: String = "", multiLine: Boolean = false) = EditText(host.viewCtx).apply {
    if (!multiLine) setSingleLine(true) else { minLines = 3; gravity = Gravity.TOP or Gravity.START }
    setText(value)
    textSize = 14f
    setTextColor(host.palette.ink)
    setHint(hint)
    setHintTextColor(host.palette.muted)
    background = shape(host.palette.canvas, 12)
    setPadding(dp(12), dp(10), dp(12), dp(10))
  }
  private fun pair(box: LinearLayout, a: View, b: View) {
    val line = container(false).apply { gravity = Gravity.CENTER_VERTICAL }
    line.addView(a, LinearLayout.LayoutParams(0, -2, 1f))
    line.addView(b, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(8) })
    box.addView(line, margins(8))
  }
  private fun fmtMoney(v: Double): String = "¥" + String.format(Locale.CHINA, "%.2f", v)
  private fun fmtShortTime(iso: String): String {
    if (iso.length < 16) return iso.ifBlank { "-" }
    return iso.substring(5, 16).replace("T", " ")
  }
  private fun copyText(txt: String, tip: String = "已复制") {
    val cm = host.viewCtx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("quickscan", txt))
    host.showToast(tip)
  }

  fun buildTopHeader(): View {
    val bar = container(false).apply {
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(15), dp(10), dp(15), dp(6))
    }
    val titleBox = container()
    val titleText = if (selectedBuyerId != null) {
      val b = dashboard?.buyers?.firstOrNull { it.userId == selectedBuyerId }
      "‹ ${b?.wechatName ?: "买手明细"}"
    } else "云端结算台"
    val titleView = label(titleText, 20f, host.palette.ink, true)
    if (selectedBuyerId != null) {
      titleView.setOnClickListener { popSubPage() }
    }
    titleBox.addView(titleView)
    val subText = when {
      !host.cloud.isAdminLoggedIn() -> "管理员登录后可与电脑端实时同步结账"
      loading -> "正在同步云端账本..."
      else -> "管理员：${host.cloud.adminName.ifBlank { "已登录" }} · 实时互通"
    }
    titleBox.addView(label(subText, 11f, host.palette.muted))
    bar.addView(titleBox, LinearLayout.LayoutParams(0, -2, 1f))

    val webBtn = label("🌐 网页", 12f, host.palette.primary, true).apply {
      background = ripple(host.palette.accentSurface, 10)
      setPadding(dp(10), dp(7), dp(10), dp(7))
      setOnClickListener { host.openExternalWeb(host.cloud.webUrl) }
    }
    bar.addView(webBtn, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6) })

    if (host.cloud.isAdminLoggedIn()) {
      val refBtn = label(if (loading) "同步中" else "🔄 刷新", 12f, host.palette.onPrimary, true).apply {
        background = ripple(host.palette.primary, 10)
        setPadding(dp(10), dp(7), dp(10), dp(7))
        setOnClickListener {
          host.triggerSyncAll()
          refreshDashboard(silent = false)
        }
      }
      bar.addView(refBtn)
    }
    return bar
  }

  fun renderContent(page: LinearLayout) {
    if (!host.cloud.isAdminLoggedIn()) {
      renderAdminLogin(page)
      return
    }
    if (dashboard == null && !loading && lastError.isEmpty()) {
      refreshDashboard(silent = false)
      return
    }
    if (dashboard == null) {
      val c = card(page)
      c.addView(label(if (loading) "正在拉取云端最新账本..." else "加载失败：$lastError", 14f, if (loading) host.palette.muted else 0xffdc2626.toInt()), margins(10))
      if (!loading) {
        pair(c, btn("重试刷新", true) { refreshDashboard() }, dangerBtn("重新登录") {
          host.cloud.clearAdminSession()
          host.renderSettlementPage()
        })
      }
      return
    }
    val d = dashboard!!

    // If drilling into a specific buyer's orders
    if (selectedBuyerId != null) {
      val buyer = d.buyers.firstOrNull { it.userId == selectedBuyerId }
      if (buyer == null) {
        selectedBuyerId = null
      } else {
        renderBuyerDetail(page, d, buyer)
        return
      }
    }

    // Top KPI summary strip
    val totalPayable = d.buyers.sumOf { it.payableAmount }
    val anomalyCount = d.orders.count { it.isAnomaly }
    val unclaimedCount = d.unclaimed.size
    val pendingApprovals = d.buyers.count { !it.approved }

    val kpi = card(page)
    val kpiRow = container(false).apply { gravity = Gravity.CENTER_VERTICAL }
    fun kpiCell(title: String, value: String, color: Int) = container().apply {
      gravity = Gravity.CENTER
      addView(label(title, 11f, host.palette.muted).apply { gravity = Gravity.CENTER })
      addView(label(value, 16f, color, true).apply { gravity = Gravity.CENTER })
    }
    kpiRow.addView(kpiCell("待结总额", fmtMoney(totalPayable), host.palette.primary), LinearLayout.LayoutParams(0, -2, 1.3f))
    kpiRow.addView(kpiCell("冲突单", anomalyCount.toString(), if (anomalyCount > 0) 0xffdc2626.toInt() else host.palette.muted), LinearLayout.LayoutParams(0, -2, 0.8f))
    kpiRow.addView(kpiCell("无主件", unclaimedCount.toString(), if (unclaimedCount > 0) 0xffd97706.toInt() else host.palette.muted), LinearLayout.LayoutParams(0, -2, 0.8f))
    kpi.addView(kpiRow)

    // Sub-tab switcher
    val tabBar = container(false).apply {
      background = shape(host.palette.surface, 14).apply { setStroke(dp(1), host.palette.outline) }
      setPadding(dp(4), dp(4), dp(4), dp(4))
    }
    val items = listOf(
      Triple("buyers", "💰 按人头结账", 0),
      Triple("anomaly", "🚨 异常/无主", anomalyCount + unclaimedCount),
      Triple("products", "⚙️ 商品/改价", pendingApprovals)
    )
    items.forEach { (key, title, badge) ->
      val active = subTab == key
      val textStr = if (badge > 0) "$title ($badge)" else title
      val tv = label(textStr, 12f, if (active) host.palette.onPrimary else host.palette.muted, active).apply {
        gravity = Gravity.CENTER
        background = shape(if (active) host.palette.primary else Color.TRANSPARENT, 10)
        setPadding(dp(4), dp(9), dp(4), dp(9))
        setOnClickListener {
          subTab = key
          host.renderSettlementPage()
        }
      }
      tabBar.addView(tv, LinearLayout.LayoutParams(0, -2, 1f))
    }
    page.addView(tabBar, margins(11))

    when (subTab) {
      "buyers" -> renderBuyersList(page, d)
      "anomaly" -> renderAnomalyAndUnclaimed(page, d)
      "products" -> renderProductsAndConfig(page, d)
    }
  }

  private fun renderAdminLogin(page: LinearLayout) {
    val c = card(page)
    c.addView(label("管理员登录 · 手机结算台", 18f, host.palette.ink, true), margins(5))
    c.addView(label("登录后可直接在手机上按人头结账、弹窗扫买手收款码、用扫码照片破损扣款、一键拆品改价，数据与电脑端实时同步。", 12f, host.palette.muted), margins(12))

    val nameInp = input("管理员微信名", host.cloud.adminName.ifBlank { CloudSyncClient.DEFAULT_ADMIN_NAME })
    val pwdInp = input("管理员密码").apply {
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
    }
    c.addView(nameInp, margins(9))
    c.addView(pwdInp, margins(12))

    c.addView(btn("登录云端结算台", true) {
      val name = nameInp.text.toString().trim()
      val pwd = pwdInp.text.toString().trim()
      if (name.isEmpty() || pwd.isEmpty()) {
        host.showToast("请输入管理员微信名和密码")
        return@btn
      }
      host.showToast("正在验证登录...")
      host.ioExecutor.execute {
        try {
          val loggedName = host.cloud.adminLogin(name, pwd)
          host.runUi {
            host.showToast("欢迎回来，$loggedName")
            refreshDashboard(silent = false)
          }
        } catch (e: Exception) {
          host.runUi { host.showToast(e.message ?: "登录失败") }
        }
      }
    }, margins(10))

    c.addView(btn("🌐 用手机浏览器打开网页总表") {
      host.openExternalWeb(host.cloud.webUrl)
    })
  }

  private fun renderBuyersList(page: LinearLayout, d: CloudDashboard) {
    val filterCard = card(page)
    val searchInp = input("搜索买手微信名...", buyerSearch)
    filterCard.addView(searchInp, margins(8))
    val chkRow = container(false).apply { gravity = Gravity.CENTER_VERTICAL }
    val onlyChk = CheckBox(host.viewCtx).apply {
      text = "仅看有待结金额的买手"
      textSize = 13f
      setTextColor(host.palette.ink)
      buttonTintList = ColorStateList.valueOf(host.palette.primary)
      isChecked = onlyPayable
    }
    chkRow.addView(onlyChk, LinearLayout.LayoutParams(0, -2, 1f))
    val logoutLink = label("切换账号", 12f, 0xffdc2626.toInt(), true).apply {
      setPadding(dp(8), dp(6), dp(4), dp(6))
      setOnClickListener {
        host.cloud.clearAdminSession()
        dashboard = null
        host.renderSettlementPage()
      }
    }
    chkRow.addView(logoutLink)
    filterCard.addView(chkRow)

    val listHolder = container()
    page.addView(listHolder)

    fun rebuildList() {
      listHolder.removeAllViews()
      val kw = buyerSearch.trim().lowercase(Locale.CHINA)
      val filtered = d.buyers.filter { b ->
        (!onlyPayable || b.payableAmount > 0.001) &&
          (kw.isEmpty() || b.wechatName.lowercase(Locale.CHINA).contains(kw))
      }
      if (filtered.isEmpty()) {
        val empty = card(listHolder)
        empty.addView(label("暂无符合条件的买手账单", 13f, host.palette.muted))
        return
      }
      filtered.forEach { b ->
        val item = card(listHolder)
        val top = container(false).apply { gravity = Gravity.CENTER_VERTICAL }
        val nameRow = container(false).apply { gravity = Gravity.CENTER_VERTICAL }
        nameRow.addView(label(b.wechatName, 16f, host.palette.ink, true))
        if (b.hasPaymentQr) {
          nameRow.addView(label(" 💳", 13f, host.palette.muted))
        }
        if (!b.approved) {
          nameRow.addView(pill("待审核", 0xfffffbeb.toInt(), 0xffd97706.toInt()), LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(6) })
        }
        top.addView(nameRow, LinearLayout.LayoutParams(0, -2, 1f))
        val payColor = if (b.payableAmount > 0.0) host.palette.primary else host.palette.muted
        top.addView(label("应结 ${fmtMoney(b.payableAmount)}", 15f, payColor, true))
        item.addView(top, margins(6))

        val stats = label(
          "已到待结 ${b.arrivedUnsettledCount} 单 · 在途 ${b.inTransitCount} · 异常 ${b.anomalyCount} · 历史已结 ${fmtMoney(b.settledAmount)}",
          12f, host.palette.muted
        )
        item.addView(stats, margins(if (!b.approved) 8 else 0))

        if (!b.approved) {
          item.addView(btn("通过该买手审核", true) {
            host.ioExecutor.execute {
              try {
                host.cloud.approveUser(b.userId, true)
                host.runUi { host.showToast("已审核通过 ${b.wechatName}"); refreshDashboard() }
              } catch (e: Exception) {
                host.runUi { host.showToast(e.message ?: "审核失败") }
              }
            }
          })
        }

        item.setOnClickListener {
          selectedBuyerId = b.userId
          selectedOrderIds.clear()
          // Auto-select arrived unsettled non-anomaly orders for fast checkout
          d.orders.filter {
            it.userId == b.userId && it.settleStatus == "unsettled" && !it.isAnomaly && it.hasArrived
          }.forEach { selectedOrderIds.add(it.id) }
          host.renderSettlementPage()
        }
      }
    }

    rebuildList()
    searchInp.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
        buyerSearch = s?.toString().orEmpty()
        rebuildList()
      }
      override fun afterTextChanged(s: Editable?) {}
    })
    onlyChk.setOnCheckedChangeListener { _, checked ->
      onlyPayable = checked
      rebuildList()
    }
  }

  private fun renderBuyerDetail(page: LinearLayout, d: CloudDashboard, buyer: CloudBuyerSummary) {
    val orders = d.orders.filter { it.userId == buyer.userId }
    val selectedValid = orders.filter {
      selectedOrderIds.contains(it.id) && it.settleStatus == "unsettled" && !it.isAnomaly
    }
    val selectedSum = selectedValid.sumOf { it.finalAmount }

    val summary = card(page)
    val top = container(false).apply { gravity = Gravity.CENTER_VERTICAL }
    top.addView(label(buyer.wechatName, 18f, host.palette.ink, true), LinearLayout.LayoutParams(0, -2, 1f))
    top.addView(label("待结 ${fmtMoney(buyer.payableAmount)}", 16f, host.palette.primary, true))
    summary.addView(top, margins(5))
    summary.addView(label("总报单 ${buyer.totalOrders} 单 · 已到待结 ${buyer.arrivedUnsettledCount} 单 · 已结总额 ${fmtMoney(buyer.settledAmount)}", 12f, host.palette.muted), margins(10))

    if (buyer.alipayAccount.isNotBlank()) {
      val aliBtn = label("支付宝：${buyer.alipayAccount}（点此复制）", 12f, host.palette.primary, true).apply {
        setPadding(dp(10), dp(7), dp(10), dp(7))
        background = ripple(host.palette.accentSurface, 10)
        setOnClickListener { copyText(buyer.alipayAccount, "已复制支付宝账号") }
      }
      summary.addView(aliBtn, margins(10))
    }

    pair(
      summary,
      btn("全选已到货") {
        orders.filter { it.settleStatus == "unsettled" && !it.isAnomaly && it.hasArrived }
          .forEach { selectedOrderIds.add(it.id) }
        host.renderSettlementPage()
      },
      btn("💰 结算打款 (${selectedValid.size}单 · ${fmtMoney(selectedSum)})", true) {
        if (selectedValid.isEmpty()) {
          host.showToast("请先勾选至少 1 条未结算正常单")
          return@btn
        }
        showPayoutDialog(buyer, selectedValid)
      }
    )

    if (orders.isEmpty()) {
      val empty = card(page)
      empty.addView(label("该买手暂无报单", 13f, host.palette.muted))
      return
    }

    orders.forEach { o ->
      val oc = card(page)
      val selectable = o.settleStatus == "unsettled" && !o.isAnomaly
      val head = container(false).apply { gravity = Gravity.CENTER_VERTICAL }
      val cb = CheckBox(host.viewCtx).apply {
        isEnabled = selectable
        isChecked = selectedOrderIds.contains(o.id)
        buttonTintList = ColorStateList.valueOf(host.palette.primary)
        setOnCheckedChangeListener { _, checked ->
          if (checked) selectedOrderIds.add(o.id) else selectedOrderIds.remove(o.id)
          host.renderSettlementPage()
        }
      }
      head.addView(cb)
      val titleCol = container()
      titleCol.addView(label(o.productName + if (o.orderQty > 1) " [合包×${o.orderQty}]" else "", 15f, host.palette.ink, true))
      titleCol.addView(label("#${o.id} · ${fmtShortTime(o.createdAt)}", 11f, host.palette.muted))
      head.addView(titleCol, LinearLayout.LayoutParams(0, -2, 1f))
      head.addView(label(fmtMoney(o.finalAmount), 16f, host.palette.ink, true))
      oc.addView(head, margins(6))

      // Status pill row
      val badgeRow = container(false).apply { gravity = Gravity.CENTER_VERTICAL }
      val stPill = when {
        o.isAnomaly -> pill("⚠️ 单号冲突", 0xfffef2f2.toInt(), 0xffdc2626.toInt())
        o.settleStatus == "settled" -> pill("✅ 已结算", 0xffecfdf5.toInt(), 0xff059669.toInt())
        o.isComplete -> pill("🟢 齐件待结 ${o.scanned}/${o.expected}", 0xffecfdf5.toInt(), 0xff059669.toInt())
        o.hasArrived -> pill("🟡 已到 ${o.scanned}/${o.expected} 可结", 0xfffffbeb.toInt(), 0xffd97706.toInt())
        else -> pill("在途未到", 0xfff3f4f6.toInt(), 0xff4b5563.toInt())
      }
      badgeRow.addView(stPill)
      if (o.isOverdueMissing) {
        badgeRow.addView(pill("⏰ 欠件超期", 0xfffffbeb.toInt(), 0xffd97706.toInt()), LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(6) })
      }
      oc.addView(badgeRow, margins(7))

      // Parcel codes
      val parcelBox = container().apply {
        background = shape(host.palette.canvas, 10)
        setPadding(dp(10), dp(8), dp(10), dp(8))
      }
      o.parcels.forEach { p ->
        val pLine = container(false).apply { gravity = Gravity.CENTER_VERTICAL }
        val codeTv = label(p.displayCode, 13f, host.palette.ink, true).apply {
          setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
          setOnClickListener { copyText(p.displayCode, "已复制单号") }
        }
        pLine.addView(codeTv, LinearLayout.LayoutParams(0, -2, 1f))
        val progColor = if (p.scannedCount >= p.expectedPieces) 0xff059669.toInt() else if (p.scannedCount > 0) 0xffd97706.toInt() else host.palette.muted
        pLine.addView(label("${p.courier} ${p.scannedCount}/${p.expectedPieces}", 12f, progColor, true))
        parcelBox.addView(pLine, margins(3))
      }
      oc.addView(parcelBox, margins(7))

      if (o.deductionAmount > 0.0) {
        val dRow = container(false).apply { gravity = Gravity.CENTER_VERTICAL }
        dRow.addView(
          label("扣款 -${fmtMoney(o.deductionAmount)} ${if (o.deductionReason.isNotBlank()) "· ${o.deductionReason}" else ""}", 12f, 0xffd97706.toInt(), true),
          LinearLayout.LayoutParams(0, -2, 1f)
        )
        if (o.hasDeductionImage) {
          dRow.addView(label("查看凭证图", 12f, host.palette.primary, true).apply {
            setOnClickListener { showOrderEvidenceImage(o.id) }
          })
        }
        oc.addView(dRow, margins(6))
      }

      if (o.remark.isNotBlank()) {
        oc.addView(label("备注：${o.remark}", 12f, host.palette.muted), margins(6))
      }

      if (o.settleStatus == "unsettled") {
        oc.addView(btn("✂️ 调价 / 破损扣款（可附扫码照）") { showAdjustOrderDialog(o) })
      }
    }
  }

  private fun showOrderEvidenceImage(orderId: Long) {
    host.showToast("正在加载现场凭证照...")
    host.ioExecutor.execute {
      try {
        val (img, reason) = host.cloud.fetchOrderImage(orderId)
        val bmp = host.cloud.decodeDataUrlToBitmap(img)
        host.runUi {
          if (bmp == null) {
            host.showToast("该订单暂无凭证照片")
            return@runUi
          }
          val box = container().apply { setPadding(dp(16), dp(12), dp(16), dp(8)) }
          if (reason.isNotBlank()) box.addView(label("原因：$reason", 13f, host.palette.muted), margins(8))
          box.addView(ImageView(host.viewCtx).apply {
            setImageBitmap(bmp)
            adjustViewBounds = true
            scaleType = ImageView.ScaleType.FIT_CENTER
          }, LinearLayout.LayoutParams(-1, dp(320)))
          AlertDialog.Builder(host.viewCtx)
            .setTitle("扣款现场凭证")
            .setView(box)
            .setPositiveButton("关闭", null)
            .show()
        }
      } catch (e: Exception) {
        host.runUi { host.showToast(e.message ?: "加载失败") }
      }
    }
  }

  private fun showAdjustOrderDialog(o: CloudOrder) {
    var selectedImageDataUrl: String? = null
    val box = container().apply { setPadding(dp(16), dp(10), dp(16), dp(6)) }
    box.addView(label("${o.wechatName} · ${o.productName}", 14f, host.palette.ink, true), margins(4))
    box.addView(label("原应结金额：${fmtMoney(o.baseAmount)}", 12f, host.palette.muted), margins(10))

    val dedInp = input("扣款金额（元）", if (o.deductionAmount > 0) String.format(Locale.CHINA, "%.2f", o.deductionAmount) else "0").apply {
      inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
    }
    val finalPreview = label("扣款后实结：${fmtMoney(o.finalAmount)}", 14f, host.palette.primary, true)
    dedInp.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
        val d = s?.toString()?.toDoubleOrNull() ?: 0.0
        val fin = (o.baseAmount - d).coerceAtLeast(0.0)
        finalPreview.text = "扣款后实结：${fmtMoney(fin)}"
      }
      override fun afterTextChanged(s: Editable?) {}
    })
    box.addView(dedInp, margins(6))
    box.addView(finalPreview, margins(10))

    val reasonInp = input("扣款原因（买手手机端可见）", o.deductionReason)
    box.addView(reasonInp, margins(6))

    // Quick reason pills
    val qRow = container(false)
    listOf("压箱破损", "日期临期", "少发一件").forEach { r ->
      val chip = pill("+ $r", host.palette.accentSurface, host.palette.primary).apply {
        setOnClickListener {
          val cur = reasonInp.text.toString().trim()
          reasonInp.setText(if (cur.isEmpty()) r else "$cur，$r")
        }
      }
      qRow.addView(chip, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6) })
    }
    box.addView(qRow, margins(10))

    val imgStatus = label("凭证照片：未选择（选填）", 12f, host.palette.muted)
    box.addView(imgStatus, margins(6))

    // Killer native feature: reuse local scan photo taken for this parcel!
    val localPhotoPath = host.scanDb.latestPhotoForBaseCodes(o.parcels.map { it.baseCode })
    if (!localPhotoPath.isNullOrBlank() && File(localPhotoPath).isFile) {
      box.addView(btn("📷 直接附刚才扫码拍的面单照") {
        host.ioExecutor.execute {
          try {
            val dataUrl = host.cloud.compressFileToDataUrl(File(localPhotoPath))
            host.runUi {
              selectedImageDataUrl = dataUrl
              imgStatus.text = "✅ 已附加本机扫码面单照（自动压缩）"
              imgStatus.setTextColor(0xff059669.toInt())
            }
          } catch (e: Exception) {
            host.runUi { host.showToast(e.message ?: "压缩本地照片失败") }
          }
        }
      }, margins(8))
    }

    box.addView(btn("🖼️ 从手机相册选择破损照") {
      host.pickGalleryImage { uri ->
        host.ioExecutor.execute {
          try {
            val dataUrl = host.cloud.compressUriToDataUrl(uri)
            host.runUi {
              selectedImageDataUrl = dataUrl
              imgStatus.text = "✅ 已选相册凭证照（自动压缩）"
              imgStatus.setTextColor(0xff059669.toInt())
            }
          } catch (e: Exception) {
            host.runUi { host.showToast(e.message ?: "读取相册图片失败") }
          }
        }
      }
    }, margins(6))

    AlertDialog.Builder(host.viewCtx)
      .setTitle("调价 / 破损扣款 (#${o.id})")
      .setView(ScrollView(host.viewCtx).apply { addView(box) })
      .setNegativeButton("取消", null)
      .setPositiveButton("保存扣款") { _, _ ->
        val ded = dedInp.text.toString().toDoubleOrNull() ?: 0.0
        val reason = reasonInp.text.toString().trim()
        host.ioExecutor.execute {
          try {
            host.cloud.adjustOrder(o.id, ded, reason, selectedImageDataUrl)
            host.runUi {
              host.showToast("✅ 调价/扣款已同步到买手端")
              refreshDashboard()
            }
          } catch (e: Exception) {
            host.runUi { host.showToast(e.message ?: "保存失败") }
          }
        }
      }
      .show()
  }

  private fun showPayoutDialog(buyer: CloudBuyerSummary, orders: List<CloudOrder>) {
    val total = orders.sumOf { it.finalAmount }
    var proofDataUrl: String? = null

    val box = container().apply { setPadding(dp(16), dp(10), dp(16), dp(6)) }
    val amountBanner = container().apply {
      background = shape(0xff111827.toInt(), 14)
      setPadding(dp(14), dp(14), dp(14), dp(14))
      gravity = Gravity.CENTER
      addView(label("本次精确应打款总额（${orders.size} 单）", 12f, 0xffd1d5db.toInt()).apply { gravity = Gravity.CENTER })
      addView(label(fmtMoney(total), 28f, 0xfffcd34d.toInt(), true).apply { gravity = Gravity.CENTER })
    }
    box.addView(amountBanner, margins(12))

    val qrContainer = container().apply {
      gravity = Gravity.CENTER
      background = shape(host.palette.canvas, 14)
      setPadding(dp(12), dp(12), dp(12), dp(12))
      addView(label("正在加载 ${buyer.wechatName} 的收款码...", 12f, host.palette.muted).apply { gravity = Gravity.CENTER })
    }
    box.addView(qrContainer, margins(12))

    val noteInp = input("打款备注（如：微信已转 / 支付宝已转）")
    box.addView(noteInp, margins(8))

    val proofStatus = label("转账截图凭证：未上传（选填）", 12f, host.palette.muted)
    box.addView(proofStatus, margins(6))
    box.addView(btn("📷 选一张转账截图附在小票里") {
      host.pickGalleryImage { uri ->
        host.ioExecutor.execute {
          try {
            val dUrl = host.cloud.compressUriToDataUrl(uri)
            host.runUi {
              proofDataUrl = dUrl
              proofStatus.text = "✅ 已附加转账截图（将同步给买手小票）"
              proofStatus.setTextColor(0xff059669.toInt())
            }
          } catch (e: Exception) {
            host.runUi { host.showToast(e.message ?: "读取截图失败") }
          }
        }
      }
    }, margins(6))

    val dialog = AlertDialog.Builder(host.viewCtx)
      .setTitle("💰 扫码结账 · ${buyer.wechatName}")
      .setView(ScrollView(host.viewCtx).apply { addView(box) })
      .setNegativeButton("取消", null)
      .setPositiveButton("确认已打款并结清") { _, _ ->
        val note = noteInp.text.toString().trim()
        val ids = orders.map { it.id }
        host.showToast("正在生成电子小票...")
        host.ioExecutor.execute {
          try {
            val batchNo = host.cloud.settleOrders(buyer.userId, ids, note, proofDataUrl)
            host.runUi {
              selectedOrderIds.clear()
              host.showToast("🎉 结清成功！小票号 $batchNo")
              host.triggerSyncAll()
              refreshDashboard()
            }
          } catch (e: Exception) {
            host.runUi { host.showToast(e.message ?: "结算失败") }
          }
        }
      }
      .create()
    dialog.show()

    // Async load buyer payment QR
    host.ioExecutor.execute {
      try {
        val pay = host.cloud.fetchBuyerPayment(buyer.userId)
        val bmp = host.cloud.decodeDataUrlToBitmap(pay.paymentQr)
        host.runUi {
          if (!dialog.isShowing) return@runUi
          qrContainer.removeAllViews()
          if (bmp != null) {
            qrContainer.addView(ImageView(host.viewCtx).apply {
              setImageBitmap(bmp)
              scaleType = ImageView.ScaleType.FIT_CENTER
            }, LinearLayout.LayoutParams(dp(220), dp(220)))
          } else {
            qrContainer.addView(label("该买手尚未上传收款码图片", 12f, host.palette.muted).apply { gravity = Gravity.CENTER }, margins(6))
          }
          if (pay.alipayAccount.isNotBlank()) {
            qrContainer.addView(btn("复制支付宝：${pay.alipayAccount}") {
              copyText(pay.alipayAccount, "已复制支付宝账号")
            }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
          }
        }
      } catch (e: Exception) {
        host.runUi {
          if (!dialog.isShowing) return@runUi
          qrContainer.removeAllViews()
          qrContainer.addView(label("加载收款码失败：${e.message}", 12f, 0xffdc2626.toInt()))
        }
      }
    }
  }

  private fun renderAnomalyAndUnclaimed(page: LinearLayout, d: CloudDashboard) {
    val anomalies = d.orders.filter { it.isAnomaly }
    val overdue = d.orders.filter { it.isOverdueMissing }

    // 1. Duplicate tracking conflicts
    val anomHeader = card(page)
    anomHeader.addView(label("🚨 重复单号冲突拦截 (${anomalies.size})", 16f, if (anomalies.isNotEmpty()) 0xffdc2626.toInt() else host.palette.ink, true), margins(4))
    anomHeader.addView(label("不同买手或同一人重复填报同一单号会自动标红锁死，请核对后选择保留真单或作废重单。", 12f, host.palette.muted))

    anomalies.forEach { o ->
      val ac = card(page)
      ac.addView(label("${o.wechatName} · ${o.productName} (${fmtMoney(o.finalAmount)})", 15f, host.palette.ink, true), margins(4))
      ac.addView(label("⚠️ ${o.anomalyReason} · 提交于 ${fmtShortTime(o.createdAt)}", 12f, 0xffdc2626.toInt()), margins(6))
      ac.addView(label(o.parcels.joinToString(" | ") { it.displayCode }, 12f, host.palette.muted).apply {
        setTypeface(Typeface.MONOSPACE)
      }, margins(10))
      pair(
        ac,
        btn("保留此单(作废冲突单)", true) { confirmResolveAnomaly(o, "keep_this") },
        dangerBtn("作废此单") { confirmResolveAnomaly(o, "void_this") }
      )
    }

    // 2. Overdue missing pieces
    if (overdue.isNotEmpty()) {
      val ovCard = card(page)
      ovCard.addView(label("⏰ 已结欠件超期提醒 (${overdue.size})", 16f, 0xffd97706.toInt(), true), margins(8))
      overdue.forEach { o ->
        ovCard.addView(
          label("${o.wechatName} · ${o.productName}（仅扫 ${o.scanned}/${o.expected} 件 · 结于 ${fmtShortTime(o.settledAt)}）", 12f, host.palette.ink),
          margins(6)
        )
      }
    }

    // 3. Unclaimed scanned parcels
    val uncCard = card(page)
    uncCard.addView(label("📦 无主包裹池 (${d.unclaimed.size})", 16f, host.palette.ink, true), margins(4))
    uncCard.addView(label("仓库先扫到、买手尚未填表的快递；买手补填同单号后会自动移出并反向匹配。", 12f, host.palette.muted), margins(10))
    if (d.unclaimed.isEmpty()) {
      uncCard.addView(label("当前没有无主包裹", 13f, host.palette.muted))
    } else {
      d.unclaimed.take(50).forEach { u ->
        val row = container(false).apply {
          gravity = Gravity.CENTER_VERTICAL
          setPadding(0, dp(8), 0, dp(8))
        }
        val info = container()
        info.addView(label(u.fullScanCode, 14f, host.palette.ink, true).apply {
          setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
          setOnClickListener { copyText(u.fullScanCode, "已复制单号") }
        })
        info.addView(label("${u.courier} · ${u.pieceIndex}/${u.pieceTotal} · ${fmtShortTime(u.scannedAt)}", 11f, host.palette.muted))
        row.addView(info, LinearLayout.LayoutParams(0, -2, 1f))
        row.addView(label("删除", 12f, 0xffdc2626.toInt(), true).apply {
          setPadding(dp(10), dp(8), dp(4), dp(8))
          setOnClickListener {
            host.ioExecutor.execute {
              try {
                host.cloud.deleteUnclaimedScan(u.id)
                host.runUi { host.showToast("已删除误扫记录"); refreshDashboard() }
              } catch (e: Exception) {
                host.runUi { host.showToast(e.message ?: "删除失败") }
              }
            }
          }
        })
        uncCard.addView(row)
        uncCard.addView(View(host.viewCtx).apply { setBackgroundColor(host.palette.outline) }, LinearLayout.LayoutParams(-1, dp(1)))
      }
    }
  }

  private fun confirmResolveAnomaly(o: CloudOrder, action: String) {
    val msg = if (action == "keep_this") "确定保留「${o.wechatName}」的订单 #${o.id}，并作废其他撞单记录吗？"
    else "确定作废「${o.wechatName}」的订单 #${o.id} 吗？"
    AlertDialog.Builder(host.viewCtx)
      .setTitle("处理单号冲突")
      .setMessage(msg)
      .setNegativeButton("取消", null)
      .setPositiveButton("确认执行") { _, _ ->
        host.ioExecutor.execute {
          try {
            host.cloud.resolveAnomaly(o.id, action)
            host.runUi {
              host.showToast("✅ 冲突已处理完毕")
              host.triggerSyncAll()
              refreshDashboard()
            }
          } catch (e: Exception) {
            host.runUi { host.showToast(e.message ?: "处理失败") }
          }
        }
      }
      .show()
  }

  private fun renderProductsAndConfig(page: LinearLayout, d: CloudDashboard) {
    // 1. Smart one-line product parser
    val smartCard = card(page)
    smartCard.addView(label("🚀 一句话智能拆品上架", 16f, host.palette.ink, true), margins(4))
    smartCard.addView(label("支持多行粘贴，如：纯牛奶反150、抖音刷券250×24伊利脱脂反45一箱", 12f, host.palette.muted), margins(8))
    val rawInp = input("每行一个商品，例如：\n纯牛奶反150", smartProductInput, multiLine = true)
    smartCard.addView(rawInp, margins(8))

    val previewTv = label("", 12f, host.palette.primary)
    fun updatePreview(txt: String) {
      smartProductInput = txt
      val list = host.cloud.parseProductLinesLocal(txt)
      previewTv.text = if (list.isEmpty()) "等待输入有效商品..." else list.joinToString("\n") {
        "• ${it.name} → ${fmtMoney(it.price)}${if (it.unitNote.isNotBlank()) " (${it.unitNote})" else ""}"
      }
    }
    updatePreview(smartProductInput)
    rawInp.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { updatePreview(s?.toString().orEmpty()) }
      override fun afterTextChanged(s: Editable?) {}
    })
    smartCard.addView(previewTv, margins(10))

    pair(
      smartCard,
      btn(if (smartProductTag == "latest") "分组：🔥 最新热收" else "分组：📌 长期收") {
        smartProductTag = if (smartProductTag == "latest") "long_term" else "latest"
        host.renderSettlementPage()
      },
      btn("一键上架同步", true) {
        val txt = rawInp.text.toString().trim()
        if (host.cloud.parseProductLinesLocal(txt).isEmpty()) {
          host.showToast("请输入类似“纯牛奶反150”的格式")
          return@btn
        }
        host.ioExecutor.execute {
          try {
            val cnt = host.cloud.batchAddProducts(txt, smartProductTag)
            host.runUi {
              smartProductInput = ""
              host.showToast("✅ 已上架 $cnt 个商品，买手搜索栏秒同步")
              refreshDashboard()
            }
          } catch (e: Exception) {
            host.runUi { host.showToast(e.message ?: "上架失败") }
          }
        }
      }
    )

    // 2. Quick invite code & announcement settings
    val cfgCard = card(page)
    cfgCard.addView(label("🔐 进门邀请码与公告快改", 16f, host.palette.ink, true), margins(8))
    val titleInp = input("收集表标题", d.settings.formTitle)
    val inviteInp = input("群进门邀请码", d.settings.inviteCode)
    val annInp = input("顶部公告提示", d.settings.announcement, multiLine = true)
    val approveChk = CheckBox(host.viewCtx).apply {
      text = "新买手注册需管理员审核通过"
      textSize = 13f
      setTextColor(host.palette.ink)
      buttonTintList = ColorStateList.valueOf(host.palette.primary)
      isChecked = d.settings.requireApproval
    }
    cfgCard.addView(titleInp, margins(8))
    cfgCard.addView(inviteInp, margins(8))
    cfgCard.addView(annInp, margins(8))
    cfgCard.addView(approveChk, margins(8))
    cfgCard.addView(btn("保存表单与门禁设置", true) {
      host.ioExecutor.execute {
        try {
          host.cloud.updateSettings(
            titleInp.text.toString().trim(),
            annInp.text.toString().trim(),
            inviteInp.text.toString().trim(),
            approveChk.isChecked
          )
          host.runUi { host.showToast("✅ 配置已全端同步"); refreshDashboard() }
        } catch (e: Exception) {
          host.runUi { host.showToast(e.message ?: "保存失败") }
        }
      }
    })

    // 3. Products list with Price Isolation editor
    val prodCard = card(page)
    prodCard.addView(label("📋 商品报价列表 (${d.products.size})", 16f, host.palette.ink, true), margins(4))
    prodCard.addView(label("点任意商品可改价（支持历史价格隔离）或切换隐藏", 12f, host.palette.muted), margins(8))
    d.products.forEach { p ->
      val row = container(false).apply {
        gravity = Gravity.CENTER_VERTICAL
        setPadding(0, dp(9), 0, dp(9))
        setOnClickListener { showEditProductDialog(p) }
      }
      val info = container()
      val tagLabel = when (p.tag) {
        "latest" -> "🔥 最新"
        "long_term" -> "📌 长期"
        else -> "⏸ 停收"
      }
      info.addView(label(p.name, 14f, host.palette.ink, true).apply {
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
      })
      info.addView(label("$tagLabel${if (p.unitNote.isNotBlank()) " · ${p.unitNote}" else ""}", 11f, host.palette.muted))
      row.addView(info, LinearLayout.LayoutParams(0, -2, 1f))
      row.addView(label(fmtMoney(p.price), 15f, host.palette.primary, true))
      prodCard.addView(row)
      prodCard.addView(View(host.viewCtx).apply { setBackgroundColor(host.palette.outline) }, LinearLayout.LayoutParams(-1, dp(1)))
    }
  }

  private fun showEditProductDialog(p: CloudProduct) {
    val box = container().apply { setPadding(dp(16), dp(10), dp(16), dp(6)) }
    val nameInp = input("商品名称", p.name)
    val priceInp = input("返现价格", String.format(Locale.CHINA, "%.2f", p.price)).apply {
      inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
    }
    val noteInp = input("规格/日期备注", p.unitNote)
    box.addView(nameInp, margins(8))
    box.addView(priceInp, margins(8))
    box.addView(noteInp, margins(8))

    box.addView(label("搜索栏分组", 12f, host.palette.muted, true), margins(4))
    val tagGroup = RadioGroup(host.viewCtx).apply { orientation = RadioGroup.HORIZONTAL }
    val rbLatest = RadioButton(host.viewCtx).apply { text = "最新热收"; isChecked = p.tag == "latest"; setTextColor(host.palette.ink) }
    val rbLong = RadioButton(host.viewCtx).apply { text = "长期收"; isChecked = p.tag == "long_term"; setTextColor(host.palette.ink) }
    val rbArch = RadioButton(host.viewCtx).apply { text = "停收隐藏"; isChecked = p.tag == "archived"; setTextColor(host.palette.ink) }
    tagGroup.addView(rbLatest); tagGroup.addView(rbLong); tagGroup.addView(rbArch)
    box.addView(tagGroup, margins(10))

    box.addView(label("调价历史隔离策略（价格变化时生效）", 12f, host.palette.primary, true), margins(4))
    val stratGroup = RadioGroup(host.viewCtx)
    val rbFuture = RadioButton(host.viewCtx).apply {
      text = "仅对之后新报单生效（推荐，老单锁原价）"
      textSize = 12f
      isChecked = true
      setTextColor(host.palette.ink)
    }
    val rbUpdate = RadioButton(host.viewCtx).apply {
      text = "同步更新该商品所有「未扫码未结算」订单"
      textSize = 12f
      setTextColor(host.palette.ink)
    }
    stratGroup.addView(rbFuture); stratGroup.addView(rbUpdate)
    box.addView(stratGroup, margins(6))

    AlertDialog.Builder(host.viewCtx)
      .setTitle("编辑 / 改价商品")
      .setView(ScrollView(host.viewCtx).apply { addView(box) })
      .setNegativeButton("取消", null)
      .setNeutralButton("删除商品") { _, _ ->
        host.ioExecutor.execute {
          try {
            host.cloud.deleteProduct(p.id)
            host.runUi { host.showToast("商品已删除"); refreshDashboard() }
          } catch (e: Exception) {
            host.runUi { host.showToast(e.message ?: "删除失败") }
          }
        }
      }
      .setPositiveButton("保存") { _, _ ->
        val nextTag = when {
          rbLong.isChecked -> "long_term"
          rbArch.isChecked -> "archived"
          else -> "latest"
        }
        val strategy = if (rbUpdate.isChecked) "update_unscanned" else "future_only"
        val nextPrice = priceInp.text.toString().toDoubleOrNull() ?: p.price
        host.ioExecutor.execute {
          try {
            val affected = host.cloud.updateProduct(p.id, nameInp.text.toString().trim(), nextPrice, noteInp.text.toString().trim(), nextTag, strategy)
            host.runUi {
              host.showToast(if (affected > 0) "已保存并更新了 $affected 条未到货单" else "商品已保存（老单价格已隔离）")
              refreshDashboard()
            }
          } catch (e: Exception) {
            host.runUi { host.showToast(e.message ?: "保存失败") }
          }
        }
      }
      .show()
  }
}
