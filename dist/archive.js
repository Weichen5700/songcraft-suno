const encoder = new TextEncoder();
const decoder = new TextDecoder();
const table = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export function crc32(data) { let c = 0xffffffff; for (const b of data) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function header(size) { const bytes = new Uint8Array(size); return [bytes, new DataView(bytes.buffer)]; }
export async function makeZip(entries) {
  const local = [], central = []; let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name), data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(await new Blob([entry.data]).arrayBuffer());
    const crc = crc32(data); const [l, v] = header(30);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true);
    local.push(l, name, data);
    const [c, cv] = header(46); cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    central.push(c, name); offset += l.length + name.length + data.length;
  }
  const centralSize = central.reduce((n, a) => n + a.length, 0), [end, ev] = header(22);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}
export async function readZip(blob) {
  if (blob.size > 512 * 1024 * 1024) throw new Error('備份超過 512 MB。');
  const data = new Uint8Array(await blob.arrayBuffer()), view = new DataView(data.buffer); let offset = 0;
  const entries = new Map();
  while (offset + 30 <= data.length && view.getUint32(offset, true) === 0x04034b50) {
    if (entries.size > 100 || view.getUint16(offset + 8, true) !== 0 || (view.getUint16(offset + 6, true) & 9)) throw new Error('請使用歌作匯出的原始備份，勿重新壓縮。');
    const size = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), extra = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extra, end = start + size;
    if (end > data.length || size !== view.getUint32(offset + 22, true)) throw new Error('備份已截斷或格式不正確。');
    const name = decoder.decode(data.subarray(offset + 30, offset + 30 + nameLength));
    if (entries.has(name) || name.includes('..') || name.startsWith('/') || name.includes('\\')) throw new Error('備份檔名不正確。');
    const bytes = data.subarray(start, end);
    if (crc32(bytes) !== view.getUint32(offset + 14, true)) throw new Error('備份內容損壞，無法安全匯入。');
    entries.set(name, bytes); offset = end;
  }
  if (!entries.size || offset + 4 > data.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('這不是歌作備份檔。');
  return entries;
}
export function download(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
