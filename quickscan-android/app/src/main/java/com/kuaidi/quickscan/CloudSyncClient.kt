package com.kuaidi.quickscan

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class CloudApiException(val statusCode: Int, message: String) : Exception(message)

data class CloudPushResult(
  val ok: Boolean,
  val status: String,
  val code: String,
  val baseCode: String,
  val orderId: Long,
  val wechatName: String,
  val productName: String,
  val orderQty: Int,
  val scanned: Int,
  val expected: Int,
  val warning: String,
  val ttsText: String,
  val summary: String
)

data class CloudStatusItem(
  val code: String,
  val baseCode: String,
  val status: String,
  val summary: String,
  val orderId: Long
)

data class CloudBuyerSummary(
  val userId: Long,
  val wechatName: String,
  val alipayAccount: String,
  val hasPaymentQr: Boolean,
  val approved: Boolean,
  val totalOrders: Int,
  val arrivedUnsettledCount: Int,
  val inTransitCount: Int,
  val anomalyCount: Int,
  val settledCount: Int,
  val payableAmount: Double,
  val settledAmount: Double,
  val overdueMissingCount: Int
)

data class CloudParcel(
  val displayCode: String,
  val baseCode: String,
  val courier: String,
  val expectedPieces: Int,
  val scannedCount: Int
)

data class CloudOrder(
  val id: Long,
  val userId: Long,
  val wechatName: String,
  val productName: String,
  val unitPrice: Double,
  val orderQty: Int,
  val baseAmount: Double,
  val deductionAmount: Double,
  val deductionReason: String,
  val hasDeductionImage: Boolean,
  val finalAmount: Double,
  val remark: String,
  val isLocked: Boolean,
  val isAnomaly: Boolean,
  val anomalyReason: String,
  val settleStatus: String,
  val settlementBatchId: Long,
  val isOverdueMissing: Boolean,
  val createdAt: String,
  val settledAt: String,
  val parcels: List<CloudParcel>,
  val scanned: Int,
  val expected: Int,
  val hasArrived: Boolean,
  val isComplete: Boolean
)

data class CloudProduct(
  val id: Long,
  val name: String,
  val price: Double,
  val unitNote: String,
  val tag: String,
  val sortOrder: Int
)

data class CloudUnclaimed(
  val id: Long,
  val fullScanCode: String,
  val baseCode: String,
  val courier: String,
  val pieceIndex: Int,
  val pieceTotal: Int,
  val source: String,
  val scannedAt: String
)

data class CloudSettings(
  val formTitle: String,
  val announcement: String,
  val trackingTip: String,
  val inviteCode: String,
  val scanApiKey: String,
  val requireApproval: Boolean,
  val overdueMissingDays: Int
)

data class CloudDashboard(
  val buyers: List<CloudBuyerSummary>,
  val orders: List<CloudOrder>,
  val products: List<CloudProduct>,
  val unclaimed: List<CloudUnclaimed>,
  val settings: CloudSettings
)

data class CloudPaymentInfo(
  val userId: Long,
  val wechatName: String,
  val alipayAccount: String,
  val paymentQr: String
)

data class ParsedProductPreview(
  val name: String,
  val price: Double,
  val unitNote: String
)

class CloudSyncClient(private val context: Context) {
  companion object {
    const val DEFAULT_API_BASE = "https://marginal-wildfowl-d9dw2q0e469ceb-1526863510.ap-singapore.app.tcloudbase.com/api"
    const val DEFAULT_WEB_URL = "https://marginal-wildfowl-d9dw2q0e469ceb-1526863510.tcloudbaseapp.com"
    const val DEFAULT_SCAN_KEY = "LH-SCAN-2026-KEY"
    const val DEFAULT_ADMIN_NAME = "毒毒剪辑"
    private const val PREF_NAME = "quickscan_cloud_v2"
  }

  private val prefs: SharedPreferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

  var apiBase: String
    get() = (prefs.getString("api_base", DEFAULT_API_BASE) ?: DEFAULT_API_BASE).trim().trimEnd('/')
    set(value) { prefs.edit().putString("api_base", value.trim().trimEnd('/')).apply() }

  var scanApiKey: String
    get() = (prefs.getString("scan_key", DEFAULT_SCAN_KEY) ?: DEFAULT_SCAN_KEY).trim()
    set(value) { prefs.edit().putString("scan_key", value.trim()).apply() }

  var webUrl: String
    get() = (prefs.getString("web_url", DEFAULT_WEB_URL) ?: DEFAULT_WEB_URL).trim()
    set(value) { prefs.edit().putString("web_url", value.trim()).apply() }

  var syncEnabled: Boolean
    get() = prefs.getBoolean("sync_enabled", true)
    set(value) { prefs.edit().putBoolean("sync_enabled", value).apply() }

  var adminToken: String
    get() = (prefs.getString("admin_token", "") ?: "").trim()
    set(value) { prefs.edit().putString("admin_token", value.trim()).apply() }

  var adminName: String
    get() = (prefs.getString("admin_name", "") ?: "").trim()
    set(value) { prefs.edit().putString("admin_name", value.trim()).apply() }

  fun isAdminLoggedIn(): Boolean = adminToken.isNotBlank()

  fun clearAdminSession() {
    prefs.edit().remove("admin_token").apply()
  }

  private fun requestJson(
    method: String,
    path: String,
    body: JSONObject? = null,
    useAdminToken: Boolean = false,
    useScanKey: Boolean = false,
    timeoutMs: Int = 9000
  ): JSONObject {
    val fullUrl = apiBase + path
    val conn = (URL(fullUrl).openConnection() as HttpURLConnection).apply {
      requestMethod = method
      connectTimeout = timeoutMs
      readTimeout = timeoutMs
      setRequestProperty("Accept", "application/json")
      setRequestProperty("Content-Type", "application/json; charset=utf-8")
      if (useScanKey && scanApiKey.isNotBlank()) {
        setRequestProperty("X-Scan-Key", scanApiKey)
      }
      if (useAdminToken && adminToken.isNotBlank()) {
        setRequestProperty("Authorization", "Bearer $adminToken")
      }
      if (body != null) {
        doOutput = true
      }
    }
    try {
      if (body != null) {
        val bytes = body.toString().toByteArray(Charsets.UTF_8)
        conn.outputStream.use { it.write(bytes) }
      }
      val statusCode = conn.responseCode
      val stream = if (statusCode in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
      val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty().trim()
      if (raw.startsWith("<")) {
        throw CloudApiException(statusCode, "云端返回了非 JSON 网页内容，请检查接口地址或 HTTP 网关设置")
      }
      val json = if (raw.isEmpty()) JSONObject() else JSONObject(raw)
      if (statusCode == 401 && useAdminToken) {
        clearAdminSession()
        throw CloudApiException(401, json.optString("error", "管理员登录已过期，请重新登录"))
      }
      if (statusCode !in 200..299 || json.optBoolean("ok", true).not()) {
        throw CloudApiException(statusCode, json.optString("error", "云端请求失败 ($statusCode)"))
      }
      return json
    } finally {
      conn.disconnect()
    }
  }

  fun healthCheck(): String {
    val res = requestJson("GET", "/health", timeoutMs = 8000)
    val dbOk = res.optBoolean("db_connected", false)
    val ver = res.optString("version", "")
    if (!dbOk) throw CloudApiException(500, res.optString("error", "云端数据库未连通"))
    return "连通正常 ($ver)"
  }

  fun pushScan(code: String, source: String = "quickscan_android"): CloudPushResult {
    val body = JSONObject().put("code", code).put("source", source)
    val r = requestJson("POST", "/scans/push", body = body, useScanKey = true, timeoutMs = 6500)
    val status = r.optString("status", "unknown")
    val wechat = r.optString("wechat_name", "")
    val prod = r.optString("product_name", "")
    val qty = r.optInt("order_qty", 1)
    val prog = r.optJSONObject("progress")
    val scanned = prog?.optInt("scanned", 0) ?: 0
    val expected = prog?.optInt("expected", 1) ?: 1
    val warning = r.optString("warning", "")
    val tts = r.optString("tts_text", "")
    val shortProd = if (prod.length > 10) prod.substring(0, 10) else prod
    val summary = when (status) {
      "matched" -> {
        val qtyTag = if (qty > 1) " ×$qty" else ""
        val progTag = if (expected > 1) " $scanned/$expected" else ""
        "$wechat · $shortProd$qtyTag$progTag · 待结算"
      }
      "duplicate_scan" -> {
        if (wechat.isNotBlank()) "$wechat · $shortProd · 已扫过" else "无主包裹 · 已扫过"
      }
      "anomaly" -> "重复单号冲突 · 请人工核实"
      "unmatched" -> "无主包裹 · 待买手补填"
      else -> warning.ifBlank { "云端已处理" }
    }
    return CloudPushResult(
      ok = r.optBoolean("ok", true),
      status = status,
      code = r.optString("code", code),
      baseCode = r.optString("base_code", code),
      orderId = r.optLong("order_id", 0L),
      wechatName = wechat,
      productName = prod,
      orderQty = qty,
      scanned = scanned,
      expected = expected,
      warning = warning,
      ttsText = tts,
      summary = summary
    )
  }

  fun queryStatuses(codes: List<String>): List<CloudStatusItem> {
    if (codes.isEmpty()) return emptyList()
    val arr = JSONArray()
    codes.take(250).forEach { arr.put(it) }
    val body = JSONObject().put("codes", arr)
    val res = requestJson("POST", "/scans/status", body = body, useScanKey = true, useAdminToken = isAdminLoggedIn(), timeoutMs = 10000)
    val items = res.optJSONArray("items") ?: return emptyList()
    return buildList {
      for (i in 0 until items.length()) {
        val o = items.optJSONObject(i) ?: continue
        add(
          CloudStatusItem(
            code = o.optString("code", ""),
            baseCode = o.optString("base_code", ""),
            status = o.optString("status", ""),
            summary = o.optString("summary", ""),
            orderId = o.optLong("order_id", 0L)
          )
        )
      }
    }
  }

  fun adminLogin(wechatName: String, password: String): String {
    val body = JSONObject().put("wechat_name", wechatName.trim()).put("password", password.trim())
    val res = requestJson("POST", "/auth/login", body = body, timeoutMs = 9000)
    val user = res.optJSONObject("user")
    val role = user?.optString("role", "") ?: ""
    if (role != "admin") {
      throw CloudApiException(403, "该账号是买手账号，结算台仅限管理员账号登录")
    }
    val token = res.optString("token", "")
    if (token.isBlank()) throw CloudApiException(500, "登录未返回有效凭证")
    adminToken = token
    adminName = user?.optString("wechat_name", wechatName.trim()) ?: wechatName.trim()
    return adminName
  }

  fun fetchDashboard(): CloudDashboard {
    val res = requestJson("GET", "/admin/dashboard", useAdminToken = true, timeoutMs = 12000)

    val buyersArr = res.optJSONArray("buyers") ?: JSONArray()
    val buyers = buildList {
      for (i in 0 until buyersArr.length()) {
        val b = buyersArr.optJSONObject(i) ?: continue
        add(
          CloudBuyerSummary(
            userId = b.optLong("user_id", 0L),
            wechatName = b.optString("wechat_name", ""),
            alipayAccount = b.optString("alipay_account", ""),
            hasPaymentQr = b.optBoolean("has_payment_qr", false),
            approved = b.optBoolean("approved", true),
            totalOrders = b.optInt("total_orders", 0),
            arrivedUnsettledCount = b.optInt("arrived_unsettled_count", 0),
            inTransitCount = b.optInt("in_transit_count", 0),
            anomalyCount = b.optInt("anomaly_count", 0),
            settledCount = b.optInt("settled_count", 0),
            payableAmount = b.optDouble("payable_amount", 0.0),
            settledAmount = b.optDouble("settled_amount", 0.0),
            overdueMissingCount = b.optInt("overdue_missing_count", 0)
          )
        )
      }
    }

    val ordersArr = res.optJSONArray("orders") ?: JSONArray()
    val orders = buildList {
      for (i in 0 until ordersArr.length()) {
        val o = ordersArr.optJSONObject(i) ?: continue
        val pArr = o.optJSONArray("parcels") ?: JSONArray()
        val parcels = buildList {
          for (j in 0 until pArr.length()) {
            val p = pArr.optJSONObject(j) ?: continue
            val scArr = p.optJSONArray("scanned_pieces")
            add(
              CloudParcel(
                displayCode = p.optString("display_code", ""),
                baseCode = p.optString("base_code", ""),
                courier = p.optString("courier", ""),
                expectedPieces = p.optInt("expected_pieces", 1),
                scannedCount = scArr?.length() ?: 0
              )
            )
          }
        }
        val prog = o.optJSONObject("progress")
        add(
          CloudOrder(
            id = o.optLong("id", 0L),
            userId = o.optLong("user_id", 0L),
            wechatName = o.optString("wechat_name", ""),
            productName = o.optString("product_name", ""),
            unitPrice = o.optDouble("unit_price", 0.0),
            orderQty = o.optInt("order_qty", 1),
            baseAmount = o.optDouble("base_amount", 0.0),
            deductionAmount = o.optDouble("deduction_amount", 0.0),
            deductionReason = o.optString("deduction_reason", ""),
            hasDeductionImage = o.optBoolean("has_deduction_image", false),
            finalAmount = o.optDouble("final_amount", 0.0),
            remark = o.optString("remark", ""),
            isLocked = o.optBoolean("is_locked", false),
            isAnomaly = o.optBoolean("is_anomaly", false),
            anomalyReason = o.optString("anomaly_reason", ""),
            settleStatus = o.optString("settle_status", "unsettled"),
            settlementBatchId = o.optLong("settlement_batch_id", 0L),
            isOverdueMissing = o.optBoolean("is_overdue_missing", false),
            createdAt = o.optString("created_at", ""),
            settledAt = o.optString("settled_at", ""),
            parcels = parcels,
            scanned = prog?.optInt("scanned", 0) ?: 0,
            expected = prog?.optInt("expected", 1) ?: 1,
            hasArrived = prog?.optBoolean("hasArrived", false) ?: false,
            isComplete = prog?.optBoolean("isComplete", false) ?: false
          )
        )
      }
    }

    val prodsArr = res.optJSONArray("products") ?: JSONArray()
    val products = buildList {
      for (i in 0 until prodsArr.length()) {
        val p = prodsArr.optJSONObject(i) ?: continue
        add(
          CloudProduct(
            id = p.optLong("id", 0L),
            name = p.optString("name", ""),
            price = p.optDouble("price", 0.0),
            unitNote = p.optString("unit_note", ""),
            tag = p.optString("tag", "latest"),
            sortOrder = p.optInt("sort_order", 100)
          )
        )
      }
    }

    val uncArr = res.optJSONArray("unclaimed") ?: JSONArray()
    val unclaimed = buildList {
      for (i in 0 until uncArr.length()) {
        val u = uncArr.optJSONObject(i) ?: continue
        add(
          CloudUnclaimed(
            id = u.optLong("id", 0L),
            fullScanCode = u.optString("full_scan_code", ""),
            baseCode = u.optString("base_code", ""),
            courier = u.optString("courier", ""),
            pieceIndex = u.optInt("piece_index", 1),
            pieceTotal = u.optInt("piece_total", 1),
            source = u.optString("source", ""),
            scannedAt = u.optString("scanned_at", "")
          )
        )
      }
    }

    val sObj = res.optJSONObject("settings") ?: JSONObject()
    val settings = CloudSettings(
      formTitle = sObj.optString("form_title", "万家商贸 · 撸货报单"),
      announcement = sObj.optString("announcement", ""),
      trackingTip = sObj.optString("tracking_tip", ""),
      inviteCode = sObj.optString("invite_code", ""),
      scanApiKey = sObj.optString("scan_api_key", scanApiKey),
      requireApproval = sObj.optBoolean("require_approval", false),
      overdueMissingDays = sObj.optInt("overdue_missing_days", 3)
    )
    if (settings.scanApiKey.isNotBlank() && settings.scanApiKey != scanApiKey) {
      scanApiKey = settings.scanApiKey
    }

    return CloudDashboard(buyers, orders, products, unclaimed, settings)
  }

  fun fetchBuyerPayment(userId: Long): CloudPaymentInfo {
    val res = requestJson("GET", "/admin/users/$userId/payment", useAdminToken = true, timeoutMs = 10000)
    val p = res.optJSONObject("payment") ?: JSONObject()
    return CloudPaymentInfo(
      userId = p.optLong("id", userId),
      wechatName = p.optString("wechat_name", ""),
      alipayAccount = p.optString("alipay_account", ""),
      paymentQr = p.optString("payment_qr", "")
    )
  }

  fun fetchOrderImage(orderId: Long): Pair<String, String> {
    val res = requestJson("GET", "/orders/$orderId/image", useAdminToken = true, timeoutMs = 10000)
    return Pair(res.optString("image", ""), res.optString("reason", ""))
  }

  fun adjustOrder(orderId: Long, deductionAmount: Double, reason: String, imageDataUrl: String?) {
    val body = JSONObject()
      .put("deduction_amount", deductionAmount)
      .put("deduction_reason", reason)
    if (imageDataUrl != null) {
      body.put("deduction_image", imageDataUrl)
    }
    requestJson("PUT", "/admin/orders/$orderId/adjust", body = body, useAdminToken = true, timeoutMs = 15000)
  }

  fun settleOrders(userId: Long, orderIds: List<Long>, note: String, proofImageDataUrl: String?): String {
    val idsArr = JSONArray()
    orderIds.forEach { idsArr.put(it) }
    val body = JSONObject()
      .put("user_id", userId)
      .put("order_ids", idsArr)
      .put("note", note)
    if (!proofImageDataUrl.isNullOrBlank()) {
      body.put("proof_image", proofImageDataUrl)
    }
    val res = requestJson("POST", "/admin/settlements", body = body, useAdminToken = true, timeoutMs = 15000)
    val b = res.optJSONObject("batch")
    return b?.optString("batch_no", "") ?: ""
  }

  fun resolveAnomaly(orderId: Long, action: String) {
    val body = JSONObject().put("action", action)
    requestJson("POST", "/admin/orders/$orderId/resolve", body = body, useAdminToken = true, timeoutMs = 10000)
  }

  fun deleteUnclaimedScan(scanId: Long) {
    requestJson("DELETE", "/admin/scans/$scanId", useAdminToken = true, timeoutMs = 9000)
  }

  fun batchAddProducts(rawText: String, tag: String): Int {
    val body = JSONObject().put("raw_text", rawText).put("tag", tag)
    val res = requestJson("POST", "/admin/products/batch", body = body, useAdminToken = true, timeoutMs = 10000)
    return res.optJSONArray("products")?.length() ?: 0
  }

  fun updateProduct(productId: Long, name: String, price: Double, unitNote: String, tag: String, priceStrategy: String): Int {
    val body = JSONObject()
      .put("name", name)
      .put("price", price)
      .put("unit_note", unitNote)
      .put("tag", tag)
      .put("price_strategy", priceStrategy)
    val res = requestJson("PUT", "/admin/products/$productId", body = body, useAdminToken = true, timeoutMs = 12000)
    return res.optInt("affected_orders", 0)
  }

  fun deleteProduct(productId: Long) {
    requestJson("DELETE", "/admin/products/$productId", useAdminToken = true, timeoutMs = 9000)
  }

  fun approveUser(userId: Long, approved: Boolean) {
    val body = JSONObject().put("approved", approved)
    requestJson("PUT", "/admin/users/$userId/approve", body = body, useAdminToken = true, timeoutMs = 9000)
  }

  fun updateSettings(formTitle: String, announcement: String, inviteCode: String, requireApproval: Boolean) {
    val body = JSONObject()
      .put("form_title", formTitle)
      .put("announcement", announcement)
      .put("invite_code", inviteCode)
      .put("require_approval", requireApproval)
    requestJson("PUT", "/admin/settings", body = body, useAdminToken = true, timeoutMs = 9000)
  }

  fun parseProductLinesLocal(rawText: String): List<ParsedProductPreview> {
    val r1 = Regex("^(.+?)\\s*(?:反|返|收|给|价)\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:元|块)?\\s*(.*)$")
    val r2 = Regex("^(.+?)\\s*([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:元|块)\\s*(.*)$")
    val r3 = Regex("^(.+?)[\\s,，:：]+([0-9]+(?:\\.[0-9]{1,2})?)(?:[\\s,，]+(.*))?$")
    return rawText.lines().mapNotNull { line ->
      val t = line.trim()
      if (t.isEmpty()) return@mapNotNull null
      val m = r1.matchEntire(t) ?: r2.matchEntire(t) ?: r3.matchEntire(t) ?: return@mapNotNull null
      val name = m.groupValues[1].trim()
      val price = m.groupValues[2].toDoubleOrNull() ?: return@mapNotNull null
      val note = m.groupValues[3].trim().trim('（', '(', '）', ')').trim()
      if (name.isEmpty()) null else ParsedProductPreview(name, price, note)
    }
  }

  fun compressBitmapToDataUrl(bitmap: Bitmap, maxDim: Int = 820): String {
    var w = bitmap.width
    var h = bitmap.height
    val scaled = if (w > maxDim || h > maxDim) {
      if (w >= h) {
        h = (h * maxDim / w).coerceAtLeast(1)
        w = maxDim
      } else {
        w = (w * maxDim / h).coerceAtLeast(1)
        h = maxDim
      }
      Bitmap.createScaledBitmap(bitmap, w, h, true)
    } else bitmap

    val baos = ByteArrayOutputStream()
    var quality = 72
    scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos)
    while (baos.size() > 190_000 && quality > 38) {
      baos.reset()
      quality -= 12
      scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos)
    }
    if (scaled !== bitmap) scaled.recycle()
    val b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
    return "data:image/jpeg;base64,$b64"
  }

  fun compressFileToDataUrl(file: File): String {
    if (!file.isFile) throw IllegalArgumentException("照片文件不存在")
    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, opts)
    var sample = 1
    while (opts.outWidth / sample > 1200 || opts.outHeight / sample > 1200) sample *= 2
    val bmp = BitmapFactory.decodeFile(
      file.absolutePath,
      BitmapFactory.Options().apply { inSampleSize = sample }
    ) ?: throw IllegalStateException("无法读取本地照片")
    try {
      return compressBitmapToDataUrl(bmp)
    } finally {
      bmp.recycle()
    }
  }

  fun compressUriToDataUrl(uri: Uri): String {
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
      ?: throw IllegalStateException("无法读取所选图片")
    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
    var sample = 1
    while (opts.outWidth / sample > 1200 || opts.outHeight / sample > 1200) sample *= 2
    val bmp = BitmapFactory.decodeByteArray(
      bytes, 0, bytes.size,
      BitmapFactory.Options().apply { inSampleSize = sample }
    ) ?: throw IllegalStateException("图片格式不支持")
    try {
      return compressBitmapToDataUrl(bmp)
    } finally {
      bmp.recycle()
    }
  }

  fun decodeDataUrlToBitmap(dataUrl: String): Bitmap? {
    if (dataUrl.isBlank()) return null
    return try {
      val b64 = if (dataUrl.contains(",")) dataUrl.substringAfter(",") else dataUrl
      val bytes = Base64.decode(b64, Base64.DEFAULT)
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (_: Exception) {
      null
    }
  }
}
