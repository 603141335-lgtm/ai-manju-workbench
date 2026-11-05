package com.kuaidi.quickscan

import com.google.mlkit.vision.barcode.common.Barcode
import kotlin.math.abs

/**
 * Fast, conservative parcel barcode gate.
 * ML Kit has already decoded CODE_128 / ITF checks; require identical readings
 * across frames and similar positions before accepting.
 *
 * A read locks the frame until the label is removed from view (two blank/invalid
 * observations). While locked, alternate readings of the same label cannot
 * create another record. Reintroduced codes are checked against SQLite.
 * Software verification cannot guarantee every barcode is correct.
 */
class StrictBarcodeGate {
  private var candidate=""
  private var consecutive=0
  private var firstSeenAt=0L
  private var lastSeenAt=0L
  private var anchorX=0
  private var anchorY=0
  private var locked=false
  private var blanks=0

  @Synchronized fun reset() {
    candidate="";consecutive=0;firstSeenAt=0L;lastSeenAt=0L
    locked=false;blanks=0
  }

  @Synchronized fun clearPending() {
    candidate="";consecutive=0;firstSeenAt=0L;lastSeenAt=0L
  }

  @Synchronized fun observe(
    items:List<Barcode>,width:Int,height:Int,now:Long
  ):String? {
    if(width<=0||height<=0)return null
    val plausible=items.filter { item ->
      val code=item.rawValue?.trim().orEmpty()
      val valid=code.matches(Regex("[A-Za-z0-9-]{10,40}"))
      val kind=item.format==Barcode.FORMAT_CODE_128 || item.format==Barcode.FORMAT_ITF
      val itfOk=item.format!=Barcode.FORMAT_ITF ||
        (code.all{it.isDigit()} && code.length>=12 && code.length%2==0)
      val rect=item.boundingBox
      val position=rect!=null &&
        rect.width()>width*0.22f && rect.height()>10 &&
        rect.width()>rect.height()*1.4f &&
        rect.centerX() in (width*0.12f).toInt()..(width*0.88f).toInt() &&
        rect.centerY() in (height*0.09f).toInt()..(height*0.91f).toInt()
      valid&&kind&&itfOk&&position
    }

    if(plausible.size!=1) {
      blanks++
      if(blanks>=2){
        if(locked)locked=false
        clearPending()
      }
      return null
    }
    blanks=0
    if(locked)return null
    val item=plausible.first()
    val code=item.rawValue!!.trim()
    val rect=item.boundingBox!!
    val samePlace=abs(rect.centerX()-anchorX)<width*0.18f &&
      abs(rect.centerY()-anchorY)<height*0.18f
    if(code!=candidate || !samePlace || now-lastSeenAt>500L){
      candidate=code;consecutive=1;firstSeenAt=now
      anchorX=rect.centerX();anchorY=rect.centerY()
      lastSeenAt=now
      return null
    }
    consecutive++
    lastSeenAt=now
    val minFrames=if(item.format==Barcode.FORMAT_ITF)4 else 3
    val minDuration=if(item.format==Barcode.FORMAT_ITF)140L else 80L
    if(consecutive<minFrames || now-firstSeenAt<minDuration)return null

    locked=true
    clearPending()
    return code
  }
}
