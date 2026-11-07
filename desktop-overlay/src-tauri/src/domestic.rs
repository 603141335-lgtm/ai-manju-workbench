//! Extra native-member windows and official OpenAI-compatible API paths.
//! Deliberately does not inject scripts into membership websites.
use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewUrl};
use std::time::Duration;

fn member(provider: &str) -> Option<(&'static str, &'static str)> {
    match provider {
        "doubao" => Some(("豆包", "https://www.doubao.com/chat/")),
        "deepseek" => Some(("DeepSeek", "https://chat.deepseek.com/")),
        "kimi" => Some(("Kimi", "https://www.kimi.com/")),
        "qwen" => Some(("千问", "https://qwen.ai/")),
        "yuanbao" => Some(("腾讯元宝", "https://yuanbao.tencent.com/chat")),
        _ => None,
    }
}
fn api_endpoint(provider: &str) -> Option<&'static str> {
    match provider {
        "doubao" => Some("https://ark.cn-beijing.volces.com/api/v3/chat/completions"),
        "deepseek" => Some("https://api.deepseek.com/chat/completions"),
        "kimi" => Some("https://api.moonshot.cn/v1/chat/completions"),
        "qwen" => Some("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"),
        _ => None,
    }
}

#[tauri::command]
pub async fn domestic_open_member(
    app: AppHandle,
    webview: tauri::Webview,
    provider: String,
    slot: Option<u8>,
) -> Result<(), String> {
    crate::webviews::ensure_control_webview(&webview)?;
    let slot = slot.unwrap_or(1);
    if !(1..=10).contains(&slot) { return Err("账号位只能是 1–10".into()); }
    let (name,url) = member(&provider).ok_or("不支持此会员网站")?;
    // Preserve the original login and label for slot 1.
    let label = if slot == 1 {format!("domestic-{provider}")} else {format!("domestic-{provider}-{slot}")};
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|e|e.to_string())?;
        window.set_focus().map_err(|e|e.to_string())?;
        return Ok(());
    }
    let remote = tauri::Url::parse(url).map_err(|e|e.to_string())?;
    let mut builder = tauri::WebviewWindowBuilder::new(&app,&label,WebviewUrl::External(remote))
        .title(format!("{} · 账号 {} · Multi-AI Chat Desktop",name,slot))
        .inner_size(1120.0,800.0)
        .min_inner_size(760.0,520.0);
    if slot > 1 {
        // The provider is whitelisted and the slot is bounded; no user-supplied filesystem path.
        let profile = app.path().app_local_data_dir().map_err(|e|e.to_string())?
            .join("domestic-profiles-v4").join(&provider).join(format!("slot-{slot}"));
        std::fs::create_dir_all(&profile).map_err(|_|"无法创建独立登录档案目录")?;
        builder = builder.data_directory(profile);
    }
    builder.build().map_err(|e|e.to_string())?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct DomesticApiRequest {
    provider: String,
    model: String,
    api_key: String,
    prompt: String,
}
fn response_text(json: &serde_json::Value) -> Result<String,String> {
    let first = json.get("choices").and_then(|x|x.get(0))
        .ok_or("接口未返回 choices[0]，请检查模型 ID 和提供商接口")?;
    if first.get("finish_reason").and_then(|v|v.as_str())==Some("length") {
        return Err("AI 回复达到输出长度限制，任务未完整完成；请分段重试".into());
    }
    let text = first.pointer("/message/content").and_then(|x|x.as_str())
        .ok_or("接口未返回文本内容，请检查模型是否支持 Chat Completions")?;
    if text.trim().is_empty() { return Err("API 返回空内容，未将它当作有效回复".into()); }
    if text.len()>500_000 { return Err("输出超过安全限制，请分批执行".into()); }
    Ok(text.to_owned())
}
#[tauri::command]
pub async fn domestic_api_chat(
    webview: tauri::Webview,
    request: DomesticApiRequest,
) -> Result<String,String> {
    crate::webviews::ensure_control_webview(&webview)?;
    let endpoint = api_endpoint(&request.provider).ok_or("不支持的 API 提供商")?;
    if request.model.trim().is_empty() || request.model.len()>160
        || request.model.chars().any(|c|c.is_control()) { return Err("请填写有效的模型 ID".into()); }
    if request.api_key.trim().is_empty() || request.api_key.len()>4096
        || request.api_key.chars().any(|c|c.is_control()) { return Err("请填写有效的官方 API Key".into()); }
    if request.prompt.trim().is_empty() || request.prompt.len()>150_000 {
        return Err("输入不能为空，且单次不得超过 150000 字符；不能静默截断".into());
    }
    // No arbitrary URL and no private-network egress. API Key is never saved to disk here.
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build().map_err(|_|"HTTP 客户端初始化失败")?;
    let response = client.post(endpoint)
        .bearer_auth(&request.api_key)
        .json(&serde_json::json!({
            "model":request.model.trim(),
            "messages":[{"role":"user","content":request.prompt}],
            "stream":false
        }))
        .send().await.map_err(|_|"请求失败或超时：检查网络、密钥和服务状态")?;
    let status=response.status();
    if !status.is_success() {
        // Do not echo provider body: it may contain submitted data or secrets.
        return Err(format!("官方 API 返回 HTTP {}，请检查密钥、模型 ID、额度和区域",status.as_u16()));
    }
    let response:serde_json::Value=response.json().await
        .map_err(|_|"API 响应不是有效 JSON")?;
    response_text(&response)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_official_destinations() {
        assert!(member("doubao").unwrap().1.starts_with("https://www.doubao.com/"));
        assert!(api_endpoint("deepseek").unwrap().starts_with("https://api.deepseek.com/"));
        assert_eq!(member("yuanbao").unwrap().0,"腾讯元宝");
        assert!(member("file:///x").is_none());
        assert!(api_endpoint("http://127.0.0.1").is_none());
    }
    #[test]
    fn parse_real_answer_not_fake() {
        let reply=serde_json::json!({"choices":[{"message":{"content":"实际回复"},"finish_reason":"stop"}]});
        assert_eq!(response_text(&reply).unwrap(),"实际回复");
        assert!(response_text(&serde_json::json!({"choices":[]})).is_err());
        assert!(response_text(&serde_json::json!({"choices":[{"message":{"content":"test"},"finish_reason":"length"}]})).is_err());
    }
}
