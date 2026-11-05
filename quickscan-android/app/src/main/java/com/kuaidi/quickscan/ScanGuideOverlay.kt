package com.kuaidi.quickscan

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.view.View

/** Quiet camera alignment grid, styled after a warehouse scanner; no obstruction text. */
class ScanGuideOverlay(context:Context):View(context){
  private val grid=Paint(Paint.ANTI_ALIAS_FLAG).apply{
    color=android.graphics.Color.argb(49,100,224,164)
    strokeWidth=1f
  }
  private val guides=Paint(Paint.ANTI_ALIAS_FLAG).apply{
    color=android.graphics.Color.argb(190,105,234,177)
    strokeWidth=4f
    style=Paint.Style.STROKE
    strokeCap=Paint.Cap.ROUND
  }
  override fun onDraw(canvas:Canvas){
    super.onDraw(canvas)
    val w=width.toFloat();val h=height.toFloat()
    if(w<=0f||h<=0f)return
    val spacing=resources.displayMetrics.density*19f
    var x=0f
    while(x<w){canvas.drawLine(x,0f,x,h,grid);x+=spacing}
    var y=0f
    while(y<h){canvas.drawLine(0f,y,w,y,grid);y+=spacing}
    val l=w*0.11f;val r=w*0.89f;val t=h*0.23f;val b=h*0.76f
    val d=resources.displayMetrics.density*18
    canvas.drawLine(l,t,l+d,t,guides);canvas.drawLine(l,t,l,t+d,guides)
    canvas.drawLine(r,t,r-d,t,guides);canvas.drawLine(r,t,r,t+d,guides)
    canvas.drawLine(l,b,l+d,b,guides);canvas.drawLine(l,b,l,b-d,guides)
    canvas.drawLine(r,b,r-d,b,guides);canvas.drawLine(r,b,r,b-d,guides)
  }
}
