/**
 * Cross-Platform Room-Code Multiplayer over pure browser WebSocket (MQTT 3.1.1 WSS) + BroadcastChannel.
 * Zero Node polyfills (no Buffer, no process), tiny footprint, works identically on Desktop & Mobile browsers.
 */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt'
];

const enc = new TextEncoder();
const dec = new TextDecoder();

function encodeVarLen(len) {
  const out = [];
  let x = len;
  do {
    let b = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) b |= 128;
    out.push(b);
  } while (x > 0);
  return out;
}

function encodeUtf8(str) {
  const bytes = enc.encode(str);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = (bytes.length >> 8) & 0xff;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  return out;
}

function concatBytes(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function mqttConnectPacket(clientId) {
  const proto = encodeUtf8('MQTT');
  const flags = new Uint8Array([4, 2, 0, 30]); // v3.1.1, cleanSession=1, keepAlive=30s
  const cid = encodeUtf8(clientId);
  const body = concatBytes(proto, flags, cid);
  const hdr = new Uint8Array([0x10, ...encodeVarLen(body.length)]);
  return concatBytes(hdr, body);
}

function mqttSubscribePacket(packetId, topics) {
  const parts = [new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff])];
  for (const t of topics) {
    parts.push(encodeUtf8(t));
    parts.push(new Uint8Array([0])); // QoS 0
  }
  const body = concatBytes(...parts);
  const hdr = new Uint8Array([0x82, ...encodeVarLen(body.length)]);
  return concatBytes(hdr, body);
}

function mqttPublishPacket(topic, payloadStr, retain = false) {
  const tBytes = encodeUtf8(topic);
  const pBytes = enc.encode(payloadStr);
  const body = concatBytes(tBytes, pBytes);
  const hdr = new Uint8Array([retain ? 0x31 : 0x30, ...encodeVarLen(body.length)]);
  return concatBytes(hdr, body);
}

function parseMqttPackets(buf) {
  const msgs = [];
  let i = 0;
  while (i + 2 <= buf.length) {
    const type = buf[i] & 0xf0;
    let mult = 1;
    let len = 0;
    let pos = i + 1;
    let ok = true;
    while (true) {
      if (pos >= buf.length) { ok = false; break; }
      const b = buf[pos++];
      len += (b & 127) * mult;
      if ((b & 128) === 0) break;
      mult *= 128;
    }
    if (!ok || pos + len > buf.length) break;
    if (type === 0x20) {
      msgs.push({ kind: 'connack', rc: buf[pos + 1] });
    } else if (type === 0x30) {
      const tLen = (buf[pos] << 8) | buf[pos + 1];
      const topic = dec.decode(buf.subarray(pos + 2, pos + 2 + tLen));
      const payload = dec.decode(buf.subarray(pos + 2 + tLen, pos + len));
      msgs.push({ kind: 'publish', topic, payload });
    }
    i = pos + len;
  }
  return { msgs, rest: buf.subarray(i) };
}

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

    this.ws = null;
    this.isHost = false;
    this.roomCode = '';
    this.myId = 'p_' + Math.random().toString(36).slice(2, 9);
    this.myName = 'Knight';
    this.realmSeed = 842109;

    this.remoteMap = new Map();
    this.bc = null;
    this.lastSendTime = 0;
    this.lastMetaTime = 0;
    this.lastPingTime = 0;
    this._connectTimer = null;
    this._connected = false;
    this._rxBuf = new Uint8Array(0);
    this._pktId = 1;
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
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this._rxBuf = new Uint8Array(0);
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
        if (this.ws) {
          try { this.ws.close(); } catch {}
          this.ws = null;
        }
        this._connectToRoom(code, brokerIdx + 1);
      } else if (!this._connected) {
        this.onStatus('error', `${code} NET`);
        this.onToast(`NET TIMEOUT (${code})`);
      }
    }, 6500);

    try {
      const ws = new WebSocket(url, 'mqtt');
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      this._rxBuf = new Uint8Array(0);

      ws.onopen = () => {
        const cid = `ashen_${this.myId}_${Math.random().toString(16).slice(2, 6)}`;
        ws.send(mqttConnectPacket(cid));
      };

      ws.onmessage = (ev) => {
        const chunk = new Uint8Array(ev.data);
        this._rxBuf = concatBytes(this._rxBuf, chunk);
        const { msgs, rest } = parseMqttPackets(this._rxBuf);
        this._rxBuf = rest;
        for (const m of msgs) {
          if (m.kind === 'connack' && m.rc === 0) {
            this._connected = true;
            this._clearTimer();
            ws.send(mqttSubscribePacket(this._pktId++, [topicState, topicMeta]));
            if (this.isHost) {
              ws.send(mqttPublishPacket(topicMeta, JSON.stringify({ type: 'meta', seed: this.realmSeed, hostId: this.myId }), true));
              this.onStatus('host', code, this.remoteMap.size + 1);
              this.onToast(`ROOM ${code} READY`);
            } else {
              ws.send(mqttPublishPacket(topicMeta, JSON.stringify({ type: 'hello', senderId: this.myId }), false));
              this.onStatus('guest', code, this.remoteMap.size + 1);
              this.onToast(`CONNECTED: ${code}`);
            }
          } else if (m.kind === 'publish') {
            try {
              this._handleIncoming(JSON.parse(m.payload));
            } catch {}
          }
        }
      };

      ws.onerror = () => {
        if (!this._connected && brokerIdx + 1 < BROKERS.length) {
          this._clearTimer();
          try { ws.close(); } catch {}
          this._connectToRoom(code, brokerIdx + 1);
        }
      };
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
    } else if (msg.type === 'hello' && this.isHost && this.ws && this._connected && this.ws.readyState === 1) {
      try {
        this.ws.send(mqttPublishPacket(`ashen-ascii/v1/room/${this.roomCode}/meta`, JSON.stringify({ type: 'meta', seed: this.realmSeed, hostId: this.myId }), false));
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

    if (this.ws && this._connected && this.ws.readyState === 1 && nowMs - this.lastPingTime >= 15000) {
      this.lastPingTime = nowMs;
      try { this.ws.send(new Uint8Array([0xc0, 0x00])); } catch {}
    }

    if (nowMs - this.lastSendTime >= 55) {
      this.lastSendTime = nowMs;
      const myPacket = { ...localState, id: this.myId, name: this.myName };
      const stateMsg = { type: 'state', senderId: this.myId, state: myPacket };

      if (this.bc) {
        try { this.bc.postMessage(stateMsg); } catch {}
      }

      if (this.ws && this._connected && this.ws.readyState === 1) {
        try {
          this.ws.send(mqttPublishPacket(`ashen-ascii/v1/room/${this.roomCode}/state`, JSON.stringify(stateMsg), false));
          if (this.isHost && nowMs - this.lastMetaTime >= 2500) {
            this.lastMetaTime = nowMs;
            this.ws.send(
              mqttPublishPacket(
                `ashen-ascii/v1/room/${this.roomCode}/meta`,
                JSON.stringify({ type: 'meta', seed: this.realmSeed, hostId: this.myId }),
                false
              )
            );
          }
        } catch {}
      }
    }

    return Array.from(this.remoteMap.values());
  }
}
