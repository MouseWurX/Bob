// 🧊 3D models: reading and showing them, shared word for word with the phone app
// (android/app/src/main/assets/www/model-core.js), so the side panel and the phone show a model the same way.
// No libraries: plain WebGL on a canvas.
//
// Reading: STL (text or binary), OBJ (text, with vertex colours when the file has them) and GLB (binary glTF, with
// its colours and pictures). Every file becomes a list of parts, each a plain list of triangles:
//   { positions: Float32Array (x,y,z per corner), normals: Float32Array|null, uvs: Float32Array|null,
//     colors: Float32Array|null (r,g,b per corner), color: [r,g,b,a], image: { mime, bytes }|null }
// plus the box around it all and the number of triangles. These are pure functions, so tests run them in Node.
//
// Showing (showModel): drag (or one finger) turns it, the wheel (or two fingers) zooms, a double-click or Home
// puts it back. Keys: arrows turn, + and - zoom. It turns slowly by itself until touched, unless animations are off.
(function (root) {
  const MODEL_EXT = ['.stl', '.obj', '.glb'];
  const MAX_TRIANGLES = 3_000_000; // more than this would stall a phone; say so instead
  const isModelName = (name) => /\.(stl|obj|glb)$/i.test(String(name || ''));

  const fail = (msg) => { throw new Error(msg); };

  // ---------- STL ----------
  // Binary STL: 80 bytes of header, a triangle count, then 50 bytes per triangle. A text STL starts "solid", but so do
  // some binary ones, so the size decides.
  function parseStl(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.byteLength >= 84) {
      const n = dv.getUint32(80, true);
      if (84 + n * 50 === u8.byteLength) {
        if (n > MAX_TRIANGLES) fail(`That model has ${n.toLocaleString('en')} triangles, too many to show here. Open it in its app.`);
        const pos = new Float32Array(n * 9), nor = new Float32Array(n * 9);
        for (let i = 0; i < n; i++) {
          const o = 84 + i * 50;
          const nx = dv.getFloat32(o, true), ny = dv.getFloat32(o + 4, true), nz = dv.getFloat32(o + 8, true);
          for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(o + 12 + k * 4, true);
          for (let v = 0; v < 3; v++) { nor[i * 9 + v * 3] = nx; nor[i * 9 + v * 3 + 1] = ny; nor[i * 9 + v * 3 + 2] = nz; }
        }
        return finish([{ positions: pos, normals: faceNormals(pos, nor), uvs: null, colors: null, color: null, image: null }]);
      }
    }
    const text = new TextDecoder().decode(u8);
    if (!/^\s*solid\b/i.test(text)) fail('That isn\'t an STL file Bob can read.');
    const nums = [];
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
    for (let m; (m = re.exec(text));) nums.push(+m[1], +m[2], +m[3]);
    if (!nums.length || nums.length % 9) fail('That STL file has no whole triangles in it.');
    if (nums.length / 9 > MAX_TRIANGLES) fail('That model has too many triangles to show here. Open it in its app.');
    const pos = Float32Array.from(nums);
    return finish([{ positions: pos, normals: faceNormals(pos), uvs: null, colors: null, color: null, image: null }]);
  }

  // The flat normal of each triangle, from its corners. Keeps a given normal only where it's a real one.
  function faceNormals(pos, given = null) {
    const out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 9) {
      const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
      const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      let l = Math.hypot(nx, ny, nz);
      if (!(l > 0) && given) { nx = given[i]; ny = given[i + 1]; nz = given[i + 2]; l = Math.hypot(nx, ny, nz); }
      if (l > 0) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 0; nz = 1; }
      for (let v = 0; v < 3; v++) { out[i + v * 3] = nx; out[i + v * 3 + 1] = ny; out[i + v * 3 + 2] = nz; }
    }
    return out;
  }

  // ---------- OBJ ----------
  // v x y z [r g b], vt u v, vn x y z, f a/b/c ... (any number of corners, counted from 1, or from the end when
  // negative). Materials (.mtl files) aren't read: the model shows in one colour, or in its vertex colours.
  function parseObj(input) {
    const text = typeof input === 'string' ? input : new TextDecoder().decode(input);
    const v = [], vc = [], vt = [], vn = [];
    const P = [], N = [], T = [], C = [];
    let hasN = true, hasT = true, hasC = false, tris = 0;
    const idx = (s, len) => { const i = parseInt(s, 10); return i < 0 ? len + i : i - 1; };
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line[0] === '#') continue;
      const parts = line.split(/\s+/);
      const k = parts[0];
      if (k === 'v') { v.push([+parts[1], +parts[2], +parts[3]]); if (parts.length >= 7) { vc.push([+parts[4], +parts[5], +parts[6]]); hasC = true; } else vc.push(null); }
      else if (k === 'vt') vt.push([+parts[1], +(parts[2] || 0)]);
      else if (k === 'vn') vn.push([+parts[1], +parts[2], +parts[3]]);
      else if (k === 'f') {
        const corners = parts.slice(1).map((c) => { const [a, b, n] = c.split('/'); return { p: idx(a, v.length), t: b ? idx(b, vt.length) : -1, n: n ? idx(n, vn.length) : -1 }; });
        for (let i = 1; i + 1 < corners.length; i++) {
          if (++tris > MAX_TRIANGLES) fail('That model has too many triangles to show here. Open it in its app.');
          for (const c of [corners[0], corners[i], corners[i + 1]]) {
            const p = v[c.p]; if (!p) fail('That OBJ file points at a corner it doesn\'t have.');
            P.push(p[0], p[1], p[2]);
            const col = vc[c.p]; C.push(...(col || [0.75, 0.77, 0.8]));
            if (c.n >= 0 && vn[c.n]) N.push(...vn[c.n]); else hasN = false;
            if (c.t >= 0 && vt[c.t]) T.push(...vt[c.t]); else hasT = false;
          }
        }
      }
    }
    if (!P.length) fail('That OBJ file has no faces in it, so there\'s nothing to show.');
    const positions = Float32Array.from(P);
    return finish([{ positions, normals: hasN ? Float32Array.from(N) : faceNormals(positions), uvs: hasT ? Float32Array.from(T) : null, colors: hasC ? Float32Array.from(C) : null, color: null, image: null }]);
  }

  // ---------- GLB (binary glTF 2.0) ----------
  const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

  function parseGlb(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) fail('That isn\'t a GLB file Bob can read.');
    if (dv.getUint32(4, true) !== 2) fail('That GLB file is an old kind (glTF 1). Open it in its app.');
    let json = null, bin = null;
    for (let o = 12; o + 8 <= u8.byteLength;) {
      const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
      const chunk = u8.subarray(o + 8, o + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004e4942) bin = chunk;
      o += 8 + len;
    }
    if (!json) fail('That GLB file has no description in it.');
    if ((json.extensionsRequired || []).some((x) => /draco|meshopt/i.test(x))) fail('That GLB file is squeezed (Draco or meshopt), which Bob\'s viewer can\'t open yet. Open it in its app.');
    const view = (i) => {
      const bv = json.bufferViews?.[i]; if (!bv) fail('That GLB file is missing a part.');
      if ((bv.buffer || 0) !== 0 || !bin) fail('That GLB file keeps its data in another file. Bob shows single-file models only.');
      return { bytes: bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength), stride: bv.byteStride || 0 };
    };
    // An accessor as plain numbers (normalised colours and texture spots become 0..1).
    const read = (i) => {
      const a = json.accessors?.[i]; if (!a) fail('That GLB file is missing a part.');
      const [, bytes] = COMP[a.componentType] || fail('That GLB file uses a number type Bob can\'t read.');
      const n = SIZE[a.type] || 1, out = new Float32Array(a.count * n);
      if (a.bufferView == null) return { data: out, n };
      const { bytes: src, stride } = view(a.bufferView);
      const step = stride || n * bytes, base = a.byteOffset || 0;
      const d = new DataView(src.buffer, src.byteOffset, src.byteLength);
      const get = { 5120: (o) => d.getInt8(o), 5121: (o) => d.getUint8(o), 5122: (o) => d.getInt16(o, true), 5123: (o) => d.getUint16(o, true), 5125: (o) => d.getUint32(o, true), 5126: (o) => d.getFloat32(o, true) }[a.componentType];
      const div = a.normalized ? NORM[a.componentType] || 1 : 1;
      for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = get(base + k * step + c * bytes) / div;
      return { data: out, n };
    };
    const parts = [];
    let tris = 0;
    const drawMesh = (mi, M) => {
      for (const pr of json.meshes?.[mi]?.primitives || []) {
        if ((pr.mode ?? 4) !== 4 || pr.attributes?.POSITION == null) continue; // triangles only (no points or lines)
        const pos = read(pr.attributes.POSITION).data;
        const nor = pr.attributes.NORMAL != null ? read(pr.attributes.NORMAL).data : null;
        const uv = pr.attributes.TEXCOORD_0 != null ? read(pr.attributes.TEXCOORD_0).data : null;
        const col = pr.attributes.COLOR_0 != null ? read(pr.attributes.COLOR_0) : null;
        const ind = pr.indices != null ? read(pr.indices).data : null;
        const count = ind ? ind.length : pos.length / 3;
        tris += count / 3;
        if (tris > MAX_TRIANGLES) fail('That model has too many triangles to show here. Open it in its app.');
        const P = new Float32Array(count * 3), N = nor ? new Float32Array(count * 3) : null, U = uv ? new Float32Array(count * 2) : null, C = col ? new Float32Array(count * 3) : null;
        for (let k = 0; k < count; k++) {
          const i = ind ? ind[k] : k;
          const [x, y, z] = apply(M, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
          P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z;
          if (N) { const [a, b, c] = turn(M, nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]); N[k * 3] = a; N[k * 3 + 1] = b; N[k * 3 + 2] = c; }
          if (U) { U[k * 2] = uv[i * 2]; U[k * 2 + 1] = uv[i * 2 + 1]; }
          if (C) for (let c = 0; c < 3; c++) C[k * 3 + c] = col.data[i * col.n + c];
        }
        const mat = json.materials?.[pr.material]?.pbrMetallicRoughness || {};
        const color = Array.isArray(mat.baseColorFactor) ? mat.baseColorFactor.slice(0, 4) : null;
        let image = null;
        const tex = mat.baseColorTexture ? json.textures?.[mat.baseColorTexture.index] : null;
        const img = tex ? json.images?.[tex.source ?? tex.extensions?.EXT_texture_webp?.source] : null;
        if (img && img.bufferView != null && U) image = { mime: img.mimeType || 'image/png', bytes: view(img.bufferView).bytes };
        parts.push({ positions: P, normals: N || faceNormals(P), uvs: U, colors: C, color, image });
      }
    };
    const walk = (ni, parent, seen) => {
      const node = json.nodes?.[ni]; if (!node || seen.has(ni)) return;
      seen.add(ni);
      const M = mul(parent, nodeMatrix(node));
      if (node.mesh != null) drawMesh(node.mesh, M);
      for (const c of node.children || []) walk(c, M, seen);
    };
    const scene = json.scenes?.[json.scene ?? 0];
    if (scene) { const seen = new Set(); for (const ni of scene.nodes || []) walk(ni, IDENT, seen); }
    else for (let mi = 0; mi < (json.meshes || []).length; mi++) drawMesh(mi, IDENT);
    if (!parts.length) fail('That GLB file has no shapes in it, so there\'s nothing to show.');
    return finish(parts);
  }

  // 4x4 matrices, column by column (as glTF writes them).
  const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mul(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  }
  function nodeMatrix(n) {
    if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix.slice();
    const [tx, ty, tz] = n.translation || [0, 0, 0], [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
    return [
      (1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
      2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
      2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
      tx, ty, tz, 1
    ];
  }
  const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  const turn = (m, x, y, z) => { const a = m[0] * x + m[4] * y + m[8] * z, b = m[1] * x + m[5] * y + m[9] * z, c = m[2] * x + m[6] * y + m[10] * z, l = Math.hypot(a, b, c) || 1; return [a / l, b / l, c / l]; };

  // The box around every part, and the triangle count.
  function finish(parts) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let triangles = 0;
    for (const p of parts) {
      triangles += p.positions.length / 9;
      for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { const x = p.positions[i + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
    }
    if (!Number.isFinite(min[0])) fail('That model is empty.');
    return { parts, min, max, size: max.map((x, k) => x - min[k]), triangles: Math.round(triangles) };
  }

  // Any of the three, by its name.
  function parseModel(name, buf) {
    const ext = (/\.[^.]+$/.exec(String(name || '').toLowerCase()) || [''])[0];
    if (ext === '.stl') return parseStl(buf);
    if (ext === '.obj') return parseObj(buf);
    if (ext === '.glb') return parseGlb(buf);
    return fail('Bob\'s 3D viewer shows STL, OBJ and GLB files.');
  }

  // "40 × 20 × 10" with sensible rounding (the file says no units; 3D printing files are usually millimetres).
  function sizeWords(size) {
    const r = (x) => (Math.abs(x) >= 100 ? Math.round(x) : Math.abs(x) >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100);
    return size.map(r).join(' \u00d7 '); // escaped: the phone app reads this file without a declared character set
  }

  const VS = `
  attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv; attribute vec3 aCol;
  uniform mat4 uMvp; uniform mat4 uRot;
  varying vec3 vNor; varying vec2 vUv; varying vec3 vCol;
  void main() { vNor = (uRot * vec4(aNor, 0.0)).xyz; vUv = aUv; vCol = aCol; gl_Position = uMvp * vec4(aPos, 1.0); }`;
  const FS = `
  precision mediump float;
  varying vec3 vNor; varying vec2 vUv; varying vec3 vCol;
  uniform vec4 uBase; uniform bool uTex; uniform sampler2D uImg;
  void main() {
    vec3 n = normalize(vNor);
    vec3 key = normalize(vec3(0.4, 0.7, 0.6)), fill = normalize(vec3(-0.6, 0.2, -0.4));
    float l = 0.32 + 0.58 * abs(dot(n, key)) + 0.18 * abs(dot(n, fill)); // both sides lit: models aren't always closed
    vec4 c = uBase * vec4(vCol, 1.0);
    if (uTex) c *= texture2D(uImg, vUv);
    gl_FragColor = vec4(c.rgb * l, 1.0);
  }`;

  const CLAY = [0.78, 0.8, 0.84, 1]; // a model with no colours of its own

  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
  const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
  const move = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  const scale = (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];

  // STL files (3D printing, CAD, OpenSCAD) stand on Z; glTF and most OBJ files stand on Y. Z-up files are tipped so
  // they stand up here too.
  const upAxis = (name) => (/\.stl$/i.test(String(name || '')) ? 'z' : 'y');

  // Shows the model at url (its file name decides how it's read) in host. Returns { close } or throws a plain message.
  async function showModel(host, { url, name, still = false }) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Bob couldn\'t read that file. It may have moved.');
    const model = parseModel(name, new Uint8Array(await res.arrayBuffer()));
    host.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'model-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `3D model ${name}. Drag or use the arrow keys to turn it, the wheel or plus and minus to zoom, Home to put it back.`);
    const info = document.createElement('p');
    info.className = 'muted model-info';
    info.textContent = `${sizeWords(model.size)} (usually mm) \u00b7 ${model.triangles.toLocaleString()} triangles \u00b7 drag to turn, scroll to zoom, double-click to reset`;
    host.append(canvas, info);
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }) || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('This screen can\'t draw 3D (WebGL is off). Open it in its app.');

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    gl.useProgram(prog);
    const at = (n) => gl.getAttribLocation(prog, n), un = (n) => gl.getUniformLocation(prog, n);
    const A = { pos: at('aPos'), nor: at('aNor'), uv: at('aUv'), col: at('aCol') };
    const U = { mvp: un('uMvp'), rot: un('uRot'), base: un('uBase'), tex: un('uTex'), img: un('uImg') };
    const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };

    const parts = [];
    for (const p of model.parts) {
      const n = p.positions.length / 3;
      const part = { n, pos: buf(p.positions), nor: buf(p.normals), uv: p.uvs ? buf(p.uvs) : null, col: p.colors ? buf(p.colors) : null, color: p.color || CLAY, tex: null };
      if (p.image) {
        try {
          const bmp = await createImageBitmap(new Blob([p.image.bytes], { type: p.image.mime }));
          const t = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // no mipmaps: pictures needn't be powers of two
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          part.tex = t; if (!p.color) part.color = [1, 1, 1, 1];
        } catch {}
      }
      if (!p.colors && !part.tex && !p.color) part.color = CLAY;
      parts.push(part);
    }

    const centre = model.min.map((x, k) => (x + model.max[k]) / 2);
    const radius = Math.max(1e-6, Math.hypot(...model.size) / 2);
    const tip = upAxis(name) === 'z' ? rotX(-Math.PI / 2) : rotX(0);
    const START = { yaw: -0.6, pitch: 0.45, dist: 2.6 };
    let { yaw, pitch, dist } = START, spin = !still, need = true, raf = 0, closed = false;

    function draw() {
      const w = canvas.clientWidth || 400, h = canvas.clientHeight || 300, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      const rot = mul(rotX(pitch), mul(rotY(yaw), tip));
      const world = mul(rot, mul(scale(1 / radius), move(-centre[0], -centre[1], -centre[2])));
      const mvp = mul(perspective(0.7, w / h, 0.05, 100), mul(move(0, 0, -dist), world));
      gl.uniformMatrix4fv(U.mvp, false, new Float32Array(mvp));
      gl.uniformMatrix4fv(U.rot, false, new Float32Array(rot));
      gl.uniform1i(U.img, 0);
      for (const p of parts) {
        const bind = (b, loc, size, fallback) => {
          if (loc < 0) return;
          if (b) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
          else { gl.disableVertexAttribArray(loc); gl.vertexAttrib4f(loc, ...fallback); }
        };
        bind(p.pos, A.pos, 3, [0, 0, 0, 1]); bind(p.nor, A.nor, 3, [0, 0, 1, 0]); bind(p.uv, A.uv, 2, [0, 0, 0, 0]); bind(p.col, A.col, 3, [1, 1, 1, 1]);
        gl.uniform4fv(U.base, p.color);
        gl.uniform1i(U.tex, p.tex ? 1 : 0);
        if (p.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, p.tex); }
        gl.drawArrays(gl.TRIANGLES, 0, p.n);
      }
    }
    let last = performance.now();
    function frame(now) {
      if (closed || !canvas.isConnected) { closed = true; return; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (spin) { yaw += dt * 0.35; need = true; }
      if (need) { need = false; draw(); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const clampPitch = () => { pitch = Math.max(-1.5, Math.min(1.5, pitch)); };
    const zoom = (f) => { dist = Math.max(0.6, Math.min(12, dist * f)); need = true; };
    const reset = () => { ({ yaw, pitch, dist } = START); need = true; };
    const pointers = new Map();
    let pinch = 0;
    canvas.addEventListener('pointerdown', (e) => { spin = false; canvas.setPointerCapture?.(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); });
    canvas.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId); if (!p) return;
      if (pointers.size === 1) { yaw += (e.clientX - p[0]) * 0.01; pitch += (e.clientY - p[1]) * 0.01; clampPitch(); need = true; }
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoom(pinch / d);
        pinch = d;
      }
    });
    const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); spin = false; zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    canvas.addEventListener('dblclick', () => { spin = false; reset(); });
    canvas.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowLeft') yaw -= 0.15; else if (k === 'ArrowRight') yaw += 0.15;
      else if (k === 'ArrowUp') pitch -= 0.15; else if (k === 'ArrowDown') pitch += 0.15;
      else if (k === '+' || k === '=') zoom(1 / 1.15); else if (k === '-' || k === '_') zoom(1.15);
      else if (k === 'Home') reset(); else return;
      e.preventDefault(); spin = false; clampPitch(); need = true;
    });
    window.addEventListener('resize', () => { need = true; });
    return { model, close() { closed = true; cancelAnimationFrame(raf); } };
  }

  const api = { MODEL_EXT, MAX_TRIANGLES, isModelName, parseStl, parseObj, parseGlb, parseModel, faceNormals, nodeMatrix, mul, sizeWords, upAxis, showModel };
  root.BobModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
