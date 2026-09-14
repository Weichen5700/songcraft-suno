let opening;
export function openDB() {
  opening ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('songcraft-v1', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('projects', { keyPath: 'id' }); request.result.createObjectStore('assets'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('無法開啟本機儲存空間。請確認瀏覽器允許網站保存資料。'));
  }); return opening;
}
async function transaction(stores, mode, run) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode); let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(new Error('保存失敗：本機空間可能不足。請先備份作品，勿關閉頁面。'));
    run(tx, value => { result = value; });
  });
}
export const listProjects = () => transaction(['projects'], 'readonly', (tx, done) => { const r = tx.objectStore('projects').getAll(); r.onsuccess = () => done(r.result.sort((a, b) => b.updatedAt - a.updatedAt)); });
export const saveProject = project => transaction(['projects'], 'readwrite', tx => tx.objectStore('projects').put(project));
export const getAsset = id => transaction(['assets'], 'readonly', (tx, done) => { const r = tx.objectStore('assets').get(id); r.onsuccess = () => done(r.result); });
export const saveWithAssets = (project, assets) => transaction(['projects', 'assets'], 'readwrite', tx => { for (const [id, blob] of assets) tx.objectStore('assets').put(blob, id); tx.objectStore('projects').put(project); });
export const deleteProject = project => transaction(['projects', 'assets'], 'readwrite', tx => { tx.objectStore('projects').delete(project.id); for (const id of [project.cover.assetId, ...project.tracks.map(t => t.audio?.id)].filter(Boolean)) tx.objectStore('assets').delete(id); });
export const deleteAsset = id => transaction(['assets'], 'readwrite', tx => tx.objectStore('assets').delete(id));
