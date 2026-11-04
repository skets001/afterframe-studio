import Peer from 'peerjs';
export function createPeer() { return new Peer(undefined, { debug:0, config:{ iceServers:[{ urls:'stun:stun.l.google.com:19302' }, { urls:'stun:stun.cloudflare.com:3478' }] } }); }
export function connectTo(peer, id, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const connection = peer.connect(id, { reliable:true, serialization:'binary' });
    const timer = setTimeout(() => { connection.close(); reject(new Error('Direct connection timed out. A firewall or mobile network may block WebRTC. Use the manual file handoff; this prototype has no TURN relay.')); }, timeout);
    connection.once('open', () => { clearTimeout(timer); resolve(connection); });
    connection.once('error', error => { clearTimeout(timer); reject(error); });
  });
}
