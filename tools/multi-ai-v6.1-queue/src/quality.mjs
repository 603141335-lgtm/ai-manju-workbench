/** Deterministic structure checks ONLY; these do not certify plot quality. */
export function checkReply({text, episodeNo, minChars = 20}) {
  const issues = [];
  if (typeof text !== 'string' || text.trim().length === 0) issues.push({code:'EMPTY',level:'error',message:'回复为空'});
  else {
    if ([...text.trim()].length < minChars) issues.push({code:'SHORT',level:'error',message:`回复少于 ${minChars} 字，可能不完整`});
    if (/\b(?:to be continued|续写中|未完待续)\b/i.test(text.slice(-100))) issues.push({code:'POSSIBLE_TRUNCATION',level:'warning',message:'末尾疑似未完，需要人工检查'});
    if (!new RegExp(`第\\s*0*${episodeNo}\\s*集`).test(text)) issues.push({code:'EPISODE_LABEL',level:'warning',message:'未发现本集集数标记，请核对是否错集'});
  }
  return {pass:!issues.some(x=>x.level==='error'),checks:issues,semanticVerified:false,reviewRequired:true};
}
