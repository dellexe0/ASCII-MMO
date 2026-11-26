import { Peer } from 'peerjs';

/**
 * Cross-Platform Room-Code Multiplayer via bundled PeerJS (WebRTC) + BroadcastChannel local fallback.
 * Works directly on static hosting (GitHub Pages) across PC and mobile browsers without external CDN scripts.
 */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
};

export function generateRoomCode(len = 5) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export class RoomMultiplayer {
  constructor({ onStatus, onRealmSync, onToast }) {
    this.onStatus = onStatus || (() => {});
    this.onRealmSync = onRealmSync || (() => {});
    this.onToast = onToast || (() => {});

    this.peer = null;
    this.isHost = false;
    this.roomCode = '';
    this.myId = 'p_' + Math.random().toString(36).slice(2, 8);
    this.myName = 'Knight';
    this.realmSeed = 842109;

    this.conns = new Map();
    this.hostConn = null;
    this.remoteMap = new Map();
    this.bc = null;
    this.lastSendTime = 0;
    this._connectTimer = null;
  }

  _clearTimer() {
    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
  }

  disconnect() {
    this._clearTimer();
    if (this.bc) {
      try { this.bc.close(); } catch {}
      this.bc = null;
    }
    for (const c of this.conns.values()) {
      try { c.close(); } catch {}
    }
    this.conns.clear();
    if (this.hostConn) {
      try { this.hostConn.close(); } catch {}
      this.hostConn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }
    this.remoteMap.clear();
    this.roomCode = '';
    this.isHost = false;
    this.onStatus('offline', '');
  }

  createRoom(seed, playerName = 'Knight') {
    this.disconnect();
    this.isHost = true;
    this.realmSeed = seed;
    this.myName = (playerName || 'Knight').slice(0, 14);
    this.roomCode = generateRoomCode(5);
    this.onStatus('connecting', this.roomCode);

    this._initBroadcastChannel(this.roomCode);

    let opened = false;
    this._connectTimer = setTimeout(() => {
      if (!opened) {
        this.onStatus('host', this.roomCode, 1);
        this.onToast(`ROOM ${this.roomCode} (LOCAL READY)`);
      }
    }, 6500);

    try {
      const hostPeerId = `ashen-ascii-room-${this.roomCode}-host`;
      this.peer = new Peer(hostPeerId, { debug: 0, config: ICE_CONFIG });

      this.peer.on('open', () => {
        opened = true;
        this._clearTimer();
        this.onStatus('host', this.roomCode, this.conns.size + 1);
        this.onToast(`ROOM ${this.roomCode} READY`);
      });

      this.peer.on('connection', (conn) => {
        this.conns.set(conn.peer, conn);
        conn.on('open', () => {
          conn.send({ type: 'welcome', seed: this.realmSeed, hostId: this.myId });
          this.onStatus('host', this.roomCode, this.conns.size + 1);
        });
        conn.on('data', (msg) => this._handleIncoming(msg, conn.peer));
        conn.on('close', () => {
          this.conns.delete(conn.peer);
          this.remoteMap.delete(conn.peer);
          this.onStatus('host', this.roomCode, this.conns.size + 1);
        });
      });

      this.peer.on('error', () => {
        this._clearTimer();
        this.onStatus('host', this.roomCode, this.conns.size + 1);
      });
    } catch {
      this._clearTimer();
      this.onStatus('host', this.roomCode, 1);
    }
    return this.roomCode;
  }

  joinRoom(code, playerName = 'Knight') {
    const clean = (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length < 3) {
      this.onStatus('empty_code', '');
      this.onToast('ENTER ROOM CODE (E.G. K7M4P)');
      return false;
    }

    this.disconnect();
    this.isHost = false;
    this.myName = (playerName || 'Knight').slice(0, 14);
    this.roomCode = clean;
    this.onStatus('connecting', clean);

    this._initBroadcastChannel(clean);

    let connected = false;
    this._connectTimer = setTimeout(() => {
      if (!connected) {
        this.onStatus('error', `${clean} TIMEOUT`);
        this.onToast(`ROOM ${clean} NOT FOUND / TIMEOUT`);
      }
    }, 7500);

    try {
      const guestId = `ashen-ascii-${clean}-${this.myId}`;
      this.peer = new Peer(guestId, { debug: 0, config: ICE_CONFIG });

      this.peer.on('open', () => {
        const hostPeerId = `ashen-ascii-room-${clean}-host`;
        const conn = this.peer.connect(hostPeerId, { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => {
          connected = true;
          this._clearTimer();
          this.onStatus('guest', clean, 2);
          this.onToast(`JOINED ROOM ${clean}`);
        });
        conn.on('data', (msg) => this._handleIncoming(msg, 'host'));
        conn.on('close', () => {
          this.remoteMap.clear();
          this.onStatus('offline', '');
        });
        conn.on('error', () => {
          this._clearTimer();
          this.onStatus('error', clean);
        });
      });

      this.peer.on('error', () => {
        this._clearTimer();
        this.onStatus('error', clean);
      });
    } catch {
      this._clearTimer();
      this.onStatus('error', clean);
      return false;
    }
    return true;
  }

  _initBroadcastChannel(code) {
    if (typeof BroadcastChannel === 'undefined') return;
    this.bc = new BroadcastChannel(`ashen-ascii-room-${code}`);
    this.bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.senderId === this.myId) return;
      if (msg.type === 'hello' && this.isHost) {
        this.bc.postMessage({ type: 'welcome', senderId: this.myId, seed: this.realmSeed });
      } else {
        this._handleIncoming(msg, msg.senderId);
      }
    };
    if (!this.isHost) {
      this.bc.postMessage({ type: 'hello', senderId: this.myId });
    }
  }

  _handleIncoming(msg, srcKey) {
    if (!msg || !msg.type) return;
    if (msg.type === 'welcome' && !this.isHost) {
      this._clearTimer();
      if (msg.seed && msg.seed !== this.realmSeed) {
        this.realmSeed = msg.seed;
        this.onRealmSync(msg.seed);
      }
      this.onStatus('guest', this.roomCode, this.remoteMap.size + 2);
    } else if (msg.type === 'state' && msg.state) {
      const st = msg.state;
      st._seenAt = performance.now();
      this.remoteMap.set(st.id || srcKey, st);
    } else if (msg.type === 'roster' && Array.isArray(msg.players)) {
      const now = performance.now();
      for (const p of msg.players) {
        if (!p || p.id === this.myId) continue;
        p._seenAt = now;
        this.remoteMap.set(p.id, p);
      }
      this.onStatus(this.isHost ? 'host' : 'guest', this.roomCode, this.remoteMap.size + 1);
    }
  }

  tick(nowMs, localState) {
    if (!this.roomCode) return [];

    for (const [k, v] of this.remoteMap.entries()) {
      if (nowMs - (v._seenAt || 0) > 5000) this.remoteMap.delete(k);
    }

    if (nowMs - this.lastSendTime >= 55) {
      this.lastSendTime = nowMs;
      const myPacket = { ...localState, id: this.myId, name: this.myName };

      if (this.bc) {
        try { this.bc.postMessage({ type: 'state', senderId: this.myId, state: myPacket }); } catch {}
      }

      if (this.isHost) {
        const list = [myPacket];
        for (const v of this.remoteMap.values()) list.push(v);
        const rosterMsg = { type: 'roster', players: list };
        for (const conn of this.conns.values()) {
          if (conn.open) {
            try { conn.send(rosterMsg); } catch {}
          }
        }
      } else if (this.hostConn && this.hostConn.open) {
        try { this.hostConn.send({ type: 'state', state: myPacket }); } catch {}
      }
    }

    return Array.from(this.remoteMap.values());
  }
}
