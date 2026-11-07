package com.kuaidi.quickscan

import com.google.mlkit.vision.barcode.common.Barcode
import kotlin.math.abs

/**
 * Multi-frame express-waybill recognizer.
 * Fast: CODE128 2 frames / ITF 3 frames. Other modes trade speed for confidence.
 * A new physical barcode may immediately replace a previously locked barcode;
 * holding the same barcode stays locked until it leaves the frame.
 * Database uniqueness remains the final same-code duplicate guard.
 */
class StrictBarcodeGate {
  private val waybillPattern = Regex("[A-Za-z0-9-]{10,40}")
  private var scanMode = "fast"
  private var candidate = ""
  private var candidateFormat = -1
  private var consecutive = 0
  private var firstSeenAt = 0L
  private var lastSeenAt = 0L
  private var anchorX = 0
  private var anchorY = 0
  private var lockedCode = ""
  private var lockedFormat = -1
  private var blanks = 0

  @Synchronized fun setMode(mode:String) {
    scanMode = if(mode in listOf("fast", "balanced", "strict")) mode else "fast"
    reset()
  }

  @Synchronized fun reset() {
    resetCandidate()
    lockedCode = ""
    lockedFormat = -1
    blanks = 0
  }

  private fun resetCandidate() {
    candidate = ""
    candidateFormat = -1
    consecutive = 0
    firstSeenAt = 0L
    lastSeenAt = 0L
    anchorX = 0
    anchorY = 0
  }

  /** The exact barcode chosen here is also the one highlighted by the camera UI. */
  @Synchronized fun select(items:List<Barcode>, width:Int, height:Int):Barcode? {
    if(width <= 0 || height <= 0) return null
    val minWidth = when(scanMode) {"strict" -> 0.22f; "balanced" -> 0.19f; else -> 0.16f}
    val valid = items.asSequence().filter { item ->
      val value = item.rawValue?.trim().orEmpty()
      val syntax = waybillPattern.matches(value)
      val format = item.format == Barcode.FORMAT_CODE_128 || item.format == Barcode.FORMAT_ITF
      val itf = item.format != Barcode.FORMAT_ITF ||
        (value.all { it.isDigit() } && value.length >= 12 && value.length % 2 == 0)
      val rect = item.boundingBox
      // A long waybill can be rotated or photographed diagonally. The old
      // rect.width > rect.height * 1.4 check rejected otherwise decoded labels.
      // ML Kit's four corners describe the actual rotated barcode edges.
      val corners = item.cornerPoints
      val edges = if(corners != null && corners.size == 4) {
        (0..3).map { i ->
          val a = corners[i]
          val b = corners[(i + 1) % 4]
          kotlin.math.hypot((a.x - b.x).toDouble(), (a.y - b.y).toDouble()).toFloat()
        }
      } else null
      val longEdge = edges?.maxOrNull() ?: rect?.let { maxOf(it.width(), it.height()).toFloat() } ?: 0f
      val shortEdge = edges?.minOrNull() ?: rect?.let { minOf(it.width(), it.height()).toFloat() } ?: 0f
      val geometry = rect != null &&
        longEdge > minOf(width, height) * minWidth && shortEdge > 6f &&
        rect.centerX() in (width * 0.06f).toInt()..(width * 0.94f).toInt() &&
        rect.centerY() in (height * 0.06f).toInt()..(height * 0.94f).toInt()
      syntax && format && itf && geometry
    }
    // If multiple courier labels are in view, target whichever is nearest center.
    return valid.minByOrNull {
      val r = it.boundingBox!!
      val dx = (r.centerX() - width * 0.5f) / width
      val dy = (r.centerY() - height * 0.5f) / height
      dx * dx + dy * dy
    }
  }

  @Synchronized fun observe(items:List<Barcode>,width:Int,height:Int,now:Long):String? {
    return observeSelected(select(items,width,height), width, height, now)
  }

  @Synchronized fun observeSelected(item:Barcode?,width:Int,height:Int,now:Long):String? {
    if(item == null || width <= 0 || height <= 0) {
      resetCandidate()
      blanks++
      if(blanks >= 2) {
        lockedCode = ""
        lockedFormat = -1
      }
      return null
    }
    blanks = 0
    val code = item.rawValue!!.trim()
    val rect = item.boundingBox!!
    if(lockedCode.isNotEmpty()) {
      if(code == lockedCode && item.format == lockedFormat) return null
      // Changed label: begin validating at once, no need to wait for blank frames.
      lockedCode = ""
      lockedFormat = -1
      resetCandidate()
    }
    val allowedDisplacement = if(scanMode == "fast") 0.19f else 0.15f
    val samePosition = abs(rect.centerX() - anchorX) < width * allowedDisplacement &&
      abs(rect.centerY() - anchorY) < height * allowedDisplacement
    if(code != candidate || item.format != candidateFormat ||
       !samePosition || now-lastSeenAt > 500L) {
      candidate = code
      candidateFormat = item.format
      consecutive = 1
      firstSeenAt = now
      anchorX = rect.centerX()
      anchorY = rect.centerY()
      lastSeenAt = now
      return null
    }
    consecutive++
    lastSeenAt = now
    val requiredFrames = when(scanMode) {
      "strict" -> if(item.format == Barcode.FORMAT_ITF) 5 else 4
      "balanced" -> if(item.format == Barcode.FORMAT_ITF) 4 else 3
      else -> if(item.format == Barcode.FORMAT_ITF) 3 else 2
    }
    val requiredMs = when(scanMode) {
      "strict" -> if(item.format == Barcode.FORMAT_ITF) 180L else 90L
      "balanced" -> if(item.format == Barcode.FORMAT_ITF) 120L else 60L
      else -> if(item.format == Barcode.FORMAT_ITF) 90L else 35L
    }
    if(consecutive < requiredFrames || now - firstSeenAt < requiredMs) return null
    lockedCode = code
    lockedFormat = item.format
    resetCandidate()
    return code
  }
}
