package com.kuaidi.quickscan

import com.google.mlkit.vision.barcode.common.Barcode
import kotlin.math.abs

/**
 * Fast barcode gate: 2 consistent CODE128 frames, 3 ITF frames.
 * Requires same valid format, value, aspect, center and approximate location.
 * A held physical label locks recognition until it leaves camera view.
 *
 * ML Kit decodes CODE128 with its checksum. ITF is less constrained, so
 * it requires an extra observation and all-even numeric payload.
 * Not a mathematical guarantee against misreads.
 */
class StrictBarcodeGate {
  private var candidate=""
  private var candidateFormat=-1
  private var consecutive=0
  private var firstSeenAt=0L
  private var lastSeenAt=0L
  private var anchorX=0
  private var anchorY=0
  private var locked=false
  private var blanks=0

  @Synchronized fun reset(){
    candidate="";candidateFormat=-1;consecutive=0;firstSeenAt=0L
    lastSeenAt=0L;locked=false;blanks=0
  }

  @Synchronized fun observe(items:List<Barcode>,width:Int,height:Int,now:Long):String? {
    if(width<=0||height<=0)return null
    val plausible=items.filter{item->
      val value=item.rawValue?.trim().orEmpty()
      val syntax=value.matches(Regex("[A-Za-z0-9-]{10,40}"))
      val kind=item.format==Barcode.FORMAT_CODE_128 || item.format==Barcode.FORMAT_ITF
      val itfValid=item.format!=Barcode.FORMAT_ITF ||
        (value.all{it.isDigit()} && value.length>=12 && value.length%2==0)
      val rect=item.boundingBox
      val geometry=rect!=null &&
        rect.width()>width*0.22f && rect.height()>10 &&
        rect.width()>rect.height()*1.4f &&
        rect.centerX() in (width*0.12f).toInt()..(width*0.88f).toInt() &&
        rect.centerY() in (height*0.09f).toInt()..(height*0.91f).toInt()
      syntax&&kind&&itfValid&&geometry
    }
    if(plausible.size!=1){
      blanks++
      if(blanks>=2){
        locked=false
        candidate="";candidateFormat=-1;consecutive=0;firstSeenAt=0L
      }
      return null
    }
    blanks=0
    if(locked)return null
    val item=plausible.first()
    val code=item.rawValue!!.trim()
    val rect=item.boundingBox!!
    val samePosition=abs(rect.centerX()-anchorX)<width*0.15f &&
      abs(rect.centerY()-anchorY)<height*0.15f
    if(code!=candidate || item.format!=candidateFormat ||
       !samePosition || now-lastSeenAt>450L){
      candidate=code
      candidateFormat=item.format
      consecutive=1
      firstSeenAt=now
      anchorX=rect.centerX()
      anchorY=rect.centerY()
      lastSeenAt=now
      return null
    }
    consecutive++
    lastSeenAt=now
    val requiredFrames=if(item.format==Barcode.FORMAT_ITF)3 else 2
    val requiredMs=if(item.format==Barcode.FORMAT_ITF)90L else 35L
    if(consecutive<requiredFrames || now-firstSeenAt<requiredMs)return null
    locked=true
    candidate="";candidateFormat=-1;consecutive=0
    return code
  }
}
