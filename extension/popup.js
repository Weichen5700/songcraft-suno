import {validateTransfer,isSunoUrl} from './contract.js';
import {fillSunoFields} from './fill.js';
const $=s=>document.querySelector(s);let song=null;
function status(text){$('#status').textContent=text;}
function show(){ $('#song').hidden=!song;$('#title').textContent=song?.title||'';$('#guidance').textContent=song?.guidance||'';$('#replace').hidden=true;}
async function read(value){const next=validateTransfer(value);await chrome.storage.local.set({song:next});song=next;show();status('歌曲已讀取。請確認目前分頁是 Suno Custom。');}
$('#read').onclick=()=>read($('#payload').value).catch(error=>status(error.message));
$('#file').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>128000)throw new Error('歌曲資料過大。');const text=await file.text();await read(text);$('#payload').value=text;}catch(error){status(error.message);}};
async function fill(replace){if(!song)return;$('#fill').disabled=true;$('#replace').disabled=true;try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!isSunoUrl(tab?.url))throw new Error('請切換到 https://suno.com 的分頁，再開啟小幫手。');const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:fillSunoFields,args:[song,replace]});const response=result[0]?.result;if(!response)throw new Error('無法讀取頁面，請重新整理 Suno 再試。');status(response.message);$('#replace').hidden=!response.occupied;}catch(error){status(error.message);}finally{$('#fill').disabled=false;$('#replace').disabled=false;}}
$('#fill').onclick=()=>fill(false);$('#replace').onclick=()=>fill(true);
document.querySelectorAll('[data-copy]').forEach(button=>{button.onclick=async()=>{try{await navigator.clipboard.writeText(song[button.dataset.copy]);status('已複製，可以貼到對應欄位。');}catch{ $('#payload').value=song[button.dataset.copy];$('#payload').select();status('請手動複製上方選取內容。');}};});
$('#clear').onclick=async()=>{await chrome.storage.local.remove('song');song=null;$('#payload').value='';show();status('歌曲資料已清除。');};
try{const saved=await chrome.storage.local.get('song');if(saved.song){song=validateTransfer(saved.song);show();}}catch{status('保存資料無法讀取，請重新貼上歌曲。');}
