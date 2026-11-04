import { CHUNK_SIZE, MAX_VIDEO, randomToken, sleep } from './core.js';
async function digest(buffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(x => x.toString(16).padStart(2,'0')).join(''); }
export async function sendFile(connection, blob, metadata = {}, progress = () => {}) {
  if (!(blob instanceof Blob) || blob.size < 1 || blob.size > MAX_VIDEO) throw new Error('File must be between 1 byte and 64 MB.');
  const buffer = await blob.arrayBuffer();
  const id = randomToken();
  connection.send({ type:'file-start', id, size:buffer.byteLength, mime:blob.type, metadata, sha256:await digest(buffer) });
  for (let offset = 0; offset < buffer.byteLength; offset += CHUNK_SIZE) {
    const start = Date.now();
    while ((connection.dataChannel?.bufferedAmount || 0) > 512 * 1024) {
      if (!connection.open || Date.now() - start > 30000) throw new Error('Transfer interrupted. Reconnect and try again.');
      await sleep(30);
    }
    if (!connection.open) throw new Error('Phone disconnected during transfer.');
    connection.send({ type:'file-chunk', id, offset, data:buffer.slice(offset, offset + CHUNK_SIZE) });
    progress(Math.min(1, (offset + CHUNK_SIZE) / buffer.byteLength));
    if ((offset / CHUNK_SIZE) % 8 === 0) await sleep(0);
  }
  connection.send({ type:'file-end', id });
}
export class FileReceiver {
  constructor(onFile, onError, onProgress = () => {}) { this.onFile = onFile; this.onError = onError; this.onProgress = onProgress; this.files = new Map(); }
  async accept(message) {
    if (!message || !String(message.type).startsWith('file-')) return false;
    try {
      if (message.type === 'file-start') {
        if (this.files.size >= 2 || !/^[a-f0-9]{48}$/.test(message.id) || !Number.isSafeInteger(message.size) || message.size < 1 || message.size > MAX_VIDEO || !/^[a-f0-9]{64}$/.test(message.sha256)) throw new Error('Invalid or oversized incoming file.');
        this.files.set(message.id, { ...message, parts:[], received:0, started:Date.now() });
      } else {
        const file = this.files.get(message.id);
        if (!file || Date.now() - file.started > 180000) throw new Error('Unknown or expired file transfer.');
        if (message.type === 'file-chunk') {
          // PeerJS yields typed-array views after its own large-message reassembly.
          const raw = message.data;
          const data = ArrayBuffer.isView(raw) ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) : raw;
          if (!(data instanceof ArrayBuffer) || data.byteLength > CHUNK_SIZE || message.offset !== file.received || file.received + data.byteLength > file.size) throw new Error('Invalid file chunk.');
          file.parts.push(data); file.received += data.byteLength; this.onProgress(file.received / file.size, file.metadata);
        } else if (message.type === 'file-end') {
          this.files.delete(message.id);
          if (file.received !== file.size) throw new Error('Incomplete transfer.');
          const blob = new Blob(file.parts, { type:file.mime });
          if (await digest(await blob.arrayBuffer()) !== file.sha256) throw new Error('File verification failed. Please retry.');
          await this.onFile(blob, file.metadata);
        }
      }
    } catch (error) { this.files.delete(message.id); this.onError(error); }
    return true;
  }
  clear() { this.files.clear(); }
}
