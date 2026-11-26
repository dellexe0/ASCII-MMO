/**
 * 100% PURE ASCII RENDERING ENGINE (WebGL2 Instanced + Canvas2D Fallback)
 *
 * Strictly zero painted terrain, zero non-ASCII images, zero background polygons:
 * every pixel on screen is either pitch black (#000000) or an ASCII character
 * rendered with its own position, pixel size, RGBA color, and blend mode.
 */

const RAW_CHARSET =
  " .,:;-~∼=+*#%@&^v·•°×≈≡░▒▓╬╔╗╚╝║═╱╲▲▼◄►◆◇◈◊○●†‡§¤✦✝τ¥ψ♣♠/\\|_<>()[]{}!'\"`?123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz08$";
export const CHARSET = Array.from(new Set(RAW_CHARSET)).join('');

export const DENSITY_RAMP = ' ·,:;-~=+*#%@◆';

const CHAR_TO_INDEX = new Map();
for (let i = 0; i < CHARSET.length; i++) {
  CHAR_TO_INDEX.set(CHARSET[i], i);
}

const MAX_INSTANCES = 262144;
const FLOATS_PER_INSTANCE = 8; // x, y, size, glyphIndex, r, g, b, a

function createGlyphAtlasCanvas() {
  const cell = 56;
  const count = CHARSET.length;
  const canvas = document.createElement('canvas');
  canvas.width = cell * count;
  canvas.height = cell;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(cell * 0.84)}px Consolas, "Cascadia Mono", "DejaVu Sans Mono", monospace`;
  ctx.fillStyle = '#ffffff';

  for (let i = 1; i < count; i++) {
    const ch = CHARSET[i];
    ctx.fillText(ch, i * cell + cell * 0.5, cell * 0.52);
  }
  return canvas;
}

export class PureAsciiEngine {
  constructor(displayCanvas) {
    this.canvas = displayCanvas;
    this.width = Math.max(1, displayCanvas.width || window.innerWidth || 1280);
    this.height = Math.max(1, displayCanvas.height || window.innerHeight || 720);
    this.dpr = 1;

    this.normalBuf = new Float32Array(MAX_INSTANCES * FLOATS_PER_INSTANCE);
    this.glowBuf = new Float32Array(MAX_INSTANCES * FLOATS_PER_INSTANCE);
    this.normalCount = 0;
    this.glowCount = 0;

    this.gl = null;
    this.ctx2d = null;
    this.atlasCanvas = createGlyphAtlasCanvas();

    try {
      const gl = displayCanvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      });
      if (gl) {
        this.gl = gl;
        this._initWebGL(gl);
      } else {
        this.ctx2d = displayCanvas.getContext('2d');
      }
    } catch {
      this.ctx2d = displayCanvas.getContext('2d');
    }
  }

  _initWebGL(gl) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh));
      }
      return sh;
    };

    const link = (vsSrc, fsSrc) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(p));
      }
      return p;
    };

    const vsGlyph = `#version 300 es
      layout(location = 0) in vec2 aCorner;
      layout(location = 1) in vec4 aRect;   // x, y, size, glyphIndex
      layout(location = 2) in vec4 aColor;  // r, g, b, a

      uniform vec2 uViewport;
      uniform float uGlyphCount;

      out vec2 vUv;
      out vec4 vColor;

      void main() {
        vec2 screenPos = aRect.xy + aCorner * aRect.z;
        vec2 ndc = (screenPos / uViewport) * 2.0 - 1.0;
        ndc.y = -ndc.y;
        gl_Position = vec4(ndc, 0.0, 1.0);

        vec2 localUv = aCorner + 0.5;
        localUv.y = 1.0 - localUv.y;
        float clampedX = clamp(localUv.x, 0.03, 0.97);
        vUv = vec2((aRect.w + clampedX) / uGlyphCount, localUv.y);
        vColor = aColor;
      }
    `;

    const fsGlyph = `#version 300 es
      precision mediump float;
      uniform sampler2D uAtlas;
      in vec2 vUv;
      in vec4 vColor;
      out vec4 outColor;
      void main() {
        float alpha = clamp(texture(uAtlas, vUv).a * 1.18, 0.0, 1.0) * vColor.a;
        if (alpha < 0.03) discard;
        outColor = vec4(vColor.rgb, alpha);
      }
    `;

    this.glyphProg = link(vsGlyph, fsGlyph);
    this.uViewportLoc = gl.getUniformLocation(this.glyphProg, 'uViewport');
    this.uGlyphCountLoc = gl.getUniformLocation(this.glyphProg, 'uGlyphCount');
    this.uAtlasLoc = gl.getUniformLocation(this.glyphProg, 'uAtlas');

    // Fullscreen Post-Process Shaders (Twilight Valley Haze + 9-Tap GPU Gaussian Bloom!)
    const vsQuad = `#version 300 es
      layout(location = 0) in vec2 aPos;
      out vec2 vUv;
      void main() {
        vUv = aPos + 0.5;
        gl_Position = vec4(aPos * 2.0, 0.0, 1.0);
      }
    `;

    const fsBloomExtract = `#version 300 es
      precision mediump float;
      uniform sampler2D uScene;
      in vec2 vUv;
      out vec4 outColor;
      void main() {
        vec3 col = texture(uScene, vUv).rgb;
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float boost = smoothstep(0.28, 0.85, lum);
        outColor = vec4(col * boost * 1.35, 1.0);
      }
    `;

    const fsBlur = `#version 300 es
      precision mediump float;
      uniform sampler2D uTex;
      uniform vec2 uDir;
      in vec2 vUv;
      out vec4 outColor;
      void main() {
        vec3 sum = texture(uTex, vUv).rgb * 0.227027;
        sum += texture(uTex, vUv + uDir * 1.3846).rgb * 0.316216;
        sum += texture(uTex, vUv - uDir * 1.3846).rgb * 0.316216;
        sum += texture(uTex, vUv + uDir * 3.2307).rgb * 0.070270;
        sum += texture(uTex, vUv - uDir * 3.2307).rgb * 0.070270;
        outColor = vec4(sum, 1.0);
      }
    `;

    const fsComposite = `#version 300 es
      precision mediump float;
      uniform sampler2D uScene;
      uniform sampler2D uBloom;
      uniform float uHorizon;
      in vec2 vUv;
      out vec4 outColor;
      void main() {
        vec3 scene = texture(uScene, vUv).rgb;
        vec3 bloom = texture(uBloom, vUv).rgb;
        // Deep midnight twilight horizon mist at top of screen behind distant forest & citadel!
        float skyFactor = smoothstep(0.54, 0.98, vUv.y) * uHorizon;
        vec3 twilight = mix(vec3(0.0, 0.0, 0.0), vec3(0.055, 0.105, 0.175), skyFactor);
        vec3 finalCol = twilight * (1.0 - clamp(dot(scene, vec3(1.2)), 0.0, 0.7)) + scene + bloom * 0.78;
        // Gentle subtle ACES-like shoulder so bright silver rims glow smoothly without clipping harsh
        finalCol = finalCol / (1.0 + finalCol * 0.18);
        outColor = vec4(finalCol, 1.0);
      }
    `;

    this.extractProg = link(vsQuad, fsBloomExtract);
    this.uExtractScene = gl.getUniformLocation(this.extractProg, 'uScene');

    this.blurProg = link(vsQuad, fsBlur);
    this.uBlurTex = gl.getUniformLocation(this.blurProg, 'uTex');
    this.uBlurDir = gl.getUniformLocation(this.blurProg, 'uDir');

    this.compProg = link(vsQuad, fsComposite);
    this.uCompScene = gl.getUniformLocation(this.compProg, 'uScene');
    this.uCompBloom = gl.getUniformLocation(this.compProg, 'uBloom');
    this.uCompHorizon = gl.getUniformLocation(this.compProg, 'uHorizon');

    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const fsVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fsVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.horizonGlow = 1.0;

    this.glyphVao = gl.createVertexArray();
    gl.bindVertexArray(this.glyphVao);

    const qVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.instanceVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INSTANCES * FLOATS_PER_INSTANCE * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    this.atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this._createRenderTargets = (w, h) => {
      const makeTarget = (tw, th) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fbo, w: tw, h: th };
      };
      if (this.sceneRt) {
        for (const rt of [this.sceneRt, this.bloomRtA, this.bloomRtB]) {
          gl.deleteTexture(rt.tex);
          gl.deleteFramebuffer(rt.fbo);
        }
      }
      const sw = Math.max(2, w);
      const sh = Math.max(2, h);
      const bw = Math.max(2, Math.floor(sw * 0.5));
      const bh = Math.max(2, Math.floor(sh * 0.5));
      this.sceneRt = makeTarget(sw, sh);
      this.bloomRtA = makeTarget(bw, bh);
      this.bloomRtB = makeTarget(bw, bh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    this.resize(this.width, this.height);
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);

    if (this.gl) {
      this._createRenderTargets(this.canvas.width, this.canvas.height);
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  beginFrame() {
    this.normalCount = 0;
    this.glowCount = 0;
  }

  drawGlyph(x, y, size, ch, r, g, b, a = 1.0, additive = false) {
    if (a <= 0.025 || size < 1.8) return;
    if (x < -size || x > this.width + size || y < -size || y > this.height + size) return;
    const idx = CHAR_TO_INDEX.get(ch);
    if (idx === undefined || idx === 0) return;

    if (additive) {
      if (this.glowCount >= MAX_INSTANCES) return;
      const off = this.glowCount * FLOATS_PER_INSTANCE;
      this.glowBuf[off] = x;
      this.glowBuf[off + 1] = y;
      this.glowBuf[off + 2] = size;
      this.glowBuf[off + 3] = idx;
      this.glowBuf[off + 4] = r;
      this.glowBuf[off + 5] = g;
      this.glowBuf[off + 6] = b;
      this.glowBuf[off + 7] = a;
      this.glowCount++;
    } else {
      if (this.normalCount >= MAX_INSTANCES) return;
      const off = this.normalCount * FLOATS_PER_INSTANCE;
      this.normalBuf[off] = x;
      this.normalBuf[off + 1] = y;
      this.normalBuf[off + 2] = size;
      this.normalBuf[off + 3] = idx;
      this.normalBuf[off + 4] = r;
      this.normalBuf[off + 5] = g;
      this.normalBuf[off + 6] = b;
      this.normalBuf[off + 7] = a;
      this.normalCount++;
    }
  }

  drawText(centerX, centerY, size, text, r, g, b, a = 1.0, additive = false) {
    const step = size * 0.56;
    const startX = centerX - ((text.length - 1) * step) * 0.5;
    for (let i = 0; i < text.length; i++) {
      this.drawGlyph(startX + i * step, centerY, size, text[i], r, g, b, a, additive);
    }
  }

  render() {
    if (this.gl) {
      const gl = this.gl;
      const rt = this.sceneRt;
      // Pass 1: Render Pure ASCII Glyphs into Offscreen Scene FBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
      gl.viewport(0, 0, rt.w, rt.h);
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.useProgram(this.glyphProg);
      gl.bindVertexArray(this.glyphVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.uniform1i(this.uAtlasLoc, 0);
      gl.uniform2f(this.uViewportLoc, this.width, this.height);
      gl.uniform1f(this.uGlyphCountLoc, CHARSET.length);

      if (this.normalCount > 0) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.normalBuf.subarray(0, this.normalCount * FLOATS_PER_INSTANCE));
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.normalCount);
      }

      if (this.glowCount > 0) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.glowBuf.subarray(0, this.glowCount * FLOATS_PER_INSTANCE));
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.glowCount);
      }
      gl.disable(gl.BLEND);

      // Pass 2: Extract Luminous Bloom Highlights -> Half-Res FBO A
      gl.bindVertexArray(this.quadVao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomRtA.fbo);
      gl.viewport(0, 0, this.bloomRtA.w, this.bloomRtA.h);
      gl.useProgram(this.extractProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, rt.tex);
      gl.uniform1i(this.uExtractScene, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 3: Separable Gaussian Blur (Horizontal -> B, Vertical -> A)
      gl.useProgram(this.blurProg);
      gl.uniform1i(this.uBlurTex, 0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomRtB.fbo);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomRtA.tex);
      gl.uniform2f(this.uBlurDir, 1.8 / this.bloomRtA.w, 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomRtA.fbo);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomRtB.tex);
      gl.uniform2f(this.uBlurDir, 0.0, 1.8 / this.bloomRtA.h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Second wide blur pass for silky cloud & lantern halo
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomRtB.fbo);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomRtA.tex);
      gl.uniform2f(this.uBlurDir, 3.2 / this.bloomRtA.w, 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomRtA.fbo);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomRtB.tex);
      gl.uniform2f(this.uBlurDir, 0.0, 3.2 / this.bloomRtA.h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 4: Composite Crisp ASCII + Atmospheric Twilight Sky + Bloom to Screen!
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.compProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, rt.tex);
      gl.uniform1i(this.uCompScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomRtA.tex);
      gl.uniform1i(this.uCompBloom, 1);
      gl.uniform1f(this.uCompHorizon, this.horizonGlow ?? 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.bindVertexArray(null);
      return;
    }

    // Canvas2D fallback (also 100% pure pitch black + crisp monospace ASCII)
    if (this.ctx2d) {
      const ctx = this.ctx2d;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const drawBatch = (buf, count, isGlow) => {
        ctx.globalCompositeOperation = isGlow ? 'lighter' : 'source-over';
        let lastBucket = -1;
        for (let i = 0; i < count; i++) {
          const off = i * FLOATS_PER_INSTANCE;
          const sz = buf[off + 2];
          const bucket = Math.round(sz);
          if (bucket !== lastBucket) {
            lastBucket = bucket;
            ctx.font = `700 ${bucket}px Consolas, monospace`;
          }
          ctx.fillStyle = `rgba(${Math.round(buf[off + 4] * 255)},${Math.round(buf[off + 5] * 255)},${Math.round(
            buf[off + 6] * 255
          )},${buf[off + 7].toFixed(2)})`;
          ctx.fillText(CHARSET[buf[off + 3]], buf[off], buf[off + 1]);
        }
      };

      drawBatch(this.normalBuf, this.normalCount, false);
      drawBatch(this.glowBuf, this.glowCount, true);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
