// ---- Interactive hero: hover a link and Anisha turns to look at it ----
// assets/hero-looks.mp4 is real green-screen footage, cut into four short clips (up-left, left, down-left, up-right) and packed side by side:
// left half = colour (premultiplied), right half = transparency mask. WebGL combines them so she
// sits on the page with no box. Each clip = turn toward the link, a short hold, then the same turn
// in reverse back to the neutral pose (frame 0).
(() => {
  const canvas = document.getElementById('avatar');
  const video = document.getElementById('heroVideo');
  if (!canvas || !video) return;
  const FPS = 24;
  const CLIPS = {                                        // frame numbers inside hero-looks.mp4
    'up-left':   { start: 2,   len: 28, hold: 4 },
    'left':      { start: 63,  len: 27, hold: 4 },
    'down-left': { start: 122, len: 27, hold: 4 },
    'up-right':  { start: 181, len: 15, hold: 4 },
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover)').matches;

  // --- WebGL: colour * mask -> transparent portrait ---
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
  if (!gl) return;
  const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 uv;uniform sampler2D t;void main(){' +
    'vec3 c=texture2D(t,vec2(uv.x*.5,uv.y)).rgb;float a=texture2D(t,vec2(.5+uv.x*.5,uv.y)).r;' +
    'a=smoothstep(.03,.97,a);gl_FragColor=vec4(min(c,vec3(a)),a);}'));
  gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
    gl.texParameteri(gl.TEXTURE_2D, k, v);
  function paint() {
    if (video.readyState < 2) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // --- playback state ---
  // phase: 'idle' | 'in' (turning toward) | 'hold' | 'out' (turning back)
  let dir = null, phase = 'idle', want = null, stopAt = 0, onStop = null;
  const t = f => (f + 0.5) / FPS;                        // middle of frame f, so seeks land exactly
  const frameNow = () => Math.floor(video.currentTime * FPS + 0.001);

  function seek(f) { video.currentTime = t(f); }
  function playTo(f, done) { stopAt = f; onStop = done; video.play().catch(() => {}); watch(); }

  function goIn(d) {
    const c = CLIPS[d]; dir = d; phase = 'in';
    seek(c.start);
    playTo(c.start + c.len, () => { phase = 'hold'; video.pause(); seek(c.start + c.len); });
  }
  function goOut() {
    const c = CLIPS[dir];
    const f = frameNow();
    let from = c.start + c.len + c.hold;                 // start of the reverse half
    if (phase === 'in') from += Math.max(0, c.start + c.len - 1 - f); // mirror point: leave mid-turn smoothly
    phase = 'out'; seek(from);
    playTo(c.start + 2 * c.len + c.hold, () => {
      video.pause(); seek(0); phase = 'idle'; dir = null;
      if (want) goIn(want);
    });
  }
  function look(d) {
    want = d;
    if (reduce) return;
    if (phase === 'idle') goIn(d);
    else if (dir === d && phase === 'out') {           // came back before she finished turning away
      const c = CLIPS[d], f = frameNow(), back = c.start + 2 * c.len + c.hold - f;
      phase = 'in'; seek(c.start + Math.max(0, c.len - back));
      playTo(c.start + c.len, () => { phase = 'hold'; video.pause(); seek(c.start + c.len); });
    }
    else if (dir !== d && phase !== 'out') goOut();    // turn back first, then toward the new link
  }
  function away(d) {
    if (want === d) want = null;
    if (reduce || phase === 'idle' || phase === 'out') return;
    goOut();
  }

  // Stop at the end of the current segment. Checked every painted frame, on every decoded video frame
  // (requestVideoFrameCallback) and on timeupdate/ended, so a slow or background tab never runs past it.
  function check() {
    if (onStop && (frameNow() >= stopAt || video.ended)) { const f = onStop; onStop = null; f(); }
  }
  let watching = false;
  function watch() {
    if (watching) return; watching = true;
    const step = () => {
      check(); paint();
      if (onStop || !video.paused || video.seeking) requestAnimationFrame(step);
      else { watching = false; paint(); }
    };
    requestAnimationFrame(step);
    if (video.requestVideoFrameCallback) {
      const vf = () => { check(); if (onStop) video.requestVideoFrameCallback(vf); };
      video.requestVideoFrameCallback(vf);
    }
  }
  video.addEventListener('timeupdate', check);
  video.addEventListener('ended', check);
  video.addEventListener('seeked', () => paint());
  video.addEventListener('loadeddata', () => { seek(0); canvas.classList.add('ready'); });
  // Load the whole (small) video into memory so seeking works on any server, even without range requests.
  fetch(video.dataset.src).then(r => r.blob()).then(b => { video.src = URL.createObjectURL(b); })
    .catch(() => { video.src = video.dataset.src; });

  document.querySelectorAll('[data-look]').forEach(el => {
    const d = el.dataset.look;
    if (canHover) {
      el.addEventListener('pointerenter', () => look(d));
      el.addEventListener('pointerleave', () => away(d));
    }
    el.addEventListener('focusin', () => look(d));
    el.addEventListener('focusout', () => away(d));
  });

  // Debug / test hook
  window.__avatar = { get phase() { return phase; }, get dir() { return dir; }, get frame() { return frameNow(); }, look, away };
})();

// ---- Light / dark theme toggle (initial theme is set in <head> before paint) ----
(() => {
  const btn = document.getElementById('themeToggle');
  const root = document.documentElement;
  const sys = matchMedia('(prefers-color-scheme: dark)');
  const label = () => btn.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  label();
  btn.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', root.dataset.theme);
    label();
  });
  // follow the system setting until the visitor picks one
  sys.addEventListener('change', e => {
    if (!localStorage.getItem('theme')) { root.dataset.theme = e.matches ? 'dark' : 'light'; label(); }
  });
})();

// Fade sections' content in on scroll
const targets = document.querySelectorAll('.copy, .head, .card, .thumb, .slide, .side, .frame');
targets.forEach(el => el.classList.add('reveal'));
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
targets.forEach(el => io.observe(el));
