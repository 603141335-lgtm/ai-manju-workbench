package com.kuaidi.quickscan

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class ScanRow(val id:Long,val batchId:Long,val code:String,val time:Long,val photo:String,val note:String)
data class BatchRow(val id:Long,val name:String,val created:Long,val count:Int)

class ScanDb(context:Context):SQLiteOpenHelper(context,"quickscan_offline.db",null,1) {
  override fun onCreate(db:SQLiteDatabase) {
    db.execSQL("CREATE TABLE batches(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,created INTEGER NOT NULL)")
    db.execSQL("CREATE TABLE scans(id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id INTEGER NOT NULL,code TEXT NOT NULL DEFAULT '',time INTEGER NOT NULL,photo TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '')")
    db.execSQL("CREATE INDEX idx_code ON scans(code)")
    db.execSQL("CREATE INDEX idx_batch_time ON scans(batch_id,time)")
  }
  override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int) {}
  fun newBatch(name:String):Long = writableDatabase.insertOrThrow("batches",null,ContentValues().apply{put("name",name);put("created",System.currentTimeMillis())})
  fun batches():List<BatchRow> = buildList {
    readableDatabase.rawQuery("SELECT b.id,b.name,b.created,COUNT(s.id) FROM batches b LEFT JOIN scans s ON s.batch_id=b.id GROUP BY b.id ORDER BY b.id DESC",null).use{c->
      while(c.moveToNext())add(BatchRow(c.getLong(0),c.getString(1),c.getLong(2),c.getInt(3)))
    }
  }
  fun all(batch:Long?=null,query:String=""):List<ScanRow> = buildList {
    val clauses=mutableListOf<String>();val args=mutableListOf<String>()
    if(batch!=null){clauses.add("batch_id=?");args.add(batch.toString())}
    if(query.isNotEmpty()){clauses.add("(code LIKE ? OR note LIKE ?)");args.add("%"+query+"%");args.add("%"+query+"%")}
    val where=if(clauses.isEmpty())"" else " WHERE "+clauses.joinToString(" AND ")
    readableDatabase.rawQuery("SELECT id,batch_id,code,time,photo,note FROM scans"+where+" ORDER BY time DESC,id DESC LIMIT 20000",args.toTypedArray()).use{c->
      while(c.moveToNext())add(ScanRow(c.getLong(0),c.getLong(1),c.getString(2),c.getLong(3),c.getString(4),c.getString(5)))
    }
  }
  fun duplicate(batch:Long,code:String)=readableDatabase.rawQuery("SELECT 1 FROM scans WHERE batch_id=? AND code=? LIMIT 1",arrayOf(batch.toString(),code)).use{it.moveToFirst()}
  fun save(batch:Long,code:String,photo:String=""):Long = writableDatabase.insertOrThrow("scans",null,ContentValues().apply{
    put("batch_id",batch);put("code",code);put("photo",photo);put("time",System.currentTimeMillis())
  })
  fun attachPhoto(id:Long,path:String){writableDatabase.update("scans",ContentValues().apply{put("photo",path)},"id=?",arrayOf(id.toString()))}
  fun update(id:Long,code:String,note:String){writableDatabase.update("scans",ContentValues().apply{put("code",code);put("note",note)},"id=?",arrayOf(id.toString()))}
  fun delete(id:Long){writableDatabase.delete("scans","id=?",arrayOf(id.toString()))}
}
