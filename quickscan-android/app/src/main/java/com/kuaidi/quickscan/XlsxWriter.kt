package com.kuaidi.quickscan

import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Create a real Office Open XML .xlsx file, keeping parcel IDs as text. */
object XlsxWriter {
  private fun xml(s:String):String = s.filter{it=='\t'||it=='\r'||it=='\n'||it.code>=32}
    .replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
    .replace("\"","&quot;").replace("'","&apos;")

  private fun cell(col:String,row:Int,content:String):String =
    "<c r=\""+col+row+"\" t=\"inlineStr\"><is><t xml:space=\"preserve\">"+
    xml(content)+"</t></is></c>"

  private fun worksheet(rows:List<ScanRow>,detail:Boolean):String {
    val out=StringBuilder(1024+rows.size*230)
    val fmt=SimpleDateFormat("yyyy-MM-dd HH:mm:ss",Locale.CHINA)
    out.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>")
    out.append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">")
    out.append("<cols><col min=\"1\" max=\"1\" width=\"29\" customWidth=\"1\"/>")
    if(detail)out.append("<col min=\"2\" max=\"2\" width=\"23\" customWidth=\"1\"/><col min=\"3\" max=\"3\" width=\"32\" customWidth=\"1\"/>")
    out.append("</cols><sheetData>")
    out.append("<row r=\"1\">")
    if(detail){
      listOf("快递单号","扫描时间","备注","是否有照片").forEachIndexed{idx,s->
        out.append(cell(('A'.code+idx).toChar().toString(),1,s))
      }
    }else out.append(cell("A",1,"快递单号"))
    out.append("</row>")
    var index=2
    for(r in rows){
      if(!detail && r.code.isBlank())continue
      out.append("<row r=\"").append(index).append("\">")
      out.append(cell("A",index,r.code))
      if(detail){
        out.append(cell("B",index,fmt.format(Date(r.time))))
        val note=r.note.trim()
        val exportNote=if(note.isEmpty())"已结算" else if(note.endsWith("已结算"))note else note+"；已结算"
        out.append(cell("C",index,exportNote))
        out.append(cell("D",index,if(r.photo.isBlank())"无" else "有"))
      }
      out.append("</row>")
      index++
    }
    out.append("</sheetData></worksheet>")
    return out.toString()
  }

  fun write(target:OutputStream,rows:List<ScanRow>,detail:Boolean){
    ZipOutputStream(target).use{zip->
      fun entry(name:String,value:String){
        zip.putNextEntry(ZipEntry(name))
        zip.write(value.toByteArray(Charsets.UTF_8))
        zip.closeEntry()
      }
      entry("[Content_Types].xml",
        """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
          <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
          </Types>""".trimIndent())
      entry("_rels/.rels",
        """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
          </Relationships>""".trimIndent())
      val sheetName=if(detail)"快递明细" else "仅单号"
      entry("xl/workbook.xml",
        """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets><sheet name="$sheetName" sheetId="1" r:id="rId1"/></sheets></workbook>""".trimIndent())
      entry("xl/_rels/workbook.xml.rels",
        """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
          </Relationships>""".trimIndent())
      entry("xl/worksheets/sheet1.xml",worksheet(rows,detail))
    }
  }
}
