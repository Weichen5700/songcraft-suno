import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
import {defaultBrief} from '../dist/core.js';
let nextPort=4318;
async function withServer(fetchImpl,run){const PORT=nextPort++;const server=createServer({port:PORT,fetchImpl});await new Promise(resolve=>server.listen(PORT,'127.0.0.1',resolve));try{await run(`http://127.0.0.1:${PORT}`);}finally{await new Promise(resolve=>server.close(resolve));}}
const input=()=>({apiKey:'test-key-not-real',model:'gemini-2.5-flash',brief:{...defaultBrief(),idea:'寫回家的歌'}});
function post(url,body,origin=url){return fetch(url+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});}
test('首頁與所有本機模組可讀取，不能讀取原始伺服器檔案',async()=>{await withServer(null,async url=>{for(const file of ['/','/app.js','/core.js','/style.css','/favicon.svg'])assert.equal((await fetch(url+file)).status,200,file);assert.equal((await fetch(url+'/server.mjs')).status,404);});});
test('跨來源 POST 被拒絕且不呼叫 AI',async()=>{let called=false;await withServer(()=>{called=true;},async url=>{assert.equal((await post(url,input(),'https://evil.example')).status,403);assert.equal(called,false);});});
test('AI 成功 mock：只使用固定官方端點，金鑰放 header 且不回傳',async()=>{await withServer(async(url,options)=>{assert.match(url,/^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\/gemini-2.5-flash:generateContent$/);assert.equal(options.headers['x-goog-api-key'],'test-key-not-real');return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({title:'回家的歌',tracks:[{title:'燈',lyrics:'[Verse]\n回家',style:'warm pop'}]})}]}}]});},async url=>{const response=await post(url,input());assert.equal(response.status,200);const text=await response.text();assert.ok(!text.includes('test-key'));assert.match(text,/回家的歌/);});});
test('額度限制與模型錯誤回傳明確訊息，不暴露原始上游內容',async()=>{await withServer(async()=>new Response('private provider response',{status:429}),async url=>{const r=await post(url,input());assert.equal(r.status,502);assert.match((await r.json()).error,/額度/);});});
test('截斷回覆不得作為成品',async()=>{await withServer(async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{'}]}}]}),async url=>{const r=await post(url,input());assert.equal(r.status,502);assert.match((await r.json()).error,/未完整完成/);});});
test('無效金鑰和模型名稱在本機拒絕',async()=>{await withServer(()=>{throw new Error('不得送出');},async url=>{assert.equal((await post(url,{...input(),apiKey:''})).status,400);assert.equal((await post(url,{...input(),model:'../../x'})).status,400);});});
