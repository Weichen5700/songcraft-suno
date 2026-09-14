// 此函式由 scripting.executeScript 注入主框架；不可依赖外部變數。
export async function fillSunoFields(song, replace = false) {
  if(location.protocol!=='https:'||!['suno.com','www.suno.com'].includes(location.hostname))return{ok:false,message:'請先開啟 Suno 網站，再操作小幫手。'};
  const labels={title:'歌名',lyrics:'歌詞',style:'曲風'};
  const patterns={title: /(?:\b(?:song\s+)?title\b|歌名|歌曲名稱|標題)/i,lyrics: /(?:\blyrics\b|歌詞)/i,style: /(?:\bstyles?\b|\bstyle of music\b|曲風|音樂風格)/i};
  const candidates=Array.from(document.querySelectorAll('input,textarea')).filter(el=>!el.disabled&&!el.readOnly&&el.type!=='hidden'&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&(!el.type||['text','search','textarea'].includes(el.type)));
  const fields={};const diagnostics=[];
  for(const key of Object.keys(labels)){
    const matching=candidates.filter(el=>{
      const described=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent||'').join(' ');
      const text=[...Array.from(el.labels||[]).map(l=>l.textContent),el.getAttribute('aria-label')||'',described,el.placeholder||''].join(' ');
      if(key==='style'&&/exclude|negative|排除|不要/i.test(text))return false;
      return patterns[key].test(text);
    });
    if(matching.length!==1)diagnostics.push(`${labels[key]}：${matching.length?'找到多個可能欄位':'找不到可編輯欄位'}`);else fields[key]=matching[0];
  }
  if(diagnostics.length)return{ok:false,message:diagnostics.join('；')+'。請切到 Custom，或使用逐欄複製。'};
  if(new Set(Object.values(fields)).size!==3)return{ok:false,message:'欄位標示不明確，請使用逐欄複製。'};
  const occupied=Object.keys(labels).filter(k=>fields[k].value.trim()&&fields[k].value!==song[k]);
  if(occupied.length&&!replace)return{ok:false,occupied:true,message:`${occupied.map(k=>labels[k]).join('、')}已有不同內容。請先確認，再選擇取代。`};
  const previous={};
  function write(el,value){const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  try{
    for(const key of Object.keys(labels))previous[key]=fields[key].value;
    for(const key of Object.keys(labels)){
      if(fields[key].maxLength>=0&&song[key].length>fields[key].maxLength)throw new Error(`${labels[key]}超過頁面欄位長度。`);
    }
    for(const key of Object.keys(labels))write(fields[key],song[key]);
    await new Promise(resolve=>setTimeout(resolve,160));
    if(Object.keys(labels).some(k=>!fields[k].isConnected||fields[k].value!==song[k]))throw new Error('網頁未保留填入內容。');
    return{ok:true,message:'三個欄位已填入，請檢查人聲與純音樂設定，再手動生成。'};
  }catch(error){for(const key of Object.keys(previous)){try{if(fields[key].isConnected)write(fields[key],previous[key]);}catch{/* 介面已改變時不推測替代欄位。 */}}
    return{ok:false,message:`${error.message} 已嘗試恢復原值，請核對頁面並使用逐欄複製。`};}
}
