use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Manager};

fn now() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64 }
fn id(s:&str)->bool { !s.is_empty() && s.len()<=96 && s.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'||c==b'_'||c==b'.') }
fn checked(s:&str,max:usize)->bool { !s.trim().is_empty()&&s.len()<=max }
fn error(e:rusqlite::Error)->String { format!("数据库错误：{e}") }
fn secure(w:&tauri::Webview)->Result<(),String>{crate::webviews::ensure_control_webview(w)}
const SCHEMA:&str=r#"
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ai_members (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('web_native','api','manual')),
 model_id TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS conversations(
 id TEXT PRIMARY KEY, title TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('private','group')),
 mode TEXT NOT NULL DEFAULT 'normal',
 updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS conversation_members(
 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES ai_members(id),
 role TEXT NOT NULL DEFAULT '', PRIMARY KEY(conversation_id,member_id));
CREATE TABLE IF NOT EXISTS messages(
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 member_id TEXT REFERENCES ai_members(id),
 sender TEXT NOT NULL CHECK(sender IN ('user','ai','system')),
 status TEXT NOT NULL, source TEXT NOT NULL,
 body TEXT NOT NULL, run_id TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(conversation_id,created_at,id);
CREATE TABLE IF NOT EXISTS workbench_runs(
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 status TEXT NOT NULL, state_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
"#;
const DEFAULT_MEMBERS:&[(&str,&str,&str)]=&[
 ("chatgpt","chatgpt","ChatGPT"),("gemini","gemini","Gemini"),("claude","claude","Claude"),
 ("grok","grok","Grok"),("meta","meta","Meta AI"),("doubao","doubao","豆包"),
 ("deepseek","deepseek","DeepSeek"),("kimi","kimi","Kimi"),("qwen","qwen","千问")];
fn open_at(path:PathBuf)->Result<Connection,String>{
 if let Some(p)=path.parent(){fs::create_dir_all(p).map_err(|e|e.to_string())?;}
 let c=Connection::open(path).map_err(error)?;
 c.busy_timeout(Duration::from_secs(5)).map_err(error)?;
 c.execute_batch("PRAGMA journal_mode=WAL;").map_err(error)?;
 c.execute_batch(SCHEMA).map_err(error)?;
 c.execute("INSERT OR IGNORE INTO schema_migrations(version,applied) VALUES(1,?1)",params![now()]).map_err(error)?;
 for (ident,provider,name) in DEFAULT_MEMBERS {
  c.execute("INSERT OR IGNORE INTO ai_members(id,provider,name,kind) VALUES(?1,?2,?3,'web_native')",params![ident,provider,name]).map_err(error)?;
 }
 Ok(c)
}
fn db(app:&AppHandle)->Result<Connection,String>{
 let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;
 open_at(dir.join("unified-chat-v3").join("messages.sqlite3"))
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Member{id:String,provider:String,name:String,kind:String,model_id:String,role:String}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Conversation{id:String,title:String,kind:String,mode:String,updated_at:i64}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Assignment{conversation_id:String,member_id:String,role:String}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Message{id:String,conversation_id:String,member_id:Option<String>,sender:String,status:String,source:String,body:String,run_id:Option<String>,created_at:i64}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct State{members:Vec<Member>,conversations:Vec<Conversation>,assignments:Vec<Assignment>}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct MemberInput{id:String,name:String,kind:String,model_id:String,role:String}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct AssignmentInput{member_id:String,role:String}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct MessageInput{id:String,conversation_id:String,member_id:Option<String>,sender:String,status:String,source:String,body:String,run_id:Option<String>}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct RunInput{id:String,conversation_id:String,status:String,state:serde_json::Value}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct RunInfo{id:String,status:String,state:serde_json::Value,updated_at:i64}

#[tauri::command]
pub fn wb_state(app:AppHandle,webview:tauri::Webview)->Result<State,String>{
 secure(&webview)?;let c=db(&app)?;
 let members=c.prepare("SELECT id,provider,name,kind,model_id,role FROM ai_members ORDER BY name").map_err(error)?
  .query_map([],|r|Ok(Member{id:r.get(0)?,provider:r.get(1)?,name:r.get(2)?,kind:r.get(3)?,model_id:r.get(4)?,role:r.get(5)?}))
  .map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
 let conversations=c.prepare("SELECT id,title,kind,mode,updated_at FROM conversations ORDER BY updated_at DESC").map_err(error)?
  .query_map([],|r|Ok(Conversation{id:r.get(0)?,title:r.get(1)?,kind:r.get(2)?,mode:r.get(3)?,updated_at:r.get(4)?}))
  .map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
 let assignments=c.prepare("SELECT conversation_id,member_id,role FROM conversation_members ORDER BY rowid").map_err(error)?
  .query_map([],|r|Ok(Assignment{conversation_id:r.get(0)?,member_id:r.get(1)?,role:r.get(2)?}))
  .map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
 Ok(State{members,conversations,assignments})
}
#[tauri::command]
pub fn wb_create(app:AppHandle,webview:tauri::Webview,id:String,title:String,kind:String,member_ids:Vec<String>)->Result<(),String>{
 secure(&webview)?;
 if !self::id(&id)||!checked(&title,160)||!["private","group"].contains(&kind.as_str())||member_ids.is_empty()||member_ids.len()>20 {return Err("会话参数无效".into());}
 if kind=="private"&&member_ids.len()!=1{return Err("私聊只能添加一名 AI".into());}
 let mut c=db(&app)?;let tx=c.transaction().map_err(error)?;
 tx.execute("INSERT INTO conversations(id,title,kind,mode,updated_at) VALUES(?1,?2,?3,'normal',?4)",params![id,title.trim(),kind,now()]).map_err(error)?;
 for m in member_ids {if !self::id(&m){return Err("成员 ID 无效".into());}
  tx.execute("INSERT INTO conversation_members(conversation_id,member_id) VALUES(?1,?2)",params![id,m]).map_err(error)?;}
 tx.commit().map_err(error)
}
#[tauri::command]
pub fn wb_set_conversation(app:AppHandle,webview:tauri::Webview,id:String,title:String,mode:String)->Result<(),String>{
 secure(&webview)?;
 if !self::id(&id)||!checked(&title,160)||!["normal","parallel","relay","debate","consult","coding","roundtable","brainstorm"].contains(&mode.as_str()){return Err("会话标题或模式无效".into());}
 let c=db(&app)?;
 if c.execute("UPDATE conversations SET title=?1,mode=?2,updated_at=?3 WHERE id=?4",params![title,mode,now(),id]).map_err(error)?!=1{return Err("会话不存在".into());}Ok(())
}
#[tauri::command]
pub fn wb_set_members(app:AppHandle,webview:tauri::Webview,conversation_id:String,assignments:Vec<AssignmentInput>)->Result<(),String>{
 secure(&webview)?;
 if !id(&conversation_id)||assignments.is_empty()||assignments.len()>20||assignments.iter().any(|a|!id(&a.member_id)||a.role.len()>240){return Err("群成员参数无效".into());}
 let mut c=db(&app)?;let tx=c.transaction().map_err(error)?;
 let kind:Option<String>=tx.query_row("SELECT kind FROM conversations WHERE id=?1",[&conversation_id],|r|r.get(0)).optional().map_err(error)?;
 if kind.as_deref()!=Some("group"){return Err("只有群聊可以修改群成员".into());}
 tx.execute("DELETE FROM conversation_members WHERE conversation_id=?1",[&conversation_id]).map_err(error)?;
 for a in assignments {tx.execute("INSERT INTO conversation_members(conversation_id,member_id,role) VALUES(?1,?2,?3)",params![conversation_id,a.member_id,a.role]).map_err(error)?;}
 tx.commit().map_err(error)
}
#[tauri::command]
pub fn wb_set_member(app:AppHandle,webview:tauri::Webview,member:MemberInput)->Result<(),String>{
 secure(&webview)?;
 if !id(&member.id)||!checked(&member.name,96)||member.role.len()>1500||member.model_id.len()>160||!["api","web_native","manual"].contains(&member.kind.as_str()){return Err("AI 成员设置无效".into());}
 let c=db(&app)?;
 if c.execute("UPDATE ai_members SET name=?1,kind=?2,model_id=?3,role=?4 WHERE id=?5",params![member.name.trim(),member.kind,member.model_id.trim(),member.role,member.id]).map_err(error)?!=1{return Err("成员不存在".into());}
 Ok(())
}
#[tauri::command]
pub fn wb_messages(app:AppHandle,webview:tauri::Webview,conversation_id:String)->Result<Vec<Message>,String>{
 secure(&webview)?;if !id(&conversation_id){return Err("会话 ID 无效".into());}
 let c=db(&app)?;let mut items=c.prepare("SELECT id,conversation_id,member_id,sender,status,source,body,run_id,created_at FROM messages WHERE conversation_id=?1 ORDER BY created_at DESC,id DESC LIMIT 500").map_err(error)?
  .query_map([conversation_id],|r|Ok(Message{id:r.get(0)?,conversation_id:r.get(1)?,member_id:r.get(2)?,sender:r.get(3)?,status:r.get(4)?,source:r.get(5)?,body:r.get(6)?,run_id:r.get(7)?,created_at:r.get(8)?}))
  .map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
 items.reverse();Ok(items)
}
#[tauri::command]
pub fn wb_message(app:AppHandle,webview:tauri::Webview,message:MessageInput)->Result<(),String>{
 secure(&webview)?;
 if !id(&message.id)||!id(&message.conversation_id)||message.body.len()>500000
 ||!["user","ai","system"].contains(&message.sender.as_str())
 ||!["completed","failed","waiting_manual","unknown_completion"].contains(&message.status.as_str())
 ||!["user","official_api","user_imported_web","official_web","system"].contains(&message.source.as_str()){return Err("消息字段无效".into());}
 if message.sender=="ai" && (!message.member_id.as_deref().is_some_and(id)||!["official_api","user_imported_web","official_web"].contains(&message.source.as_str())){return Err("AI 消息必须标明真实提供商与来源".into());}
 if message.sender=="user" && message.source!="user"{return Err("用户消息来源无效".into());}
 let mut c=db(&app)?;let tx=c.transaction().map_err(error)?;
 tx.execute("INSERT INTO messages(id,conversation_id,member_id,sender,status,source,body,run_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![message.id,message.conversation_id,message.member_id,message.sender,message.status,message.source,message.body,message.run_id,now()]).map_err(error)?;
 tx.execute("UPDATE conversations SET updated_at=?1 WHERE id=?2",params![now(),message.conversation_id]).map_err(error)?;
 tx.commit().map_err(error)
}
#[tauri::command]
pub fn wb_save_run(app:AppHandle,webview:tauri::Webview,run:RunInput)->Result<(),String>{
 secure(&webview)?;
 if !id(&run.id)||!id(&run.conversation_id)||!["running","waiting_manual","unknown_completion","failed","completed","paused","cancelled"].contains(&run.status.as_str())||!run.state.is_object(){return Err("接力状态无效".into());}
 let body=serde_json::to_string(&run.state).map_err(|e|e.to_string())?;
 if body.len()>1_200_000{return Err("任务成果过长，请分段而非截断".into());}
 let c=db(&app)?;
 c.execute("INSERT INTO workbench_runs(id,conversation_id,status,state_json,updated_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET status=excluded.status,state_json=excluded.state_json,updated_at=excluded.updated_at",params![run.id,run.conversation_id,run.status,body,now()]).map_err(error)?;Ok(())
}
#[tauri::command]
pub fn wb_recent_run(app:AppHandle,webview:tauri::Webview,conversation_id:String)->Result<Option<RunInfo>,String>{
 secure(&webview)?;if !id(&conversation_id){return Err("会话 ID 无效".into());}
 let c=db(&app)?;
 c.query_row("SELECT id,status,state_json,updated_at FROM workbench_runs WHERE conversation_id=?1 ORDER BY updated_at DESC LIMIT 1",[conversation_id],|r|{
  let raw:String=r.get(2)?;Ok(RunInfo{id:r.get(0)?,status:r.get(1)?,state:serde_json::from_str(&raw).unwrap_or(serde_json::json!({})),updated_at:r.get(3)?})
 }).optional().map_err(error)
}
#[tauri::command]
pub fn wb_backup(app:AppHandle,webview:tauri::Webview)->Result<String,String>{
 secure(&webview)?;
 let dir=app.path().app_data_dir().map_err(|e|e.to_string())?.join("unified-chat-v3");
 let dest=dir.join("backups").join(format!("messages-{}.sqlite3",now()));
 fs::create_dir_all(dest.parent().ok_or("备份目录无效")?).map_err(|e|e.to_string())?;
 let c=db(&app)?;c.execute("VACUUM INTO ?1",[dest.to_string_lossy().as_ref()]).map_err(error)?;
 Ok(dest.to_string_lossy().to_string())
}
#[cfg(test)] mod tests {
 use super::*;
 #[test] fn schema_integrity(){
  let path=std::env::temp_dir().join(format!("wb-{}-{}.sqlite3",std::process::id(),now()));
  let c=open_at(path.clone()).unwrap();
  let n:i64=c.query_row("SELECT COUNT(*) FROM ai_members",[],|r|r.get(0)).unwrap();assert_eq!(n,9);
  assert!(c.execute("INSERT INTO conversations(id,title,kind,mode,updated_at) VALUES('x','x','invalid','normal',1)",[]).is_err());
  drop(c);let _=fs::remove_file(path);
 }
 #[test] fn ids(){assert!(id("group_23"));assert!(!id("../bad"));assert!(!checked("  ",50));}
}