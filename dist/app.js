import { defaultBrief, validateBrief, createProject, parseCreativeResponse, buildPrompt, sampleProject, snapshotTrack, preserveVersion, transferTrack, revisionKey, safeName, uid } from './core.js';
import { listProjects, saveProject, getAsset, saveWithAssets, deleteProject, deleteAsset } from './db.js';
import { makeZip, readZip, download } from './archive.js';
import { drawCover, canvasBlob } from './cover.js';

const $ = (s, root = document) => root.querySelector(s);
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { projects: [], projectId: null, trackId: null, tab: 'write', brief: defaultBrief(), busy: false, apiKey: '', model: 'gemini-2.5-flash', chatTemplate: '請依照以下需求完成歌曲創作，並只輸出符合指定格式的 JSON：\n\n%s', saveStatus: '本機創作空間', savedError: false };
let pending = Promise.resolve(), renderToken = 0, audioUrl, toastTimer, externalContext = null;
const currentProject = () => state.projects.find(p => p.id === state.projectId);
const currentTrack = () => currentProject()?.tracks.find(t => t.id === state.trackId) || currentProject()?.tracks[0];
const formatTime = at => new Date(at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const action = (name, label, cls = '', extra = '') => `<button type="button" data-action="${name}" class="${cls}" ${extra}>${label}</button>`;
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 4500); }
function report(error) { toast(error.message || '操作未完成，請再試一次。'); console.error(error); }
function savedLabel(text) { state.saveStatus = text; const el = $('#save-status'); if (el) el.textContent = text; }
function queueSave(project = currentProject()) {
  if (!project) return Promise.resolve();
  project.updatedAt = Date.now(); const copy = structuredClone(project); savedLabel('正在保存…');
  const work = pending.catch(() => {}).then(() => saveProject(copy));
  pending = work;
  work.then(() => { state.savedError = false; if (pending === work) savedLabel('已保存於此瀏覽器'); }, error => { state.savedError = true; savedLabel('保存失敗，請先備份'); report(error); });
  return work;
}
window.addEventListener('beforeunload', event => { if (state.busy || state.savedError || state.saveStatus === '正在保存…') { event.preventDefault(); event.returnValue = ''; } });
function setCurrent(p, track = p.tracks[0]) { state.projectId = p.id; state.trackId = track.id; state.tab = 'write'; }
function field(label, content) { return `<div class="field"><label>${label}</label>${content}</div>`; }
function select(name, value, options, source = 'brief') { return `<select aria-label="${name}" data-${source}="${name}">${options.map(v => `<option ${v === value ? 'selected' : ''}>${escape(v)}</option>`).join('')}</select>`; }
function render() {
  renderToken++;
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
  const p = currentProject();
  $('#app').innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><img src="/favicon.svg" alt=""><div>歌作<small>SONGCRAFT</small></div></div>${action('new', '＋ 新的創作', 'new-button')}<div><div class="section-label">我的作品 · ${state.projects.length}</div><div class="project-list">${state.projects.length ? state.projects.map(item => `<button class="project-item ${item.id === p?.id ? 'active' : ''}" data-project="${item.id}">${escape(item.title)}<small>${item.mode === 'album' ? '專輯' : '單曲'} · ${item.tracks.length} 首${item.isSample ? ' · 範例' : ''}</small></button>`).join('') : '<p class="local-note">第一首歌，從一個想法開始。</p>'}</div></div><div class="sidebar-bottom">${action('settings', '⚙ AI 設定')}${action('help', '↗ Suno 小幫手')}${action('import-backup', '↥ 匯入作品備份')}<div class="local-note">作品保存在此瀏覽器。<br>清除瀏覽資料前，記得備份。</div></div></aside><main class="main"><header class="topbar"><span class="crumb">${p ? `我的作品 / ${p.mode === 'album' ? '專輯' : '單曲'}` : '你的寫歌工作室'}</span><div class="row"><span class="saved" id="save-status">${escape(state.saveStatus)}</span>${state.busy ? '<span class="tag">處理中</span>' : ''}</div></header><div class="workspace">${p ? renderProject(p) : renderCreate()}</div></main></div>`;
  if (p && state.tab === 'cover') updateCoverPreview();
  if (p && state.tab === 'audio') mountAudio();
  if (state.busy) $('#app').querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = true; });
}
function renderCreate() {
  const b = state.brief;
  return `<div class="page-heading"><div><div class="eyebrow">A LITTLE IDEA, A NEW SONG</div><h1>今天，想把什麼寫成歌？</h1><p>一句想法就夠了，剩下的我們慢慢完成。</p></div></div><div class="create-layout"><section class="panel"><div class="mode-switch">${action('mode-single', '♫ 做一首歌<span>送給一個人，或留住一個時刻</span>', b.mode === 'single' ? 'selected' : '', `aria-pressed="${b.mode === 'single'}"`)}${action('mode-album', '▤ 做一張專輯<span>讓幾首歌，說完同一個故事</span>', b.mode === 'album' ? 'selected' : '', `aria-pressed="${b.mode === 'album'}"`)}</div><div class="field"><label for="idea">你想寫什麼？ <span class="muted">唯一必填</span></label><textarea id="idea" data-brief="idea" maxlength="6000" placeholder="例如：寫給陪我走過辛苦日子的另一半，溫暖一點，不要太肉麻。也可以貼入完整需求。">${escape(b.idea)}</textarea></div><div class="grid3">${field('語言', select('language', b.language, ['臺灣華語', '臺語', '英文', '華語＋英文']))}${field('心情', select('mood', b.mood, ['溫暖', '開心', '感傷', '有力量', '平靜', '幫我決定']))}${field('人聲', select('voice', b.voice, ['幫我決定', '溫柔男聲', '溫柔女聲', '有力量的男聲', '有力量的女聲', '對唱', '純音樂']))}</div><details><summary>我還有一些想法（選填）</summary>${field('曲風', select('genre', b.genre, ['幫我決定', '華語抒情', '輕快流行', '民謠', '搖滾', 'R&B', 'City Pop', '電子流行']))}<label for="existing-lyrics">已經有歌詞？建立時原文保留</label><textarea id="existing-lyrics" data-brief="existingLyrics" maxlength="18000" placeholder="可貼上你已經寫好的歌詞，不會在建立時被 AI 覆寫。">${escape(b.existingLyrics || '')}</textarea></details>${b.mode === 'album' ? `<div class="field"><label for="count">這張專輯先規劃幾首？</label><select id="count" data-brief="count">${[3,4,5,6,7,8].map(n => `<option value="${n}" ${n === Number(b.count) ? 'selected' : ''}>${n} 首</option>`).join('')}</select><small>先完成代表曲，其餘逐首展開，減少整批重做。</small></div>` : ''}<div class="actions">${action('create-ai', state.apiKey ? '✦ 幫我整理成歌' : '✦ 用 AI 幫我整理', 'primary')}${action('create-manual', '先自己寫')}</div><p class="muted top-gap">${state.apiKey ? '會將創作文字送到 Gemini；使用費依你的 API 帳號計算。' : '尚未連接 AI。可以複製需求到慣用的 AI，再貼回草稿。'}</p><hr>${action('sample', '先看看一首範例 ↗', 'ghost')}</section><aside class="panel guide"><span class="tag">從想法到作品</span><h2>把生活，<br>留在一首歌裡。</h2><ol class="step-list"><li><b>1</b><div><strong>說說你的想法</strong><span>不用懂樂理，也不用先想好歌名。</span></div></li><li><b>2</b><div><strong>一起把歌詞寫好</strong><span>用「更口語」「副歌更好記」來調整。</span></div></li><li><b>3</b><div><strong>到 Suno 讓它唱出來</strong><span>小幫手協助填寫，你決定何時生成。</span></div></li><li><b>4</b><div><strong>收好你的作品</strong><span>下載後拖回音檔，配上自己的封面。</span></div></li></ol><p class="muted">專輯共用一張主視覺，切換歌曲時，只換中央歌名。</p></aside></div>`;
}
function renderProject(p) {
  const t = currentTrack();
  const tabs = [['write','① 歌詞創作'],['suno','② 到 Suno 製作'],['audio','③ 收好音檔'],['cover','④ 專輯與封面']];
  return `<div class="page-heading"><div><div class="eyebrow">${p.mode === 'album' ? 'ALBUM WORKSPACE' : 'SINGLE WORKSPACE'} ${p.isSample ? '<span class="tag sample">範例創作・尚無音檔</span>' : ''}</div><h1>${escape(p.title)}</h1><p>${p.mode === 'album' ? `${p.tracks.length} 首歌，慢慢完成同一個故事。` : '把喜歡的字句，變成可以聽見的作品。'}</p></div><div class="row">${action('backup', '備份這份作品')}${action('project-settings', '作品設定', 'ghost')}</div></div><nav class="tabs" aria-label="製作階段">${tabs.map(([key,label]) => `<button data-tab="${key}" class="${state.tab === key ? 'active' : ''}" aria-current="${state.tab === key ? 'page' : 'false'}">${label}</button>`).join('')}</nav><div class="editor-layout"><aside><div class="track-list">${p.tracks.map((track,i) => `<button class="track-item ${track.id === t.id ? 'active' : ''}" data-track="${track.id}"><span class="track-num">${String(i + 1).padStart(2,'0')}</span><span class="track-name">${escape(track.title)}<small>${track.audio ? '已收錄音檔' : track.lyrics || track.instrumental ? '草稿已準備' : '等待寫詞'}</small></span></button>`).join('')}${p.mode === 'album' && p.tracks.length < 8 ? action('add-track','＋ 新增曲目','ghost') : ''}</div></aside><section class="panel">${state.tab === 'write' ? renderWrite(p,t) : state.tab === 'suno' ? renderSuno(t) : state.tab === 'audio' ? renderAudio(t) : renderCover(p,t)}</section></div><footer>自動保存於此瀏覽器 · 音檔與圖片不會送到 AI · 建議完成一首就備份一次</footer>`;
}
function renderWrite(p,t) {
  return `<div class="editor-head"><div><h2>先把這首歌寫好</h2><span class="muted">你可以直接改字，也可以用一句話請 AI 調整。</span></div><div class="row">${action('save-version','保存一個版本')}${action('versions',`版本紀錄 ${t.versions.length}`,'ghost')}</div></div><div class="grid2"><div class="field"><label for="track-title">歌名</label><input id="track-title" data-track-field="title" maxlength="120" value="${escape(t.title)}"></div><div class="field"><label for="track-voice">演唱感覺</label><input id="track-voice" data-track-field="voice" maxlength="200" value="${escape(t.voice)}" placeholder="例如：溫柔女聲"></div></div><div class="field"><label for="track-role">這首歌想說什麼</label><textarea id="track-role" data-track-field="role" maxlength="1000">${escape(t.role)}</textarea></div><div class="row spread"><label for="track-lyrics">歌詞</label><label class="inline-check"><input type="checkbox" data-track-field="instrumental" ${t.instrumental ? 'checked' : ''}>這首是純音樂</label></div>${t.instrumental ? '<p class="note">純音樂不需要歌詞。到 Suno 請開啟純音樂設定。</p>' : ''}<textarea class="lyrics" id="track-lyrics" data-track-field="lyrics" maxlength="18000" placeholder="在這裡寫歌詞，或請 AI 依照這首歌的企劃展開。">${escape(t.lyrics)}</textarea><div class="pill-row">${['更口語','不要太肉麻','副歌更好記','更開心','更感傷',...(t.lyrics ? [] : ['依企劃完成歌詞'])].map(label => `<button data-rewrite="${label}">✦ ${label}</button>`).join('')}</div><div class="row"><input id="feedback" maxlength="3000" placeholder="例如：第二段加入我們第一次旅行的故事" aria-label="修改想法"><div class="actions">${action('rewrite','依這個想法調整','soft')}</div></div><details><summary>曲風提示詞（帶到 Suno 的內容）</summary><label for="track-style">英文曲風，可自行修改</label><textarea id="track-style" data-track-field="style" maxlength="4000">${escape(t.style)}</textarea><small>這些是創作引導，實際唱法仍以 Suno 生成結果為準。</small></details><div class="actions">${action('next-suno','歌詞準備好了 →','primary')}${action('export-lyrics','下載歌詞')}</div>`;
}
function renderSuno(t) {
  return `<div class="editor-head"><div><h2>把這首歌帶到 Suno</h2><p class="muted">選擇 Custom 模式，填好後由你手動生成、試聽及下載。</p></div><a class="hint-link" href="https://suno.com/create" target="_blank" rel="noopener noreferrer">開啟 Suno ↗</a></div><div class="note">${escape(t.instrumental ? '這是純音樂，請開啟 Instrumental。' : `人聲建議：${t.voice || '自行選擇'}。請檢查純音樂開關已關閉。`)} 小幫手只填寫，不會按下生成。</div><div class="actions">${action('copy-transfer','複製給 Suno 小幫手','primary')}${action('export-transfer','下載填寫資料')}${action('help','安裝／使用說明','ghost')}</div><p class="muted">在 Suno 分頁打開擴充套件 → 貼入 →「讀取歌曲」→「填入目前頁面」。沒有套件也能使用下方複製。</p><div class="transfer-grid"><div class="copy-box"><div class="row spread"><h3>歌名</h3>${action('copy-title','複製')}</div><p>${escape(t.title)}</p><div class="row spread"><h3>曲風 Styles</h3>${action('copy-style','複製')}</div><pre>${escape(t.style || '請先在歌詞創作頁補上曲風。')}</pre></div><div class="copy-box"><div class="row spread"><h3>歌詞 Lyrics</h3>${action('copy-lyrics','複製')}</div><pre>${escape(t.lyrics || (t.instrumental ? '純音樂，歌詞留空。' : '尚未填寫歌詞。'))}</pre></div></div><div class="field top-gap"><label for="suno-url">Suno 作品連結（選填，方便以後回去）</label><input type="url" id="suno-url" data-track-field="sunoUrl" value="${escape(t.sunoUrl || '')}" placeholder="https://suno.com/song/…"></div><div class="actions">${action('next-audio','已下載歌曲，收好音檔 →','primary')}</div>`;
}
function renderAudio(t) {
  return `<h2>讓音檔和歌詞待在一起</h2><p class="muted">從 Suno 手動下載後，把音檔放到這裡。只保存於本機，不上傳 AI。</p>${t.audio ? `<div class="audio-card"><div class="row spread"><div><strong>${escape(t.audio.name)}</strong><br><small>${(t.audio.size / 1024 / 1024).toFixed(1)} MB · ${formatTime(t.audio.at)}</small></div>${action('download-audio','下載原音檔')}</div><div id="audio-player" aria-live="polite">正在載入音檔…</div>${t.audio.revision !== revisionKey(t) ? '<p class="note warning">這首歌的文字或曲風在匯入音檔後改過。音檔仍是原版本，請自行確認是否對應。</p>' : ''}</div>` : ''}<label class="drop-zone" id="audio-drop"><strong>${t.audio ? '想換另一個版本？' : '把歌曲拖到這裡'}</strong><span class="muted">MP3、WAV、M4A、OGG、FLAC、WebM，每首最多 80 MB；每份作品的素材合計 200 MB</span><input id="audio-file" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm" aria-label="選擇歌曲音檔"></label><div class="note">替換會先確認新音檔能播放再保存。若想保留所有候選，替換前先備份這份作品。</div><div class="actions">${action('next-cover','幫歌曲配一張封面 →','primary')}</div>`;
}
function renderCover(p,t) {
  return `<div class="editor-head"><div><h2>同一張主視覺，每首都有自己的名字</h2><p class="muted">切換左側曲目，背景不換，只換中央歌名。</p></div></div><div class="cover-layout"><div><canvas id="cover-canvas" class="cover-preview" aria-label="歌曲封面預覽"></canvas><p class="muted" id="cover-status">輸出 1200 × 1200 PNG</p></div><div class="cover-controls"><div class="field"><label for="cover-file">上傳專輯主視覺</label><input id="cover-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="上傳專輯背景"><small>JPG、PNG、WebP，最多 12 MB。背景會置中裁成正方形。</small></div>${p.cover.assetId ? action('remove-cover','移除背景圖片','ghost') : ''}${field('沒有圖片也能用配色', `<select data-cover="theme" aria-label="背景配色">${Object.entries({night:'深夜墨藍',forest:'森林綠',plum:'暮色紫',blue:'海岸藍'}).map(([key,label]) => `<option value="${key}" ${key === p.cover.theme ? 'selected' : ''}>${label}</option>`).join('')}</select>`)}<div class="grid2">${field('歌名字體', `<select data-cover="font" aria-label="歌名字體"><option value="serif" ${p.cover.font === 'serif' ? 'selected' : ''}>書寫感明體</option><option value="sans" ${p.cover.font === 'sans' ? 'selected' : ''}>清晰黑體</option></select>`)}${field('文字顏色', `<input data-cover="color" aria-label="文字顏色" type="color" value="${p.cover.color}">`)}</div>${field('歌名大小', `<input type="range" data-cover="size" aria-label="歌名大小" min="40" max="130" value="${p.cover.size}">`)}${field('歌名上下位置', `<input type="range" data-cover="position" aria-label="歌名上下位置" min="30" max="75" value="${p.cover.position}">`)}${field('背景壓暗，讓歌名更清楚', `<input type="range" data-cover="shade" aria-label="背景壓暗" min="0" max="80" value="${p.cover.shade}">`)}<div class="actions">${action('export-cover','下載這首封面','primary')}${action('export-covers','下載全部封面 ZIP')}</div></div></div>${p.mode === 'album' ? `<details open><summary>專輯概念與曲序</summary><label for="concept">專輯概念</label><textarea id="concept" data-project-field="concept" maxlength="6000">${escape(p.concept)}</textarea><label for="shared-style">共同聲音設定</label><textarea id="shared-style" data-project-field="sharedStyle" maxlength="3000">${escape(p.sharedStyle)}</textarea><p class="muted">共同設定會帶入後續 AI 改寫；不會直接覆寫已完成歌曲的曲風。</p>${p.tracks.map((track,i) => `<div class="plan-track"><div class="row spread"><h3>${String(i+1).padStart(2,'0')} · ${escape(track.title)}</h3><div class="row">${action('move-up','↑','ghost',`data-id="${track.id}" aria-label="將 ${escape(track.title)} 往前移" ${i===0?'disabled':''}`)}${action('move-down','↓','ghost',`data-id="${track.id}" aria-label="將 ${escape(track.title)} 往後移" ${i===p.tracks.length-1?'disabled':''}`)}</div></div><p class="muted">${escape(track.role)}</p></div>`).join('')}</details>` : ''}`;
}
function dialog(title, body) { const el = $('#modal'); el.innerHTML = `<div class="dialog-head"><h2>${escape(title)}</h2>${action('close-dialog','×','ghost','aria-label="關閉"')}</div>${body}`; if (!el.open) el.showModal(); }
function closeDialog() { $('#modal').close(); $('#modal').replaceChildren(); externalContext = null; }
async function busy(task) { if (state.busy) return; state.busy = true; render(); try { await task(); } catch (error) { report(error); } finally { state.busy = false; render(); } }
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast('已複製，可以貼到下一步。'); } catch { dialog('請手動複製', `<p>瀏覽器未允許自動複製，可選取以下文字。</p><textarea id="manual-copy" class="code" readonly>${escape(text)}</textarea>`); $('#manual-copy').select(); } }
function checkedBrief() { const b = structuredClone(state.brief); b.count = b.mode === 'single' ? 1 : Number(b.count); validateBrief(b); return b; }
function blankCreative(b) {
  return { title: b.mode === 'album' ? '我的新專輯' : '我的新單曲', concept: b.idea, sharedStyle: '', tracks: Array.from({length:b.count}, (_,i) => ({title:b.count===1?'還沒想好歌名':`第 ${i+1} 首`, role:i===0?b.idea:'這首歌在專輯中的故事…', style:b.genre==='幫我決定'?'mandopop, melodic, expressive vocals':`${b.genre}, melodic, expressive vocals`, lyrics:i===0?b.existingLyrics||'':'', voice:b.voice, instrumental:b.voice==='純音樂'})) };
}
async function addProject(p) { await saveProject(p); state.projects.unshift(p); setCurrent(p); savedLabel('已保存於此瀏覽器'); render(); }
function requestContext(feedback = '') {
  const p = currentProject(), t = currentTrack();
  return p ? { brief: { ...p.brief, idea:`${p.brief.idea}\n專輯概念：${p.concept}\n共同曲風：${p.sharedStyle}`.slice(0,6000) }, current: {title:t.title,role:t.role,style:t.style,lyrics:t.lyrics,voice:t.voice,instrumental:t.instrumental}, projectId:p.id, trackId:t.id, revision:revisionKey(t), feedback } : {brief:checkedBrief(),current:null,feedback};
}
function showExternal(context) {
  externalContext = context;
  dialog('用 Gemini Chat 完成草稿', `<p>按下「開啟 Gemini Chat」後，網站會複製提示詞並開啟 Gemini。到 Gemini 貼上，複製回覆，再貼回這裡。</p><details><summary>查看將複製的內容</summary><textarea class="code" readonly>${escape(chatPrompt(context))}</textarea></details><div class="row">${action('open-gemini','↗ 開啟 Gemini Chat','primary')}${action('copy-prompt','只複製提示詞')}${action('settings','修改模板','ghost')}</div><label for="ai-response" class="top-gap">貼上 Gemini 回覆</label><textarea id="ai-response" class="code" placeholder='{"title":"…","concept":"…","tracks":[…]}'></textarea><div id="import-error" role="alert"></div><div class="actions">${action('apply-response',context.current?'套用草稿並保留舊版':'檢查並建立作品','primary')}</div>`);
}
function chatPrompt(context) { const prompt = buildPrompt(context.brief, context.current, context.feedback); return state.chatTemplate.includes('%s') ? state.chatTemplate.replaceAll('%s', prompt) : `${state.chatTemplate}\n\n${prompt}`; }
async function applyCreative(data, ctx, source) {
  const creative = parseCreativeResponse(data);
  if (ctx.current) {
    if (creative.tracks.length !== 1) throw new Error('改寫只接受一首歌曲；請讓 AI 只回覆目前曲目。');
    const p = state.projects.find(p => p.id === ctx.projectId), t = p?.tracks.find(t => t.id === ctx.trackId);
    if (!t) throw new Error('原曲目已不存在，沒有覆寫任何資料。');
    const next = creative.tracks[0];
    if (!next.instrumental && !next.lyrics) throw new Error('這首改寫沒有歌詞，請讓 AI 完成後再貼回。');
    if (revisionKey(t) !== ctx.revision) throw new Error('原稿已經修改，請重新從這一首發起改寫，避免覆蓋新內容。');
    preserveVersion(t, `${source}前的版本`); Object.assign(t, next); await queueSave(p); setCurrent(p,t);
  } else {
    if (creative.tracks.length !== ctx.brief.count) throw new Error(`需求為 ${ctx.brief.count} 首，但回覆有 ${creative.tracks.length} 首。請調整回覆再匯入。`);
    if (ctx.brief.existingLyrics) creative.tracks[0].lyrics = ctx.brief.existingLyrics;
    const p = createProject(ctx.brief,creative); await addProject(p);
  }
  toast('草稿已保存，可以開始修改。');
}
async function requestAI(ctx) {
  if (!state.apiKey) { showExternal(ctx); return; }
  await busy(async () => {
    toast('正在整理創作，最多等候 90 秒…');
    const result = await fetch('/api/generate', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...ctx,apiKey:state.apiKey,model:state.model})});
    const data = await result.json(); if (!result.ok) throw new Error(data.error || 'AI 暫時無法完成。');
    await applyCreative(data,ctx,'AI 改寫');
  });
}
function showSettings() {
  dialog('AI 設定', `<p>設定後可直接在網站寫詞與改寫；不設定也能透過按鈕開啟 Gemini Chat。</p><div class="note">這裡使用 Gemini API，與 Suno Pro 分開計費。只送出創作文字，不送音檔或封面。</div><label for="api-key">Gemini API 金鑰（選填）</label><input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="貼入你的 API 金鑰" value="${escape(state.apiKey)}"><p class="muted">金鑰只留在這次頁面記憶體，重整就清除，不寫入作品備份。</p><label for="api-model">模型</label><input id="api-model" value="${escape(state.model)}" maxlength="80"><small>預設 gemini-2.5-flash，可依帳號可用模型修改。</small><label for="chat-template">Gemini Chat 提示詞模板</label><textarea id="chat-template" maxlength="6000" placeholder="使用 %s 代表歌曲需求">${escape(state.chatTemplate)}</textarea><small>按鈕會把 `%s` 替換成完整歌曲需求；沒有 `%s` 就接在模板後面。</small><p><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">前往 Google AI Studio 取得金鑰 ↗</a></p><div class="actions">${action('save-settings','保存設定','primary')}${action('clear-settings','清除金鑰','ghost')}</div>`);
}
function showHelp() {
  dialog('Suno 小幫手', `<p>適用電腦版 Chrome／Edge。只填入歌名、歌詞與曲風，不會自動生成。</p><ol><li>下載並解壓縮下方擴充套件。</li><li>開啟瀏覽器「擴充功能」管理頁，開啟「開發人員模式」。</li><li>選「載入未封裝項目」，選擇含 manifest.json 的資料夾。</li><li>回到本網站的「到 Suno 製作」，按「複製給 Suno 小幫手」。</li><li>打開 Suno，切到 Custom 模式，再開啟套件貼入資料。</li><li>按「讀取歌曲」後填入，檢查內容並手動生成。</li></ol><a href="/suno-helper.zip" download>下載 Suno 小幫手 ZIP</a><div class="note warning">Suno 網頁欄位可能改版。找不到欄位時不會亂填；請使用逐欄複製。第一版以模擬頁驗證，尚未在你的登入帳號實測。</div><p class="muted">套件只在你點擊時存取目前分頁，不讀取帳號密碼。</p>`);
}
function showVersions() {
  const t = currentTrack();
  dialog('歌詞版本紀錄', `<p class="muted">保存歌名、歌詞、曲風及人聲設定；不包含音檔。還原前會保留現在的版本。</p><div class="version-list">${t.versions.length ? [...t.versions].reverse().map(v => `<div class="version-card"><div class="row spread"><div><strong>${escape(v.label)}</strong><br><small>${formatTime(v.at)} · ${escape(v.title)}</small></div>${action('restore-version','還原這版','',`data-id="${v.id}"`)}</div><pre>${escape(v.lyrics || '純音樂／尚無歌詞')}</pre></div>`).join('') : '<p class="empty">還沒有版本。按「保存一個版本」記住現在的草稿。</p>'}</div>`);
}
async function updateCoverPreview() {
  const token = renderToken, canvas = $('#cover-canvas'); if (!canvas) return;
  const p = structuredClone(currentProject()), t = structuredClone(currentTrack());
  const temp = document.createElement('canvas');
  try { await drawCover(temp,p,t); if (token !== renderToken || canvas !== $('#cover-canvas')) return; canvas.width = canvas.height = 1200; canvas.getContext('2d').drawImage(temp,0,0); }
  catch(error) { if ($('#cover-status')) $('#cover-status').textContent = error.message; }
}
async function mountAudio() {
  const p = currentProject(), t = currentTrack(), token = renderToken; if (!t.audio) return;
  const blob = await getAsset(t.audio.id); if (token !== renderToken) return;
  const container = $('#audio-player'); if (!container) return;
  if (!blob) { container.textContent='音檔遺失，請重新匯入。'; return; }
  audioUrl = URL.createObjectURL(blob); const player = document.createElement('audio'); player.controls = true; player.preload = 'metadata'; player.src = audioUrl; container.replaceChildren(player);
  player.addEventListener('error', () => toast('瀏覽器無法播放這個音檔，可下載原檔確認。'));
}
function assertAssetBudget(project, file, replacing = 0) {
  const total = project.tracks.reduce((sum,t)=>sum+(t.audio?.size||0),0)+(project.cover.assetSize||0)-replacing+file.size;
  if(total>200*1024*1024)throw new Error('這份作品的素材會超過 200 MB。請使用較小的音檔或另開作品，原資料未變更。');
}
async function verifyAudio(file) {
  if (!/\.(mp3|wav|m4a|ogg|flac|webm)$/i.test(file.name) || file.size > 80*1024*1024 || !file.size) throw new Error('請選擇支援的音檔，每首不超過 80 MB。');
  const url = URL.createObjectURL(file), audio = new Audio();
  try { await new Promise((resolve,reject) => { const timeout = setTimeout(() => reject(new Error('讀取音檔逾時，原音檔未變更。')),10000); audio.onloadedmetadata = () => {clearTimeout(timeout); resolve();}; audio.onerror = () => {clearTimeout(timeout); reject(new Error('此檔案無法播放，請改用 MP3 或 WAV。'));}; audio.src=url; }); } finally {audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url);}
}
async function importAudio(file) {
  const p = currentProject(), t = currentTrack(); if (!file) return;
  await busy(async () => { await verifyAudio(file); assertAssetBudget(p,file,t.audio?.size||0); await pending.catch(()=>{}); const next = structuredClone(p), target = next.tracks.find(x=>x.id===t.id), old = target.audio?.id, id = uid();
    target.audio = {id,name:file.name,type:file.type||'application/octet-stream',size:file.size,at:Date.now(),revision:revisionKey(t)}; next.updatedAt=Date.now();
    await saveWithAssets(next,[[id,file]]); Object.assign(p,next); if(old) await deleteAsset(old); savedLabel('音檔已保存於此瀏覽器'); toast('音檔已收好，可在這裡播放。'); });
}
async function importCover(file) {
  if (!file) return; const p=currentProject();
  await busy(async()=>{ if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024) throw new Error('請選擇 12 MB 以內的 JPG、PNG 或 WebP。');
    const bitmap=await createImageBitmap(file); if(bitmap.width*bitmap.height>40000000){bitmap.close();throw new Error('圖片解析度太大，請縮小到 4,000 萬像素以內。');} bitmap.close(); assertAssetBudget(p,file,p.cover.assetSize||0);
    await pending.catch(()=>{});const next=structuredClone(p),old=next.cover.assetId,id=uid();next.cover.assetId=id;next.cover.assetSize=file.size;next.cover.blob=null;next.updatedAt=Date.now();await saveWithAssets(next,[[id,file]]);Object.assign(p,next);if(old)await deleteAsset(old);toast('整張專輯已共用這張主視覺。'); });
}
async function backupProject() {
  const p = structuredClone(currentProject()); await busy(async()=>{const assets=[],entries=[];
    for(const id of [p.cover.assetId,...p.tracks.map(t=>t.audio?.id)].filter(Boolean)){const blob=await getAsset(id);if(!blob)throw new Error('有素材遺失，請重新匯入後再備份。');assets.push({id,path:`assets/${id}`,type:blob.type});entries.push({name:`assets/${id}`,data:blob});}
    entries.unshift({name:'project.json',data:JSON.stringify({schema:'songcraft-backup',version:1,project:p,assets},null,2)});
    download(await makeZip(entries),`${safeName(p.title)}_完整備份.songcraft`);toast('備份已匯出，包含文字、版本、音檔與背景。'); });
}
async function importBackup(file) {
  if(!file)return;await busy(async()=>{const entries=await readZip(file),manifest=entries.get('project.json');if(!manifest||manifest.length>220*1024*1024)throw new Error('缺少有效的作品資料。');let data;try{data=JSON.parse(new TextDecoder().decode(manifest));}catch{throw new Error('作品資料不是有效 JSON。');}
    if(data.schema!=='songcraft-backup'||data.version!==1||!Array.isArray(data.assets)||data.assets.length>9)throw new Error('備份版本或素材資料不正確。');
    const old=data.project;validateBrief(old?.brief);const creative=parseCreativeResponse(old,{draft:true});const p=createProject(old.brief,creative,{draft:true});p.title=`${p.title.slice(0,114)}（匯入）`;
    const map=new Map(),assets=[];for(const a of data.assets){if(typeof a.id!=='string'||map.has(a.id)||!['image/png','image/jpeg','image/webp','audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/ogg','audio/flac','audio/webm','audio/x-m4a','application/octet-stream'].includes(a.type))throw new Error('素材格式無法識別。');const bytes=entries.get(a.path);if(!bytes||bytes.length>80*1024*1024)throw new Error('素材遺失或過大。');const id=uid();map.set(a.id,id);assets.push([id,new Blob([bytes],{type:a.type})]);}if(assets.reduce((sum,entry)=>sum+entry[1].size,0)>200*1024*1024)throw new Error('此作品的素材超過 200 MB。');
    const c=old.cover||{};p.cover={...p.cover,theme:['night','forest','plum','blue'].includes(c.theme)?c.theme:'night',font:c.font==='sans'?'sans':'serif',color:/^#[0-9a-f]{6}$/i.test(c.color)?c.color:'#ffffff',size:Math.min(130,Math.max(40,Number(c.size)||90)),shade:Math.min(80,Math.max(0,Number(c.shade)||0)),position:Math.min(75,Math.max(30,Number(c.position)||50))};
    if(c.assetId){if(!map.has(c.assetId))throw new Error('背景素材遺失。');p.cover.assetId=map.get(c.assetId);p.cover.assetSize=assets.find(([id])=>id===p.cover.assetId)[1].size;}
    p.tracks.forEach((t,i)=>{const src=old.tracks[i];t.sunoUrl=typeof src.sunoUrl==='string'?src.sunoUrl.slice(0,2000):'';if(src.audio){if(!map.has(src.audio.id))throw new Error('歌曲音檔遺失。');const blob=assets.find(([id])=>id===map.get(src.audio.id))[1];t.audio={id:map.get(src.audio.id),name:String(src.audio.name||'歌曲').slice(0,200),size:blob.size,type:blob.type,at:Date.now(),revision:typeof src.audio.revision==='string'?src.audio.revision.slice(0,60000):null};}
      if(!Array.isArray(src.versions)||src.versions.length>300)throw new Error('版本紀錄格式錯誤。');t.versions=src.versions.map(v=>{const clean=parseCreativeResponse({title:'版本',tracks:[v]},{draft:true}).tracks[0];return{...clean,id:uid(),at:Number(v.at)||Date.now(),label:String(v.label||'匯入版本').slice(0,100)};});});
    await saveWithAssets(p,assets);state.projects.unshift(p);setCurrent(p);savedLabel('備份已匯入為新作品');toast('已新增備份副本，原作品沒有被覆寫。'); });
}
function chooseFile(accept,onFile){const input=document.createElement('input');input.type='file';input.accept=accept;input.onchange=()=>Promise.resolve(onFile(input.files[0])).catch(report);input.click();}
async function exportCovers(all) {const p=structuredClone(currentProject()),tracks=all?p.tracks:[structuredClone(currentTrack())];await busy(async()=>{const entries=[];for(const t of tracks){const canvas=document.createElement('canvas');await drawCover(canvas,p,t);const blob=await canvasBlob(canvas),name=`${String(p.tracks.findIndex(x=>x.id===t.id)+1).padStart(2,'0')}_${safeName(t.title)}.png`;entries.push({name,data:blob});}download(all?await makeZip(entries):entries[0].data,all?`${safeName(p.title)}_全部封面.zip`:entries[0].name);toast(all?'所有歌曲封面已匯出。':'歌曲封面已匯出。');});}
function projectSettings(){const p=currentProject();dialog('作品設定',`<label for="project-title">${p.mode==='album'?'專輯':'作品'}名稱</label><input id="project-title" maxlength="120" value="${escape(p.title)}"><div class="actions">${action('save-project-title','保存名稱','primary')}${action('delete-project','刪除這份作品','danger')}</div><p class="muted">刪除會移除此作品的文字與本機音檔，請先備份。</p>`);}
const actions = {
  new:async()=>{await pending;state.projectId=null;state.trackId=null;render();},
  'mode-single':()=>{state.brief.mode='single';state.brief.count=1;render();},
  'mode-album':()=>{state.brief.mode='album';state.brief.count=3;render();},
  sample:()=>addProject(sampleProject()),
  'create-manual':async()=>{const b=checkedBrief();await addProject(createProject(b,blankCreative(b)));},
  'create-ai':()=>requestAI(requestContext()),
  rewrite:()=>requestAI(requestContext($('#feedback')?.value || '改善可唱性與副歌記憶點')),
  settings:showSettings,help:showHelp,'close-dialog':closeDialog,
  'save-settings':()=>{const key=$('#api-key').value.trim(),model=$('#api-model').value.trim(),template=$('#chat-template').value;if(key&&key.length<10)throw new Error('金鑰格式不完整。');if(!/^gemini-[a-z0-9.-]{3,70}$/.test(model))throw new Error('請填入 Gemini 模型名稱。');if(template.length>6000)throw new Error('模板最多 6,000 字。');state.apiKey=key;state.model=model;state.chatTemplate=template||'請依照以下需求完成歌曲創作，並只輸出符合指定格式的 JSON：\n\n%s';closeDialog();render();toast('AI 設定已保存。');},
  'clear-settings':()=>{state.apiKey='';closeDialog();render();toast('金鑰已清除。');},
  'copy-prompt':()=>copyText(chatPrompt(externalContext)),
  'open-gemini':async()=>{const tab=window.open('https://gemini.google.com/app','_blank','noopener,noreferrer');await copyText(chatPrompt(externalContext));toast(tab?'提示詞已複製，Gemini Chat 已開啟。':'提示詞已複製；瀏覽器阻擋了新分頁，請手動開啟 Gemini Chat。');},
  'apply-response':async()=>{const text=$('#ai-response').value,ctx=externalContext;try{await applyCreative(text,ctx,'外部 AI 改寫');closeDialog();render();}catch(error){$('#import-error').className='form-error';$('#import-error').textContent=error.message;}},
  'save-version':async()=>{const t=currentTrack();if(t.versions.length>=300)throw new Error('版本已達 300，請備份後另開作品。');preserveVersion(t);await queueSave();render();toast('已保留這個版本。');},
  versions:showVersions,
  'restore-version':async el=>{const t=currentTrack(),v=t.versions.find(v=>v.id===el.dataset.id);if(!v)return;preserveVersion(t,'還原前的版本');for(const k of ['title','role','style','lyrics','voice','instrumental'])t[k]=v[k];await queueSave();closeDialog();render();toast('已還原，剛才的版本也保留了。');},
  'next-suno':()=>{state.tab='suno';render();},'next-audio':()=>{state.tab='audio';render();},'next-cover':()=>{state.tab='cover';render();},
  'copy-title':()=>copyText(currentTrack().title),'copy-style':()=>copyText(currentTrack().style),'copy-lyrics':()=>copyText(currentTrack().lyrics),
  'copy-transfer':()=>{const t=currentTrack();if(!t.title.trim()||!t.style.trim()||(!t.instrumental&&!t.lyrics.trim()))throw new Error('請先補上歌名、曲風與歌詞。');return copyText(JSON.stringify(transferTrack(t),null,2));},
  'export-transfer':()=>{const t=currentTrack();download(new Blob([JSON.stringify(transferTrack(t),null,2)],{type:'application/json'}),`${safeName(t.title)}.suno.json`);},
  'export-lyrics':()=>{const t=currentTrack();download(new Blob([`${t.title}\n\n${t.lyrics}\n\nStyle\n${t.style}`],{type:'text/plain;charset=utf-8'}),`${safeName(t.title)}_歌詞.txt`);},
  'download-audio':async()=>{const a=currentTrack().audio,blob=await getAsset(a.id);if(!blob)throw new Error('音檔遺失，請重新匯入。');download(blob,safeName(a.name));},
  'remove-cover':async()=>{const p=currentProject(),id=p.cover.assetId;delete p.cover.assetId;delete p.cover.assetSize;await queueSave(p);if(id)await deleteAsset(id);render();},
  'export-cover':()=>exportCovers(false),'export-covers':()=>exportCovers(true),backup:backupProject,
  'import-backup':()=>{ $('#backup-file').value=''; $('#backup-file').click(); },
  'project-settings':projectSettings,
  'save-project-title':async()=>{const title=$('#project-title').value.trim();if(!title)throw new Error('請填入作品名稱。');currentProject().title=title;await queueSave();closeDialog();render();},
  'delete-project':()=>{dialog('刪除作品？',`<p>「${escape(currentProject().title)}」的文字、版本、音檔與背景將從此瀏覽器移除。</p><p>此操作無法復原，除非你已下載備份。</p><div class="actions">${action('close-dialog','保留作品','primary')}${action('confirm-delete','確定刪除','danger')}</div>`);},
  'confirm-delete':async()=>{const p=currentProject();await pending;await deleteProject(p);state.projects=state.projects.filter(x=>x.id!==p.id);state.projectId=null;state.trackId=null;closeDialog();render();toast('作品已刪除。');},
  'add-track':async()=>{const p=currentProject();if(p.tracks.length>=8)return;const t={id:uid(),title:`第 ${p.tracks.length+1} 首`,role:'',lyrics:'',style:p.sharedStyle||'mandopop, melodic',voice:p.brief.voice,instrumental:false,status:'draft',versions:[],audio:null,sunoUrl:''};p.tracks.push(t);p.brief.count=p.tracks.length;state.trackId=t.id;await queueSave();render();},
  'move-up':el=>moveTrack(el.dataset.id,-1),'move-down':el=>moveTrack(el.dataset.id,1),
};
async function moveTrack(id,direction){const p=currentProject(),i=p.tracks.findIndex(t=>t.id===id),next=i+direction;if(next<0||next>=p.tracks.length)return;[p.tracks[i],p.tracks[next]]=[p.tracks[next],p.tracks[i]];await queueSave();render();}
document.addEventListener('click',async event=>{const el=event.target.closest('button');if(!el||el.disabled||state.busy)return;try{
  if(el.dataset.project){await pending;state.projectId=el.dataset.project;state.trackId=currentProject().tracks[0].id;state.tab='write';render();}
  else if(el.dataset.track){await pending;state.trackId=el.dataset.track;render();}
  else if(el.dataset.tab){await pending;state.tab=el.dataset.tab;render();}
  else if(el.dataset.rewrite){await requestAI(requestContext(el.dataset.rewrite));}
  else if(actions[el.dataset.action])await actions[el.dataset.action](el);
}catch(error){report(error);}});
document.addEventListener('input',event=>{const el=event.target;if(state.busy)return;
  if(el.dataset.brief){state.brief[el.dataset.brief]=el.dataset.brief==='count'?Number(el.value):el.value;}
  if(el.dataset.trackField){const t=currentTrack();t[el.dataset.trackField]=el.type==='checkbox'?el.checked:el.value;queueSave();}
  if(el.dataset.projectField){currentProject()[el.dataset.projectField]=el.value;queueSave();}
  if(el.dataset.cover){currentProject().cover[el.dataset.cover]=el.type==='range'?Number(el.value):el.value;queueSave();renderToken++;updateCoverPreview();}
});
document.addEventListener('change',event=>{const el=event.target;if(el.id==='audio-file')importAudio(el.files[0]).catch(report);if(el.id==='cover-file')importCover(el.files[0]).catch(report);if(el.id==='backup-file')importBackup(el.files[0]).catch(report);if(el.dataset.trackField==='instrumental')render();});
document.addEventListener('dragover',event=>{const zone=event.target.closest('#audio-drop');if(zone){event.preventDefault();zone.classList.add('drag');}});
document.addEventListener('dragleave',event=>event.target.closest('#audio-drop')?.classList.remove('drag'));
document.addEventListener('drop',event=>{if(event.target.closest('#audio-drop')){event.preventDefault();importAudio(event.dataTransfer.files[0]).catch(report);}});

function registerTools(){const context=document.modelContext;if(!context?.registerTool)return;try{Promise.resolve(context.registerTool({name:'get_current_song',title:'讀取目前歌曲',description:'讀取目前選定歌曲的文字與階段，不含金鑰或音檔。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>{const t=currentTrack();return t?{project:currentProject().title,title:t.title,lyrics:t.lyrics,style:t.style,tab:state.tab}:{state:'no_song_selected'};}})).catch(()=>{});}catch{/* WebMCP 為選用能力。 */}}
async function initialize() {
  try { state.projects=await listProjects(); render(); registerTools(); } catch(error){$('#app').innerHTML=`<main class="workspace"><h1>本機資料暫時無法開啟</h1><p>${escape(error.message)}</p><p>請使用一般瀏覽模式，並允許此網站保存資料，再重新整理。</p></main>`;}
}
if(navigator.locks?.request) {
  navigator.locks.request('songcraft-editor',{ifAvailable:true},async lock=>{
    if(!lock){$('#app').innerHTML='<main class="workspace"><h1>歌作已在另一個分頁開啟</h1><p>請回到原分頁繼續，避免兩邊修改互相覆蓋。關閉原分頁後，可重新整理這一頁。</p></main>';return;}
    await initialize(); await new Promise(()=>{});
  }).catch(report);
} else {
  $('#app').innerHTML='<main class="workspace"><h1>請使用新版 Chrome 或 Edge</h1><p>此瀏覽器缺少保護作品所需的分頁鎖定功能。</p></main>';
}
