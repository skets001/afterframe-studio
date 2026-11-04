import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePairing, pairingCode, randomToken, isValidJob, allowedMediaURL, escapeHTML, slugify, MAX_VIDEO } from '../src/core.js';
import { FileReceiver, sendFile } from '../src/transfer.js';
import { pack, unpack } from 'peerjs-js-binarypack';

test('pairing round-trips while malformed or truncated invitations are rejected',()=>{
  const token=randomToken();const peer='8afb6e09-3061-4100-a29e-984bc755e247';
  assert.deepEqual(parsePairing(pairingCode(peer,token)),{peer,token});
  assert.deepEqual(parsePairing(`https://example.test/app/#phone?peer=${peer}&token=${token}`),{peer,token});
  assert.throws(()=>parsePairing('AF1.bad.short'));
  assert.throws(()=>parsePairing('https://example.test/#phone?peer=x&token=y'));
});
test('jobs require a bounded prompt, title, and safe identifier',()=>{
  const job={id:'ad13-42',title:'A painting',prompt:'Animate the water.'};
  assert.equal(isValidJob(job),true);
  for(const invalid of [{...job,prompt:''},{...job,prompt:'a'.repeat(12001)},{...job,title:'a'.repeat(161)},{...job,id:'../bad'},null])assert.equal(isValidJob(invalid),false);
});
test('video retrieval only permits expected HTTPS Google media hosts',()=>{
  assert.equal(allowedMediaURL('https://lh3.googleusercontent.com/video'),true);
  assert.equal(allowedMediaURL('https://storage.googleapis.com/bucket/file.mp4'),true);
  for(const url of ['http://storage.googleapis.com/a','https://googleusercontent.com.evil.test/a','https://evilgoogle.com/a','file:///etc/passwd','javascript:alert(1)'])assert.equal(allowedMediaURL(url),false);
});
test('user titles are escaped in HTML and filenames remain simple',()=>{
  assert.equal(escapeHTML('<script>"&\''),'&lt;script&gt;&quot;&amp;&#39;');
  assert.equal(slugify('../../A painting <script>'),'a-painting-script');
});
test('large binary files are chunked, reassembled, and verified end-to-end',async()=>{
  const original=new Blob([crypto.getRandomValues(new Uint8Array(60000)),crypto.getRandomValues(new Uint8Array(60000))],{type:'video/mp4'});
  let saved;const errors=[];const packets=[];
  const connection={open:true,send:packet=>packets.push(packet),dataChannel:{bufferedAmount:0}};
  await sendFile(connection,original,{kind:'video',job:'job-1'});
  const receiver=new FileReceiver((blob,metadata)=>{saved={blob,metadata};},e=>errors.push(e.message));
  for(const packet of packets)await receiver.accept(packet);
  assert.deepEqual(errors,[]);assert.deepEqual(saved.metadata,{kind:'video',job:'job-1'});assert.deepEqual(await saved.blob.arrayBuffer(),await original.arrayBuffer());
});
test('corrupted transfers never reach the saved-file handler',async()=>{
  const packets=[];await sendFile({open:true,send:p=>packets.push(p)},new Blob(['real video bytes'],{type:'video/mp4'}),{kind:'video'});
  new Uint8Array(packets[1].data)[0]^=1;
  let saved=false;const errors=[];const receiver=new FileReceiver(()=>{saved=true;},e=>errors.push(e.message));
  for(const packet of packets)await receiver.accept(packet);
  assert.equal(saved,false);assert.ok(errors.some(message=>message.includes('verification failed')));
});
test('PeerJS chunk reassembly can return typed-array payloads without corrupting files',async()=>{
  const packets=[];const original=new Blob([crypto.getRandomValues(new Uint8Array(60000))],{type:'image/jpeg'});
  await sendFile({open:true,send:packet=>packets.push(packet)},original,{kind:'painting'});
  const errors=[];let saved;
  const receiver=new FileReceiver(blob=>{saved=blob;},error=>errors.push(error.message));
  for(const packet of packets){
    const packed=await pack(packet);
    // PeerJS returns a Uint8Array after reassembling messages above its 16,300-byte MTU.
    const transported=unpack(packed.byteLength>16300?new Uint8Array(packed):packed);
    await receiver.accept(transported);
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(await saved.arrayBuffer(),await original.arrayBuffer());
});
test('oversized and out-of-order incoming transfers are rejected',async()=>{
  const errors=[];let saved=false;const receiver=new FileReceiver(()=>{saved=true;},e=>errors.push(e.message));
  await receiver.accept({type:'file-start',id:randomToken(),size:MAX_VIDEO+1,sha256:'a'.repeat(64)});
  const id=randomToken();await receiver.accept({type:'file-start',id,size:100,sha256:'a'.repeat(64)});
  await receiver.accept({type:'file-chunk',id,offset:50,data:new ArrayBuffer(50)});
  assert.equal(saved,false);assert.equal(errors.length,2);assert.equal(receiver.files.size,0);
});
test('disconnected transfers fail rather than claiming completion',async()=>{
  await assert.rejects(sendFile({open:false,send:()=>{}},new Blob(['video'],{type:'video/mp4'})),/disconnected/);
});
