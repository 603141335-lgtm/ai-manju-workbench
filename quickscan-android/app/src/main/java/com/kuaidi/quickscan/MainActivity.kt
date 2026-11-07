package com.kuaidi.quickscan

import android.Manifest
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.media.ToneGenerator
import android.speech.tts.TextToSpeech
import android.os.Vibrator
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.net.Uri
import android.app.Dialog
import android.view.WindowManager
import androidx.core.content.FileProvider
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.*
import android.text.Editable
import android.text.TextWatcher
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity:ComponentActivity(){
  private val primary=Color.rgb(40,100,213)
  private val ink=Color.rgb(26,42,65)
  private val muted=Color.rgb(116,132,155)
  private val canvasColor=Color.rgb(244,247,253)
  private lateinit var db:ScanDb
  private lateinit var page:LinearLayout
  private var activeBatch=0L
  private var batchName=""
  private var currentPage="home"
  private val backToHome=object:OnBackPressedCallback(false){
    override fun handleOnBackPressed(){
      if(repairTarget!=null)showScan() else showHome()
    }
  }
  private var provider:ProcessCameraProvider?=null
  private var camera:androidx.camera.core.Camera?=null
  private var imageCapture:ImageCapture?=null
  private var previewView:PreviewView?=null
  private val executor=Executors.newSingleThreadExecutor()
  private val strictGate=StrictBarcodeGate()
  private var scanRowsBox:LinearLayout?=null
  private var scanSearch:EditText?=null
  private var scanCount:TextView?=null
  private var pendingQueueButton:TextView?=null
  private var duplicateAnnounced=""
  private var duplicateTime=0L
  private var scanOverlay:BarcodeHighlightOverlay?=null
  private var feedbackCard:LinearLayout?=null
  private var feedbackIcon:TextView?=null
  private var feedbackTitle:TextView?=null
  private var feedbackCode:TextView?=null
  private val uiHandler=Handler(Looper.getMainLooper())
  private var feedbackSequence=0L
  private var scanMode="fast"
  private var voiceProfile="light"

  private val processing=AtomicBoolean(false)
  private val captureBusy=AtomicBoolean(false)
  private var repairTarget:ScanRow?=null
  private var pendingRepair:ScanRow?=null
  private var flashlight=false
  private var lastVisibleBarcodeAt=0L
  private var lastRefocusAt=0L
  private var voiceEnabled=true
  private var vibrationEnabled=true
  private var voice:TextToSpeech?=null
  private var speechReady=false
  private var exportDetail=true
  private var pendingPhotoSave:String?=null
  private val barcodeScanner = lazy { BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(
    Barcode.FORMAT_CODE_128,Barcode.FORMAT_ITF
  ).build()) }
  private val permissionRequest=registerForActivityResult(ActivityResultContracts.RequestPermission()){granted->
    val repair=pendingRepair
    pendingRepair=null
    if(granted)showScan(repair) else {toast("请允许相机权限才能扫码拍照");announce("failure")}
  }
  private val exportRequest=registerForActivityResult(ActivityResultContracts.CreateDocument(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")){uri->
    if(uri!=null){
      val batch=activeBatch
      val detail=exportDetail
      Thread{
        try{
          val rows=db.all(if(batch>0)batch else null).asReversed()
          val output=contentResolver.openOutputStream(uri)?:throw IllegalStateException("无法写入文件")
          output.use{XlsxWriter.write(it,rows,detail)}
          runOnUiThread{
            toast("✓ Excel导出成功 · "+rows.size+"条")
            AlertDialog.Builder(this).setTitle("Excel 已保存")
              .setItems(arrayOf("分享给微信、QQ等软件","选择应用打开 Excel","完成")){_,choice->
                when(choice){
                  0->shareContent(uri,EXCEL_MIME,"选择分享 Excel 的软件")
                  1->openContent(uri,EXCEL_MIME,"选择打开 Excel 的软件")
                }
              }.show()
          }
        }catch(e:Exception){
          runOnUiThread{toast("Excel导出失败："+e.message);announce("failure")}
        }
      }.start()
    }
  }
  private val savePhotoRequest=registerForActivityResult(ActivityResultContracts.CreateDocument("image/jpeg")){uri->
    val path=pendingPhotoSave
    pendingPhotoSave=null
    if(uri!=null&&!path.isNullOrBlank()){
      Thread{
        try{
          val photo=File(path)
          if(!photo.exists())throw IllegalStateException("照片不存在")
          val out=contentResolver.openOutputStream(uri)?:throw IllegalStateException("无法写入照片")
          photo.inputStream().use{input->out.use{output->input.copyTo(output)}}
          runOnUiThread{toast("✓ 照片已另存到指定位置")}
        }catch(e:Exception){runOnUiThread{toast("保存照片失败："+e.message);announce("failure")}}
      }.start()
    }
  }
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState)
    onBackPressedDispatcher.addCallback(this,backToHome)
    WindowCompat.setDecorFitsSystemWindows(window,false)
    WindowCompat.getInsetsController(window,window.decorView).isAppearanceLightStatusBars=true
    WindowCompat.getInsetsController(window,window.decorView).isAppearanceLightNavigationBars=true
    db=ScanDb(this)
    voiceEnabled=getPreferences(MODE_PRIVATE).getBoolean("voiceEnabled",true)
    vibrationEnabled=getPreferences(MODE_PRIVATE).getBoolean("vibrationEnabled",true)
    scanMode=getPreferences(MODE_PRIVATE).getString("scanMode","fast") ?: "fast"
    voiceProfile=getPreferences(MODE_PRIVATE).getString("voiceProfile","light") ?: "light"
    strictGate.setMode(scanMode)
    voice=TextToSpeech(this){status->
      if(status==TextToSpeech.SUCCESS){
        val result=voice?.setLanguage(Locale.SIMPLIFIED_CHINESE)
        speechReady=result!=null && result!=TextToSpeech.LANG_MISSING_DATA && result!=TextToSpeech.LANG_NOT_SUPPORTED
      }
    }
    val batches=db.batches()
    val savedBatch=getPreferences(MODE_PRIVATE).getLong("lastScanBatch",0L)
    val restoreRepair=savedInstanceState?.getLong("repairRow",0L)?.takeIf{it>0L}?.let{db.find(it)}
    val first=batches.firstOrNull{it.id==(restoreRepair?.batchId ?: savedBatch)} ?: batches.firstOrNull()
    activeBatch=first?.id?:0L
    batchName=first?.name?:""
    showHome()
    if(restoreRepair!=null){
      if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)showScan(restoreRepair)
      else pendingRepair=restoreRepair
    }
  }
  override fun onSaveInstanceState(outState:Bundle){
    (repairTarget ?: pendingRepair)?.let{outState.putLong("repairRow",it.id)}
    super.onSaveInstanceState(outState)
  }
  override fun onDestroy(){
    stopCamera()
    uiHandler.removeCallbacksAndMessages(null)
    if(executor.isShutdown.not())executor.shutdown()
    if(barcodeScanner.isInitialized())barcodeScanner.value.close()
    voice?.stop()
    voice?.shutdown()
    db.close()
    super.onDestroy()
  }
  private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
  private fun shape(color:Int,radius:Int=14)=GradientDrawable().apply{setColor(color);cornerRadius=dp(radius).toFloat()}
  private fun label(t:String,size:Float=15f,c:Int=ink,bold:Boolean=false)=TextView(this).apply{
    text=t;textSize=size;setTextColor(c);gravity=Gravity.CENTER_VERTICAL
    if(bold)setTypeface(null,Typeface.BOLD)
  }
  private fun container(vertical:Boolean=true)=LinearLayout(this).apply{orientation=if(vertical)LinearLayout.VERTICAL else LinearLayout.HORIZONTAL}
  private fun margins(bottom:Int=11)=LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(bottom)}
  private fun button(t:String,main:Boolean=false,action:()->Unit)=label(t,14f,if(main)Color.WHITE else primary,true).apply{
    gravity=Gravity.CENTER;background=shape(if(main)primary else Color.rgb(231,240,255),14)
    setPadding(dp(11),dp(14),dp(11),dp(14));setOnClickListener{action()}
  }
  private fun card():LinearLayout=container().apply{
    setPadding(dp(16),dp(15),dp(16),dp(15))
    background=shape(Color.WHITE,20)
    elevation=dp(1).toFloat()
    page.addView(this,margins(13))
  }
  private fun pair(box:LinearLayout,a:View,b:View){
    val line=container(false).apply{gravity=Gravity.CENTER_VERTICAL}
    line.addView(a,LinearLayout.LayoutParams(0,-2,1f))
    line.addView(b,LinearLayout.LayoutParams(0,-2,1f).apply{leftMargin=dp(9)})
    box.addView(line,margins(9))
  }
  private fun input(hint:String,value:String="")=EditText(this).apply{
    setSingleLine(true);setText(value);setTextSize(16f);setTextColor(ink)
    setHint(hint);setHintTextColor(muted);background=shape(canvasColor,12)
    setPadding(dp(12),dp(11),dp(12),dp(11))
  }
  private fun setPageContent(root:View){
    ViewCompat.setOnApplyWindowInsetsListener(root){view, insets->
      val safe=insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      )
      view.setPadding(safe.left,safe.top,safe.right,safe.bottom)
      insets
    }
    backToHome.isEnabled=currentPage!="home"
    setContentView(root)
  }
  override fun onWindowFocusChanged(hasFocus:Boolean){
    super.onWindowFocusChanged(hasFocus)
    if(!hasFocus){
      strictGate.reset()
      scanOverlay?.clearTarget()
    }
  }
  private fun shell(title:String,sub:String){
    val root=container().apply{setBackgroundColor(canvasColor)}
    setPageContent(root)
    val header=container().apply{
      background=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(Color.rgb(22,49,106),Color.rgb(44,102,210)))
      setPadding(dp(19),dp(20),dp(19),dp(21))
    }
    val heading=container(false).apply{gravity=Gravity.CENTER_VERTICAL}
    val icon=ImageView(this).apply{setImageResource(R.drawable.ic_quickscan_launcher)}
    heading.addView(icon,LinearLayout.LayoutParams(dp(46),dp(46)).apply{rightMargin=dp(12)})
    val labels=container()
    labels.addView(label(title,22f,Color.WHITE,true),margins(2))
    labels.addView(label(sub,12f,Color.rgb(211,228,255)))
    heading.addView(labels,LinearLayout.LayoutParams(0,-2,1f))
    header.addView(heading)
    root.addView(header)
    val scroller=ScrollView(this).apply{isFillViewport=true;isVerticalScrollBarEnabled=false}
    page=container().apply{setPadding(dp(14),dp(16),dp(14),dp(8))}
    scroller.addView(page)
    root.addView(scroller,LinearLayout.LayoutParams(-1,0,1f))
    val navigation=container(false).apply{
      setBackgroundColor(Color.WHITE);setPadding(dp(8),dp(7),dp(8),dp(9))
    }
    listOf("▦ 批次" to "home","▥ 扫码" to "scan","📷 失败件" to "pending","⚙ 设置" to "settings").forEach{(title,tag)->
      val active=currentPage==tag || (currentPage=="batch" && tag=="home")
      val view=label(title,13f,if(active)primary else muted,active).apply{
        gravity=Gravity.CENTER;setPadding(dp(1),dp(12),dp(1),dp(12))
        if(active)background=shape(Color.rgb(234,242,255),14)
        setOnClickListener{when(tag){"home"->showHome();"scan"->showScan();"pending"->showPendingPhotos();else->showSettings()}}
      }
      navigation.addView(view,LinearLayout.LayoutParams(0,-2,1f).apply{leftMargin=dp(3);rightMargin=dp(3)})
    }
    root.addView(navigation)
  }
  private fun announce(kind:String){
    if(vibrationEnabled){
      try{(getSystemService(VIBRATOR_SERVICE) as Vibrator)
        .vibrate(VibrationEffect.createOneShot(if(kind=="success")60L else 140L,85))}
      catch(_:Exception){}
    }
    if(!voiceEnabled)return
    val phrase=when(voiceProfile){
      "light"->when(kind){"success"->"扫好啦";"duplicate"->"这件扫过啦";else->"再试一下"}
      "calm"->when(kind){"success"->"登记成功";"duplicate"->"单号重复";else->"识别失败"}
      else->when(kind){"success"->"成功";"duplicate"->"重复";else->"失败"}
    }
    if(voiceProfile!="beep" && speechReady){
      try{
        val pitch=when(voiceProfile){"light"->1.13f;"calm"->0.93f;else->1.0f}
        val rate=when(voiceProfile){"light"->1.16f;"calm"->1.04f;else->1.20f}
        voice?.setPitch(pitch)
        voice?.setSpeechRate(rate)
        voice?.speak(phrase,TextToSpeech.QUEUE_FLUSH,null,"scan_"+System.currentTimeMillis())
        return
      }catch(_:Exception){}
    }
    try{
      val tone=ToneGenerator(AudioManager.STREAM_MUSIC,85)
      val which=when(kind){
        "success"->ToneGenerator.TONE_PROP_ACK
        "duplicate"->ToneGenerator.TONE_PROP_NACK
        else->ToneGenerator.TONE_SUP_ERROR
      }
      tone.startTone(which,if(kind=="success")130 else 250)
      uiHandler.postDelayed({tone.release()},360)
    }catch(_:Exception){}
  }
  private fun toast(t:String)=Toast.makeText(this,t,Toast.LENGTH_SHORT).show()
  private fun formatTime(t:Long)=SimpleDateFormat("yyyy-MM-dd HH:mm:ss",Locale.CHINA).format(Date(t))
  private fun today()=SimpleDateFormat("M.d",Locale.CHINA).format(Date())
  private fun csv(t:String)="\""+t.replace("\"","\"\"")+"\""
  private fun prompt(title:String,hint:String,default:String="",accept:(String)->Unit){
    val edit=input(hint,default);val holder=container().apply{setPadding(dp(17),dp(10),dp(17),0);addView(edit)}
    AlertDialog.Builder(this).setTitle(title).setView(holder)
      .setNegativeButton("取消",null).setPositiveButton("确定"){_,_->
        accept(edit.text.toString().trim())
      }.show()
  }
  private fun newBatchDialog(then:()->Unit){
    val day=today()
    prompt("新建扫码批次","例如 "+day,day){requested->
      val name=requested.trim()
      if(name.isBlank()){toast("批次名称不能为空");return@prompt}
      val existing=db.batches().firstOrNull{it.name==name}
      if(existing==null){
        activeBatch=db.newBatch(name);batchName=name;then()
      }else{
        val existingNames=db.batches().map{it.name}.toSet()
        var suffix=2
        while(existingNames.contains(name+"-"+suffix))suffix++
        val alternative=name+"-"+suffix
        AlertDialog.Builder(this).setTitle("已存在批次 "+name)
          .setMessage("可以打开今天已有的批次，也可以创建新的 "+alternative+"。")
          .setPositiveButton("使用已有"){_,_->
            activeBatch=existing.id;batchName=existing.name;then()
          }
          .setNeutralButton("新建 "+alternative){_,_->
            activeBatch=db.newBatch(alternative);batchName=alternative;then()
          }
          .setNegativeButton("取消",null).show()
      }
    }
  }
  private fun selectBatch(then:()->Unit){
    val batches=db.batches()
    if(batches.isEmpty()){
      newBatchDialog(then)
      return
    }
    AlertDialog.Builder(this).setTitle("选择扫码批次")
      .setItems(batches.map{it.name+" · "+it.count+" 件"}.toTypedArray()){_,which->
        activeBatch=batches[which].id;batchName=batches[which].name;then()
      }.setNeutralButton("新建"){_,_->newBatchDialog(then)}.show()
  }
  private fun showHome(){
    currentPage="home";stopCamera();shell("快递快扫","扫码登记 · 批次管理 · 直接查询")
    val intro=card()
    intro.addView(label("今天："+today(),21f,ink,true),margins(5))
    intro.addView(label("只扫快递一维码 · 快速自动登记",12f,muted),margins(14))
    pair(intro,button("＋ 新建批次",true){newBatchDialog{showScan()}},button("选批扫码"){selectBatch{showScan()}})
    val batches=db.batches()
    val lastBatchId=getPreferences(MODE_PRIVATE).getLong("lastScanBatch",0L)
    val lastBatch=batches.firstOrNull{it.id==lastBatchId}
    if(lastBatch!=null){
      intro.addView(button("继续扫码 · "+lastBatch.name){
        activeBatch=lastBatch.id
        batchName=lastBatch.name
        showScan()
      })
    }
    val stats=card()
    stats.addView(label("累计 "+batches.sumOf{it.count}+" 件 · "+batches.size+" 个批次",17f,primary,true))
    stats.addView(button("📷 扫码失败照片 · 待补录 "+db.pendingPhotoCount()+" 张"){showPendingPhotos()},margins(8))
    val find=card()
    find.addView(label("查询单号",17f,ink,true),margins(9))
    val query=input("直接输入完整单号或末四位")
    find.addView(query,margins(9))
    val foundList=container()
    find.addView(foundList)
    fun display(q:String){
      foundList.removeAllViews()
      if(q.isBlank()){
        foundList.addView(label("所有批次均可查询，无须单独打开窗口",12f,muted))
      }else{
        val matches=db.all(null,q,80)
        if(matches.isEmpty())foundList.addView(label("没有找到匹配记录",13f,muted))
        else matches.forEach{addRow(foundList,it)}
      }
    }
    display("")
    query.addTextChangedListener(object:TextWatcher{
      override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
      override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){display(s?.toString().orEmpty())}
      override fun afterTextChanged(s:Editable?){}
    })
    val list=card()
    list.addView(label("历史批次",18f,ink,true),margins(12))
    if(batches.isEmpty())list.addView(label("还没有记录，创建批次即可开始",14f,muted))
    batches.forEach{batch->
      val item=container().apply{
        setPadding(dp(12),dp(12),dp(12),dp(12))
        background=shape(canvasColor,12)
        addView(label(batch.name+"  ·  "+batch.count+" 件",17f,ink,true))
        addView(label(formatTime(batch.created),12f,muted))
        setOnClickListener{activeBatch=batch.id;batchName=batch.name;showBatch()}
      }
      list.addView(item,margins(9))
    }
  }

  /** Decode a bounded thumbnail; never allocate the full-resolution JPEG for every list item. */
  private fun photoThumbnail(file:File):android.graphics.Bitmap? {
    if(!file.isFile)return null
    return try{
      val bounds=android.graphics.BitmapFactory.Options().apply{inJustDecodeBounds=true}
      android.graphics.BitmapFactory.decodeFile(file.absolutePath,bounds)
      if(bounds.outWidth<=0||bounds.outHeight<=0)return null
      var sample=1
      while(bounds.outWidth/sample>700||bounds.outHeight/sample>700)sample*=2
      android.graphics.BitmapFactory.decodeFile(
        file.absolutePath,
        android.graphics.BitmapFactory.Options().apply{inSampleSize=sample}
      )
    }catch(_:Exception){null}
  }

  /** Central inbox for unreadable-waybill photos captured by the camera button. */
  private fun showPendingPhotos(){
    currentPage="pending";stopCamera()
    shell("扫码失败件","所有批次集中查看 · 看图补录单号")
    val count=db.pendingPhotoCount()
    val rows=db.pendingPhotos(40)
    val batches=db.batches().associate{it.id to it.name}
    val summary=card()
    summary.addView(label("待补录 "+count+" 张照片",21f,primary,true),margins(7))
    summary.addView(label("扫不出来就直接拍照。拍完继续扫；这里能统一看面单、输入条码。保存后自动移出待补录列表，照片仍保留在原批次记录里。",13f,muted),margins(10))
    pair(summary,button("返回扫码",true){showScan()},button("刷新列表"){showPendingPhotos()})
    if(count>rows.size)summary.addView(label("每页显示最新40张，处理后会自动出现下一批。",12f,muted))
    if(rows.isEmpty()){
      val empty=card()
      empty.addView(label("暂无需要补录的照片",17f,primary,true),margins(6))
      empty.addView(label("扫码失败后点击拍照，照片会自动汇总在这里。",14f,muted))
      return
    }
    rows.forEachIndexed{index,row->
      val item=card()
      item.addView(label("失败件 "+(index+1)+" · "+(batches[row.batchId]?:"历史批次"),16f,ink,true),margins(5))
      item.addView(label(formatTime(row.time),12f,muted),margins(10))
      val file=File(row.photo)
      if(file.isFile){
        val bitmap=photoThumbnail(file)
        if(bitmap!=null){
          val thumb=ImageView(this).apply{
            setImageBitmap(bitmap)
            scaleType=ImageView.ScaleType.FIT_CENTER
            background=shape(canvasColor,12)
            contentDescription="点击放大失败件照片"
            setOnClickListener{showPhotoFullscreen(row.photo)}
          }
          item.addView(thumb,LinearLayout.LayoutParams(-1,dp(160)).apply{bottomMargin=dp(8)})
        }else item.addView(label("照片预览无法加载，可以尝试打开原图。",13f,muted),margins(8))
        item.addView(button("放大看单号 · 双指缩放"){showPhotoFullscreen(row.photo)},margins(8))
      }else{
        item.addView(label("⚠ 照片文件已丢失；原记录仍在。",13f,Color.rgb(191,70,60)),margins(8))
      }
      val codeField=input("输入面单条码下的完整单号")
      codeField.setSelectAllOnFocus(true)
      item.addView(codeField,margins(10))
      pair(item,button("查看批次"){activeBatch=row.batchId;batchName=batches[row.batchId].orEmpty();showBatch()},
        button("确认补录",true){
          val code=codeField.text.toString().trim().replace(" ","")
          if(!valid(code)){toast("请输入10—40位字母、数字或横线的单号");return@button}
          try{
            if(db.update(row.id,code,row.note)){
              showPendingPhotos()
              toast("✓ 补录成功，照片已归档到原批次")
            }else toast("该批次单号重复，或记录已不存在")
          }catch(e:Exception){toast("补录失败："+e.message)}
        })
    }
  }

  private fun showBatch(){
    currentPage="batch";stopCamera();shell("批次 "+batchName,"查看记录 · 导出表格")
    val records=db.all(activeBatch)
    val photoRecords=records.filter{it.photo.isNotBlank()}
    val selected=mutableSetOf<Long>()
    val checkboxes=mutableMapOf<Long,CheckBox>()
    val summary=card()
    summary.addView(label(records.size.toString()+" 条记录",22f,primary,true),margins(13))
    pair(summary,button("连续扫码",true){showScan()},button("导出/分享 Excel"){exportBatch()})
    pair(summary,button("拍照留底"){showScan();toast("点击扫码页的拍照按钮")},button("手动录入"){
      prompt("录入快递单号","快递单条码下方数字"){addCode(it)}
    })
    pair(summary,button("复制单号"){copyCodes()},button("切换批次"){selectBatch{showBatch()}})
    summary.addView(button("📷 集中处理失败照片 · "+db.pendingPhotoCount()+" 张"){showPendingPhotos()},margins(5))
    val manager=card()
    manager.addView(label("照片管理 · "+photoRecords.size+" 张",18f,ink,true),margins(7))
    val count=label("已选 0 张 · 只删除照片，保留快递单号及扫码时间",12f,muted)
    manager.addView(count,margins(9))
    if(photoRecords.isNotEmpty()){
      pair(manager,button("全选照片"){checkboxes.values.forEach{it.isChecked=true}},
        button("取消选择"){checkboxes.values.forEach{it.isChecked=false}})
      manager.addView(button("删除选中照片",true){
        if(selected.isEmpty()){toast("请先勾选要删除的照片");return@button}
        val ids=selected.toSet()
        AlertDialog.Builder(this)
          .setTitle("确认彻底删除 "+ids.size+" 张照片？")
          .setMessage("将永久删除本软件内选中的原始照片，不会删除快递单号、时间、备注或记录。此操作不能在软件内撤销。之前另存或分享出去的照片不受影响。")
          .setNegativeButton("取消",null)
          .setPositiveButton("删除照片"){_,_->
            deleteSelectedPhotos(activeBatch,ids)
          }.show()
      },margins(5))
    }else{
      manager.addView(label("这个批次没有待管理的照片",13f,muted))
    }
    val list=card()
    list.addView(label("本批记录 · 勾选带照片的快递",17f,ink,true),margins(9))
    records.forEach{row->
      if(row.photo.isBlank()){
        addRow(list,row)
      }else{
        val line=container(false).apply{
          gravity=Gravity.CENTER_VERTICAL
          setPadding(dp(1),dp(5),dp(5),dp(5))
        }
        val check=CheckBox(this).apply{
          contentDescription="选择照片 "+(if(row.code.isBlank())"待补单号" else row.code)
          setOnCheckedChangeListener{_,checked->
            if(checked)selected.add(row.id)else selected.remove(row.id)
            count.text="已选 "+selected.size+" 张 · 只删除照片，保留快递单号及扫码时间"
          }
        }
        checkboxes[row.id]=check
        line.addView(check,LinearLayout.LayoutParams(dp(46),-2))
        val textBlock=container().apply{
          setPadding(dp(3),dp(11),dp(0),dp(11))
          addView(label(if(row.code.isBlank())"📷 待补录单号" else row.code,16f,ink,true))
          addView(label(formatTime(row.time)+"  ·  有照片 · 点击查看",12f,muted))
          setOnClickListener{detail(row)}
        }
        line.addView(textBlock,LinearLayout.LayoutParams(0,-2,1f))
        list.addView(line)
        list.addView(View(this).apply{setBackgroundColor(canvasColor)},
          LinearLayout.LayoutParams(-1,dp(1)))
      }
    }
  }

  private fun deleteSelectedPhotos(batch:Long,ids:Set<Long>){
    Thread{
      var deleted=0
      var missing=0
      var failed=0
      val root=File(filesDir,"photos").canonicalFile
      val rootPrefix=root.path+File.separator
      val chosen=db.all(batch).filter{ids.contains(it.id) && it.photo.isNotBlank()}
      chosen.forEach{row->
        try{
          val photo=File(row.photo).canonicalFile
          if(!photo.path.startsWith(rootPrefix)){
            failed++
          }else if(!photo.exists()){
            db.attachPhoto(row.id,"")
            missing++
          }else if(photo.isFile && photo.delete()){
            db.attachPhoto(row.id,"")
            deleted++
          }else{
            failed++
          }
        }catch(_:Exception){failed++}
      }
      runOnUiThread{
        showBatch()
        val message="已删除 "+deleted+" 张照片"+(if(missing>0)"，清理 "+missing+" 条失效照片引用" else "")+(if(failed>0)"；失败 "+failed+" 张" else "")+"。快递单号、时间和备注已保留。"
        AlertDialog.Builder(this).setTitle("照片清理完成")
          .setMessage(message).setPositiveButton("知道了",null).show()
      }
    }.start()
  }
  private fun addRow(parent:LinearLayout,row:ScanRow){
    val item=container().apply{
      setPadding(dp(6),dp(12),dp(6),dp(12))
      addView(label(if(row.code.isEmpty())"📷 待补录单号" else row.code,16f,ink,true))
      addView(label(formatTime(row.time)+"  ·  "+if(row.photo.isEmpty())"无照片" else "有照片",12f,muted))
      setOnClickListener{detail(row)}
    }
    parent.addView(item)
    parent.addView(View(this).apply{setBackgroundColor(canvasColor)},LinearLayout.LayoutParams(-1,dp(1)))
  }
  private fun detail(r:ScanRow){
    var detailDialog:AlertDialog?=null
    val layout=container().apply{setPadding(dp(16),dp(8),dp(16),0)}
    if(r.photo.isNotEmpty()&&File(r.photo).exists()){
      val image=ImageView(this).apply{
        setImageURI(Uri.fromFile(File(r.photo)));adjustViewBounds=true
        scaleType=ImageView.ScaleType.FIT_CENTER
      }
      image.setOnClickListener{showPhotoFullscreen(r.photo)}
      layout.addView(image,LinearLayout.LayoutParams(-1,dp(240)))
      layout.addView(label("点击图片可全屏放大，双击或双指缩放",12f,muted),margins(7))
      pair(layout,button("全屏放大"){showPhotoFullscreen(r.photo)},button("分享照片"){sharePhoto(r.photo)})
      layout.addView(button("另存照片到手机"){savePhoto(r.photo)},margins(7))
    }
    if(r.photo.isBlank()||!File(r.photo).exists()){
      layout.addView(button("📷 给这条记录补拍照片"){
        detailDialog?.dismiss()
        val matching=db.batches().firstOrNull{it.id==r.batchId} ?: return@button
        activeBatch=matching.id
        batchName=matching.name
        showScan(r)
      },margins(8))
    }
    val code=input("补录条码下方的数字",r.code)
    val note=input("备注",r.note)
    layout.addView(code,margins(9));layout.addView(note,margins(8))
    detailDialog=AlertDialog.Builder(this).setTitle("快递详情 · "+formatTime(r.time)).setView(layout)
      .setNegativeButton("取消",null)
      .setNeutralButton("删除"){_,_->
        AlertDialog.Builder(this).setTitle("确认删除？").setPositiveButton("删除"){_,_->
          if(r.photo.isNotEmpty())File(r.photo).delete()
          db.delete(r.id);refresh()
        }.setNegativeButton("取消",null).show()
      }.setPositiveButton("保存"){_,_->
        val v=code.text.toString().trim().replace(" ","")
        if(v.isNotBlank()&&!valid(v)){toast("单号只支持字母数字和横线");return@setPositiveButton}
        if(!db.update(r.id,v,note.text.toString())){
          toast("⚠ 该批次已有相同单号")
        }else{refresh()}
      }.show()
  }
  private fun refresh(){when(currentPage){"home"->showHome();"batch"->showBatch();"search"->showSearch();"scan"->showScan()}}
  private fun updateScanOutcome(code:String,status:String,color:Int){
    if(currentPage!="scan")return
    val card=feedbackCard ?:return
    feedbackTitle?.text=status
    feedbackTitle?.setTextColor(color)
    feedbackCode?.text=code
    feedbackCode?.visibility=if(code.isBlank())View.GONE else View.VISIBLE
    feedbackIcon?.text=when{
      status.contains("正在拍照")->"…"
      status.contains("重复")||status.contains("失败")||status.contains("无效")->"!"
      else->"✓"
    }
    feedbackIcon?.background=GradientDrawable().apply{
      shape=GradientDrawable.OVAL
      setColor(color)
    }
    card.visibility=View.VISIBLE
    feedbackSequence++
    val current=feedbackSequence
    if(status.contains("正在拍照"))return
    uiHandler.postDelayed({
      if(feedbackSequence==current && currentPage=="scan")card.visibility=View.GONE
    },if(status.contains("失败"))3200L else 1450L)
  }
  private fun onStableCandidate(code:String){
    if(currentPage!="scan"||captureBusy.get()||repairTarget!=null)return
    // The transactional DB insert is the single source of truth for duplicates.
    // Avoid two separate SELECT queries on every barcode scan.
    addCode(code,true)
  }
  private fun iconAction(resource:Int,description:String,action:()->Unit):LinearLayout{
    val holder=container().apply{gravity=Gravity.CENTER}
    val image=ImageButton(this).apply{
      setImageResource(resource);setColorFilter(primary)
      scaleType=ImageView.ScaleType.CENTER_INSIDE
      background=shape(Color.rgb(232,241,255),13)
      setPadding(dp(12),dp(12),dp(12),dp(12))
      contentDescription=description
      setOnClickListener{action()}
    }
    holder.addView(image,LinearLayout.LayoutParams(dp(46),dp(46)))
    holder.addView(label(description,11f,muted).apply{gravity=Gravity.CENTER},LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(4)})
    return holder
  }
  private fun showScan(repair:ScanRow?=null){
    if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){
      pendingRepair=repair
      permissionRequest.launch(Manifest.permission.CAMERA);return
    }
    if(activeBatch==0L){selectBatch{showScan()};return}
    currentPage="scan"
    stopCamera()
    lastVisibleBarcodeAt=SystemClock.elapsedRealtime()
    lastRefocusAt=0L
    repairTarget=repair
    getPreferences(MODE_PRIVATE).edit().putLong("lastScanBatch",activeBatch).apply()
    val windowRoot=FrameLayout(this).apply{setBackgroundColor(Color.WHITE)}
    val root=container().apply{setBackgroundColor(Color.WHITE)}
    windowRoot.addView(root,FrameLayout.LayoutParams(-1,-1))
    setPageContent(windowRoot)

    val top=container(false).apply{
      gravity=Gravity.CENTER_VERTICAL
      setBackgroundColor(Color.WHITE)
      setPadding(dp(14),dp(7),dp(14),dp(7))
    }
    val back=label("‹",29f,ink,true).apply{
      gravity=Gravity.CENTER
      contentDescription=if(repair==null)"返回首页" else "取消补拍"
      setOnClickListener{if(repair==null)showHome() else showScan()}
    }
    top.addView(back,LinearLayout.LayoutParams(dp(38),dp(40)))
    val heading=container().apply{gravity=Gravity.CENTER_VERTICAL}
    heading.addView(label(if(repair==null)batchName else "补拍面单",19f,ink,true))
    top.addView(heading,LinearLayout.LayoutParams(0,-2,1f))
    if(repair==null){
      top.addView(button("切换批次"){selectBatch{showScan()}},LinearLayout.LayoutParams(dp(92),-2))
    }else{
      top.addView(button("取消补拍"){showScan()},LinearLayout.LayoutParams(dp(92),-2))
    }
    top.addView(label("⚙",27f,ink,true).apply{
      gravity=Gravity.CENTER
      contentDescription="扫码速度和语音设置"
      setOnClickListener{showScanSettingsDialog()}
    },LinearLayout.LayoutParams(dp(48),dp(44)).apply{leftMargin=dp(4)})
    root.addView(top)
    val cameraView=PreviewView(this).apply{
      scaleType=PreviewView.ScaleType.FILL_CENTER
      setBackgroundColor(Color.rgb(28,34,40))
    }
    var tapX:Float?=null
    var tapY:Float?=null
    cameraView.setOnClickListener{
      focusCamera(cameraView,tapX ?: cameraView.width/2f,tapY ?: cameraView.height/2f)
      tapX=null;tapY=null
    }
    cameraView.setOnTouchListener{view,event->
      if(event.action==MotionEvent.ACTION_UP){
        tapX=event.x;tapY=event.y
        view.performClick()
      }
      true
    }
    cameraView.contentDescription="相机取景，点击对焦"
    previewView=cameraView
    val cameraFrame=FrameLayout(this).apply{setBackgroundColor(Color.rgb(28,34,40))}
    cameraFrame.addView(cameraView,FrameLayout.LayoutParams(-1,-1))
    cameraFrame.addView(ScanGuideOverlay(this),FrameLayout.LayoutParams(-1,-1))
    scanOverlay=BarcodeHighlightOverlay(this)
    cameraFrame.addView(scanOverlay,FrameLayout.LayoutParams(-1,-1))
    val screenHeight=(resources.displayMetrics.heightPixels/resources.displayMetrics.density).toInt()
    root.addView(cameraFrame,LinearLayout.LayoutParams(-1,dp((screenHeight*0.37f).toInt().coerceIn(220,335))))
    val controls=container(false).apply{
      gravity=Gravity.CENTER_VERTICAL
      setBackgroundColor(Color.WHITE)
      setPadding(dp(12),dp(9),dp(12),dp(9))
    }
    val cameraActions=mutableListOf(
      iconAction(R.drawable.ic_action_camera,if(repair==null)"拍照" else "为本单补拍"){
        takePhoto(repair?.id,repair?.code)
      },
      iconAction(R.drawable.ic_action_flash,"补光"){
        val currentCamera=camera
        if(currentCamera==null || !currentCamera.cameraInfo.hasFlashUnit()){
          toast("当前相机无法补光")
        }else{
          flashlight=!flashlight
          currentCamera.cameraControl.enableTorch(flashlight)
        }
      }
    )
    if(repair==null){
      cameraActions.add(iconAction(R.drawable.ic_action_keyboard,"录入"){
        prompt("手动输入单号","请核对条码下方单号"){addCode(it)}
      })
      cameraActions.add(iconAction(R.drawable.ic_action_records,"批次记录"){showBatch()})
    }
    cameraActions.forEach{controls.addView(it,LinearLayout.LayoutParams(0,-2,1f))}
    root.addView(controls)
    if(repair!=null){
      root.addView(label("当前补拍 · "+repair.code.ifBlank{"待补录单号"}+"\n自动扫码已暂停，请对准对应面单再拍照",14f,primary,true).apply{
        setPadding(dp(14),dp(8),dp(14),dp(8))
      })
    }

    root.addView(View(this).apply{setBackgroundColor(Color.rgb(227,233,241))},
      LinearLayout.LayoutParams(-1,dp(1)))

    val bottom=container().apply{
      setPadding(dp(14),dp(12),dp(14),dp(8))
      setBackgroundColor(Color.WHITE)
    }
    val titleRow=container(false).apply{gravity=Gravity.CENTER_VERTICAL}
    scanCount=label("扫码记录",17f,ink,true)
    titleRow.addView(scanCount,LinearLayout.LayoutParams(0,-2,1f))
    pendingQueueButton=button("失败件 "+db.pendingPhotoCount()){showPendingPhotos()}
    titleRow.addView(pendingQueueButton,LinearLayout.LayoutParams(-2,-2).apply{rightMargin=dp(7)})
    titleRow.addView(button("导出"){exportBatch()})
    bottom.addView(titleRow,margins(9))
    scanSearch=input("搜索单号 / 后四位")
    bottom.addView(scanSearch,margins(9))
    scanRowsBox=container()
    bottom.addView(scanRowsBox)
    val scroll=ScrollView(this).apply{
      isFillViewport=true;isVerticalScrollBarEnabled=false
    }
    scroll.addView(bottom)
    root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
    val popup=container(false).apply{
      accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE
      gravity=Gravity.CENTER_VERTICAL
      setPadding(dp(17),dp(17),dp(17),dp(17))
      background=shape(Color.rgb(42,44,48),22)
      elevation=dp(13).toFloat()
      visibility=View.GONE
      isClickable=false
    }
    feedbackCard=popup
    feedbackIcon=label("✓",28f,Color.WHITE,true).apply{
      gravity=Gravity.CENTER
      background=GradientDrawable().apply{
        shape=GradientDrawable.OVAL
        setColor(Color.rgb(23,188,116))
      }
    }
    popup.addView(feedbackIcon,LinearLayout.LayoutParams(dp(58),dp(58)).apply{rightMargin=dp(16)})
    val messages=container()
    feedbackTitle=label("扫码成功",16f,Color.rgb(28,214,138),true)
    feedbackCode=label("",20f,Color.WHITE,true).apply{maxLines=2}
    messages.addView(feedbackTitle,margins(6))
    messages.addView(feedbackCode)
    popup.addView(messages,LinearLayout.LayoutParams(0,-2,1f))
    windowRoot.addView(popup,FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM).apply{
      setMargins(dp(14),0,dp(14),dp(74))
    })
    scanSearch?.addTextChangedListener(object:TextWatcher{
      override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
      override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){updateRecent()}
      override fun afterTextChanged(s:Editable?){}
    })
    updateRecent()
    startCamera(cameraView)
  }
  private fun updateRecent(){
    if(currentPage!="scan")return
    val holder=scanRowsBox?:return
    holder.removeAllViews()
    val q=scanSearch?.text?.toString()?.trim().orEmpty()
    val total=db.count(activeBatch)
    scanCount?.text="扫码记录 · "+total+" 件"
    pendingQueueButton?.text="失败件 "+db.pendingPhotoCount()
    val rows=db.recent(activeBatch,q,if(q.isEmpty())14 else 100)
    if(rows.isEmpty()){
      holder.addView(label(if(q.isBlank())"暂无扫码记录" else "没有匹配单号",13f,muted))
      return
    }
    rows.forEachIndexed{idx,item->
      val line=container(false).apply{
        gravity=Gravity.CENTER_VERTICAL
        setPadding(dp(1),dp(10),dp(1),dp(10))
        setOnClickListener{detail(item)}
      }
      val number=label(if(q.isEmpty())(total-idx).toString()+"." else "·",13f,muted)
      line.addView(number,LinearLayout.LayoutParams(dp(39),-2))
      val info=container()
      info.addView(label(item.code.ifBlank{"📷 待补录"},17f,ink,true),margins(4))
      info.addView(label(formatTime(item.time),12f,muted))
      line.addView(info,LinearLayout.LayoutParams(0,-2,1f))
      line.addView(label(if(item.photo.isBlank())"待拍照" else "有照片",12f,muted),
        LinearLayout.LayoutParams(-2,-2).apply{leftMargin=dp(7)})
      holder.addView(line)
      holder.addView(View(this).apply{setBackgroundColor(Color.rgb(239,242,248))},
        LinearLayout.LayoutParams(-1,dp(1)))
    }
  }
  private fun startCamera(view:PreviewView){
    val future=ProcessCameraProvider.getInstance(this)
    future.addListener({
      try{
        if(currentPage!="scan"||previewView!==view)return@addListener
        val p=future.get();provider=p;p.unbindAll()
        val preview=Preview.Builder().build().also{it.surfaceProvider=view.surfaceProvider}
        imageCapture=ImageCapture.Builder()
          .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
          .setJpegQuality(82)
          .build()
        if(repairTarget==null){
          val analyzer=ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
          analyzer.setAnalyzer(executor){proxy->analyze(proxy,view)}
          camera=p.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,preview,imageCapture,analyzer)
        }else{
          camera=p.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,preview,imageCapture)
        }
      }catch(e:Exception){toast("相机启动失败："+e.message);announce("failure")}
    },ContextCompat.getMainExecutor(this))
  }
  private fun focusCamera(view:PreviewView,x:Float,y:Float){
    val currentCamera=camera ?: return
    val point=view.meteringPointFactory.createPoint(x,y)
    val action=FocusMeteringAction.Builder(point,FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
      .setAutoCancelDuration(3,TimeUnit.SECONDS)
      .build()
    currentCamera.cameraControl.startFocusAndMetering(action)
  }
  @androidx.annotation.OptIn(markerClass=[androidx.camera.core.ExperimentalGetImage::class])
  private fun analyze(proxy:ImageProxy,view:PreviewView){
    val media=proxy.image
    if(media==null||captureBusy.get()||!processing.compareAndSet(false,true)){
      proxy.close();return
    }
    val now=SystemClock.elapsedRealtime()
    val rotated=proxy.imageInfo.rotationDegrees%180!=0
    val w=if(rotated)media.height else media.width
    val h=if(rotated)media.width else media.height
    val task=try{
      val image=InputImage.fromMediaImage(media,proxy.imageInfo.rotationDegrees)
      barcodeScanner.value.process(image)
    }catch(e:RuntimeException){
      proxy.close()
      processing.set(false)
      return
    }
    task.addOnSuccessListener{codes->
      if(previewView===view && hasWindowFocus() && !captureBusy.get()){
        val selected=strictGate.select(codes,w,h)
        // Try a bounded center refocus if the camera has not seen a readable
        // barcode for a while. Avoid refocusing during normal rapid scanning.
        if(selected!=null) lastVisibleBarcodeAt=now
        else if(now-lastVisibleBarcodeAt>2200L && now-lastRefocusAt>4500L) {
          lastRefocusAt=now
          focusCamera(view,view.width/2f,view.height/2f)
        }
        scanOverlay?.updateTarget(selected,w,h)
        val result=strictGate.observeSelected(selected,w,h,now)
        if(result!=null)onStableCandidate(result)
      }
    }.addOnCompleteListener{
      proxy.close()
      processing.set(false)
    }
  }
  private fun valid(v:String)=v.matches(Regex("[A-Za-z0-9-]{10,40}"))
  private fun addCode(raw:String,fromCamera:Boolean=false){
    if(activeBatch==0L){toast("请先新建批次");announce("failure");return}
    if(fromCamera&&captureBusy.get())return
    val code=raw.trim().replace(" ","")
    if(!valid(code)){
      toast("单号需要10-40位字母数字或横线")
      announce("failure")
      if(fromCamera)updateScanOutcome(code,"单号无效 · 未保存",Color.rgb(198,57,57))
      return
    }
    val saved=try{db.saveIfNew(activeBatch,code)}catch(e:Exception){
      if(fromCamera)updateScanOutcome(code,"登记失败 · 请重试",Color.rgb(198,57,57))
      toast("登记失败："+e.message)
      announce("failure")
      return
    }
    if(saved<0L){
      updateScanOutcome(code,"重复单号 · 已自动拦截",Color.rgb(245,76,81))
      val now=SystemClock.elapsedRealtime()
      if(duplicateAnnounced!=code||now-duplicateTime>1700L){
        duplicateAnnounced=code;duplicateTime=now
        announce("duplicate")
      }
      return
    }
    if(fromCamera){
      updateScanOutcome(code,"已登记 · 请保持面单，正在拍照",Color.rgb(216,154,49))
      // Keep the parcel in the frame until photo callback confirms it is saved.
      takePhoto(saved,code)
    }else{
      announce("success")
      toast("✓ 已手动登记："+code)
      updateRecent()
    }
  }
  private fun takePhoto(forRow:Long?=null,displayCode:String?=null){
    if(!captureBusy.compareAndSet(false,true)){
      toast("上一张照片保存中，请稍后")
      return
    }
    val capture=imageCapture
    val viewAtCapture=previewView
    val batchAtCapture=activeBatch
    val repairAtCapture=repairTarget
    val code=displayCode.orEmpty()
    val file=File(File(filesDir,"photos"),"scan_"+java.util.UUID.randomUUID()+".jpg")
    fun reportFailure(message:String){
      file.delete()
      captureBusy.set(false)
      if(isDestroyed || previewView!==viewAtCapture)return
      toast(message)
      if(forRow!=null)updateScanOutcome(code,"照片保存失败 · 单号已保留，可补拍",Color.rgb(198,57,57))
      announce("failure")
      updateRecent()
    }
    if(capture==null || viewAtCapture==null){
      reportFailure("相机启动中，请稍后再拍")
      return
    }
    try{
      val directory=file.parentFile!!
      check(directory.isDirectory || directory.mkdirs()){"无法创建照片目录"}
      capture.takePicture(
        ImageCapture.OutputFileOptions.Builder(file).build(),
        ContextCompat.getMainExecutor(this),
        object:ImageCapture.OnImageSavedCallback{
          override fun onImageSaved(result:ImageCapture.OutputFileResults){
            if(isDestroyed){
              file.delete()
              captureBusy.set(false)
              return
            }
            try{
              check(file.isFile && file.length()>0L){"照片文件为空"}
              if(forRow!=null){
                check(db.attachPhoto(forRow,file.absolutePath)){"原记录已删除"}
              }else{
                db.save(batchAtCapture,"",file.absolutePath)
              }
            }catch(e:Exception){
              reportFailure("照片保存失败："+e.message)
              return
            }
            captureBusy.set(false)
            if(previewView!==viewAtCapture)return
            if(forRow!=null){
              if(repairAtCapture!=null)showScan()
              updateScanOutcome(code,if(repairAtCapture==null)"✓ 单号及照片均已保存" else "✓ 补拍照片已保存",Color.rgb(36,151,94))
              announce("success")
            }else{
              toast("照片已保存，之后可补录单号")
            }
            updateRecent()
          }
          override fun onError(exception:ImageCaptureException){
            reportFailure(if(forRow==null)"拍照失败，请重试" else "照片保存失败，单号已保留")
          }
        }
      )
    }catch(e:RuntimeException){
      reportFailure("无法拍照："+e.message)
    }
  }
  private fun showSearch(){
    currentPage="search";stopCamera();shell("单号查询","完整单号、末四位及备注都可以搜")
    val box=card()
    val query=input("输入单号或末四位")
    box.addView(query,margins(12))
    val results=container();box.addView(results)
    fun display(q:String){
      results.removeAllViews()
      val found=if(q.isBlank())emptyList() else db.all(null,q,100)
      if(q.isBlank())results.addView(label("请输入要查询的单号",13f,muted))
      else if(found.isEmpty())results.addView(label("未找到匹配的快递记录",13f,muted))
      else found.forEach{addRow(results,it)}
    }
    display("")
    query.addTextChangedListener(object:TextWatcher{
      override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
      override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){display(s?.toString().orEmpty())}
      override fun afterTextChanged(s:Editable?){}
    })
  }
  private fun copyCodes(){
    val content=db.all(if(activeBatch>0)activeBatch else null).asReversed()
      .map{it.code}.filter{it.isNotBlank()}.joinToString("\n")
    if(content.isBlank()){toast("没有可复制的单号");return}
    (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("快递单号",content))
    toast("已复制，可粘贴到腾讯文档")
  }
  private val EXCEL_MIME="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  private fun fileUri(file:File):Uri =
    FileProvider.getUriForFile(this,packageName+".fileprovider",file)
  private fun shareContent(uri:Uri,mime:String,title:String){
    try{
      val share=Intent(Intent.ACTION_SEND).apply{
        type=mime
        putExtra(Intent.EXTRA_STREAM,uri)
        clipData=ClipData.newUri(contentResolver,"快递快扫文件",uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      startActivity(Intent.createChooser(share,title))
    }catch(e:Exception){toast("未能启动分享："+e.message);announce("failure")}
  }
  private fun openContent(uri:Uri,mime:String,title:String){
    try{
      val view=Intent(Intent.ACTION_VIEW).apply{
        setDataAndType(uri,mime)
        clipData=ClipData.newUri(contentResolver,"快递快扫文件",uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      startActivity(Intent.createChooser(view,title))
    }catch(e:Exception){toast("没有可用的打开软件，请改用分享");announce("failure")}
  }
  private fun shareExcelDirect(detail:Boolean,open:Boolean){
    val batch=activeBatch
    val name=batchName.replace(Regex("[^A-Za-z0-9\\u4e00-\\u9fa5_-]"),"_").take(32)
    Thread{
      try{
        val rows=db.all(batch).asReversed()
        val directory=File(cacheDir,"exports").apply{mkdirs()}
        val suffix=if(detail)"完整明细" else "仅单号"
        val file=File(directory,"快递快扫_"+name+"_"+suffix+"_"+System.currentTimeMillis()+".xlsx")
        file.outputStream().use{XlsxWriter.write(it,rows,detail)}
        if(!file.exists()||file.length()==0L)throw IllegalStateException("生成 Excel 失败")
        runOnUiThread{
          val uri=fileUri(file)
          if(open)openContent(uri,EXCEL_MIME,"选择打开 Excel 的软件")
          else shareContent(uri,EXCEL_MIME,"选择分享 Excel 的软件")
        }
      }catch(e:Exception){runOnUiThread{toast("Excel处理失败："+e.message);announce("failure")}}
    }.start()
  }
  private fun exportBatch(){
    if(activeBatch==0L){toast("请先新建批次");announce("failure");return}
    AlertDialog.Builder(this).setTitle("选择 Excel 内容")
      .setItems(arrayOf("完整明细：单号、时间、备注、照片状态","仅单号：方便粘贴腾讯文档")){_,which->
        exportDetail=(which==0)
        val suffix=if(exportDetail)"完整明细" else "仅单号"
        AlertDialog.Builder(this).setTitle("接下来做什么？")
          .setItems(arrayOf("保存到手机文件夹","分享给微信、QQ等软件","选择软件打开 Excel")){_,action->
            when(action){
              0->exportRequest.launch("快递快扫_"+batchName+"_"+suffix+".xlsx")
              1->shareExcelDirect(exportDetail,false)
              2->shareExcelDirect(exportDetail,true)
            }
          }.setNegativeButton("取消",null).show()
      }.setNegativeButton("取消",null).show()
  }
  private fun sharePhoto(path:String){
    try{
      val file=File(path)
      if(!file.exists())throw IllegalStateException("照片不存在")
      shareContent(fileUri(file),"image/jpeg","选择分享照片的软件")
    }catch(e:Exception){toast("分享照片失败："+e.message);announce("failure")}
  }
  private fun savePhoto(path:String){
    val file=File(path)
    if(!file.exists()){toast("照片不存在");announce("failure");return}
    pendingPhotoSave=path
    savePhotoRequest.launch("快递留底_"+file.name)
  }
  private fun showPhotoFullscreen(path:String){
    val photo=File(path)
    if(!photo.exists()){toast("照片已不存在");return}
    val dialog=Dialog(this,android.R.style.Theme_Black_NoTitleBar_Fullscreen)
    val column=container().apply{setBackgroundColor(Color.rgb(10,16,28))}
    val top=container(false).apply{
      gravity=Gravity.CENTER_VERTICAL
      setPadding(dp(15),dp(18),dp(15),dp(10))
    }
    val close=label("← 返回",17f,Color.WHITE,true).apply{
      setPadding(dp(7),dp(10),dp(20),dp(10))
      setOnClickListener{dialog.dismiss()}
    }
    top.addView(close)
    top.addView(label("照片留底 · 双指缩放",15f,Color.rgb(194,212,242)))
    column.addView(top)
    val zoom=ZoomPhotoView(this)
    zoom.load(photo)
    column.addView(zoom,LinearLayout.LayoutParams(-1,0,1f))
    val actions=container(false).apply{setPadding(dp(14),dp(12),dp(14),dp(20))}
    actions.addView(button("分享图片",true){sharePhoto(path)},LinearLayout.LayoutParams(0,-2,1f))
    actions.addView(button("另存到手机"){savePhoto(path)},
      LinearLayout.LayoutParams(0,-2,1f).apply{leftMargin=dp(10)})
    column.addView(actions)
    dialog.setContentView(column)
    dialog.window?.setLayout(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT)
    dialog.show()
  }
  private fun showScanSettingsDialog(){
    AlertDialog.Builder(this).setTitle("扫码设置")
      .setItems(arrayOf(
        "扫码速度："+modeLabel(),
        "播报风格："+voiceLabel(),
        if(vibrationEnabled)"关闭震动反馈" else "开启震动反馈",
        "测试当前播报"
      )){_,which->
        when(which){
          0->showScanModeDialog()
          1->showVoiceModeDialog()
          2->{
            vibrationEnabled=!vibrationEnabled
            getPreferences(MODE_PRIVATE).edit().putBoolean("vibrationEnabled",vibrationEnabled).apply()
            toast(if(vibrationEnabled)"已开启震动" else "已关闭震动")
          }
          3->announce("success")
        }
      }.setNegativeButton("关闭",null).show()
  }
  private fun modeLabel():String=when(scanMode){
    "balanced"->"标准";"strict"->"严谨";else->"极速"
  }
  private fun voiceLabel():String=when(voiceProfile){
    "calm"->"沉稳";"short"->"简短";"beep"->"纯提示音";else->"轻快"
  }
  private fun showScanModeDialog(){
    val modes=arrayOf("fast","balanced","strict")
    val names=arrayOf(
      "极速模式 · CODE128 2帧 / ITF 3帧",
      "标准模式 · CODE128 3帧 / ITF 4帧",
      "严谨模式 · CODE128 4帧 / ITF 5帧"
    )
    AlertDialog.Builder(this).setTitle("扫码速度（推荐极速模式）")
      .setSingleChoiceItems(names,modes.indexOf(scanMode).coerceAtLeast(0)){dialog,which->
        scanMode=modes[which]
        strictGate.setMode(scanMode)
        getPreferences(MODE_PRIVATE).edit().putString("scanMode",scanMode).apply()
        toast("已切换："+modeLabel()+"模式")
        dialog.dismiss()
      }.setNegativeButton("取消",null).show()
  }
  private fun showVoiceModeDialog(){
    val profiles=arrayOf("light","calm","short","beep")
    val names=arrayOf(
      "轻快播报 · 扫好啦 / 这件扫过啦",
      "沉稳播报 · 登记成功 / 单号重复",
      "简短播报 · 成功 / 重复",
      "纯提示音 · 无机器人语音"
    )
    AlertDialog.Builder(this).setTitle("播报声音")
      .setSingleChoiceItems(names,profiles.indexOf(voiceProfile).coerceAtLeast(0)){dialog,which->
        voiceProfile=profiles[which]
        getPreferences(MODE_PRIVATE).edit().putString("voiceProfile",voiceProfile).apply()
        voiceEnabled=true
        getPreferences(MODE_PRIVATE).edit().putBoolean("voiceEnabled",true).apply()
        dialog.dismiss()
        announce("success")
      }.setNegativeButton("取消",null).show()
  }
  private fun showSettings(){
    currentPage="settings";stopCamera();shell("设置与说明","语音提示 · Excel 导出 · 数据安全")
    val info=card()
    info.addView(label("快递快扫 v0.15.0",21f,ink,true),margins(8))
    info.addView(button("打开失败件照片 · 待补录 "+db.pendingPhotoCount()+" 张"){showPendingPhotos()},margins(8))
    info.addView(label("三档识别速度：极速2/3帧、标准3/4帧、严谨4/5帧。支持倾斜和竖向条码检测、新条码快速切换、动态绿色定位框、成功/重复悬浮提示。照片保存后才提示成功，注意保持面单不离开取景框。",13f,muted))
    val speed=card()
    speed.addView(label("识别速度",18f,ink,true),margins(8))
    speed.addView(button("当前："+modeLabel()+"模式 · 点击选择"){showScanModeDialog()},margins(5))
    speed.addView(label("默认极速。帧数减少并不保证不误识别；模糊件可切标准或严谨，或拍照后人工补单号。",12f,muted))

    val audio=card()
    audio.addView(label("扫码声音",18f,ink,true),margins(6))
    audio.addView(label("轻快/沉稳/简短语音及纯提示音，使用手机系统 TTS；音色自然程度由手机已安装的中文语音引擎决定。",12f,muted),margins(8))
    audio.addView(button("当前："+voiceLabel()+" · 点击选择"){showVoiceModeDialog()},margins(6))
    audio.addView(CheckBox(this).apply{
      text="中文语音播报";isChecked=voiceEnabled
      setOnCheckedChangeListener{_,enabled->
        voiceEnabled=enabled;getPreferences(MODE_PRIVATE).edit().putBoolean("voiceEnabled",enabled).apply()
      }
    })
    audio.addView(CheckBox(this).apply{
      text="震动提示";isChecked=vibrationEnabled
      setOnCheckedChangeListener{_,enabled->
        vibrationEnabled=enabled;getPreferences(MODE_PRIVATE).edit().putBoolean("vibrationEnabled",enabled).apply()
      }
    })
    audio.addView(button("测试声音：成功 / 重复 / 失败"){
      announce("success")
      android.os.Handler(mainLooper).postDelayed({announce("duplicate")},900)
      android.os.Handler(mainLooper).postDelayed({announce("failure")},1800)
    },margins(6))
    audio.addView(label("如只有提示音没有中文播报，请检查手机TTS语音引擎和媒体音量。",12f,muted))
    val actions=card()
    actions.addView(label("数据操作",18f,ink,true),margins(10))
    pair(actions,button("复制单号",true){copyCodes()},button("导出/分享 Excel"){exportBatch()})
    val help=card()
    help.addView(label("模糊条码怎么办？",17f,ink,true),margins(7))
    help.addView(label("点击取景画面可对焦，也可以调整距离、角度或打开补光。扫不出来就拍照留底，所有照片集中在“失败件”页面统一补录。",14f,muted),margins(10))
    help.addView(label("照片保存在手机本地的应用专用 files/photos 目录，普通相册不会自动显示。点记录里的照片可全屏放大、分享或另存到手机。卸载软件会删除本机记录和照片。Excel不嵌入照片。",13f,muted),margins(10))
    help.addView(button("打开系统应用设置"){
      startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+packageName)))
    },margins(5))
  }
  private fun stopCamera(){
    strictGate.reset()
    scanOverlay?.clearTarget()
    scanOverlay=null
    feedbackSequence++
    feedbackCard=null;feedbackIcon=null;feedbackTitle=null;feedbackCode=null
    scanRowsBox=null
    scanSearch=null
    scanCount=null
    pendingQueueButton=null
    repairTarget=null
    provider?.unbindAll()
    provider=null;camera=null;imageCapture=null;previewView=null;flashlight=false
  }
}
