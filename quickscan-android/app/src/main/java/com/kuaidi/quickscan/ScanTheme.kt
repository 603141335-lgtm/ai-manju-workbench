package com.kuaidi.quickscan

import android.graphics.Color

internal enum class ScanTheme(
  val title: String,
  val isDark: Boolean,
  val style: Int,
  val canvas: Int,
  val surface: Int,
  val ink: Int,
  val muted: Int,
  val primary: Int,
  val onPrimary: Int,
  val accentSurface: Int,
  val outline: Int
) {
  BLUE(
    "海湾蓝", false, R.style.QuickScanBlue, 0xfff2f5fb.toInt(), Color.WHITE,
    0xff142237.toInt(), 0xff53647d.toInt(), 0xff214fb6.toInt(), Color.WHITE,
    0xffe6eeff.toInt(), 0xffdce5f3.toInt()
  ),
  GREEN(
    "青竹绿", false, R.style.QuickScanGreen, 0xffeef5f1.toInt(), Color.WHITE,
    0xff172b22.toInt(), 0xff496457.toInt(), 0xff146747.toInt(), Color.WHITE,
    0xffdff2e7.toInt(), 0xffd4e7db.toInt()
  ),
  DARK(
    "深夜黑", true, R.style.QuickScanDark, 0xff101722.toInt(), 0xff192332.toInt(),
    0xffeff4fb.toInt(), 0xffa9bbd1.toInt(), 0xffa5c6ff.toInt(), 0xff112347.toInt(),
    0xff253959.toInt(), 0xff374861.toInt()
  );

  companion object {
    const val PREFERENCE = "uiTheme"

    fun fromPreference(value: String?): ScanTheme =
      entries.firstOrNull { it.name == value } ?: BLUE
  }
}
