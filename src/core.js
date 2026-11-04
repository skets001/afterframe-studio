export const MAX_IMAGE = 4 * 1024 * 1024;
export const MAX_VIDEO = 64 * 1024 * 1024;
export const CHUNK_SIZE = 48 * 1024;
export const DEFAULT_PROMPT = 'Bring this painting to life as a short, seamless video. Preserve the original composition, framing, colors, brushwork, and artistic style. Keep the camera completely still. Add gentle, natural movement only where appropriate: softly moving water, drifting clouds, subtle foliage, or small character movements. Keep all action inside the existing painted scene. No new objects, no cuts, no zoom, no text, no borders. The first and last frames should match for a smooth loop.';
export const PRESETS = {
  subtle: DEFAULT_PROMPT,
  atmosphere: 'Animate this painting into a short atmospheric loop. Keep the original image composition and brushwork. Fix the camera in place. Add slow clouds, changing light, and delicate environmental movement appropriate to the scene. No added objects, no scene changes, no text, no camera motion. Return to the original pose and lighting at the end for a seamless loop.',
  character: 'Create a short living portrait from this painting. Preserve the identity, painted style, colors, and exact composition. Keep the camera fixed. Add only a subtle blink, gentle breathing, and tiny natural movements. No speaking, no new details, no text, no cuts. End in the original position for seamless looping.'
};
export const MIND_VERSION = '1.2.5';
export function randomToken() { return [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join(''); }
export function slugify(value) { return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'painting'; }
export function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
export function pairingCode(peer, token) { return `AF1.${peer}.${token}`; }
export function parsePairing(value) {
  const text = String(value).trim();
  let peer, token;
  if (text.startsWith('AF1.')) [, peer, token] = text.split('.');
  else {
    try { const url = new URL(text); const params = new URLSearchParams(url.hash.split('?')[1] || url.search); peer = params.get('peer'); token = params.get('token'); } catch { throw new Error('Paste the complete pairing code from the studio.'); }
  }
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(peer || '') || !/^[a-f0-9]{48}$/.test(token || '')) throw new Error('That pairing code is incomplete or invalid.');
  return { peer, token };
}
export function isValidJob(job) {
  return !!job && typeof job.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(job.id) && typeof job.title === 'string' && job.title.length <= 160 && typeof job.prompt === 'string' && job.prompt.length > 0 && job.prompt.length <= 12000;
}
export function allowedMediaURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'storage.googleapis.com' || /(^|\.)(googleusercontent\.com|googlevideo\.com|google\.com)$/.test(u.hostname)); } catch { return false; }
}
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
