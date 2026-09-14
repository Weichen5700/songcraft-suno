export function validateTransfer(input) {
  if(typeof input==='string'){if(input.length>32000)throw new Error('資料過大，請重新從歌作複製這一首。');try{input=JSON.parse(input);}catch{throw new Error('請貼上完整歌曲資料，或匯入 .suno.json 檔。');}}
  if(!input||typeof input!=='object'||Array.isArray(input)||input.schema!=='suno-writing-assistant'||input.version!==1)throw new Error('這不是支援的歌作歌曲資料。');
  const out={schema:input.schema,version:1};
  for(const [key,max] of [['songId',200],['title',120],['lyrics',18000],['style',4000],['guidance',1000]]){
    if(typeof input[key]!=='string'||input[key].length>max)throw new Error(`歌曲欄位 ${key} 格式不正確。`);out[key]=input[key];
  }
  if(!out.title.trim()||!out.style.trim())throw new Error('歌名和曲風不可空白。');return out;
}
export function isSunoUrl(url) {try{const u=new URL(url);return u.protocol==='https:'&&['suno.com','www.suno.com'].includes(u.hostname);}catch{return false;}}
