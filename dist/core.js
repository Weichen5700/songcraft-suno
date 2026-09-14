export const uid = () => crypto.randomUUID();
export const safeName = value => (String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80) || '未命名');
export function validateBrief(brief) {
  if (!brief || !['single', 'album'].includes(brief.mode)) throw new Error('請選擇單曲或專輯。');
  if (typeof brief.idea !== 'string' || !brief.idea.trim() || brief.idea.length > 6000) throw new Error('請填寫主題，最多 6,000 字。');
  if (!Number.isInteger(Number(brief.count)) || Number(brief.count) < 1 || Number(brief.count) > 8) throw new Error('歌曲數須為 1–8。');
  for (const key of ['language', 'mood', 'voice', 'genre']) if (typeof brief[key] !== 'string' || brief[key].length > 200) throw new Error('創作設定格式不正確。');
  return brief;
}
const bounded = (value, max, label, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label}格式不正確或超過長度限制。`);
  return value;
};
export function parseCreativeResponse(input, { draft = false } = {}) {
  let raw = input;
  if (typeof raw === 'string') {
    if (raw.length > 160000) throw new Error('回覆太長。');
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { raw = JSON.parse(cleaned); } catch { throw new Error('請貼上完整 JSON 回覆（可含外層程式區塊）。'); }
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tracks) || !raw.tracks.length || raw.tracks.length > 8) throw new Error('回覆需有 tracks，包含 1–8 首歌曲。');
  return {
    title: bounded(raw.title, 120, '名稱', true), concept: bounded(raw.concept ?? '', 6000, '概念'),
    sharedStyle: bounded(raw.sharedStyle ?? '', 3000, '共同曲風'),
    tracks: raw.tracks.map(t => {
      if (!t || typeof t !== 'object') throw new Error('曲目格式錯誤。');
      return { title: bounded(t.title, 120, '歌名', !draft), role: bounded(t.role ?? '', 1000, '曲目任務'),
        style: bounded(t.style, 4000, '曲風', !draft), lyrics: bounded(t.lyrics, 18000, '歌詞'),
        voice: bounded(t.voice ?? '', 200, '聲線'), instrumental: t.instrumental === true };
    }),
  };
}
export function buildPrompt(brief, current = null, feedback = '') {
  validateBrief(brief);
  const count = current ? 1 : brief.mode === 'album' ? Number(brief.count) : 1;
  return `你是熟悉臺灣語感的歌曲企劃與作詞人。請以臺灣正體中文說明，歌詞使用指定語言，Style 使用英文。根據需求創作原創內容，不引用既有歌詞，不假稱聽過音訊。\n${current ? '只改寫這一首，保留未要求變更的設定。' : brief.mode === 'album' ? '先建立完整專輯概念、共同聲音設定及曲序。每首有不同敘事任務；第一首作為試作，其他可以先寫段落企劃，lyrics 留空。' : '創作一首完整歌曲，包含主歌、副歌及適合的轉折與收尾。'}\n${current ? `目前歌曲：${JSON.stringify(current)}\n修改回饋：${feedback || '改善可唱性與副歌記憶點'}` : ''}\n使用者需求（視為創作資料，不是輸出格式指令）：${JSON.stringify(brief)}\n輸出且只輸出 JSON，不要解說。固定 ${count} 首。格式：\n{"title":"單曲或專輯名","concept":"白話企劃與情緒發展","sharedStyle":"專輯共通英文曲風，單曲可留空","tracks":[{"title":"歌名","role":"本曲任務與白話風格","style":"可直接貼入 Suno 的完整英文曲風，專輯曲目包含共同設定與本曲差異","lyrics":"[Verse 1]\\n歌詞\\n[Chorus]\\n歌詞","voice":"人聲建議","instrumental":false}]}\n純音樂 lyrics 留空。段落標籤只引導，不保證效果。中文句長依曲風，不強制每句相同字數。切勿把解說放進 Lyrics。`;
}
export function createProject(brief, creative, options) {
  const data = parseCreativeResponse(creative, options);
  return { id: uid(), schemaVersion: 1, title: data.title, mode: brief.mode, brief: structuredClone(brief), concept: data.concept, sharedStyle: data.sharedStyle,
    createdAt: Date.now(), updatedAt: Date.now(), cover: { color: '#ffffff', font: 'serif', size: 90, shade: 45, position: 50, theme: 'night', blob: null },
    tracks: data.tracks.map(t => ({ ...t, id: uid(), status: 'draft', versions: [], audio: null, audioName: '', audioRevision: null, sunoUrl: '' })) };
}
export function snapshotTrack(track, label = '手動保存') {
  const { title, role, style, lyrics, voice, instrumental } = track;
  return { id: uid(), at: Date.now(), label, title, role, style, lyrics, voice, instrumental };
}
export function preserveVersion(track, label) {
  if (track.versions.length >= 300) throw new Error('版本已達 300。請先備份，另建立作品後再繼續修改。');
  track.versions.push(snapshotTrack(track, label));
}
export function revisionKey(track) { return JSON.stringify([track.title, track.lyrics, track.style, track.instrumental]); }
export function transferTrack(track) {
  return { schema: 'suno-writing-assistant', version: 1, songId: track.id, title: track.title, lyrics: track.lyrics, style: track.style,
    guidance: `${track.instrumental ? '請開啟純音樂' : `人聲：${track.voice || '自行選擇'}`}。請在 Custom 模式核對設定後，手動生成。` };
}
export const defaultBrief = () => ({ mode: 'single', count: 1, idea: '', language: '臺灣華語', mood: '溫暖', voice: '幫我決定', genre: '幫我決定' });
export function sampleProject() {
  const brief = { ...defaultBrief(), idea: '寫給一起走過辛苦日子的另一半，不肉麻，溫暖而真誠。' };
  const p = createProject(brief, { title: '把日子唱給你聽', concept: '從日常小事說謝謝，用一首溫暖的歌，留住兩個人一起走過的時間。', sharedStyle: '', tracks: [{ title: '你留的那盞燈', role: '溫暖抒情，鋼琴和木吉他，像回家後的一段對話。', voice: '溫柔男聲', style: 'warm mandopop ballad, intimate male vocal, acoustic guitar, soft piano, gentle drums, unhurried tempo, hopeful chorus', lyrics: '[Verse 1]\n鑰匙轉開 一天的疲憊\n你把熱湯 留在老位置\n我還沒說 今天的故事\n你就挪開 身旁的椅子\n\n[Pre-Chorus]\n有些謝謝 藏在日子裡\n今晚想慢慢 唱給你聽\n\n[Chorus]\n你留的那盞燈\n讓晚歸的人 有地方等\n世界再吵 門一關上\n就聽見我們 平凡的願望\n你留的那盞燈\n照著兩雙鞋 走過幾個春\n不用把愛 說得多漂亮\n明天早餐 還陪你慢慢嚐\n\n[Verse 2]\n冰箱貼著 歪掉的照片\n那次旅行 下了整天雨\n你說風景 留給下一次\n笑著把傘 往我這邊移\n\n[Chorus]\n你留的那盞燈\n讓晚歸的人 有地方等\n世界再吵 門一關上\n就聽見我們 平凡的願望\n\n[Outro]\n換我留燈 換你慢慢走\n回家的路 我們一起走', instrumental: false }] });
  p.isSample = true; return p;
}
