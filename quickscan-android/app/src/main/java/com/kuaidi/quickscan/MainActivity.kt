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
import android.os.VibrationEffect
import android.net.Uri
import android.app.Dialog
import android.view.WindowManager
import androidx.core.content.FileProvider
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
  private val strictGate=StrictBarcodeGate()
  private var latestAcceptedCode=""
  private var scanRowsBox:LinearLayout?=null
  private var scanSearch:EditText?=null
  private var scanCount:TextView?=null
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
  private var lastCode=""
  private var lastAt=0L
  private val captureBusy=AtomicBoolean(false)
  private var latestCodeView:TextView?=null
  private var latestStatusView:TextView?=null
  private var retryPhotoForRow:Long?=null
  private var retryPhotoCode:String?=null
  private var flashlight=false
  private var voiceEnabled=true
  private var vibrationEnabled=true
  private var voice:TextToSpeech?=null
  private var speechReady=false
  private var exportDetail=true
  private var pendingPhotoSave:String?=null
  private val barcodeScanner by lazy { BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(
    Barcode.FORMAT_CODE_128,Barcode.FORMAT_ITF
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
    val first=db.batches().firstOrNull()
    activeBatch=first?.id?:0L
    batchName=first?.name?:""
    showHome()
  }
  override fun onDestroy(){
    stopCamera()
    uiHandler.removeCallbacksAndMessages(null)
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
    listOf("▦ 批次" to "home","▥ 扫码" to "scan","⚙ 设置" to "settings").forEach{(title,tag)->
      val active=currentPage==tag
      val view=label(title,13f,if(active)primary else muted,active).apply{
        gravity=Gravity.CENTER;setPadding(dp(1),dp(12),dp(1),dp(12))
        if(active)background=shape(Color.rgb(234,242,255),14)
        setOnClickListener{when(tag){"home"->showHome();"scan"->showScan();else->showSettings()}}
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
    pair(intro,button("＋ 新建批次",true){newBatchDialog{showScan()}},button("开始扫码"){selectBatch{showScan()}})
    val batches=db.batches()
    val stats=card()
    stats.addView(label("累计 "+batches.sumOf{it.count}+" 件 · "+batches.size+" 个批次",17f,primary,true))
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
        val matches=db.all(null,q).take(80)
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

  private fun showBatch(){
    currentPage="home";stopCamera();shell("批次 "+batchName,"查看记录 · 导出表格")
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
        retryPhotoForRow=r.id
        retryPhotoCode=r.code
        val matching=db.batches().firstOrNull{it.id==r.batchId}
        activeBatch=r.batchId
        if(matching!=null)batchName=matching.name
        showScan()
        toast("对准面单，点击拍照图标为此记录补拍")
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
        if(v.isNotEmpty()&&db.all(r.batchId).any{it.id!=r.id&&it.code==v}){
          toast("⚠ 该批次已有相同单号")
        }else{db.update(r.id,v,note.text.toString());refresh()}
      }.show()
  }
  private fun refresh(){when(currentPage){"home"->showBatch();"search"->showSearch();"scan"->showScan()}}
  private fun updateScanOutcome(code:String,status:String,color:Int){
    if(currentPage!="scan")return
    val card=feedbackCard ?:return
    feedbackTitle?.text=status
    feedbackTitle?.setTextColor(color)
    feedbackCode?.text=code.ifBlank{"请检查条码"}
    feedbackIcon?.text=if(status.contains("重复")||status.contains("失败"))"!" else "✓"
    feedbackIcon?.background=GradientDrawable().apply{
      shape=GradientDrawable.OVAL
      setColor(color)
    }
    card.visibility=View.VISIBLE
    feedbackSequence++
    val current=feedbackSequence
    uiHandler.postDelayed({
      if(feedbackSequence==current && currentPage=="scan")card.visibility=View.GONE
    },if(status.contains("失败"))2300L else 1450L)
  }
  private fun onStableCandidate(code:String){
    if(currentPage!="scan"||captureBusy.get())return
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
  private fun showScan(){
    if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){
      permissionRequest.launch(Manifest.permission.CAMERA);return
    }
    if(activeBatch==0L){selectBatch{showScan()};return}
    currentPage="scan"
    stopCamera()
    strictGate.reset()
    val windowRoot=FrameLayout(this).apply{setBackgroundColor(Color.WHITE)}
    val root=container().apply{setBackgroundColor(Color.WHITE)}
    windowRoot.addView(root,FrameLayout.LayoutParams(-1,-1))
    setContentView(windowRoot)

    val top=container(false).apply{
      gravity=Gravity.CENTER_VERTICAL
      setBackgroundColor(Color.WHITE)
      setPadding(dp(14),dp(7),dp(14),dp(7))
    }
    val back=label("‹",29f,ink,true).apply{
      gravity=Gravity.CENTER
      contentDescription="返回首页"
      setOnClickListener{showHome()}
    }
    top.addView(back,LinearLayout.LayoutParams(dp(38),dp(40)))
    val heading=container().apply{gravity=Gravity.CENTER_VERTICAL}
    heading.addView(label(batchName,19f,ink,true))
    top.addView(heading,LinearLayout.LayoutParams(0,-2,1f))
    top.addView(button("切换批次"){selectBatch{showScan()}},
      LinearLayout.LayoutParams(dp(92),-2))
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
    listOf(
      iconAction(R.drawable.ic_action_camera,"拍照"){takePhoto(retryPhotoForRow,retryPhotoCode)},
      iconAction(R.drawable.ic_action_flash,"补光"){
        flashlight=!flashlight
        camera?.cameraControl?.enableTorch(flashlight)
      },
      iconAction(R.drawable.ic_action_keyboard,"录入"){
        prompt("手动输入单号","请核对条码下方单号"){addCode(it)}
      },
      iconAction(R.drawable.ic_action_records,"批次记录"){showBatch()}
    ).forEach{controls.addView(it,LinearLayout.LayoutParams(0,-2,1f))}
    root.addView(controls)

    root.addView(View(this).apply{setBackgroundColor(Color.rgb(227,233,241))},
      LinearLayout.LayoutParams(-1,dp(1)))

    val bottom=container().apply{
      setPadding(dp(14),dp(12),dp(14),dp(8))
      setBackgroundColor(Color.WHITE)
    }
    val titleRow=container(false).apply{gravity=Gravity.CENTER_VERTICAL}
    scanCount=label("扫码记录",17f,ink,true)
    titleRow.addView(scanCount,LinearLayout.LayoutParams(0,-2,1f))
    titleRow.addView(button("导出 Excel"){exportBatch()})
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
    feedbackCode=label("",23f,Color.WHITE,true).apply{setTextIsSelectable(true);maxLines=1}
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
        val analyzer=ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        analyzer.setAnalyzer(executor){proxy->analyze(proxy)}
        camera=p.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,preview,imageCapture,analyzer)
      }catch(e:Exception){toast("相机启动失败："+e.message);announce("failure")}
    },ContextCompat.getMainExecutor(this))
  }
  @androidx.camera.core.ExperimentalGetImage
  private fun analyze(proxy:ImageProxy){
    val media=proxy.image
    if(media==null||captureBusy.get()||!processing.compareAndSet(false,true)){
      proxy.close();return
    }
    val image=InputImage.fromMediaImage(media,proxy.imageInfo.rotationDegrees)
    val rotated=proxy.imageInfo.rotationDegrees%180!=0
    val w=if(rotated)media.height else media.width
    val h=if(rotated)media.width else media.height
    barcodeScanner.process(image).addOnSuccessListener{codes->
      if(currentPage=="scan" && !captureBusy.get()){
        val selected=strictGate.select(codes,w,h)
        scanOverlay?.updateTarget(selected,w,h)
        val result=strictGate.observeSelected(selected,w,h,System.currentTimeMillis())
        if(result!=null)runOnUiThread{
          if(currentPage=="scan"&&!captureBusy.get())onStableCandidate(result)
        }
      }
    }.addOnCompleteListener{processing.set(false);proxy.close()}
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
      toast("登记失败："+e.message);announce("failure");return
    }
    if(saved<0L){
      updateScanOutcome(code,"重复单号 · 已自动拦截",Color.rgb(245,76,81))
      val now=System.currentTimeMillis()
      if(duplicateAnnounced!=code||now-duplicateTime>1700L){
        duplicateAnnounced=code;duplicateTime=now
        announce("duplicate")
      }
      return
    }
    latestAcceptedCode=code
    if(fromCamera){
      updateScanOutcome(code,"✓ 已登记 · 照片保存中",Color.rgb(36,151,94))
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
    if(capture==null){
      captureBusy.set(false);toast("相机启动中，请稍后再拍");announce("failure")
      if(forRow!=null)updateScanOutcome(displayCode?:lastCode,"照片失败 · 记录已保留",Color.rgb(198,57,57))
      return
    }
    val batchAtCapture=activeBatch
    val dir=File(filesDir,"photos").apply{mkdirs()}
    val file=File(dir,"scan_"+System.currentTimeMillis()+"_"+(100..999).random()+".jpg")
    capture.takePicture(
      ImageCapture.OutputFileOptions.Builder(file).build(),
      ContextCompat.getMainExecutor(this),
      object:ImageCapture.OnImageSavedCallback{
        override fun onImageSaved(result:ImageCapture.OutputFileResults){
          try{
            if(forRow!=null){
              db.attachPhoto(forRow,file.absolutePath)
              updateScanOutcome(displayCode?:lastCode,"✓ 单号及照片均已保存",Color.rgb(36,151,94))
              announce("success")
            }else{
              db.save(batchAtCapture,"",file.absolutePath)
              toast("照片已保存，之后可补录单号")
            }
            if(retryPhotoForRow==forRow && forRow!=null){retryPhotoForRow=null;retryPhotoCode=null}
            updateRecent()
          }catch(e:Exception){
            toast("照片关联失败："+e.message);announce("failure")
            if(forRow!=null)updateScanOutcome(displayCode?:lastCode,"照片关联失败 · 单号已保留",Color.rgb(198,57,57))
          }finally{captureBusy.set(false)}
        }
        override fun onError(exception:ImageCaptureException){
          file.delete()
          captureBusy.set(false)
          toast("拍照失败，单号已保留："+exception.message)
          if(forRow!=null)updateScanOutcome(displayCode?:lastCode,"照片保存失败 · 单号已保留，可补拍",Color.rgb(198,57,57))
          announce("failure")
          updateRecent()
        }
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
  private fun showSettings(){
    currentPage="settings";stopCamera();shell("设置与说明","语音提示 · Excel 导出 · 数据安全")
    val info=card()
    info.addView(label("快递快扫 v0.12",21f,ink,true),margins(8))
    info.addView(label("极速识别：CODE128 连续2帧、ITF 连续3帧同码校验，自动登记并拍照；数据库事务和唯一索引防止同一批次单号重复。拍照完成才提示成功，请保持面单在镜头内。",13f,muted))
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
    pair(actions,button("复制单号",true){copyCodes()},button("导出/分享 Excel"){exportBatch()})
    val help=card()
    help.addView(label("模糊条码怎么办？",17f,ink,true),margins(7))
    help.addView(label("调整距离、角度或打开手电筒；扫不出来就拍照留底，稍后打开记录补录单号。",14f,muted),margins(10))
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
    latestCodeView=null
    latestStatusView=null
    provider?.unbindAll()
    provider=null;camera=null;imageCapture=null;previewView=null;flashlight=false
  }
  @Deprecated("Deprecated in Java")
  override fun onBackPressed(){
    when(currentPage){"scan"->showHome();"home"->showHome();else->showHome()}
  }
}
