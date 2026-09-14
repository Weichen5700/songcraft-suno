import { getAsset } from './db.js';
export function fitLines(ctx, text, maxWidth, maxLines = 4, requested = 90) {
  let size = requested, lines = [];
  while (size >= 14) {
    ctx.font = `${size}px ${ctx.coverFont || 'serif'}`; lines = []; let line = '';
    for (const char of Array.from(text)) {
      if (char === '\n') { lines.push(line); line = ''; continue; }
      if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = char; } else line += char;
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines) return { size, lines }; size -= 2;
  }
  return { size: 14, lines };
}
export async function drawCover(canvas, project, track) {
  const settings = project.cover;
  canvas.width = canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  const themes = { night: ['#123441', '#0b141f'], forest: ['#16584c', '#0d2827'], plum: ['#633f65', '#261d3b'], blue: ['#2c6297', '#172941'] };
  const colors = themes[settings.theme] || themes.night;
  const gradient = ctx.createLinearGradient(0, 0, 1200, 1200); gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 1200);
  if (settings.assetId) {
    const blob = await getAsset(settings.assetId); if (!blob) throw new Error('背景圖片遺失，請重新上傳。');
    const bitmap = await createImageBitmap(blob); const s = Math.max(1200 / bitmap.width, 1200 / bitmap.height);
    ctx.drawImage(bitmap, (1200 - bitmap.width * s) / 2, (1200 - bitmap.height * s) / 2, bitmap.width * s, bitmap.height * s); bitmap.close();
  }
  ctx.fillStyle = `rgba(0,0,0,${settings.shade / 100})`; ctx.fillRect(0, 0, 1200, 1200);
  await document.fonts.ready;
  const family = settings.font === 'sans' ? '"Microsoft JhengHei", sans-serif' : '"Noto Serif TC", "PMingLiU", serif';
  ctx.coverFont = family; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = settings.color;
  ctx.shadowColor = '#0009'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  const top = fitLines(ctx, project.mode === 'album' ? project.title : 'SONGCRAFT • ORIGINAL', 950, 2, 30);
  top.lines.forEach((line, i) => ctx.fillText(line, 600, 115 + i * 42));
  const title = fitLines(ctx, track.title || '未命名歌曲', 940, 4, settings.size);
  const lineHeight = title.size * 1.5, blockHeight = title.lines.length * lineHeight;
  const center = Math.min(1010 - blockHeight / 2, Math.max(250 + blockHeight / 2, settings.position * 12));
  title.lines.forEach((line, i) => ctx.fillText(line, 600, center + (i - (title.lines.length - 1) / 2) * lineHeight));
  ctx.font = '24px sans-serif'; ctx.fillText(project.mode === 'album' ? 'ORIGINAL ALBUM' : 'ORIGINAL SINGLE', 600, 1080);
  return canvas;
}
export const canvasBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('圖片匯出失敗。')), 'image/png'));
