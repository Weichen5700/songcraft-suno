import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPrompt, parseCreativeResponse, validateBrief } from './dist/core.js';

const root = path.resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.zip': 'application/zip' };

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function createServer({ fetchImpl = fetch, port = 4317 } = {}) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
    if (!hosts.has(req.headers.host)) return send(res, 403, { error: '僅接受本機網站的請求。' });
    try {
      if (req.url === '/api/generate' && req.method === 'POST') {
        if (req.headers.origin !== `http://${req.headers.host}` || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: '請從本機創作網站使用 AI。' });
        if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: '請使用 JSON 格式。' });
        let size = 0; const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 180000) { send(res, 413, { error: '創作文字過長，請縮短後重試。' }); req.resume(); return; }
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(res, 400, { error: '資料格式錯誤。' }); }
        const { apiKey, model = 'gemini-2.5-flash', brief, current, feedback } = input;
        if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 300) return send(res, 400, { error: '請先在 AI 設定填入有效金鑰。' });
        if (typeof model !== 'string' || !/^gemini-[a-z0-9.-]{3,70}$/.test(model)) return send(res, 400, { error: '模型名稱格式不正確。' });
        try { validateBrief(brief); } catch (error) { return send(res, 400, { error: error.message }); }
        if (feedback != null && (typeof feedback !== 'string' || feedback.length > 3000)) return send(res, 400, { error: '修改說明請在 3,000 字以內。' });
        const prompt = buildPrompt(brief, current, feedback);
        let upstream;
        try {
          upstream = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 16000 } }),
            signal: AbortSignal.timeout(90000), redirect: 'error',
          });
        } catch { return send(res, 502, { error: 'AI 連線失敗或等待超過 90 秒。草稿仍在；可改用複製需求到外部 AI。' }); }
        if (!upstream.ok) {
          const errors = { 400: '模型或請求設定不被接受，請確認模型名稱。', 401: '金鑰無效，請重新設定。', 403: '金鑰權限或所在地無法使用此模型。', 404: '此模型目前無法使用，請在 AI 設定更換模型。', 429: 'AI 額度或速率已達限制，請稍後重試或使用外部 AI。' };
          return send(res, 502, { error: errors[upstream.status] || `AI 服務暫時無法完成（${upstream.status}）。草稿未變更。` });
        }
        const result = await upstream.json();
        const candidate = result.candidates?.[0];
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') return send(res, 502, { error: 'AI 回覆未完整完成，沒有取代原稿。請縮減內容或重試。' });
        try {
          const text = candidate?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') || '';
          const creative = parseCreativeResponse(text);
          if (creative.tracks.length !== (current ? 1 : brief.mode === 'album' ? Number(brief.count) : 1)) throw new Error('歌曲數與需求不符，請重試。');
          send(res, 200, creative);
        } catch (error) { send(res, 502, { error: `AI 回覆需要整理：${error.message} 原稿未變更。` }); }
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: '不支援此操作。' });
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep) && target !== path.join(root, 'index.html')) return send(res, 403, { error: '無法存取。' });
      if (!Object.hasOwn(types, path.extname(target))) return send(res, 404, { error: '找不到檔案。' });
      const data = await readFile(target);
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { if (!res.headersSent) send(res, 404, { error: '找不到檔案或資料無法讀取。' }); else res.end(); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '4317 已在使用中。請先開啟 http://127.0.0.1:4317，或關閉先前的歌作服務。' : '啟動失敗：' + error.code); process.exitCode = 1; });
  server.listen(4317, '127.0.0.1', () => console.log('歌作已啟動：http://127.0.0.1:4317'));
}
