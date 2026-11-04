import './styles.css';
import QRCode from 'qrcode';
import { DEFAULT_PROMPT, PRESETS, escapeHTML as h, randomToken, pairingCode, parsePairing, formatBytes, isValidJob } from './core.js';
import { listPaintings, savePainting, deletePainting } from './storage.js';
import { prepareImage, validateVideo, downloadBlob, compileTarget } from './media.js';
import { createPeer, connectTo } from './peer.js';
import { sendFile, FileReceiver } from './transfer.js';
import { exportExhibition } from './exhibition.js';
import { startAR } from './viewer.js';

const app = document.querySelector('#app');
let arts = [], selectedId, host, hostId = '', worker, activeJob = null, connectionStatus = 'Phone not connected', peerError = '', lastSeen = 0;
let routeCleanup = () => {}, urls = [], logs = [], toastTimer, saveTimer, saveChain = Promise.resolve();
const hostToken = randomToken();
const base = new URL('.',location.href).href;
const selected = () => arts.find(a => a.id === selectedId);
const imageURL = blob => { const url=URL.createObjectURL(blob); urls.push(url); return url; };
const siteURL = hash => `${base}#${hash}`;
const phoneURL = () => siteURL(`phone?peer=${hostId}&token=${hostToken}`);
const visitorURL = art => siteURL(`view?peer=${hostId}&art=${art.id}&token=${art.visitorToken}`);
function toast(text) { const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),6500); }
function log(text) { logs.push(`${new Date().toLocaleTimeString()}  ${text}`);logs=logs.slice(-40);document.querySelectorAll('[data-log]').forEach(el=>el.textContent=logs.join('\n')||'No events yet.'); }
async function persist(art) { const snapshot={...art};saveChain=saveChain.catch(()=>{}).then(()=>savePainting(snapshot));await saveChain; }
function updateStatus(text) { connectionStatus=text;document.querySelectorAll('[data-connection]').forEach(el=>{el.replaceChildren();const dot=document.createElement('span');dot.className=`dot ${worker?.open?'ready':''}`;el.append(dot,document.createTextNode(text));}); }
function route() { const [name,query] = location.hash.slice(1).replace(/^\//,'').split('?');return {name:name||'studio',params:new URLSearchParams(query||'')}; }
function shell(content, active='studio') {
  return `<div class="shell"><header class="masthead"><a class="brand" href="#studio"><img src="${base}mark.svg" alt="">afterframe<span>LIVING PAINTINGS</span></a><nav class="nav" aria-label="Main navigation"><a href="#studio" class="${active==='studio'?'active':''}">The studio</a><a href="#phone" class="${active==='phone'?'active':''}">Connect a phone</a><a href="#gallery" class="${active==='gallery'?'active':''}">Exhibition</a><a href="#guide" class="${active==='guide'?'active':''}">How it works ↗</a></nav><div class="connection" data-connection><span class="dot ${worker?.open?'ready':''}"></span>${h(connectionStatus)}</div></header>${content}<footer class="footer"><span>AFTERFRAME / AN EXPERIMENT IN LIVING ART</span><span>Stored in this browser · Back up your paintings with Export<br>Gemini Pro allowance applies. Mobile automation is experimental.</span></footer></div>`;
}
function heading(kicker,title,description) { return `<div class="heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="subtle">${description}</p></div><div class="edition">FROM STILLNESS<br>TO SOMETHING MORE. ↗</div></div>`; }
async function paintQR(selector, value) { if(!value)return;const node=document.querySelector(selector);if(!node)return;try{node.src=await QRCode.toDataURL(value,{width:420,margin:1,color:{dark:'#164d3f',light:'#ffffff'},errorCorrectionLevel:'M'});}catch(error){log(error.message);} }
function showDialog(content) { document.querySelector('dialog')?.remove();const dialog=document.createElement('dialog');dialog.innerHTML=`<div class="dialog-head"><div></div><button class="close" data-action="close-dialog" aria-label="Close dialog">×</button></div>${content}`;document.body.append(dialog);dialog.showModal();dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});return dialog; }
function currentJobStatus(art) { return art.status==='generating'?'Generating on phone':art.status==='sent'?'Sent · waiting for phone':art.video?'Video ready':'Ready for a little life'; }
function renderStudio() {
  const art=selected();
  if(!art){ app.innerHTML=shell(`${heading('YOUR CREATIVE WORKSPACE','A little life.<br><em>Beyond the frame.</em>','Prepare a painting, bring it to life, and share a small moment of wonder.')}<div class="empty-state panel"><h2>Your first living painting starts here.</h2><p class="subtle">Upload a painting, or explore the studio with our sample artwork.</p><button class="btn" data-action="upload">＋ Upload painting</button> <button class="btn secondary" data-action="sample">Try sample artwork</button></div>`);return; }
  app.innerHTML=shell(`${heading('YOUR CREATIVE WORKSPACE','A little life. <em>Beyond the frame.</em>','Turn a still painting into an experience worth stopping for.')}
  ${peerError?`<div class="notice warning">${h(peerError)} <button class="quiet-link" data-action="reconnect-host">Retry connection</button></div>`:''}
  <div class="workspace"><aside><section class="panel collection"><div class="panel-head"><h2>YOUR COLLECTION</h2><span class="count">${String(arts.length).padStart(2,'0')}</span></div><div class="paint-list">${arts.map(a=>`<button class="art-item ${a.id===art.id?'active':''}" data-action="select" data-id="${a.id}"><img src="${imageURL(a.image)}" alt=""><span><strong>${h(a.title)}</strong><small>${a.video?'● Video ready':a.status==='generating'?'◌ Generating':'○ Still image'}</small></span></button>`).join('')}</div><button class="upload-button" data-action="upload">＋ Add a painting</button></section><p class="collection-note">A small collection.<br>An entirely new perspective.<br><br>Paintings and videos stay in this browser until you choose to transfer or export them.</p></aside>
  <section class="stage-wrap" aria-label="Painting preview"><div class="stage"><div class="stage-top"><span>THE CANVAS</span><span>${art.video?'VIDEO / LOOP':'ORIGINAL / STILL'}</span></div><div class="frame">${art.video?`<video src="${imageURL(art.video)}" poster="${imageURL(art.image)}" controls playsinline loop muted aria-label="Generated video preview"></video>`:`<img src="${imageURL(art.image)}" alt="${h(art.title)}">`}</div><div class="stage-caption">${h(art.title)}<small>${art.video?'A PAINTING, NOW IN MOTION':'WAITING FOR ITS FIRST BREATH'}</small></div><div class="stage-status"><span class="dot ${art.video?'ready':''}"></span>${h(currentJobStatus(art))}</div><div class="stage-controls"><button class="small-btn" data-action="original">↗ Original</button></div></div><div class="under-stage"><span>${art.width} × ${art.height} PX · ${formatBytes(art.image.size)}</span><span>${art.video?formatBytes(art.video.size)+' VIDEO':'JPG / PAINTING'}</span></div></section>
  <section class="panel form-panel"><div class="step"><span class="step-number">01</span> GIVE IT SOME LIFE</div><label class="field">Painting title<input id="art-title" maxlength="160" value="${h(art.title)}"></label><label class="field">Motion direction<select id="preset"><option value="subtle">Subtle & natural</option><option value="atmosphere" ${art.preset==='atmosphere'?'selected':''}>Atmosphere & light</option><option value="character" ${art.preset==='character'?'selected':''}>Living portrait</option><option value="custom" ${art.preset==='custom'?'selected':''}>My own prompt</option></select></label><label class="field">Your prompt <span class="saved" id="save-state">· saved locally</span><textarea id="art-prompt" maxlength="12000">${h(art.prompt)}</textarea></label><button class="btn wide" data-action="send" ${!worker?.open||activeJob?'disabled':''}>${activeJob===art.id?'Job in progress…':'Bring this painting to life'} <span>↗</span></button><p class="hint">${worker?.open?'Uses your phone’s signed-in Gemini Pro session. Keep Gemini open and your phone awake.':'Connect your Android phone first. You can also generate manually and import the video below.'}</p><p class="status-line" id="job-status" aria-live="polite">${h(art.message||'')}</p>${activeJob===art.id?'<button class="quiet-link" data-action="cancel-job">Stop this job</button>':''}<div class="divider"></div><div class="step"><span class="step-number">02</span> PREPARE THE EXHIBITION</div><div class="inline"><button class="small-btn" data-action="import-video">＋ Import video</button><button class="small-btn" data-action="compile">${art.target?'✓ Tracking ready':'Prepare camera tracking'}</button></div><p class="hint">${art.target?'Camera target saved. The video can follow the painting when viewed through a phone camera.':'Compile the painting once for camera recognition. Detailed, textured paintings work best.'}</p><div class="progress" id="compile-progress" hidden><span></span></div></section></div>
  <div class="bottom-grid"><section class="panel bottom-card"><div class="badge-icon">⌁</div><div><p class="eyebrow" style="margin-bottom:9px">YOUR PHONE IS THE ENGINE</p><h3>A connection, without the cables.</h3><p>Install the browser script once. Pair your phone over the internet and keep your Pro allowance in your own account.</p><a class="quiet-link" href="#phone">${worker?.open?'Manage phone connection':'Connect your Android phone'} ↗</a></div></section><section class="panel bottom-card"><img class="qr" id="studio-qr" alt="QR code to connect your generation phone"><div><p class="eyebrow" style="margin-bottom:9px">A WINDOW INTO THE PAINTING</p><h3>Scan. Point. Wonder.</h3><p>${art.video?'Your video is ready. Preview a live viewer or export a permanent exhibition.':'When your video is ready, create a QR experience for visitors. This QR connects your generation phone.'}</p><button class="quiet-link" data-action="${art.video?'share':'pair-dialog'}">${art.video?'Open visitor QR':'View phone setup QR'} ↗</button></div></section></div>`);
  paintQR('#studio-qr',hostId?phoneURL():'');
}
function renderPhone(params) {
  let paired;
  try { if(params.get('peer'))paired=parsePairing(siteURL(`phone?${params}`)); } catch(error){toast(error.message);}
  const code=paired?pairingCode(paired.peer,paired.token):hostId?pairingCode(hostId,hostToken):'';
  const isRemote=!!paired;
  app.innerHTML=shell(`${heading('NO CABLES. NO API KEY.','Your phone.<br><em>The creative engine.</em>','A one-time browser setup, then a private connection to your studio.')}<div class="split"><section class="panel onboarding"><p class="eyebrow">${isRemote?'YOU’RE ON THE PHONE SETUP PAGE':'SET UP ON YOUR ANDROID PHONE'}</p><h2>Three small steps.<br>One living painting.</h2><ol class="instructions"><li><strong>Open this page in Firefox for Android.</strong>Install Firefox if needed, then open the setup link in Firefox—not the QR scanner’s built-in browser.</li><li><strong>Add Tampermonkey, then our script.</strong>The extension asks for permission; our script runs only on Gemini. You confirm both installations.<div class="inline" style="margin-top:12px"><a class="btn secondary" href="https://addons.mozilla.org/en-US/android/addon/tampermonkey/" target="_blank" rel="noopener">1. Get Tampermonkey ↗</a><a class="btn" href="${base}afterframe.user.js">2. Install Afterframe script ↗</a></div></li><li><strong>Open Gemini and pair.</strong>Sign into your Pro account in Firefox. The Afterframe panel appears inside Gemini. Use the button below, or paste the pairing code into that panel.<div class="inline" style="margin-top:12px"><button class="btn" data-action="open-gemini">${code?'Open Gemini & pair':'Open Gemini to test script'} ↗</button><button class="small-btn" data-action="copy-code" ${!code?'disabled':''}>Copy pairing code</button></div></li></ol><p class="notice">Keep Gemini visible and your phone unlocked while working. If the script can’t find a control, it stops and asks for your help. No password or Google cookies are sent to this app.</p><p class="hint">This setup is for your generation phone. Exhibition visitors do not install the script.</p></section><section><div class="panel onboarding"><p class="eyebrow">${isRemote?'YOUR STUDIO PAIRING':'SCAN WITH YOUR PHONE'}</p><h2>${isRemote?'One code. Your studio.':'Take the studio with you.'}</h2>${!isRemote?'<img id="phone-qr" class="qr" style="width:220px;height:220px;margin:20px auto" alt="Scan to open phone setup">':''}<div class="code-box" id="pair-code">${h(code||'Connecting to the free signaling service…')}</div><p class="hint">Treat this code like a private invitation. It allows your phone to exchange a painting and generated video with the open studio.</p><div class="divider"></div><div class="status-line" data-phone-status>${isRemote?'Open Gemini to complete the connection.':h(connectionStatus)}</div><button class="quiet-link" data-action="copy-setup" ${!hostId&&!paired?'disabled':''}>Copy phone setup link</button></div><div class="notice warning" style="margin-top:20px">Direct transfer uses WebRTC and free public signaling. Corporate firewalls or some mobile networks may block it. If pairing fails, use the manual handoff in the studio. This does not change the company PC’s access policy.</div><div class="panel onboarding"><p class="eyebrow">CONNECTION NOTES</p><div class="logs" data-log>${h(logs.join('\n')||'No connection events yet.')}</div></div></section></div>`, 'phone');
  if(!isRemote&&hostId)paintQR('#phone-qr',phoneURL());
  app.dataset.pairCode=code;
}
function renderGallery() {
  const ready=arts.filter(a=>a.video);
  app.innerHTML=shell(`${heading('LET THE WORK MEET THE WORLD','An exhibition.<br><em>A different kind of encounter.</em>','Share a live preview, or export the files for a permanent GitHub Pages exhibition.')}${ready.length?`<div class="notice">Live visitor links work while this studio is open and connected. For an exhibition that works independently, export it and upload the exhibition folder to GitHub.</div><div class="gallery-grid">${ready.map(a=>`<section class="panel gallery-card"><img src="${imageURL(a.image)}" alt="${h(a.title)}"><div class="gallery-meta"><h2>${h(a.title)}</h2><span class="count">${a.target?'AR READY':'VIDEO ONLY'}</span></div><p>${formatBytes(a.video.size)} · ${a.target?'Camera tracking included':'Prepare tracking in the studio to add AR'}</p><div class="inline"><button class="btn secondary" data-action="share" data-id="${a.id}" ${!hostId?'disabled':''}>Live visitor QR ↗</button><button class="btn" data-action="export" data-id="${a.id}">Export exhibition ↓</button></div><p class="export-note">Permanent path: <span class="mono">exhibitions/${h(a.slug||'export-to-get-path')}/</span></p>${a.slug?`<button class="quiet-link" data-action="permanent" data-id="${a.id}">Permanent visitor QR ↗</button>`:''}</section>`).join('')}</div>`:`<div class="empty-state panel"><h2>A quiet room, for now.</h2><p class="subtle">Generate or import your first video to start an exhibition.</p><a class="btn" href="#studio">Back to the studio ↗</a></div>`}<div class="feature-strip"><span>No visitor login</span><span>No app for visitors</span><span>HTTPS camera experience</span></div>`, 'gallery');
}
function renderGuide() {
  app.innerHTML=shell(`${heading('A FIELD GUIDE','From canvas<br><em>to living encounter.</em>','The complete prototype workflow, with the experimental steps made visible.')}<div class="split"><section class="panel onboarding"><h2>For the creator</h2><ol class="instructions"><li><strong>Upload a painting.</strong>Images are resized to 1600 pixels and saved in this browser’s IndexedDB. Choose a motion direction or use your own prompt.</li><li><strong>Connect your Android.</strong>Open the phone setup QR in Firefox. Install Tampermonkey and our script, sign into Gemini, then pair. The studio and phone use a direct WebRTC data channel.</li><li><strong>Send a generation job.</strong>On the phone, enable Gemini’s video generation mode. The script has a Run job button and an optional automatic mode. It attempts the image upload, inserts your prompt, submits it, and looks for a new video. Your normal Gemini limits apply.</li><li><strong>Import if needed.</strong>If the script cannot capture the video, download it in Gemini and use Send downloaded video in the phone panel. If pairing fails altogether, use Manual handoff in this studio.</li><li><strong>Compile camera tracking.</strong>This creates a MindAR image target in your browser. It can take a minute or more. Use the exact artwork photo that visitors will point at.</li><li><strong>Share or publish.</strong>A live visitor link downloads the experience directly from your open studio. Export an exhibition ZIP for permanent hosting; upload its exhibitions folder into this GitHub repository, commit, and wait for Pages to deploy.</li></ol></section><section><div class="panel onboarding"><h2>What this version does</h2><p class="subtitle">Local collection and video storage, custom prompts, phone pairing, an installable Gemini script, manual video import, image-target compilation, live visitor QR codes, and standalone exhibition export.</p><div class="notice warning"><strong>What needs your phone test:</strong> Gemini UI selectors, image attachment, submission, and video download. A button or page change may require updating the script. It does not solve CAPTCHAs or account restrictions.</div><p class="subtitle">GitHub Pages hosts static files. PeerJS’s free service handles the connection handshake; artwork and video are transferred between the paired browsers. No TURN relay is included, so some network combinations will not connect.</p><p class="subtitle">Your studio is not a durable cloud queue: keep it open during transfer and generation. Refreshing creates a new pairing code. Videos already saved in your browser remain until you delete them or clear site storage. Export backups.</p><div class="inline"><button class="btn secondary" data-action="manual">Manual handoff</button><a class="btn secondary" href="./afterframe.user.js">Install script ↗</a></div></div><div class="panel onboarding" style="margin-top:24px"><p class="eyebrow">DIAGNOSTICS</p><div class="logs" data-log>${h(logs.join('\n')||'No events yet.')}</div><button class="quiet-link" data-action="copy-diagnostics" style="margin-top:14px">Copy diagnostics (no pairing secrets)</button></div></section></div>`, 'guide');
}
async function renderViewer(params) {
  app.innerHTML=`<main class="viewer-shell"><a class="brand" href="#studio" style="justify-content:center"><img src="${base}mark.svg" alt="">afterframe</a><p class="eyebrow" style="margin-top:35px">A LIVING ENCOUNTER</p><h1>A painting,<br><em>with a little more life.</em></h1><p class="subtle" id="viewer-state">Connecting to the creator’s studio…</p><div class="progress"><span id="viewer-progress"></span></div><div id="viewer-content"></div><p class="hint">Live preview · the creator’s studio must stay open.</p></main>`;
  let peer,connection,closed=false;let received={};
  routeCleanup=()=>{closed=true;connection?.close();peer?.destroy();};
  function fail(error){if(!closed){document.querySelector('#viewer-state').textContent=error.message;log(error.message);}}
  try {
    if(!params.get('peer')||!params.get('art')||!/^[a-f0-9]{48}$/.test(params.get('token')||''))throw new Error('This viewer link is incomplete. Ask the creator for a new QR code.');
    peer=createPeer();peer.on('error',fail);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Signaling service unavailable. Ask the creator for a permanent exhibition link.')),20000);peer.once('open',()=>{clearTimeout(timer);resolve();});});
    if(closed)return;
    connection=await connectTo(peer,params.get('peer'));
    let chain=Promise.resolve();
    const receiver=new FileReceiver(async(blob,meta)=>{received[meta.kind]=blob;if(received.image&&received.video&&received.meta&&(!received.meta.hasTarget||received.target))await displayViewer(received);},fail,ratio=>{const el=document.querySelector('#viewer-progress');if(el)el.style.width=`${ratio*100}%`;});
    connection.on('data',message=>{chain=chain.then(async()=>{if(closed)return;if(message.type==='viewer-meta'){received.meta=message.art;document.querySelector('#viewer-state').textContent='Receiving the painting and video…';}else if(message.type==='error')fail(new Error(message.message));else await receiver.accept(message);}).catch(fail);});
    connection.on('close',()=>{if(!received.video)fail(new Error('The studio disconnected. Ask the creator to reopen it or use a permanent exhibition link.'));});
    connection.send({type:'hello',role:'visitor',art:params.get('art'),token:params.get('token')});
  }catch(error){fail(error);}
}
async function displayViewer(received) {
  const art=received.meta;
  document.querySelector('#viewer-state').textContent=art.title;
  document.querySelector('#viewer-content').innerHTML=`<video id="visitor-video" class="viewer-media" src="${imageURL(received.video)}" poster="${imageURL(received.image)}" controls playsinline loop muted></video>${received.target?'<button class="btn" data-action="start-ar">View on the painting ↗</button>':''}<p class="hint">${received.target?'Allow the camera, then point at the original painting.':'Camera tracking is not included yet. Enjoy the video above.'}</p>`;
  const button=document.querySelector('[data-action="start-ar"]');if(button)button.onclick=()=>openAR({target:received.target,ratio:art.width/art.height,video:document.querySelector('#visitor-video')});
}
async function openAR({target,ratio,video}) {
  const container=document.createElement('div');container.className='ar-container';
  const overlay=document.createElement('div');overlay.className='ar-overlay';overlay.innerHTML='<span class="ar-pill" role="status">Starting camera…</span><button class="small-btn" id="ar-sound">Sound off</button><button class="small-btn" id="ar-close">Close</button>';
  document.body.append(container,overlay);let stop,closing=false;
  const cleanup=async()=>{closing=true;await stop?.();container.remove();overlay.remove();};
  document.querySelector('#ar-close').onclick=cleanup;
  document.querySelector('#ar-sound').onclick=()=>{video.muted=!video.muted;video.play().catch(()=>{});document.querySelector('#ar-sound').textContent=video.muted?'Sound off':'Sound on';};
  try{video.muted=true;await video.play().catch(()=>{});video.pause();stop=await startAR({container,target,ratio,video,onStatus:text=>overlay.querySelector('span').textContent=text});if(closing)await stop();else window.addEventListener('hashchange',cleanup,{once:true});}
  catch(error){await cleanup();toast(error.message);}
}
function render() {
  routeCleanup();routeCleanup=()=>{};urls.forEach(URL.revokeObjectURL);urls=[];
  const {name,params}=route();if(name==='view'){renderViewer(params);return;}
  if(!host&&!(name==='phone'&&params.has('peer')))startHost();
  if(name==='phone')renderPhone(params);else if(name==='gallery')renderGallery();else if(name==='guide')renderGuide();else renderStudio();
}
function startHost() {
  host=createPeer();let timer=setTimeout(()=>{if(!hostId){peerError='Free signaling is taking too long. Manual handoff remains available.';render();}},20000);
  host.on('open',id=>{clearTimeout(timer);hostId=id;peerError='';log('Studio signaling connected.');render();});
  host.on('error',error=>{peerError=`Connection unavailable: ${error.type||error.message}. Use manual handoff if your network blocks WebRTC.`;updateStatus('Connection unavailable');log(peerError);if(route().name!=='view')render();});
  host.on('disconnected',()=>{updateStatus('Signaling disconnected');log('Signaling disconnected. Reconnect from the studio.');});
  host.on('connection',connection=>handleIncoming(connection));
}
function handleIncoming(connection) {
  let authorized=false,role='',chain=Promise.resolve();const authTimeout=setTimeout(()=>connection.close(),10000);
  const receiver=new FileReceiver(async(blob,meta)=>{
    if(role!=='worker'||meta.kind!=='video'||meta.job!==activeJob)throw new Error('Unexpected video transfer.');
    await validateVideo(blob);
      const art=arts.find(a=>a.id===meta.job);if(!art)throw new Error('Painting no longer exists.');
    art.video=blob;art.status='ready';art.message='Video received and saved. Prepare tracking, then share your exhibition.';art.updatedAt=Date.now();await persist(art);activeJob=null;connection.send({type:'video-saved',job:art.id});log('Generated video received and verified.');render();toast('Video saved to your collection.');
  },error=>{log(error.message);toast(error.message);},ratio=>{const el=document.querySelector('#job-status');if(el)el.textContent=`Receiving video · ${Math.round(ratio*100)}%`;});
  connection.on('data',message=>{chain=chain.then(async()=>{
    if(!message||typeof message!=='object')return;
    if(!authorized){
      if(message.type!=='hello'){connection.close();return;}
      clearTimeout(authTimeout);
      if(message.role==='worker'&&message.token===hostToken){authorized=true;role='worker';if(worker&&worker!==connection)worker.close();worker=connection;lastSeen=Date.now();connection.send({type:'paired',name:'Afterframe studio'});updateStatus('Phone connected');log('Generation phone paired.');render();}
      else if(message.role==='visitor'){
        const art=arts.find(a=>a.id===message.art&&a.visitorToken===message.token);
        if(!art?.video){connection.send({type:'error',message:'This painting is not available. Ask the creator for an updated QR.'});setTimeout(()=>connection.close(),1000);return;}
        authorized=true;role='visitor';connection.send({type:'viewer-meta',art:{title:art.title,width:art.width,height:art.height,hasTarget:!!art.target}});await sendFile(connection,art.image,{kind:'image'});if(art.target)await sendFile(connection,art.target,{kind:'target'});await sendFile(connection,art.video,{kind:'video'});log('Visitor experience transferred.');
      }else connection.close();return;
    }
    if(role==='worker'){
      if(message.type==='heartbeat'){lastSeen=Date.now();connection.send({type:'heartbeat-ack'});}
      else if(message.type==='job-status'&&message.job===activeJob&&typeof message.message==='string'){
        const art=arts.find(a=>a.id===activeJob);if(!art)return;art.message=message.message.slice(0,500);if(message.phase==='generating')art.status='generating';await persist(art);document.querySelector('#job-status')?.replaceChildren(document.createTextNode(art.message));log(art.message);
        if(message.phase==='needs-help'){art.status='needs-help';await persist(art);render();}
      }else await receiver.accept(message);
    }
  }).catch(error=>{log(error.message);toast(error.message);});});
  connection.on('close',()=>{clearTimeout(authTimeout);receiver.clear();if(worker===connection){worker=null;updateStatus('Phone disconnected');log('Phone disconnected. Reopen Gemini to reconnect.');if(activeJob){const art=arts.find(a=>a.id===activeJob);if(art){art.status='needs-help';art.message='Phone disconnected. The video may still be generating in Gemini. Reconnect and send the downloaded video manually.';persist(art).catch(error=>toast(error.message));}}if(route().name!=='view')render();}});
  connection.on('error',error=>log(error.message));
}
setInterval(()=>{if(worker?.open&&Date.now()-lastSeen>45000)updateStatus('Phone may be asleep');},10000);
async function createPainting(file) {
  const image=await prepareImage(file);
  const art={id:crypto.randomUUID(),title:file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ').slice(0,160),prompt:DEFAULT_PROMPT,preset:'subtle',image:image.blob,width:image.width,height:image.height,status:'draft',visitorToken:randomToken(),createdAt:Date.now(),updatedAt:Date.now()};
  await persist(art);arts.push(art);selectedId=art.id;render();toast('Painting saved. Choose its motion direction.');
}
async function chooseFile(accept,callback) { const input=document.createElement('input');input.type='file';input.accept=accept;input.className='file-input';document.body.append(input);input.onchange=async()=>{try{if(input.files[0])await callback(input.files[0]);}catch(error){toast(error.message);log(error.message);}finally{input.remove();}};input.addEventListener('cancel',()=>input.remove());input.click(); }
async function saveFields() {
  const art=selected();if(!art)return;
  art.title=document.querySelector('#art-title')?.value.trim().slice(0,160)||art.title;
  art.prompt=document.querySelector('#art-prompt')?.value||art.prompt;art.preset=document.querySelector('#preset')?.value||art.preset;art.updatedAt=Date.now();await persist(art);
  const el=document.querySelector('#save-state');if(el)el.textContent='· saved locally';
}
async function showShare(art, permanent=false) {
  if(!art?.video)throw new Error('Add a video first.');
  if(!permanent&&!hostId)throw new Error('Live sharing needs a signaling connection. Export a permanent exhibition instead.');
  const url=permanent?new URL(`exhibitions/${art.slug}/`,base).href:visitorURL(art);
  showDialog(`<h2>${permanent?'A permanent encounter.':'A first encounter.'}</h2><p>${permanent?'Upload the exported exhibition folder to GitHub and wait for deployment before using this QR.':'Scan on another device. Keep this studio open while the visitor downloads the painting and video.'}</p><img class="qr" id="share-qr" alt="Visitor QR code"><p class="code-box">${h(url)}</p><div class="inline"><button class="btn" data-action="copy-share" data-url="${h(url)}">Copy link</button><a class="btn secondary" href="${h(url)}" target="_blank" rel="noopener">Open viewer ↗</a><button class="btn secondary" data-action="download-qr">Save QR ↓</button></div><p class="hint">${art.target?'Camera tracking included.':'Video only. Prepare camera tracking in the studio to add an overlay.'}</p>`);
  await paintQR('#share-qr',url);
}
function showManual() { const art=selected();if(!art)throw new Error('Add a painting first.');showDialog(`<h2>A simple handoff.</h2><p>Generate in Gemini on your phone using your Pro allowance, then import the downloaded video into the studio.</p><ol class="instructions"><li><strong>Save the painting and copy its prompt.</strong><div class="inline"><button class="small-btn" data-action="download-image">Save painting ↓</button><button class="small-btn" data-action="copy-prompt">Copy prompt</button><button class="small-btn" data-action="export-job">Export job ↓</button></div></li><li><strong>Open Gemini on your phone.</strong>Upload the painting, choose video generation, and paste the prompt. You can send the exported job file to your phone using an approved file-transfer method.</li><li><strong>Bring the video back.</strong>Download it from Gemini, transfer it to this PC, and use Import video. Or use the paired script’s Send downloaded video button.</li></ol><button class="btn" data-action="import-video">Import video ↗</button>`); }

document.addEventListener('input',event=>{if(['art-title','art-prompt'].includes(event.target.id)){clearTimeout(saveTimer);const el=document.querySelector('#save-state');if(el)el.textContent='· saving…';saveTimer=setTimeout(()=>saveFields().catch(error=>toast(error.message)),350);}});
document.addEventListener('change',event=>{if(event.target.id==='preset'){const art=selected();art.preset=event.target.value;if(PRESETS[art.preset]){art.prompt=PRESETS[art.preset];document.querySelector('#art-prompt').value=art.prompt;}saveFields().catch(error=>toast(error.message));}});
document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action;
  if(action==='start-ar')return;
  event.preventDefault();
  try {
    if(action!=='close-dialog')await saveFields();
    const art=target.dataset.id?arts.find(a=>a.id===target.dataset.id):selected();
    if(action==='upload')await chooseFile('image/jpeg,image/png,image/webp',createPainting);
    else if(action==='sample'){
      const blob=await fetch(`${base}sample-painting.svg`).then(r=>r.blob());const url=imageURL(blob);const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1100;canvas.getContext('2d').drawImage(image,0,0);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await createPainting(new File([png],'The quiet shore.png',{type:'image/png'}));
    }
    else if(action==='select'){selectedId=target.dataset.id;render();}
    else if(action==='close-dialog'){target.closest('dialog').close();}
    else if(action==='pair-dialog'){if(!hostId)throw new Error('The signaling service is unavailable. Open How it works for manual handoff, or retry the connection.');showDialog(`<h2>A connection, without cables.</h2><p>Scan this QR with your Android phone and open the link in Firefox.</p><img class="qr" id="pair-dialog-qr" alt="Phone setup QR"><a class="btn wide" href="#phone" data-action="phone-page">Open setup instructions ↗</a>`);await paintQR('#pair-dialog-qr',phoneURL());}
    else if(action==='phone-page'){document.querySelector('dialog')?.close();location.hash='phone';}
    else if(action==='copy-code'){await navigator.clipboard.writeText(app.dataset.pairCode||pairingCode(hostId,hostToken));toast('Pairing code copied. Paste it in the Afterframe panel inside Gemini.');}
    else if(action==='copy-setup'){const code=app.dataset.pairCode;const p=code?parsePairing(code):{peer:hostId,token:hostToken};await navigator.clipboard.writeText(siteURL(`phone?peer=${p.peer}&token=${p.token}`));toast('Phone setup link copied.');}
    else if(action==='open-gemini'){const code=app.dataset.pairCode||(hostId?pairingCode(hostId,hostToken):'');window.open(`https://gemini.google.com/app${code?'#afterframe='+encodeURIComponent(code):''}`,'_blank','noopener');}
    else if(action==='send'){
      if(!worker?.open)throw new Error('Connect your generation phone first.');if(activeJob)throw new Error('Finish or stop the current job first.');
      if(!isValidJob(art))throw new Error('Enter a title and prompt (up to 12,000 characters).');activeJob=art.id;art.status='sent';art.message='Sending painting to your phone…';await persist(art);render();
      worker.send({type:'job',job:{id:art.id,title:art.title,prompt:art.prompt}});
      try{await sendFile(worker,art.image,{kind:'painting',job:art.id,name:'painting.jpg'});art.message='Job received by the connection. Tap Run job in the phone panel, or enable Auto-run there.';await persist(art);render();log('Painting and prompt sent to phone.');}catch(error){activeJob=null;art.status='needs-help';art.message=error.message;await persist(art);render();throw error;}
    }
    else if(action==='cancel-job'){worker?.send({type:'cancel',job:activeJob});activeJob=null;art.status='draft';art.message='Automation stopped. Check Gemini before retrying; an already submitted generation may continue.';await persist(art);render();}
    else if(action==='import-video'){if(!art)throw new Error('Add a painting first.');await chooseFile('video/mp4,video/webm,video/quicktime',async file=>{await validateVideo(file);art.video=file;art.status='ready';art.message='Video imported and saved.';if(activeJob===art.id){worker?.send({type:'cancel',job:activeJob});activeJob=null;}await persist(art);document.querySelector('dialog')?.close();render();toast('Video imported. Prepare camera tracking or share the video.');});}
    else if(action==='compile'){
      target.disabled=true;target.textContent='Compiling…';const progress=document.querySelector('#compile-progress');progress.hidden=false;
      try{art.target=await compileTarget(art.image,value=>{progress.querySelector('span').style.width=`${value}%`;target.textContent=`Compiling · ${Math.round(value)}%`;});await persist(art);render();toast('Camera target ready. Test it on the physical painting.');}finally{target.disabled=false;if(document.contains(target))target.textContent='Prepare camera tracking';}
    }
    else if(action==='share')await showShare(art);
    else if(action==='permanent')await showShare(art,true);
    else if(action==='copy-share'){await navigator.clipboard.writeText(target.dataset.url);toast('Visitor link copied.');}
    else if(action==='download-qr'){const source=document.querySelector('#share-qr').src;if(source.startsWith('data:'))downloadBlob(await fetch(source).then(r=>r.blob()),'afterframe-visitor-qr.png');}
    else if(action==='export'){target.disabled=true;target.textContent='Exporting…';try{art.slug=await exportExhibition(art);await persist(art);render();toast('Exhibition ZIP downloaded. Upload its exhibitions folder to GitHub.');}finally{target.disabled=false;}}
    else if(action==='original'){showDialog(`<h2>${h(art.title)}</h2><img src="${imageURL(art.image)}" style="max-width:100%;max-height:65vh;display:block;margin:auto" alt="${h(art.title)}"><div class="modal-actions"><button class="btn secondary" data-action="download-image">Save image ↓</button><button class="btn danger" data-action="delete">Delete painting</button></div>`);}
    else if(action==='delete'){showDialog(`<h2>Remove this painting?</h2><p>The image, video, and camera target will be removed from this browser. Export an exhibition first if you need a backup.</p><div class="modal-actions"><button class="btn secondary" data-action="close-dialog">Keep painting</button><button class="btn danger" data-action="confirm-delete">Delete painting</button></div>`);}
    else if(action==='confirm-delete'){if(activeJob===art.id){worker?.send({type:'cancel',job:art.id});activeJob=null;}await deletePainting(art.id);arts=arts.filter(a=>a.id!==art.id);selectedId=arts[0]?.id;document.querySelector('dialog').close();render();}
    else if(action==='manual')showManual();
    else if(action==='copy-prompt'){await navigator.clipboard.writeText(art.prompt);toast('Prompt copied.');}
    else if(action==='download-image')downloadBlob(art.image,'painting.jpg');
    else if(action==='export-job'){const data={version:1,job:{id:art.id,title:art.title,prompt:art.prompt}};downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'afterframe-job.json');downloadBlob(art.image,'painting.jpg');}
    else if(action==='copy-diagnostics'){await navigator.clipboard.writeText(`Afterframe 0.1.0\n${navigator.userAgent}\n${logs.join('\n')}`);toast('Diagnostics copied.');}
    else if(action==='reconnect-host'){host?.destroy();host=null;hostId='';worker=null;peerError='';render();}
  }catch(error){toast(error.message||'Something went wrong. Please retry.');log(error.message||String(error));}
});
window.addEventListener('hashchange',()=>{clearTimeout(saveTimer);saveFields().catch(error=>toast(error.message)).finally(render);});
window.addEventListener('beforeunload',event=>{if(activeJob){event.preventDefault();event.returnValue='';}});
async function init(){app.innerHTML='<div class="loading"><p class="eyebrow">AFTERFRAME</p><h1>Opening the studio.</h1></div>';try{arts=await listPaintings();for(const art of arts)if(['sent','generating'].includes(art.status)){art.status='needs-help';art.message='The previous session ended. Check Gemini for your video, then import it or reconnect.';await persist(art);}selectedId=arts[0]?.id;render();}catch(error){app.innerHTML=`<div class="loading"><h1>The studio could not open.</h1><p>${h(error.message)}</p></div>`;}}
init();
