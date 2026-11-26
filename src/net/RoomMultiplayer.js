import mqtt from 'mqtt';

/**
 * Cross-Platform Room-Code Multiplayer over TLS WebSocket PubSub (MQTT WSS) + BroadcastChannel.
 * Eliminates mobile LTE <-> Wi-Fi WebRTC NAT/TURN failures; works everywhere on GitHub Pages.
 */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt'
];

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

    this.client = null;
    this.isHost = false;
    this.roomCode = '';
    this.myId = 'p_' + Math.random().toString(36).slice(2, 9);
    this.myName = 'Knight';
    this.realmSeed = 842109;

    this.remoteMap = new Map();
    this.bc = null;
    this.lastSendTime = 0;
    this.lastMetaTime = 0;
    this._connectTimer = null;
    this._connected = false;
  }

  _clearTimer() {
    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
  }

  disconnect() {
    this._clearTimer();
    this._connected = false;
    if (this.bc) {
      try { this.bc.close(); } catch {}
      this.bc = null;
    }
    if (this.client) {
      try { this.client.end(true); } catch {}
      this.client = null;
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
    this._connectToRoom(this.roomCode, 0);
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
    this._connectToRoom(clean, 0);
    return true;
  }

  _connectToRoom(code, brokerIdx) {
    this.onStatus('connecting', code);
    this._initBroadcastChannel(code);

    const url = BROKERS[brokerIdx % BROKERS.length];
    const topicState = `ashen-ascii/v1/room/${code}/state`;
    const topicMeta = `ashen-ascii/v1/room/${code}/meta`;

    this._clearTimer();
    this._connectTimer = setTimeout(() => {
      if (!this._connected && brokerIdx + 1 < BROKERS.length) {
        if (this.client) {
          try { this.client.end(true); } catch {}
          this.client = null;
        }
        this._connectToRoom(code, brokerIdx + 1);
      } else if (!this._connected) {
        this.onStatus('error', `${code} NET`);
        this.onToast(`NET TIMEOUT (${code})`);
      }
    }, 6500);

    try {
      const client = mqtt.connect(url, {
        clientId: `ashen_${this.myId}_${Math.random().toString(16).slice(2, 6)}`,
        clean: true,
        connectTimeout: 6000,
        reconnectPeriod: 2500
      });
      this.client = client;

      client.on('connect', () => {
        this._connected = true;
        this._clearTimer();
        client.subscribe([topicState, topicMeta], { qos: 0 });
        if (this.isHost) {
          client.publish(topicMeta, JSON.stringify({ type: 'meta', seed: this.realmSeed, hostId: this.myId }), { qos: 0, retain: true });
          this.onStatus('host', code, this.remoteMap.size + 1);
          this.onToast(`ROOM ${code} READY`);
        } else {
          client.publish(topicMeta, JSON.stringify({ type: 'hello', senderId: this.myId }), { qos: 0 });
          this.onStatus('guest', code, this.remoteMap.size + 1);
          this.onToast(`CONNECTED: ${code}`);
        }
      });

      client.on('message', (topic, payload) => {
        try {
          const msg = JSON.parse(payload.toString());
          this._handleIncoming(msg);
        } catch {}
      });

      client.on('error', () => {
        if (!this._connected && brokerIdx + 1 < BROKERS.length) {
          this._clearTimer();
          try { client.end(true); } catch {}
          this._connectToRoom(code, brokerIdx + 1);
        }
      });
    } catch {
      this._clearTimer();
      this.onStatus('error', code);
    }
  }

  _initBroadcastChannel(code) {
    if (this.bc || typeof BroadcastChannel === 'undefined') return;
    this.bc = new BroadcastChannel(`ashen-ascii-room-${code}`);
    this.bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.senderId === this.myId) return;
      if (msg.type === 'hello' && this.isHost) {
        this.bc.postMessage({ type: 'meta', senderId: this.myId, seed: this.realmSeed });
      } else {
        this._handleIncoming(msg);
      }
    };
    if (!this.isHost) {
      this.bc.postMessage({ type: 'hello', senderId: this.myId });
    }
  }

  _handleIncoming(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'meta' && !this.isHost) {
      if (msg.seed && msg.seed !== this.realmSeed) {
        this.realmSeed = msg.seed;
        this.onRealmSync(msg.seed);
      }
    } else if (msg.type === 'hello' && this.isHost && this.client && this._connected) {
      const topicMeta = `ashen-ascii/v1/room/${this.roomCode}/meta`;
      try {
        this.client.publish(topicMeta, JSON.stringify({ type: 'meta', seed: this.realmSeed, hostId: this.myId }), { qos: 0 });
      } catch {}
    } else if (msg.type === 'state' && msg.state) {
      const st = msg.state;
      if (!st.id || st.id === this.myId) return;
      const had = this.remoteMap.has(st.id);
      st._seenAt = performance.now();
      this.remoteMap.set(st.id, st);
      if (!had) {
        this.onStatus(this.isHost ? 'host' : 'guest', this.roomCode, this.remoteMap.size + 1);
      }
    }
  }

  tick(nowMs, localState) {
    if (!this.roomCode) return [];

    let removed = false;
    for (const [k, v] of this.remoteMap.entries()) {
      if (nowMs - (v._seenAt || 0) > 6000) {
        this.remoteMap.delete(k);
        removed = true;
      }
    }
    if (removed && this._connected) {
      this.onStatus(this.isHost ? 'host' : 'guest', this.roomCode, this.remoteMap.size + 1);
    }

    if (nowMs - this.lastSendTime >= 55) {
      this.lastSendTime = nowMs;
      const myPacket = { ...localState, id: this.myId, name: this.myName };
      const stateMsg = { type: 'state', senderId: this.myId, state: myPacket };

      if (this.bc) {
        try { this.bc.postMessage(stateMsg); } catch {}
      }

      if (this.client && this._connected) {
        try {
          this.client.publish(`ashen-ascii/v1/room/${this.roomCode}/state`, JSON.stringify(stateMsg), { qos: 0 });
          if (this.isHost && nowMs - this.lastMetaTime >= 2500) {
            this.lastMetaTime = nowMs;
            this.client.publish(
              `ashen-ascii/v1/room/${this.roomCode}/meta`,
              JSON.stringify({ type: 'meta', seed: this.realmSeed, hostId: this.myId }),
              { qos: 0 }
            );
          }
        } catch {}
      }
    }

    return Array.from(this.remoteMap.values());
  }
}
