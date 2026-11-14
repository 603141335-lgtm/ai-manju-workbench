//! Verifies server Ed25519 permits. The signing PRIVATE key never ships.
use base64::{engine::general_purpose::{STANDARD,URL_SAFE_NO_PAD},Engine};
use ed25519_dalek::{Signature,Verifier,VerifyingKey};
use ed25519_dalek::pkcs8::DecodePublicKey;
use serde_json::{Value,json};

fn bad(message:&str)->String{json!({"valid":false,"reason":message}).to_string()}
pub fn verify_token(token:&str,pubkey:&str,expected_device:&str,now_ms:i64)->String{
 let pieces:Vec<&str>=token.split('.').collect();
 if pieces.len()!=2||token.len()>8192{return bad("授权凭证格式无效")}
 let Ok(payload)=URL_SAFE_NO_PAD.decode(pieces[0])else{return bad("授权正文解码失败")};
 let Ok(sigbytes)=URL_SAFE_NO_PAD.decode(pieces[1])else{return bad("授权签名解码失败")};
 let Ok(public_der)=STANDARD.decode(pubkey)else{return bad("授权公钥无效")};
 let Ok(key)=VerifyingKey::from_public_key_der(&public_der)else{return bad("授权公钥格式错误")};
 let Ok(sig)=Signature::from_slice(&sigbytes)else{return bad("授权签名长度错误")};
 if key.verify(&payload,&sig).is_err(){return bad("授权签名无效")}
 let Ok(value):Result<Value,_>=serde_json::from_slice(&payload)else{return bad("授权凭证数据无效")};
 if value["schema"].as_i64()!=Some(1)||value["product"].as_str()!=Some("dudu-ai-workbench")
    ||value["deviceId"].as_str()!=Some(expected_device){return bad("授权不属于此软件或设备")}
 let Some(kind)=value["type"].as_str()else{return bad("授权类别无效")};
 if kind!="trial"&&kind!="permanent"{return bad("授权类别无效")}
 let Some(issued)=value["issuedAt"].as_i64()else{return bad("签发时间缺失")};
 if issued>now_ms.saturating_add(300000){return bad("系统时间明显早于授权签发时间")}
 let Some(lease)=value["leaseExpiresAt"].as_i64()else{return bad("离线期限缺失")};
 if now_ms>=lease||lease<=issued{return bad("离线授权有效期已结束")}
 let expires=value["entitlementExpiresAt"].as_i64();
 if kind=="trial"{
   let Some(exp)=expires else{return bad("试用到期时间无效")};
   if now_ms>=exp||lease>exp{return bad("24小时试用已经结束")}
 }else if !value["entitlementExpiresAt"].is_null(){return bad("永久授权字段错误")}
 json!({"valid":true,"type":kind,"expiresAt":expires,"leaseExpiresAt":lease,"issuedAt":issued}).to_string()
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test] fn rejects_empty_and_forged(){assert!(verify_token("","","a",1000).contains("\"valid\":false"));}
 #[test] fn accepts_only_valid_ed25519_signed_device_lease(){
   use ed25519_dalek::{SigningKey,Signer};
   use ed25519_dalek::pkcs8::EncodePublicKey;
   let signing=SigningKey::from_bytes(&[7u8;32]);
   let der=signing.verifying_key().to_public_key_der().unwrap();
   let pubkey=STANDARD.encode(der.as_ref());
   let claims=json!({"schema":1,"product":"dudu-ai-workbench","type":"trial","deviceId":"dev-1","issuedAt":1000,"entitlementExpiresAt":90000,"leaseExpiresAt":90000});
   let raw=claims.to_string();
   let signature=signing.sign(raw.as_bytes());
   let token=format!("{}.{}",URL_SAFE_NO_PAD.encode(raw.as_bytes()),URL_SAFE_NO_PAD.encode(signature.to_bytes()));
   assert!(verify_token(&token,&pubkey,"dev-1",2000).contains("\"valid\":true"));
   assert!(verify_token(&token,&pubkey,"different",2000).contains("\"valid\":false"));
   assert!(verify_token(&token,&pubkey,"dev-1",90000).contains("\"valid\":false"));
 }

}
