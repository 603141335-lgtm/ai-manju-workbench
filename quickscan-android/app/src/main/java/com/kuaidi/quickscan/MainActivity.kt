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
import android.os.VibrationEffect
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.*
import android.text.Editable
import android.text.TextWatcher
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
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
  private var provider:ProcessCameraProvider?=null
  private var camera:androidx.camera.core.Camera?=null
  private var imageCapture:ImageCapture?=null
  private var previewView:PreviewView?=null
  private val executor=Executors.newSingleThreadExecutor()
  private val processing=AtomicBoolean(false)
  private var lastCode=""
  private var lastAt=0L
  private var autoPhoto=false
  private var duplicates=false
  private var flashlight=false
  private var voiceEnabled=true
  private var vibrationEnabled=true
  private var voice:TextToSpeech?=null
  private var speechReady=false
  private var exportDetail=true
  private val barcodeScanner by lazy { BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(
    Barcode.FORMAT_CODE_128,Barcode.FORMAT_CODE_39,Barcode.FORMAT_CODE_93,Barcode.FORMAT_ITF,
    Barcode.FORMAT_EAN_13,Barcode.FORMAT_EAN_8,Barcode.FORMAT_UPC_A,Barcode.FORMAT_UPC_E,Barcode.FORMAT_CODABAR
  ).build()) }
  private val permissionRequest=registerForActivityResult(ActivityResultContracts.RequestPermission()){granted->
    if(granted)showScan() else {toast("请允许相机权限才能扫码拍照");announce("failure")}
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
          runOnUiThread{toast("✓ Excel导出成功 · "+rows.size+"条")}
        }catch(e:Exception){
          runOnUiThread{toast("Excel导出失败："+e.message);announce("failure")}
        }
      }.start()
    }
  }
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState)
    db=ScanDb(this)
    voiceEnabled=getPreferences(MODE_PRIVATE).getBoolean("voiceEnabled",true)
    vibrationEnabled=getPreferences(MODE_PRIVATE).getBoolean("vibrationEnabled",true)
    voice=TextToSpeech(this){status->
      if(status==TextToSpeech.SUCCESS){
        val result=voice?.setLanguage(Locale.SIMPLIFIED_CHINESE)
        speechReady=result!=null && result!=TextToSpeech.LANG_MISSING_DATA && result!=TextToSpeech.LANG_NOT_SUPPORTED
      }
    }
    val first=db.batches().firstOrNull()
    activeBatch=first?.id?:0L
    batchName=first?.name?:""
    showHome()
  }
  override fun onDestroy(){
    stopCamera()
    if(executor.isShutdown.not())executor.shutdown()
    if(barcodeScanner!=null)barcodeScanner.close()
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
  private fun shell(title:String,sub:String){
    val root=container().apply{setBackgroundColor(canvasColor)}
    setContentView(root)
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
    listOf("▦ 批次" to "home","▥ 扫码" to "scan","⌕ 查件" to "search","⚙ 设置" to "settings").forEach{(title,tag)->
      val active=currentPage==tag
      val view=label(title,13f,if(active)primary else muted,active).apply{
        gravity=Gravity.CENTER;setPadding(dp(1),dp(12),dp(1),dp(12))
        if(active)background=shape(Color.rgb(234,242,255),14)
        setOnClickListener{when(tag){"home"->showHome();"scan"->showScan();"search"->showSearch();else->showSettings()}}
      }
      navigation.addView(view,LinearLayout.LayoutParams(0,-2,1f).apply{leftMargin=dp(3);rightMargin=dp(3)})
    }
    root.addView(navigation)
  }
  private fun announce(kind:String){
    val phrase=when(kind){"success"->"成功";"duplicate"->"重复";else->"失败"}
    if(vibrationEnabled){
      try{(getSystemService(VIBRATOR_SERVICE) as Vibrator)
        .vibrate(VibrationEffect.createOneShot(if(kind=="success")65L else 160L,85))}
      catch(_:Exception){}
    }
    if(!voiceEnabled)return
    if(speechReady){
      try{
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
      tone.startTone(which,if(kind=="success")160 else 300)
      android.os.Handler(mainLooper).postDelayed({tone.release()},400)
    }catch(_:Exception){}
  }
  private fun toast(t:String)=Toast.makeText(this,t,Toast.LENGTH_SHORT).show()
  private fun formatTime(t:Long)=SimpleDateFormat("yyyy-MM-dd HH:mm:ss",Locale.CHINA).format(Date(t))
  private fun today()=SimpleDateFormat("MMdd",Locale.CHINA).format(Date())
  private fun csv(t:String)="\""+t.replace("\"","\"\"")+"\""
  private fun prompt(title:String,hint:String,default:String="",accept:(String)->Unit){
    val edit=input(hint,default);val holder=container().apply{setPadding(dp(17),dp(10),dp(17),0);addView(edit)}
    AlertDialog.Builder(this).setTitle(title).setView(holder)
      .setNegativeButton("取消",null).setPositiveButton("确定"){_,_->
        accept(edit.text.toString().trim())
      }.show()
  }
  private fun selectBatch(then:()->Unit){
    val batches=db.batches()
    if(batches.isEmpty()){
      prompt("新建扫码批次","如："+today(),today()){name->
        if(name.isNotBlank()){activeBatch=db.newBatch(name);batchName=name;then()}
      }
      return
    }
    AlertDialog.Builder(this).setTitle("选择扫码批次").setItems(batches.map{it.name+" · "+it.count+" 件"}.toTypedArray()){_,which->
      activeBatch=batches[which].id;batchName=batches[which].name;then()
    }.setNeutralButton("新建"){_,_->
      prompt("新建批次","批次名称",today()){name->
        if(name.isNotBlank()){activeBatch=db.newBatch(name);batchName=name;then()}
      }
    }.show()
  }
  private fun showHome(){
    currentPage="home";stopCamera();shell("快递快扫","离线扫码 · 一键拍照 · 批次登记")
    val intro=card()
    intro.addView(label("今日快递登记",20f,ink,true),margins(5))
    intro.addView(label("仅识别快递一维条形码 · 离线保存 · 语音播报",12f,muted),margins(14))
    pair(intro,button("＋ 新建批次",true){
      prompt("新建批次","例如 "+today(),today()){name->
        if(name.isNotEmpty()){activeBatch=db.newBatch(name);batchName=name;showBatch()}
      }
    },button("开始扫码"){selectBatch{showScan()}})
    val batches=db.batches()
    val stat=card()
    stat.addView(label("📦  "+batches.size+" 个批次",17f,ink,true),margins(4))
    stat.addView(label("累计登记 "+batches.sumOf{it.count}+" 条快递记录",14f,primary,true))
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
  private fun showBatch(){
    currentPage="home";stopCamera();shell("批次 "+batchName,"查看记录 · 导出表格")
    val summary=card()
    summary.addView(label(db.all(activeBatch).size.toString()+" 条记录",22f,primary,true),margins(13))
    pair(summary,button("连续扫码",true){showScan()},button("导出 Excel"){exportBatch()})
    pair(summary,button("拍照留底"){showScan();toast("点击扫码页的拍照按钮")},button("手动录入"){
      prompt("录入快递单号","快递单条码下方数字"){addCode(it)}
    })
    pair(summary,button("复制单号"){copyCodes()},button("切换批次"){selectBatch{showBatch()}})
    val list=card()
    list.addView(label("本批记录",17f,ink,true),margins(9))
    db.all(activeBatch).forEach{addRow(list,it)}
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
    val layout=container().apply{setPadding(dp(16),dp(8),dp(16),0)}
    if(r.photo.isNotEmpty()&&File(r.photo).exists()){
      val image=ImageView(this).apply{
        setImageURI(Uri.fromFile(File(r.photo)));adjustViewBounds=true
        scaleType=ImageView.ScaleType.FIT_CENTER
      }
      layout.addView(image,LinearLayout.LayoutParams(-1,dp(240)))
    }
    val code=input("补录条码下方的数字",r.code)
    val note=input("备注",r.note)
    layout.addView(code,margins(9));layout.addView(note,margins(8))
    AlertDialog.Builder(this).setTitle("快递详情 · "+formatTime(r.time)).setView(layout)
      .setNegativeButton("取消",null)
      .setNeutralButton("删除"){_,_->
        AlertDialog.Builder(this).setTitle("确认删除？").setPositiveButton("删除"){_,_->
          if(r.photo.isNotEmpty())File(r.photo).delete()
          db.delete(r.id);refresh()
        }.setNegativeButton("取消",null).show()
      }.setPositiveButton("保存"){_,_->
        val v=code.text.toString().trim().replace(" ","")
        if(v.isNotBlank()&&!valid(v)){toast("单号只支持字母数字和横线");return@setPositiveButton}
        if(v.isNotEmpty()&&!duplicates&&db.all(r.batchId).any{it.id!=r.id&&it.code==v}){
          toast("⚠ 该批次已有相同单号")
        }else{db.update(r.id,v,note.text.toString());refresh()}
      }.show()
  }
  private fun refresh(){when(currentPage){"home"->showBatch();"search"->showSearch();"scan"->showScan()}}
  private fun showScan(){
    if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){
      permissionRequest.launch(Manifest.permission.CAMERA);return
    }
    if(activeBatch==0L){selectBatch{showScan()};return}
    currentPage="scan";stopCamera();shell("连续扫码 · "+batchName,"一维条形码专用 · 扫不上就拍照")
    val box=card()
    box.addView(label("▥  对准快递条形码",17f,ink,true),margins(5))
    box.addView(label("成功读“成功” · 重复读“重复”",12f,muted),margins(11))
    val view=PreviewView(this).apply{
      scaleType=PreviewView.ScaleType.FILL_CENTER
      background=shape(Color.rgb(28,34,50),15)
    }
    previewView=view
    val frame=FrameLayout(this)
    frame.addView(view,FrameLayout.LayoutParams(-1,-1))
    val overlay=label("▱  对准横向条形码  ▱",18f,Color.WHITE,true).apply{
      gravity=Gravity.CENTER;background=shape(Color.argb(90,28,34,50),12)
    }
    frame.addView(overlay,FrameLayout.LayoutParams(-1,dp(56),Gravity.CENTER))
    box.addView(frame,LinearLayout.LayoutParams(-1,dp(260)).apply{bottomMargin=dp(12)})
    pair(box,button("📷 拍照留底",true){takePhoto()},button("🔦 手电筒"){
      flashlight=!flashlight;camera?.cameraControl?.enableTorch(flashlight)
    })
    box.addView(label("识别不到也可以先拍照片，再从记录中补录单号",12f,muted),margins(10))
    pair(box,button("手动录入"){
      prompt("手动输入单号","快递条码下方数字"){addCode(it)}
    },button("本批记录"){showBatch()})
    val flags=card()
    flags.addView(CheckBox(this).apply{
      text="扫码成功自动拍照（连续扫码会略慢）";isChecked=autoPhoto
      setOnCheckedChangeListener{_,v->autoPhoto=v}
    })
    flags.addView(CheckBox(this).apply{
      text="允许相同快递单号重复登记";isChecked=duplicates
      setOnCheckedChangeListener{_,v->duplicates=v}
    })
    val latest=card()
    latest.tag="recent"
    showRecent(latest)
    startCamera(view)
  }
  private fun showRecent(box:LinearLayout){
    box.removeAllViews()
    box.addView(label("最近扫码",17f,ink,true),margins(9))
    db.all(activeBatch).take(7).forEach{addRow(box,it)}
  }
  private fun updateRecent(){
    if(currentPage!="scan")return
    for(i in 0 until page.childCount){
      val v=page.getChildAt(i)
      if(v.tag=="recent"&&v is LinearLayout){showRecent(v);return}
    }
  }
  private fun startCamera(view:PreviewView){
    val future=ProcessCameraProvider.getInstance(this)
    future.addListener({
      try{
        if(currentPage!="scan"||previewView!==view)return@addListener
        val p=future.get();provider=p;p.unbindAll()
        val preview=Preview.Builder().build().also{it.surfaceProvider=view.surfaceProvider}
        imageCapture=ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build()
        val analyzer=ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        analyzer.setAnalyzer(executor){proxy->analyze(proxy)}
        camera=p.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,preview,imageCapture,analyzer)
      }catch(e:Exception){toast("相机启动失败："+e.message);announce("failure")}
    },ContextCompat.getMainExecutor(this))
  }
  @androidx.camera.core.ExperimentalGetImage
  private fun analyze(proxy:ImageProxy){
    val media=proxy.image
    if(media==null||!processing.compareAndSet(false,true)){proxy.close();return}
    val input=InputImage.fromMediaImage(media,proxy.imageInfo.rotationDegrees)
    barcodeScanner.process(input).addOnSuccessListener{items->
      val result=items.firstOrNull{it.rawValue!=null}?.rawValue?.trim().orEmpty()
      if(valid(result)){
        val now=System.currentTimeMillis()
        if(result!=lastCode||now-lastAt>3000){
          lastCode=result;lastAt=now;runOnUiThread{if(currentPage=="scan")addCode(result)}
        }
      }
    }.addOnCompleteListener{processing.set(false);proxy.close()}
  }
  private fun valid(v:String)=v.matches(Regex("[A-Za-z0-9_-]{6,80}"))
  private fun addCode(raw:String){
    if(activeBatch==0L){toast("请先新建批次");announce("failure");return}
    val code=raw.trim().replace(" ","")
    if(!valid(code)){toast("请输入有效的快递单号");announce("failure");return}
    if(!duplicates&&db.duplicate(activeBatch,code)){toast("⚠ 重复件："+code);announce("duplicate");return}
    val saved=db.save(activeBatch,code)
    announce("success")
    toast("✓ 已登记："+code);updateRecent()
    if(autoPhoto)takePhoto(saved)
  }
  private fun takePhoto(forRow:Long?=null){
    val capture=imageCapture
    if(capture==null){toast("相机启动中，请稍后再拍");announce("failure");return}
    val dir=File(filesDir,"photos").apply{mkdirs()}
    val file=File(dir,"scan_"+System.currentTimeMillis()+"_"+(100..999).random()+".jpg")
    capture.takePicture(
      ImageCapture.OutputFileOptions.Builder(file).build(),
      ContextCompat.getMainExecutor(this),
      object:ImageCapture.OnImageSavedCallback{
        override fun onImageSaved(result:ImageCapture.OutputFileResults){
          if(forRow!=null)db.attachPhoto(forRow,file.absolutePath)
          else if(activeBatch!=0L)db.save(activeBatch,"",file.absolutePath)
          toast("照片已保存，可随时补录");updateRecent()
        }
        override fun onError(exception:ImageCaptureException){toast("拍照失败："+exception.message);announce("failure")}
      }
    )
  }
  private fun showSearch(){
    currentPage="search";stopCamera();shell("单号查询","完整单号、末四位及备注都可以搜")
    val box=card()
    val query=input("输入单号或末四位")
    box.addView(query,margins(12))
    val results=container();box.addView(results)
    fun display(q:String){
      results.removeAllViews()
      val found=if(q.isBlank())emptyList() else db.all(null,q).take(100)
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
  private fun exportBatch(){
    if(activeBatch==0L){toast("请先新建批次");announce("failure");return}
    AlertDialog.Builder(this).setTitle("导出 Excel 文件")
      .setItems(arrayOf("完整明细：单号、时间、备注、照片状态","仅单号：方便粘贴到腾讯文档")){_,which->
        exportDetail=which==0
        val suffix=if(exportDetail)"完整明细" else "仅单号"
        exportRequest.launch("快递快扫_"+batchName+"_"+suffix+".xlsx")
      }.setNegativeButton("取消",null).show()
  }
  private fun showSettings(){
    currentPage="settings";stopCamera();shell("设置与说明","语音提示 · Excel 导出 · 数据安全")
    val info=card()
    info.addView(label("快递快扫 v0.6",21f,ink,true),margins(8))
    info.addView(label("只扫常见一维快递条形码 · 不识别二维码 · 不限次数",13f,muted))
    val audio=card()
    audio.addView(label("扫码声音",18f,ink,true),margins(6))
    audio.addView(label("成功读“成功”，重复读“重复”，输入或拍照错误读“失败”",12f,muted),margins(8))
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
    pair(actions,button("复制单号",true){copyCodes()},button("导出 Excel"){exportBatch()})
    val help=card()
    help.addView(label("模糊条码怎么办？",17f,ink,true),margins(7))
    help.addView(label("调整距离、角度或打开手电筒；扫不出来就拍照留底，稍后打开记录补录单号。",14f,muted),margins(10))
    help.addView(label("记录和照片保存在本机。Excel包含单号、时间、备注和照片状态，但不包含照片文件本体。卸载软件会清空应用内数据。",13f,muted),margins(10))
    help.addView(button("打开系统应用设置"){
      startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+packageName)))
    },margins(5))
  }
  private fun stopCamera(){
    provider?.unbindAll()
    provider=null;camera=null;imageCapture=null;previewView=null;flashlight=false
  }
  @Deprecated("Deprecated in Java")
  override fun onBackPressed(){
    when(currentPage){"scan"->showBatch();"home"->showHome();else->showHome()}
  }
}
