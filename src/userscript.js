import { createPeer, connectTo } from './peer.js';
import { FileReceiver, sendFile } from './transfer.js';
import { MAX_IMAGE, MAX_VIDEO, parsePairing, isValidJob, allowedMediaURL, sleep } from './core.js';

async function boot() {
  if (document.querySelector('#afterframe-helper')) return;
  const mount=document.createElement('div');mount.id='afterframe-helper';document.documentElement.append(mount);
  const root=mount.attachShadow({mode:'open'});
  root.innerHTML=`<style>:host{all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483646;font-family:system-ui,sans-serif;color:#233e33;width:min(355px,calc(100vw - 24px))}*{box-sizing:border-box}.panel{border:1px solid #afbea5;border-radius:12px;background:#fafbf2;box-shadow:0 8px 40px #122c3440;overflow:hidden}header{display:flex;justify-content:space-between;align-items:center;padding:12px 15px;background:#174d3f;color:white;font-size:12px}header strong{letter-spacing:1px;font-weight:600}header button{color:white;background:none;border:0;font-size:19px;padding:0 5px}section{padding:15px;max-height:65vh;overflow:auto}.label{font-size:10px;letter-spacing:1px;color:#6c7d60;margin-bottom:7px}textarea{display:block;width:100%;font:10px/1.6 monospace;border:1px solid #c9d1bb;border-radius:5px;padding:9px;background:white;color:#233e33;min-height:54px;resize:vertical}button,.file{font:11px system-ui;cursor:pointer;border:1px solid #bbc8ab;border-radius:5px;padding:9px 11px;background:transparent;color:#234e3b;min-height:36px}button:disabled{opacity:.4;cursor:not-allowed}.primary{background:#174d3f;color:white;border-color:#174d3f}.buttons{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.status{font-size:11px;line-height:1.7;padding:9px 11px;background:#e9eedb;border-radius:5px;white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0}.hint{font-size:10px;line-height:1.7;color:#7d886f;margin:10px 0}label{display:block;font-size:11px;line-height:1.8;margin:10px 0}input[type=checkbox]{vertical-align:middle;margin-right:6px}.job{border-top:1px solid #d5ddc7;margin-top:14px;padding-top:13px}.job strong{font-size:12px}.job p{font-size:10px;line-height:1.7;color:#6b7c5a;max-height:90px;overflow:auto;white-space:pre-wrap}.file{display:block;max-width:100%;font-size:10px;width:100%;padding:9px}a{color:#305f44}.hidden{display:none!important}.danger{color:#aa5134;border-color:#d7b09e}.progress{font-size:10px;color:#6d8258}</style><div class="panel"><header><strong>AFTERFRAME / PHONE ENGINE</strong><div><button id="collapse" aria-label="Collapse panel">−</button></div></header><section id="body"><div class="label">PRIVATE STUDIO PAIRING</div><textarea id="code" placeholder="Paste the AF1… pairing code" aria-label="Studio pairing code" autocomplete="off" spellcheck="false"></textarea><div class="buttons"><button class="primary" id="pair">Pair with studio</button><button id="disconnect">Disconnect</button></div><div id="status" class="status" role="status">Ready to pair. Open Gemini’s video generation mode before running a job.</div><label><input id="auto" type="checkbox">Auto-run received jobs (uses your allowance)</label><div class="buttons"><button id="check">Check Gemini controls</button><button id="test" disabled>Insert prompt only</button></div><div id="job" class="job hidden"><strong id="title"></strong><p id="prompt"></p><div class="buttons"><button class="primary" id="run" disabled>Run job</button><button class="danger" id="stop">Stop automation</button><button id="save-image" disabled>Save painting</button></div><div id="progress" class="progress"></div><p class="hint">If automatic capture fails, download the result using Gemini’s own download control, then choose that video below.</p><input id="video-file" class="file" type="file" accept="video/mp4,video/webm" aria-label="Choose the downloaded generated video"><div class="buttons"><button id="send-video" disabled>Send downloaded video</button><button id="capture" disabled>Send latest displayed video</button></div></div><p class="hint">Keep this tab visible and the phone awake. Google login stays in this browser. No passwords or cookies are copied. Refreshing may lose a pending job.</p></section></div>`;
  const $=id=>root.querySelector(`#${id}`);
  let peer,connection,job=null,painting=null,running=false,cancelled=false,collapsed=false,baseline=new Set(),attempt=0,connectTimer,heartbeat,disposed=false;
  const uiStatus=text=>{$('status').textContent=text;};
  function status(text,phase='waiting') {uiStatus(text);if(connection?.open&&job)connection.send({type:'job-status',job:job.id,phase,message:text});}
  function controls() {$('run').disabled=!job||!painting||!connection?.open||running;$('test').disabled=!job||running;$('save-image').disabled=!painting;$('capture').disabled=!job||!connection?.open||running;$('send-video').disabled=!job||!connection?.open||!$('video-file').files[0]||running;}
  function visible(element) {return !!element&&element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden';}
  function editor() {return [...document.querySelectorAll('rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"], textarea[aria-label], textarea[placeholder]')].find(visible);}
  function buttonMatching(pattern) {return [...document.querySelectorAll('button,[role="button"]')].find(el=>visible(el)&&!el.disabled&&pattern.test([el.getAttribute('aria-label')||'',el.getAttribute('title')||'',el.textContent||''].join(' ').replace(/\s+/g,' ').trim()));}
  function videos() {return [...document.querySelectorAll('video')].map(video=>video.currentSrc||video.src||video.querySelector('source')?.src).filter(Boolean);}
  async function waitFor(getter,timeout=10000) {const started=Date.now();while(Date.now()-started<timeout){if(cancelled)throw new Error('Automation stopped. A submitted generation may still finish in Gemini.');const result=getter();if(result)return result;await sleep(250);}throw new Error('Could not find the expected Gemini control. Open video mode and complete the missing step manually.');}
  async function fillPrompt() {
    const input=await waitFor(editor);
    input.focus();
    if(input instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,job.prompt);input.dispatchEvent(new Event('input',{bubbles:true}));}
    else {const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(input);selection.removeAllRanges();selection.addRange(range);if(!document.execCommand('insertText',false,job.prompt)){input.textContent=job.prompt;input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:job.prompt}));}}
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const text=input.value??input.innerText;
    if(!text.includes(job.prompt.slice(0,Math.min(30,job.prompt.length))))throw new Error('Prompt insertion could not be verified. Paste it manually from the panel.');
  }
  async function attachPainting() {
    let input=[...document.querySelectorAll('input[type="file"]')].find(el=>!el.accept||/image|jpg|jpeg|png|webp|\*/i.test(el.accept));
    if(!input){const add=buttonMatching(/(add files|upload files|add image|upload image|attach file|add photos)/i);if(add)add.click();await sleep(450);const upload=buttonMatching(/^(upload files|upload image|upload from device|from device)$/i);upload?.click();input=await waitFor(()=>[...document.querySelectorAll('input[type="file"]')].find(el=>!el.accept||/image|jpg|jpeg|png|webp|\*/i.test(el.accept)),6000);}
    const transfer=new DataTransfer();transfer.items.add(new File([painting],'painting.jpg',{type:painting.type||'image/jpeg'}));input.files=transfer.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));await sleep(2500);
  }
  async function ensureVideoMode() {
    const video=buttonMatching(/^(create video|video|videos|generate video)(\s.*)?$/i);
    if(video){video.click();await sleep(600);}
    // Gemini changes its tools menu frequently; the user selects video mode during setup.
  }
  async function readVideo(src) {
    if(src.startsWith('blob:')){const response=await fetch(src);if(!response.ok)throw new Error('Could not read this video. Download it in Gemini and choose the file below.');const blob=await response.blob();return blob;}
    if(!allowedMediaURL(src))throw new Error('Video URL is outside the permitted Google media hosts. Download it using Gemini and choose the file below.');
    return new Promise((resolve,reject)=>GM.xmlHttpRequest({method:'GET',url:src,responseType:'blob',timeout:120000,onload:response=>{if(response.status>=200&&response.status<300){resolve(response.response);}else reject(new Error(`Video download returned ${response.status}. Use the manual file picker.`));},onerror:()=>reject(new Error('Automatic video download was blocked. Use the manual file picker.')),ontimeout:()=>reject(new Error('Video download timed out. Use the manual file picker.'))}));
  }
  async function transferVideo(blob) {
    if(!connection?.open)throw new Error('Reconnect to your studio before sending the video.');
    if(!job)throw new Error('No active job. Send a painting from the studio first.');
    if(!/^video\//.test(blob.type)||blob.size<1||blob.size>MAX_VIDEO)throw new Error('Choose a real MP4/WebM video smaller than 64 MB.');
    status('Sending the generated video to your studio…','transferring');
    await sendFile(connection,blob,{kind:'video',job:job.id},ratio=>$('progress').textContent=`Transferring video · ${Math.round(ratio*100)}%`);
    status('Video sent. Waiting for the studio to verify and save it…','transferring');
  }
  async function runJob() {
    if(running||!job||!painting)return;
    running=true;cancelled=false;controls();baseline=new Set(videos());
    try {
      status('Preparing Gemini’s video controls…');await ensureVideoMode();
      status('Attaching the painting…');await attachPainting();
      status('Inserting your selected prompt…');await fillPrompt();await sleep(700);
      // Submission is limited to an explicit send/submit control, never a generic first button.
      const send=await waitFor(()=>buttonMatching(/^(send message|send|submit|generate video)(\s.*)?$/i),12000);
      if(cancelled)throw new Error('Automation stopped before submission.');
      send.click();status('Submitted to Gemini. Waiting for a new generated video…','generating');
      const started=Date.now();let source;
      while(Date.now()-started<12*60*1000){if(cancelled)throw new Error('Automation stopped. Check Gemini for the submitted generation.');source=videos().find(src=>!baseline.has(src));if(source)break;await sleep(2000);}
      if(!source)throw new Error('No new video was detected after 12 minutes. Check Gemini for a limit, error, or completed result. Use the manual video picker if it finished.');
      await sleep(2000);if(cancelled)throw new Error('Automation stopped.');
      const blob=await readVideo(source);if(cancelled)throw new Error('Automation stopped.');await transferVideo(blob);
    }catch(error){status(error.message,'needs-help');}
    finally{running=false;controls();}
  }
  async function connect(code) {
    const pairing=parsePairing(code);clearTimeout(connectTimer);clearInterval(heartbeat);connection?.close();peer?.destroy();
    const thisAttempt=++attempt;peer=createPeer();uiStatus('Connecting to the free signaling service…');
    peer.on('error',error=>{if(thisAttempt===attempt)uiStatus(`Connection error: ${error.type||error.message}. Keep the studio open; use manual handoff if the network blocks WebRTC.`);});
    await new Promise((resolve,reject)=>{connectTimer=setTimeout(()=>reject(new Error('Signaling timed out. Check the connection or use manual handoff.')),20000);peer.once('open',()=>{clearTimeout(connectTimer);resolve();});});
    if(thisAttempt!==attempt||disposed)return;
    connection=await connectTo(peer,pairing.peer);
    let chain=Promise.resolve();
    const receiver=new FileReceiver(async(blob,metadata)=>{if(metadata.kind!=='painting'||metadata.job!==job?.id||!/^image\/(jpeg|png|webp)$/.test(blob.type)||blob.size>MAX_IMAGE)throw new Error('Invalid painting transfer.');painting=blob;status('Painting received. Select Gemini video mode, then tap Run job.');controls();if($('auto').checked)runJob();},error=>status(error.message,'needs-help'),ratio=>$('progress').textContent=`Receiving painting · ${Math.round(ratio*100)}%`);
    connection.on('data',message=>{chain=chain.then(async()=>{
      if(!message||typeof message!=='object')return;
      if(message.type==='paired'){
        await GM.setValue('afterframe-pairing',code);uiStatus('Connected to your studio. Send a painting from the dashboard.');heartbeat=setInterval(()=>{if(connection?.open)connection.send({type:'heartbeat'});},10000);controls();
      }else if(message.type==='job'){
        if(running){connection.send({type:'job-status',job:message.job?.id,phase:'needs-help',message:'Phone is already processing a job. Stop it before sending another.'});return;}
        if(!isValidJob(message.job))throw new Error('Invalid generation job.');job=message.job;painting=null;cancelled=false;$('title').textContent=job.title;$('prompt').textContent=job.prompt;$('job').classList.remove('hidden');$('progress').textContent='';$('video-file').value='';status('Receiving the painting…');controls();
      }else if(message.type==='cancel'&&message.job===job?.id){cancelled=true;status('Studio stopped this job. Check Gemini for any generation already submitted.','needs-help');job=null;painting=null;controls();}
      else if(message.type==='video-saved'&&message.job===job?.id){status('✓ Video verified and saved in your studio. You can prepare its exhibition now.','complete');}
      else if(message.type!=='heartbeat-ack')await receiver.accept(message);
    }).catch(error=>status(error.message,'needs-help'));});
    connection.on('close',()=>{receiver.clear();clearInterval(heartbeat);uiStatus('Studio disconnected. Tap Pair again. A submitted Gemini generation can still finish.');controls();});
    connection.send({type:'hello',role:'worker',token:pairing.token});
  }
  $('collapse').onclick=()=>{collapsed=!collapsed;$('body').classList.toggle('hidden',collapsed);$('collapse').textContent=collapsed?'+':'−';};
  $('pair').onclick=()=>connect($('code').value.trim()).catch(error=>uiStatus(error.message));
  $('disconnect').onclick=async()=>{cancelled=true;attempt++;clearTimeout(connectTimer);clearInterval(heartbeat);connection?.close();peer?.destroy();connection=null;await GM.deleteValue('afterframe-pairing');uiStatus('Disconnected. Your Gemini login is unchanged.');controls();};
  $('check').onclick=()=>uiStatus(`Prompt editor: ${editor()?'found':'not found'}\nVideo controls: ${buttonMatching(/(create video|generate video|videos)/i)?'visible':'select Video in Gemini’s tools menu manually'}\nFile input: ${document.querySelector('input[type="file"]')?'found':'not visible yet; open Gemini’s upload menu'}\nThis check does not submit a generation.`);
  $('test').onclick=async()=>{cancelled=false;try{await fillPrompt();status('Prompt inserted only. No generation was submitted.');}catch(error){status(error.message,'needs-help');}};
  $('run').onclick=runJob;
  $('stop').onclick=()=>{cancelled=true;status('Stopping automation. A generation already submitted may continue in Gemini.','needs-help');};
  $('save-image').onclick=()=>{if(!painting)return;const link=document.createElement('a');const url=URL.createObjectURL(painting);link.href=url;link.download='painting.jpg';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  $('video-file').onchange=controls;
  $('send-video').onclick=async()=>{try{await transferVideo($('video-file').files[0]);}catch(error){status(error.message,'needs-help');}};
  $('capture').onclick=async()=>{try{const source=videos().at(-1);if(!source)throw new Error('No video element is visible in Gemini. Use its download button and the file picker.');status('Reading the latest displayed video. Check that it belongs to this painting.');await transferVideo(await readVideo(source));}catch(error){status(error.message,'needs-help');}};
  const hash=new URLSearchParams(location.hash.slice(1));let code=hash.get('afterframe');
  if(code){try{parsePairing(code);history.replaceState(null,'',location.pathname+location.search);}catch{code=null;}}
  if(!code)code=await GM.getValue('afterframe-pairing','');
  if(code){$('code').value=code;connect(code).catch(error=>uiStatus(error.message));}
  window.addEventListener('pagehide',()=>{disposed=true;cancelled=true;clearInterval(heartbeat);connection?.close();peer?.destroy();});
}
boot().catch(error=>console.error('Afterframe setup failed:',error.message));
