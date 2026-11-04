const ready = new Promise((resolve, reject) => {
  const request = indexedDB.open('afterframe-studio', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('paintings', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('Local storage is unavailable. Open in a normal browser tab and allow site storage.'));
});
async function run(mode, action) {
  const db = await ready;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('paintings', mode);
    const req = action(tx.objectStore('paintings'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error || new Error('Could not save. Your browser storage may be full.'));
    tx.onabort = () => reject(tx.error || new Error('Storage operation was interrupted.'));
  });
}
export const listPaintings = () => run('readonly', store => store.getAll());
export const savePainting = painting => run('readwrite', store => store.put(painting));
export const deletePainting = id => run('readwrite', store => store.delete(id));
