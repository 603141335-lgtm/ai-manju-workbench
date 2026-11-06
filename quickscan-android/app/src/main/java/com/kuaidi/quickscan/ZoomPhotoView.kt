package com.kuaidi.quickscan

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.RectF
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.widget.ImageView
import java.io.File
import kotlin.math.min

/** Photo detail viewer with pinch zoom, drag and double-tap to reset/zoom. */
// This view uses the platform theme and only draws its own photo.
@android.annotation.SuppressLint("AppCompatCustomView")
class ZoomPhotoView(context:Context): ImageView(context) {
  private val transform=Matrix()
  private var baseScale=1f
  private var actualScale=1f
  private var lastX=0f
  private var lastY=0f
  private var loaded=false

  private val scaler=ScaleGestureDetector(context,object:ScaleGestureDetector.SimpleOnScaleGestureListener(){
    override fun onScale(detector:ScaleGestureDetector):Boolean{
      if(!loaded)return false
      val desired=(actualScale*detector.scaleFactor).coerceIn(baseScale,baseScale*6f)
      val factor=desired/actualScale
      transform.postScale(factor,factor,detector.focusX,detector.focusY)
      actualScale=desired
      constrain()
      imageMatrix=transform
      return true
    }
  })
  private val taps=GestureDetector(context,object:GestureDetector.SimpleOnGestureListener(){
    override fun onDoubleTap(e:MotionEvent):Boolean{
      if(!loaded)return false
      if(actualScale>baseScale*1.3f) resetZoom()
      else{
        val factor=2.5f
        transform.postScale(factor,factor,e.x,e.y)
        actualScale=baseScale*factor
        constrain()
        imageMatrix=transform
      }
      return true
    }
  })

  init{scaleType=ScaleType.MATRIX;setBackgroundColor(android.graphics.Color.rgb(10,16,28))}
  fun load(file:File){
    val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true}
    BitmapFactory.decodeFile(file.absolutePath,bounds)
    if(bounds.outWidth<=0||bounds.outHeight<=0)return
    var sample=1
    while(bounds.outWidth/sample>3200 || bounds.outHeight/sample>3200)sample*=2
    val bitmap=BitmapFactory.decodeFile(file.absolutePath,BitmapFactory.Options().apply{inSampleSize=sample})?:return
    setImageBitmap(bitmap)
    loaded=true
    post{resetZoom()}
  }
  override fun onSizeChanged(w:Int,h:Int,oldw:Int,oldh:Int){
    super.onSizeChanged(w,h,oldw,oldh)
    if(loaded && w>0 && h>0)post{resetZoom()}
  }
  private fun resetZoom(){
    val d=drawable?:return
    if(width<=0||height<=0||d.intrinsicWidth<=0||d.intrinsicHeight<=0)return
    val w=d.intrinsicWidth.toFloat();val h=d.intrinsicHeight.toFloat()
    baseScale=min(width/w,height/h)
    actualScale=baseScale
    transform.reset()
    transform.postScale(baseScale,baseScale)
    transform.postTranslate((width-w*baseScale)/2f,(height-h*baseScale)/2f)
    imageMatrix=transform
  }
  private fun constrain(){
    val d=drawable?:return
    val rect=RectF(0f,0f,d.intrinsicWidth.toFloat(),d.intrinsicHeight.toFloat())
    transform.mapRect(rect)
    val dx=if(rect.width()<=width)width/2f-rect.centerX() else when{
      rect.left>0f -> -rect.left
      rect.right<width -> width-rect.right
      else -> 0f
    }
    val dy=if(rect.height()<=height)height/2f-rect.centerY() else when{
      rect.top>0f -> -rect.top
      rect.bottom<height -> height-rect.bottom
      else -> 0f
    }
    transform.postTranslate(dx,dy)
  }
  override fun onTouchEvent(event:MotionEvent):Boolean{
    taps.onTouchEvent(event)
    scaler.onTouchEvent(event)
    when(event.actionMasked){
      MotionEvent.ACTION_DOWN->{lastX=event.x;lastY=event.y}
      MotionEvent.ACTION_MOVE->{
        if(event.pointerCount==1 && !scaler.isInProgress && actualScale>baseScale*1.01f){
          transform.postTranslate(event.x-lastX,event.y-lastY)
          constrain()
          imageMatrix=transform
        }
        lastX=event.x;lastY=event.y
      }
      MotionEvent.ACTION_POINTER_UP->{lastX=event.x;lastY=event.y}
    }
    return true
  }
}
