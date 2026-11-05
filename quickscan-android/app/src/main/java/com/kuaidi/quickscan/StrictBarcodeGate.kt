package com.kuaidi.quickscan

import com.google.mlkit.vision.barcode.common.Barcode
import java.util.ArrayDeque

/**
 * Conservative confirmation gate for parcel barcode candidates.
 *
 * 1. Decodes only CODE_128 and ITF, never QR/EAN/UPC or 2D.
 * 2. Rejects very short, implausible, off-center or mixed-code frames.
 * 3. Requires eight identical observations over >= 400 ms.
 * 4. Holds result until human confirms the printed tracking number in UI.
 *
 * This reduces recognition error, but cannot mathematically guarantee correctness;
 * human confirmation is the final safety layer.
 */
class StrictBarcodeGate {
  private var last=""
  private var count=0
  private var firstAt=0L
  private var lockedCode:String?=null
  private var missingFrames=0

  @Synchronized fun reset(){
    last="";count=0;firstAt=0L;lockedCode=null;missingFrames=0
  }

  @Synchronized fun clearPending(){
    last="";count=0;firstAt=0L
    // Keep lockedCode until the camera sees a real gap;
    // otherwise a held label immediately returns again.
  }

  @Synchronized fun observe(items:List<Barcode>,width:Int,height:Int,now:Long):String? {
    if(width<=0||height<=0)return null
    val candidates=items.filter{item->
      val code=item.rawValue?.trim().orEmpty()
      val valid=code.matches(Regex("[A-Za-z0-9-]{10,40}"))
      val type=item.format==Barcode.FORMAT_CODE_128 || item.format==Barcode.FORMAT_ITF
      val itfValid=item.format!=Barcode.FORMAT_ITF ||
        (code.all{it.isDigit()} && code.length%2==0 && code.length>=12)
      val box=item.boundingBox
      val geometry=box!=null && box.width()>width*0.24f &&
        box.height()>12 &&
        box.width()>box.height()*1.55f &&
        box.centerX()>width*0.15f && box.centerX()<width*0.85f &&
        box.centerY()>height*0.12f && box.centerY()<height*0.88f
      valid&&type&&itfValid&&geometry
    }
    if(candidates.size!=1){
      missingFrames++
      last="";count=0
      if(missingFrames>=5)lockedCode=null
      return null
    }
    missingFrames=0
    val code=candidates[0].rawValue!!.trim()
    if(code==lockedCode)return null
    if(code!=last){
      last=code
      count=1
      firstAt=now
      return null
    }
    count++
    if(count<8 || now-firstAt<400L)return null
    lockedCode=code
    last=""
    count=0
    return code
  }
}
