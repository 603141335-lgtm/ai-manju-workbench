package com.kuaidi.quickscan

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.view.View
import com.google.mlkit.vision.barcode.common.Barcode
import kotlin.math.max

/** Non-interactive live indication of the *selected* 1D waybill barcode. */
class BarcodeHighlightOverlay(context:Context):View(context) {
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color=Color.argb(90,17,199,126) }
  private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color=Color.rgb(20,221,140); strokeWidth=3f*resources.displayMetrics.density
    style=Paint.Style.STROKE
  }
  private val tagBackground = Paint(Paint.ANTI_ALIAS_FLAG).apply { color=Color.argb(230,13,99,70) }
  private val tagText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color=Color.WHITE; textSize=13f*resources.displayMetrics.scaledDensity
    isFakeBoldText=true
  }
  private val shown=RectF()
  private var rawRect:Rect? = null
  private var rawWidth = 0
  private var rawHeight = 0
  private var code = ""

  fun updateTarget(barcode:Barcode?,imageWidth:Int,imageHeight:Int) {
    val nextRect = barcode?.boundingBox?.let { Rect(it) }
    val nextCode = barcode?.rawValue?.trim().orEmpty()
    post {
      rawRect=nextRect
      rawWidth=imageWidth
      rawHeight=imageHeight
      code=nextCode
      invalidate()
    }
  }

  fun clearTarget() {
    post {rawRect=null;code="";invalidate()}
  }

  override fun onDraw(canvas:Canvas) {
    super.onDraw(canvas)
    val r=rawRect ?:return
    if(rawWidth<=0 || rawHeight<=0 || width<=0 || height<=0)return
    // Same FILL_CENTER transform as CameraX PreviewView (back camera, no mirroring).
    val scale=max(width.toFloat()/rawWidth,height.toFloat()/rawHeight)
    val offsetX=(width-rawWidth*scale)*0.5f
    val offsetY=(height-rawHeight*scale)*0.5f
    shown.set(
      (r.left*scale+offsetX).coerceIn(0f,width.toFloat()),
      (r.top*scale+offsetY).coerceIn(0f,height.toFloat()),
      (r.right*scale+offsetX).coerceIn(0f,width.toFloat()),
      (r.bottom*scale+offsetY).coerceIn(0f,height.toFloat())
    )
    if(shown.width()<16f || shown.height()<7f)return
    val radius=9f*resources.displayMetrics.density
    canvas.drawRoundRect(shown,radius,radius,fill)
    canvas.drawRoundRect(shown,radius,radius,border)
    if(code.isNotBlank()) {
      val displayCode=code.take(34)
      val x=shown.left.coerceAtMost(width-20f)
      val labelWidth=(tagText.measureText(displayCode)+22f*resources.displayMetrics.density)
        .coerceAtMost(width.toFloat()-x)
      val labelHeight=27f*resources.displayMetrics.density
      val y=(shown.bottom+6f*resources.displayMetrics.density)
        .coerceAtMost(height-labelHeight-3f)
      if(labelWidth>0) {
        canvas.drawRoundRect(x,y,x+labelWidth,y+labelHeight,radius,radius,tagBackground)
        canvas.drawText(displayCode,x+8f*resources.displayMetrics.density,
          y+18f*resources.displayMetrics.density,tagText)
      }
    }
  }
}
