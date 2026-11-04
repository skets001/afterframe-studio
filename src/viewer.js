export async function startAR({ container, target, video, ratio, onStatus }) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS or localhost in a supported browser.');
  if (!document.querySelector('script[type="importmap"]')) {
    const map = document.createElement('script'); map.type = 'importmap'; map.textContent = JSON.stringify({imports:{three:'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js','three/addons/':'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/'}}); document.head.append(map);
  }
  const [THREE, { MindARThree }] = await Promise.all([
    import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'),
    import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js')
  ]);
  const targetURL = target instanceof Blob ? URL.createObjectURL(target) : target;
  let mindar;
  try {
    mindar = new MindARThree({container,imageTargetSrc:targetURL,uiLoading:'no',uiScanning:'no',uiError:'no',filterMinCF:.001,filterBeta:.001});
    const {renderer,scene,camera} = mindar;
    const anchor = mindar.addAnchor(0);
    const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});
    const geometry = new THREE.PlaneGeometry(1,1 / ratio);
    anchor.group.add(new THREE.Mesh(geometry,material));
    anchor.onTargetFound = () => { onStatus('Painting found · playing'); video.play().catch(() => onStatus('Tap the sound/play button to resume playback.')); };
    anchor.onTargetLost = () => { video.pause(); onStatus('Point your camera at the painting'); };
    await mindar.start(); renderer.setAnimationLoop(() => renderer.render(scene,camera)); onStatus('Point your camera at the painting');
    return async () => { renderer.setAnimationLoop(null); video.pause(); await mindar.stop(); texture.dispose(); material.dispose(); geometry.dispose(); renderer.dispose(); container.replaceChildren(); if (target instanceof Blob) URL.revokeObjectURL(targetURL); };
  } catch (error) { try { await mindar?.stop(); } catch {} if (target instanceof Blob) URL.revokeObjectURL(targetURL); throw error; }
}
