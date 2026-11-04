import { MAX_IMAGE, MAX_VIDEO } from './core.js';
export function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not read the image. Try a JPG or PNG.')); image.src = src; }); }
export async function prepareImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 25 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP image smaller than 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, 1600 / Math.max(image.width,image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',.9));
    if (!blob || blob.size > MAX_IMAGE) throw new Error('The image is too large after compression. Resize it and retry.');
    return { blob, width:canvas.width, height:canvas.height };
  } finally { URL.revokeObjectURL(url); }
}
export async function validateVideo(file) {
  if (!/^video\/(mp4|webm|quicktime)$/.test(file.type) || file.size < 1 || file.size > MAX_VIDEO) throw new Error('Choose an MP4 or WebM video smaller than 64 MB.');
  const src = URL.createObjectURL(file);
  try {
    const video = document.createElement('video'); video.preload = 'metadata'; video.src = src;
    await new Promise((resolve,reject) => { const timeout = setTimeout(() => reject(new Error('Could not read video metadata.')),12000); video.onloadedmetadata = () => {clearTimeout(timeout);resolve();}; video.onerror = () => {clearTimeout(timeout);reject(new Error('This browser cannot play that video. Use H.264 MP4 for widest compatibility.'));}; });
    return { duration:video.duration, width:video.videoWidth, height:video.videoHeight };
  } finally { URL.revokeObjectURL(src); }
}
export function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),30000); }
export async function compileTarget(blob, onProgress) {
  const { Compiler } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js');
  const url = URL.createObjectURL(blob);
  try { const image = await loadImage(url); const compiler = new Compiler(); await compiler.compileImageTargets([image],onProgress); const buffer = await compiler.exportData(); return new Blob([buffer],{type:'application/octet-stream'}); }
  finally { URL.revokeObjectURL(url); }
}
