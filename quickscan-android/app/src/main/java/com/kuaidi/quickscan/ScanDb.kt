package com.kuaidi.quickscan

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class ScanRow(
  val id:Long,
  val batchId:Long,
  val code:String,
  val time:Long,
  val photo:String,
  val note:String,
  val cloudStatus:String="",
  val cloudSummary:String="",
  val cloudSyncedAt:Long=0L
)
data class BatchRow(val id:Long,val name:String,val created:Long,val count:Int)

class ScanDb(context:Context):SQLiteOpenHelper(context,"quickscan_offline.db",null,4) {
  override fun onCreate(db:SQLiteDatabase){
    db.execSQL("CREATE TABLE batches(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,created INTEGER NOT NULL)")
    db.execSQL(
      "CREATE TABLE scans(" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "batch_id INTEGER NOT NULL," +
        "code TEXT NOT NULL DEFAULT ''," +
        "time INTEGER NOT NULL," +
        "photo TEXT NOT NULL DEFAULT ''," +
        "note TEXT NOT NULL DEFAULT ''," +
        "cloud_status TEXT NOT NULL DEFAULT ''," +
        "cloud_summary TEXT NOT NULL DEFAULT ''," +
        "cloud_synced_at INTEGER NOT NULL DEFAULT 0)"
    )
    db.execSQL("CREATE INDEX idx_code ON scans(code)")
    db.execSQL("CREATE INDEX idx_batch_time ON scans(batch_id,time)")
    db.execSQL("CREATE INDEX idx_batch_code ON scans(batch_id,code)")
    db.execSQL("CREATE INDEX idx_cloud_status ON scans(cloud_status)")
    db.execSQL("CREATE UNIQUE INDEX idx_unique_batch_code ON scans(batch_id,code) WHERE code<>''")
  }

  private fun hasColumn(db:SQLiteDatabase,table:String,column:String):Boolean {
    db.rawQuery("PRAGMA table_info($table)",null).use{c->
      while(c.moveToNext()){
        if(c.getString(1)==column)return true
      }
    }
    return false
  }

  override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int){
    if(oldVersion<2){
      db.execSQL("CREATE INDEX IF NOT EXISTS idx_batch_code ON scans(batch_id,code)")
    }
    if(oldVersion<3){
      val legacyDuplicates=db.rawQuery(
        "SELECT 1 FROM scans WHERE code<>'' GROUP BY batch_id,code HAVING COUNT(*)>1 LIMIT 1",null
      ).use{it.moveToFirst()}
      if(!legacyDuplicates){
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_batch_code ON scans(batch_id,code) WHERE code<>''")
      }
    }
    if(oldVersion<4){
      if(!hasColumn(db,"scans","cloud_status")){
        db.execSQL("ALTER TABLE scans ADD COLUMN cloud_status TEXT NOT NULL DEFAULT ''")
      }
      if(!hasColumn(db,"scans","cloud_summary")){
        db.execSQL("ALTER TABLE scans ADD COLUMN cloud_summary TEXT NOT NULL DEFAULT ''")
      }
      if(!hasColumn(db,"scans","cloud_synced_at")){
        db.execSQL("ALTER TABLE scans ADD COLUMN cloud_synced_at INTEGER NOT NULL DEFAULT 0")
      }
      db.execSQL("CREATE INDEX IF NOT EXISTS idx_cloud_status ON scans(cloud_status)")
    }
  }

  private val rowColumns="id,batch_id,code,time,photo,note,cloud_status,cloud_summary,cloud_synced_at"

  private fun readRow(c:Cursor):ScanRow = ScanRow(
    c.getLong(0),
    c.getLong(1),
    c.getString(2),
    c.getLong(3),
    c.getString(4),
    c.getString(5),
    c.getString(6) ?: "",
    c.getString(7) ?: "",
    c.getLong(8)
  )

  fun newBatch(name:String):Long = writableDatabase.insertOrThrow(
    "batches",null,ContentValues().apply{put("name",name);put("created",System.currentTimeMillis())}
  )
  fun batches():List<BatchRow> = buildList {
    readableDatabase.rawQuery(
      "SELECT b.id,b.name,b.created,COUNT(s.id) FROM batches b LEFT JOIN scans s ON s.batch_id=b.id GROUP BY b.id ORDER BY b.id DESC",null
    ).use{c->
      while(c.moveToNext())add(BatchRow(c.getLong(0),c.getString(1),c.getLong(2),c.getInt(3)))
    }
  }
  fun all(batch:Long?=null,query:String="",limit:Int=20000):List<ScanRow> = buildList {
    val clauses=mutableListOf<String>();val args=mutableListOf<String>()
    if(batch!=null){clauses.add("batch_id=?");args.add(batch.toString())}
    if(query.isNotEmpty()){
      clauses.add("(code LIKE ? OR note LIKE ? OR cloud_summary LIKE ?)")
      args.add("%"+query+"%");args.add("%"+query+"%");args.add("%"+query+"%")
    }
    val where=if(clauses.isEmpty())"" else " WHERE "+clauses.joinToString(" AND ")
    readableDatabase.rawQuery(
      "SELECT "+rowColumns+" FROM scans"+where+
        " ORDER BY time DESC,id DESC LIMIT "+limit.coerceIn(1,20000),args.toTypedArray()
    ).use{c->
      while(c.moveToNext())add(readRow(c))
    }
  }

  /** Photos captured when a label could not be decoded. Across all batches. */
  fun pendingPhotos(limit:Int=50):List<ScanRow> = buildList {
    readableDatabase.rawQuery(
      "SELECT "+rowColumns+" FROM scans "+
        "WHERE code='' AND photo<>'' ORDER BY time DESC,id DESC LIMIT "+limit.coerceIn(1,200),
      null
    ).use{c->
      while(c.moveToNext())add(readRow(c))
    }
  }

  fun pendingPhotoCount():Int=readableDatabase.rawQuery(
    "SELECT COUNT(*) FROM scans WHERE code='' AND photo<>''",null
  ).use{c->if(c.moveToFirst())c.getInt(0) else 0}

  fun find(id:Long):ScanRow?=readableDatabase.rawQuery(
    "SELECT "+rowColumns+" FROM scans WHERE id=?",arrayOf(id.toString())
  ).use{c-> if(c.moveToFirst()) readRow(c) else null}

  fun count(batch:Long):Int=readableDatabase.rawQuery(
    "SELECT COUNT(*) FROM scans WHERE batch_id=?",arrayOf(batch.toString())
  ).use{c->if(c.moveToFirst())c.getInt(0)else 0}

  fun recent(batch:Long,filter:String="",limit:Int=18):List<ScanRow> = buildList {
    val args=mutableListOf(batch.toString())
    var where=" WHERE batch_id=?"
    if(filter.isNotBlank()){
      where+=" AND (code LIKE ? OR note LIKE ? OR cloud_summary LIKE ?)"
      args.add("%"+filter+"%");args.add("%"+filter+"%");args.add("%"+filter+"%")
    }
    val sql="SELECT "+rowColumns+" FROM scans"+where+
      " ORDER BY time DESC,id DESC LIMIT "+limit.coerceIn(1,150)
    readableDatabase.rawQuery(sql,args.toTypedArray()).use{c->
      while(c.moveToNext())add(readRow(c))
    }
  }

  fun duplicate(batch:Long,code:String):Boolean=readableDatabase.rawQuery(
    "SELECT 1 FROM scans WHERE batch_id=? AND code=? LIMIT 1",
    arrayOf(batch.toString(),code)
  ).use{it.moveToFirst()}

  fun saveIfNew(batch:Long,code:String):Long {
    if(code.isBlank())return -1L
    val database=writableDatabase
    database.beginTransaction()
    try{
      val exists=database.rawQuery(
        "SELECT 1 FROM scans WHERE batch_id=? AND code=? LIMIT 1",
        arrayOf(batch.toString(),code)
      ).use{it.moveToFirst()}
      if(exists)return -1L
      val id=database.insertOrThrow("scans",null,ContentValues().apply{
        put("batch_id",batch);put("code",code);put("photo","")
        put("time",System.currentTimeMillis())
        put("cloud_status","pending")
        put("cloud_summary","")
        put("cloud_synced_at",0L)
      })
      database.setTransactionSuccessful()
      return id
    }finally{database.endTransaction()}
  }

  fun save(batch:Long,code:String,photo:String=""):Long {
    if(code.isNotBlank())return saveIfNew(batch,code)
    return writableDatabase.insertOrThrow("scans",null,ContentValues().apply{
      put("batch_id",batch);put("code",code);put("photo",photo)
      put("time",System.currentTimeMillis())
      put("cloud_status","")
      put("cloud_summary","")
      put("cloud_synced_at",0L)
    })
  }

  fun attachPhoto(id:Long,path:String):Boolean =
    writableDatabase.update("scans",ContentValues().apply{put("photo",path)},"id=?",arrayOf(id.toString()))>0

  fun update(id:Long,code:String,note:String):Boolean {
    val database=writableDatabase
    database.beginTransaction()
    try{
      var oldCode=""
      database.rawQuery("SELECT code FROM scans WHERE id=? LIMIT 1",arrayOf(id.toString())).use{c->
        if(c.moveToFirst())oldCode=c.getString(0) ?: ""
      }
      if(code.isNotEmpty()){
        val duplicate=database.rawQuery(
          "SELECT 1 FROM scans WHERE code=? AND batch_id=(SELECT batch_id FROM scans WHERE id=?) AND id<>? LIMIT 1",
          arrayOf(code,id.toString(),id.toString())
        ).use{it.moveToFirst()}
        if(duplicate)return false
      }
      val cv=ContentValues().apply{
        put("code",code);put("note",note)
        if(code.isNotBlank() && code!=oldCode){
          put("cloud_status","pending")
          put("cloud_summary","")
          put("cloud_synced_at",0L)
        }
      }
      val changed=database.update("scans",cv,"id=?",arrayOf(id.toString()))>0
      database.setTransactionSuccessful()
      return changed
    }finally{database.endTransaction()}
  }

  fun delete(id:Long){writableDatabase.delete("scans","id=?",arrayOf(id.toString()))}

  fun pendingSyncRows(limit:Int=120):List<ScanRow> = buildList {
    readableDatabase.rawQuery(
      "SELECT "+rowColumns+" FROM scans WHERE code<>'' AND (cloud_status='' OR cloud_status='pending' OR cloud_status='failed') "+
        "ORDER BY time ASC LIMIT "+limit.coerceIn(1,300),
      null
    ).use{c-> while(c.moveToNext()) add(readRow(c)) }
  }

  fun pendingSyncCount():Int=readableDatabase.rawQuery(
    "SELECT COUNT(*) FROM scans WHERE code<>'' AND (cloud_status='' OR cloud_status='pending' OR cloud_status='failed')",
    null
  ).use{c-> if(c.moveToFirst()) c.getInt(0) else 0}

  fun updateCloudResult(id:Long,status:String,summary:String){
    writableDatabase.update("scans",ContentValues().apply{
      put("cloud_status",status)
      put("cloud_summary",summary)
      put("cloud_synced_at",System.currentTimeMillis())
    },"id=?",arrayOf(id.toString()))
  }

  fun updateCloudStatusByCode(code:String,status:String,summary:String){
    if(code.isBlank())return
    writableDatabase.update("scans",ContentValues().apply{
      put("cloud_status",status)
      put("cloud_summary",summary)
      put("cloud_synced_at",System.currentTimeMillis())
    },"code=?",arrayOf(code))
  }

  fun recentCodesForStatusRefresh(batch:Long?=null,limit:Int=180):List<String> = buildList {
    val args=mutableListOf<String>()
    val where=if(batch!=null){
      args.add(batch.toString())
      " WHERE batch_id=? AND code<>''"
    }else{
      " WHERE code<>''"
    }
    readableDatabase.rawQuery(
      "SELECT DISTINCT code FROM scans"+where+" ORDER BY time DESC LIMIT "+limit.coerceIn(1,250),
      args.toTypedArray()
    ).use{c-> while(c.moveToNext()) add(c.getString(0)) }
  }

  /** Find the latest local waybill photo captured for a tracking code or its JD base code. */
  fun latestPhotoForBaseCodes(baseCodes:List<String>):String? {
    for(raw in baseCodes){
      val base=raw.trim().uppercase()
      if(base.length<4)continue
      readableDatabase.rawQuery(
        "SELECT photo FROM scans WHERE photo<>'' AND (UPPER(code)=? OR UPPER(code) LIKE ?) ORDER BY time DESC LIMIT 1",
        arrayOf(base,base+"-%")
      ).use{c->
        if(c.moveToFirst()){
          val path=c.getString(0)
          if(!path.isNullOrBlank())return path
        }
      }
    }
    return null
  }
}
