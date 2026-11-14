//! Core source-code protection boundary for Dudu AI Workbench.
//! Only the stable reference parsing/matching algorithms are compiled here.
//! Login/session data, cookies, passwords and user images are never handled.
use napi::bindgen_prelude::*;
mod license;
use napi_derive::napi;
use regex::Regex;
use serde::Serialize;
use std::collections::HashSet;

fn normalized(value: &str) -> String {
    value.trim().replace(&['＿', '－', '–', '—'][..], "-").to_ascii_uppercase()
}
fn re(pattern: &str) -> Regex { Regex::new(pattern).expect("constant regex") }
fn is_ascii_code(c: char) -> bool { c.is_ascii_alphanumeric() }
fn parse_code_hits(input: &str) -> Vec<(String, usize, usize)> {
    let pat = re(r"(?i)(?:AG|BL|A|B|C|E)[0-9]{2,3}(?:-[0-9]{2})?");
    pat.find_iter(input).filter_map(|m| {
        let prev = input[..m.start()].chars().last();
        let next = input[m.end()..].chars().next();
        if prev.is_some_and(is_ascii_code) || next.is_some_and(is_ascii_code) {return None}
        Some((normalized(m.as_str()), m.start(), m.end()))
    }).collect()
}
fn unique_codes(value: &str) -> Vec<String> {
    let mut seen=HashSet::new();
    parse_code_hits(value).into_iter().filter_map(|(code,_,_)|
        if seen.insert(code.clone()) {Some(code)} else {None}).collect()
}
#[derive(Serialize)]
struct CodesResponse { codes:Vec<String>, origin:String }
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
struct Slot { code:String, anchor:String, original_line:String }
#[derive(Serialize)]
struct SlotsResponse { slots:Vec<Slot>, ambiguous:Vec<String> }
fn ref_header() -> Regex {
    re(r"(?i)(?:需要参考图|参考图(?:编号|列表)?|所需参考图|引用参考图)\s*[:：]?\s*")
}
fn section_stop() -> Regex {
    re(r"^(?:连续性|场景与站位|场景设定|场景|画风|限制|分镜|音效|时间|承接|镜头|台词|对白|人物情绪|人物表演|运镜|动作|[0-9]+[—-][0-9]+秒|第[0-9]+段)")
}
fn parse_codes_raw(text: &str) -> CodesResponse {
    let header=ref_header();
    let stop=section_stop();
    let lines:Vec<&str>=text.lines().collect();
    let mut selected=Vec::<String>::new();
    for i in 0..lines.len() {
        let line=lines[i];
        let Some(m)=header.find(line) else {continue};
        let mut parts=vec![line[m.end()..].to_string()];
        for j in (i+1)..lines.len().min(i+13) {
            let item=lines[j].trim();
            if item.is_empty() || stop.is_match(item) {break}
            let content=re(r"(?i)^[A-Z]{1,3}\s*[:：]").replace(item,"").trim().to_string();
            if unique_codes(&content).is_empty() || content.chars().any(|c|matches!(c,'。'|'！'|'？')){break}
            parts.push(content);
        }
        selected.push(parts.join(" "));
    }
    if selected.is_empty(){
        return CodesResponse { codes:Vec::new(),origin:"未检测到“需要参考图”栏目".into() }
    }
    let mut seen=HashSet::new();
    let mut result=Vec::new();
    for part in selected {
       for code in unique_codes(&part) {
          if seen.insert(code.clone()){result.push(code)}
       }
    }
    CodesResponse{codes:result,origin:"参考图栏目".into()}
}
fn reference_slots_raw(text:&str) -> SlotsResponse {
    let head=ref_header();let stop=section_stop();
    let mut collecting=false;let mut scanned=0;
    let mut slots=Vec::<Slot>::new();let mut seen=HashSet::new();
    let mut ambiguous=Vec::<String>::new();let mut conflicts=HashSet::new();
    for raw in text.lines() {
        let line=raw.trim();
        let header=head.find(line);
        if header.is_some(){collecting=true;scanned=0}
        if !collecting{continue}
        if header.is_none()&&(line.is_empty()||stop.is_match(line)||scanned>=13){collecting=false;continue}
        scanned+=1;
        let body=if let Some(m)=header {&line[m.end()..]} else {line};
        let hits=parse_code_hits(body);
        for index in 0..hits.len() {
            let (code,start,_)=&hits[index];
            let end=hits.get(index+1).map(|x|x.1).unwrap_or(body.len());
            let anchor=body[*start..end].trim().trim_end_matches(&[' ','\t','、','，',',',';','；'][..]).to_string();
            if anchor.is_empty()||anchor.chars().count()>350||!seen.insert(code.clone()){
                if conflicts.insert(code.clone()){ambiguous.push(code.clone())}
                continue
            }
            slots.push(Slot{code:code.clone(),anchor,original_line:line.into()});
        }
    }
    SlotsResponse{slots,ambiguous}
}
fn code_from_file_raw(name:&str,path:&str)->Option<String>{
    let filename=re(r"(?i)\.(png|jpe?g|webp)$").replace(name,"");
    let filename=filename.trim_start_matches(|c:char|c.is_whitespace()||"【[(（".contains(c));
    let start_match=|candidate:&str| ->Option<String> {
        parse_code_hits(candidate).into_iter().find_map(|(code,start,_)|if start==0{Some(code)}else{None})
    };
    if let Some(code)=start_match(filename){return Some(code)}
    let dirs:Vec<&str>=path.split('/').collect();
    for segment in dirs.iter().rev().skip(1) {
        if let Some(code)=start_match(segment){return Some(code)}
    }
    None
}
#[napi(js_name="tokensJson")]
pub fn tokens_json(input:String)-> Result<String> {
    serde_json::to_string(&unique_codes(&input)).map_err(|e|Error::from_reason(e.to_string()))
}
#[napi(js_name="parseCodesJson")]
pub fn parse_codes_json(input:String)->Result<String>{
    serde_json::to_string(&parse_codes_raw(&input)).map_err(|e|Error::from_reason(e.to_string()))
}
#[napi(js_name="referenceSlotsJson")]
pub fn reference_slots_json(input:String)->Result<String>{
    serde_json::to_string(&reference_slots_raw(&input)).map_err(|e|Error::from_reason(e.to_string()))
}
#[napi(js_name="codeFromFile")]
pub fn code_from_file(name:String,relative_path:String)-> Option<String> {code_from_file_raw(&name,&relative_path)}
#[napi(js_name="normalizeCode")]
pub fn normalize_code(code:String)->String{normalized(&code)}
#[napi(js_name="verifyLicenseToken")]
pub fn verify_license_token(token:String,public_key:String,device_id:String,now_ms:f64)->String{
    license::verify_token(&token,&public_key,&device_id,now_ms as i64)
}
#[napi(js_name="securityBuildInfo")]
pub fn security_build_info()->String{"dudu-native-core-1.0.1".into()}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_codes_and_order(){
        let text="第1段｜测试\n需要参考图：\nA15-01 杜不凡\nA15 杜不凡\nB15 场景\nC42 食材\n连续性参考：A99";
        assert_eq!(parse_codes_raw(text).codes,vec!["A15-01","A15","B15","C42"]);
        let s=reference_slots_raw(text);
        assert_eq!(s.slots.iter().map(|x|x.code.as_str()).collect::<Vec<_>>(),vec!["A15-01","A15","B15","C42"]);
    }
    #[test]
    fn duplicates_fail_closed(){
       let slots=reference_slots_raw("需要参考图：\nA15-01 初稿\nA15-01 终稿\n限制：结束");
       assert_eq!(slots.ambiguous,vec!["A15-01"]);
    }
    #[test]
    fn file_code_exact(){
       assert_eq!(code_from_file_raw("A15-01杜不凡.png",""),Some("A15-01".to_string()));
       assert_eq!(code_from_file_raw("A15-010不存在.png",""),None);
    }
}
