package com.kuaidi.quickscan

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class ScanRow(val id:Long,val batchId:Long,val code:String,val time:Long,val photo:String,val note:String)
data class BatchRow(val id:Long,val name:String,val created:Long,val count:Int)

class ScanDb(context:Context):SQLiteOpenHelper(context,"quickscan_offline.db",null,3) {
  override fun onCreate(db:SQLiteDatabase){
    db.execSQL("CREATE TABLE batches(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,created INTEGER NOT NULL)")
    db.execSQL("CREATE TABLE scans(id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id INTEGER NOT NULL,code TEXT NOT NULL DEFAULT '',time INTEGER NOT NULL,photo TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '')")
    db.execSQL("CREATE INDEX idx_code ON scans(code)")
    db.execSQL("CREATE INDEX idx_batch_time ON scans(batch_id,time)")
    db.execSQL("CREATE INDEX idx_batch_code ON scans(batch_id,code)")
    db.execSQL("CREATE UNIQUE INDEX idx_unique_batch_code ON scans(batch_id,code) WHERE code<>''")
  }

  override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int){
    if(oldVersion<2){
      db.execSQL("CREATE INDEX IF NOT EXISTS idx_batch_code ON scans(batch_id,code)")
    }
    if(oldVersion<3){
      // Preserve old entries and attached photos. A unique index can only be
      // added when no legacy duplicate values exist. New scans always use
      // a transaction-protected saveIfNew(), even on legacy databases.
      val legacyDuplicates=db.rawQuery(
        "SELECT 1 FROM scans WHERE code<>'' GROUP BY batch_id,code HAVING COUNT(*)>1 LIMIT 1",null
      ).use{it.moveToFirst()}
      if(!legacyDuplicates){
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_batch_code ON scans(batch_id,code) WHERE code<>''")
      }
    }
  }

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
    if(query.isNotEmpty()){clauses.add("(code LIKE ? OR note LIKE ?)");args.add("%"+query+"%");args.add("%"+query+"%")}
    val where=if(clauses.isEmpty())"" else " WHERE "+clauses.joinToString(" AND ")
    readableDatabase.rawQuery(
      "SELECT id,batch_id,code,time,photo,note FROM scans"+where+
        " ORDER BY time DESC,id DESC LIMIT "+limit.coerceIn(1,20000),args.toTypedArray()
    ).use{c->
      while(c.moveToNext())add(ScanRow(c.getLong(0),c.getLong(1),c.getString(2),c.getLong(3),c.getString(4),c.getString(5)))
    }
  }

  /** Photos captured when a label could not be decoded. Across all batches. */
  fun pendingPhotos(limit:Int=50):List<ScanRow> = buildList {
    readableDatabase.rawQuery(
      "SELECT id,batch_id,code,time,photo,note FROM scans "+
        "WHERE code='' AND photo<>'' ORDER BY time DESC,id DESC LIMIT "+limit.coerceIn(1,200),
      null
    ).use{c->
      while(c.moveToNext())add(ScanRow(c.getLong(0),c.getLong(1),c.getString(2),c.getLong(3),c.getString(4),c.getString(5)))
    }
  }

  fun pendingPhotoCount():Int=readableDatabase.rawQuery(
    "SELECT COUNT(*) FROM scans WHERE code='' AND photo<>''",null
  ).use{c->if(c.moveToFirst())c.getInt(0) else 0}

  fun find(id:Long):ScanRow?=readableDatabase.rawQuery(
    "SELECT id,batch_id,code,time,photo,note FROM scans WHERE id=?",arrayOf(id.toString())
  ).use{c->
    if(c.moveToFirst())ScanRow(c.getLong(0),c.getLong(1),c.getString(2),c.getLong(3),c.getString(4),c.getString(5)) else null
  }

  fun count(batch:Long):Int=readableDatabase.rawQuery(
    "SELECT COUNT(*) FROM scans WHERE batch_id=?",arrayOf(batch.toString())
  ).use{c->if(c.moveToFirst())c.getInt(0)else 0}

  fun recent(batch:Long,filter:String="",limit:Int=18):List<ScanRow> = buildList {
    val args=mutableListOf(batch.toString())
    var where=" WHERE batch_id=?"
    if(filter.isNotBlank()){
      where+=" AND (code LIKE ? OR note LIKE ?)"
      args.add("%"+filter+"%");args.add("%"+filter+"%")
    }
    val sql="SELECT id,batch_id,code,time,photo,note FROM scans"+where+
      " ORDER BY time DESC,id DESC LIMIT "+limit.coerceIn(1,150)
    readableDatabase.rawQuery(sql,args.toTypedArray()).use{c->
      while(c.moveToNext())add(ScanRow(c.getLong(0),c.getLong(1),c.getString(2),c.getLong(3),c.getString(4),c.getString(5)))
    }
  }

  fun duplicate(batch:Long,code:String):Boolean=readableDatabase.rawQuery(
    "SELECT 1 FROM scans WHERE batch_id=? AND code=? LIMIT 1",
    arrayOf(batch.toString(),code)
  ).use{it.moveToFirst()}

  /**
   * Single transaction protects against re-entrant camera callbacks. Returns
   * -1 when already saved. A partial unique index adds DB-level enforcement
   * without restricting photo-only rows whose code is blank.
   */
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
    })
  }

  fun attachPhoto(id:Long,path:String):Boolean =
    writableDatabase.update("scans",ContentValues().apply{put("photo",path)},"id=?",arrayOf(id.toString()))>0
  fun update(id:Long,code:String,note:String):Boolean {
    val database=writableDatabase
    database.beginTransaction()
    try{
      if(code.isNotEmpty()){
        val duplicate=database.rawQuery(
          "SELECT 1 FROM scans WHERE code=? AND batch_id=(SELECT batch_id FROM scans WHERE id=?) AND id<>? LIMIT 1",
          arrayOf(code,id.toString(),id.toString())
        ).use{it.moveToFirst()}
        if(duplicate)return false
      }
      val changed=database.update("scans",ContentValues().apply{
        put("code",code);put("note",note)
      },"id=?",arrayOf(id.toString()))>0
      database.setTransactionSuccessful()
      return changed
    }finally{database.endTransaction()}
  }
  fun delete(id:Long){writableDatabase.delete("scans","id=?",arrayOf(id.toString()))}
}
