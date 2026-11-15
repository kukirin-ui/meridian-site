/* Meridian Hub shell: raw WebGL2, no dependencies.
   Store -> menu scene (core + fibres + 4 portals) -> dive into the tapped portal -> the app opens. */
(function () {
  'use strict';

  /* ---------- Store ---------- */
  var MODULES = {
    parallel: { label: 'PARALLEL', acc: [0.23, 0.62, 1.00] },
    gaming:   { label: 'GAMING',   acc: [1.00, 0.35, 0.12] },
    nullcloud:{ label: 'NULLCLOUD',acc: [0.13, 0.83, 0.65] },
    chat:     { label: 'CHAT',     acc: [0.55, 0.42, 1.00] },
    core:     { label: 'CORE',     acc: [1.00, 0.85, 0.60] }
  };
  // portal order = lobe order: TL, TR, BL, BR  (unit coords, y up)
  var PORTALS = [
    { id: 'parallel',  x: -0.40, y:  0.40 },
    { id: 'gaming',    x:  0.40, y:  0.40 },
    { id: 'nullcloud', x: -0.40, y: -0.40 },
    { id: 'chat',      x:  0.40, y: -0.40 }
  ];
  var PORTAL_R = 0.25;

  var Store = {
    activeModule: 'menu',   // 'menu' | parallel | gaming | nullcloud | chat
    phase: 'menu',          // menu | zoomIn | module | zoomOut
    target: null,
    subs: [],
    subscribe: function (f) { this.subs.push(f); },
    set: function (patch) { for (var k in patch) this[k] = patch[k]; for (var i = 0; i < this.subs.length; i++) this.subs[i](this); }
  };
  window.MeridianStore = Store;

  /* ---------- GL setup ---------- */
  var canvas = document.getElementById('gl');
  var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) { document.getElementById('nogl').style.display = 'flex'; return; }
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');
  var LOWQ = /[?&]low/.test(location.search);
  var DPR = Math.min(window.devicePixelRatio || 1, LOWQ ? 1 : 1080 / Math.max(1, Math.min(window.innerWidth, window.innerHeight)));
  var W = 1, H = 1, S = 1;

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s), src); }
    return s;
  }
  function prog(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
    p.u = {}; var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var nm = gl.getActiveUniform(p, i).name; p.u[nm] = gl.getUniformLocation(p, nm); }
    return p;
  }
  var QUAD_VS = '#version 300 es\nin vec2 a;out vec2 uv;void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var vaoQuad = gl.createVertexArray(); gl.bindVertexArray(vaoQuad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  function drawQuad() { gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }

  function makeTarget(w, h) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { tex: t, fbo: f, w: w, h: h };
  }

  /* ---------- shaders: fibres ---------- */
  var FIB_VS = '#version 300 es\n' +
    'in vec2 p;in vec3 d;' +
    'uniform float time;uniform vec2 sc;uniform vec2 tilt;uniform float kind;uniform vec3 dive;out float vT;out float vSeed;out float vB;out vec2 vP;out float vFlow;\n' +
    'void main(){\n' +
    ' float w=sin(time*.6+d.y*40.+d.x*9.)*.006+sin(time*1.3+d.y*17.-d.x*5.)*.004;\n' +
    ' vec2 q=p*(1.+.035*sin(time*.7+d.y*6.))+vec2(-p.y,p.x)*w*3.;\n' +
    ' float z=(d.y-.5)*.9+.18*sin(time*.4+d.y*20.+length(p)*5.);\n' +
    ' vec3 v=vec3(q,z);\n' +
    ' float cx=cos(tilt.y),sx=sin(tilt.y),cy=cos(tilt.x),sy=sin(tilt.x);\n' +
    ' v=vec3(v.x*cy+v.z*sy,v.y,-v.x*sy+v.z*cy);\n' +
    ' v=vec3(v.x,v.y*cx-v.z*sx,v.y*sx+v.z*cx);\n' +
    ' float persp=1./(1.-v.z*.55);\n' +
    ' vec2 s=v.xy*persp;\n' +
    ' s=(s-dive.xy)*dive.z+dive.xy;\n' +
    ' vP=q;vT=d.x;vSeed=d.y;vB=d.z*(.75+.5*persp*persp*.6);\n' +
    ' vFlow=pow(.5+.5*sin(d.x*40.-time*(1.2+d.y*1.5)+d.y*30.),6.);\n' +
    ' gl_PointSize=kind>.5?((vFlow>.8&&fract(d.y*91.)<.07)?(1.5+3.5*vFlow)*persp*sqrt(dive.z)*'+(DPR*0.9)+':0.):1.;\n' +
    ' gl_Position=vec4(s*sc,0.,1.);}';
  var FIB_FS = '#version 300 es\nprecision highp float;\n' +
    'in float vT;in float vSeed;in float vB;in vec2 vP;in float vFlow;uniform float time;uniform float kind;out vec4 o;\n' +
    'void main(){\n' +
    ' float r=length(vP);\n' +
    ' vec3 white=vec3(1.,.95,.85), orange=vec3(1.,.55,.14), red=vec3(.95,.18,.06), gold=vec3(1.,.74,.3), blue=vec3(.25,.55,1.), ice=vec3(.6,.85,1.);\n' +
    ' vec3 c=mix(white,orange,smoothstep(.0,.22,r));\n' +
    ' float cone=smoothstep(.08,.35,abs(vP.y))*(1.-smoothstep(.35,.75,r))*smoothstep(.45,.1,abs(vP.x)*1.4);\n' +
    ' c=mix(c,red,clamp(cone*1.3,0.,1.)*.9);\n' +
    ' float mid=smoothstep(.55,.15,abs(vP.y))*smoothstep(.22,.7,abs(vP.x));\n' +
    ' c=mix(c,blue,mid*.8);\n' +
    ' float vert=smoothstep(.2,.04,abs(vP.x))*smoothstep(.2,.8,abs(vP.y));\n' +
    ' c=mix(c,ice,vert*.9);\n' +
    ' c=mix(c,gold,smoothstep(.5,.85,r)*(1.-mid)*.9);\n' +
    ' float flow=vFlow;\n' +
    ' if(kind>.5){vec2 pc=gl_PointCoord*2.-1.;float g=exp(-dot(pc,pc)*3.5);o=vec4(mix(c,vec3(1.),.5)*g*flow*.9,1.);return;}\n' +
    ' float a=(.05+.22*flow)*vB;\n' +
    ' a*=1.+2.*exp(-r*5.);\n' +
    ' o=vec4(c*a,1.);}';

  /* ---------- shaders: background glow + portals ---------- */
  var BG_FS = '#version 300 es\nprecision highp float;\n' +
    'in vec2 uv;uniform vec2 res;uniform float S;uniform float time;uniform vec4 pt[4];uniform vec2 par;uniform vec3 dive;uniform vec4 acc;out vec4 o;\n' +
    'void main(){\n' +
    ' vec2 p=(uv*res-res*.5)/(S*.5);p=(p-dive.xy)/dive.z+dive.xy;p-=par;\n' +
    ' float r=length(p);\n' +
    ' vec3 col=vec3(0.);\n' +
    ' float core=exp(-r*r*70.);\n' +
    ' col+=vec3(1.,.95,.88)*core*1.6;\n' +
    ' col+=vec3(1.,.5,.12)*exp(-r*r*14.)*.55;\n' +
    ' float cone=exp(-pow(abs(p.x)*5.5,1.6))*exp(-abs(p.y)*1.8)*smoothstep(1.,0.,abs(p.y));\n' +
    ' col+=vec3(.95,.2,.05)*cone*.55;\n' +
    ' float beam=exp(-abs(p.x)*70.)*exp(-abs(p.y)*1.1);\n' +
    ' col+=vec3(.35,.7,1.)*beam*(.55+.1*sin(time*2.));\n' +
    ' float band=exp(-abs(p.y)*7.)*smoothstep(.2,.9,abs(p.x))*.22;\n' +
    ' col+=vec3(.15,.4,.9)*band;\n' +
    ' float fl=1.;\n' +
    ' for(int i=0;i<4;i++){\n' +
    '  vec2 c=pt[i].xy; float rad=pt[i].z; float d=length(p-c);\n' +
    '  float rim=exp(-pow((d-rad)*14.,2.));\n' +
    '  float ang=atan(p.y-c.y,p.x-c.x);\n' +
    '  float hot=float(int(acc.w)==i)*clamp(dive.z-1.,0.,1.);\n' +
    '  col+=mix(vec3(1.,.7,.3),acc.rgb*1.6,hot)*rim*(.12+.1*sin(ang*3.+time+float(i))+hot*.9)*pt[i].w;\n' +
    '  fl*=smoothstep(rad,rad*.82,d)>.0?1.-smoothstep(rad*1.0,rad*.8,d)*.96:1.;\n' +
    ' }\n' +
    ' o=vec4(col*fl,1.);}';

  /* ---------- shaders: bloom + composite ---------- */
  var BLUR_FS = '#version 300 es\nprecision highp float;\nin vec2 uv;uniform sampler2D tx;uniform vec2 dir;uniform float thr;out vec4 o;\n' +
    'void main(){\n' +
    ' float w[5]=float[](.227027,.1945946,.1216216,.054054,.016216);\n' +
    ' vec3 c=texture(tx,uv).rgb*w[0];\n' +
    ' for(int i=1;i<5;i++){c+=texture(tx,uv+dir*float(i)*1.4).rgb*w[i];c+=texture(tx,uv-dir*float(i)*1.4).rgb*w[i];}\n' +
    ' o=vec4(max(c-thr,0.),1.);}';
  var COMP_FS = '#version 300 es\nprecision highp float;\nin vec2 uv;uniform sampler2D scene;uniform sampler2D bloom;uniform sampler2D bloom2;\n' +
    'uniform vec2 zc;uniform float zoom;uniform float bk;uniform float dark;uniform vec3 rs;uniform float vm;uniform vec4 pv[4];out vec4 o;\n' +
    'void main(){\n' +
    ' vec2 u=zc+(uv-zc)/zoom;\n' +
    ' vec3 c=texture(scene,u).rgb+texture(bloom,u).rgb*bk+texture(bloom2,u).rgb*bk*1.2;\n' +
    ' vec2 p=(u*rs.xy-rs.xy*.5)/(rs.z*.5);\n' +
    ' float m=1.;for(int i=0;i<4;i++){float d=length(p-pv[i].xy);m*=mix(1.,smoothstep(pv[i].z*.55,pv[i].z*1.02,d)*.92+.08,vm);}\n' +
    ' c*=m;\n' +
    ' c=1.-exp(-c*1.25);\n' +
    ' c=pow(c,vec3(.92));\n' +
    ' o=vec4(c*(1.-dark),1.);}';

  var pFib = prog(FIB_VS, FIB_FS), pBg = prog(QUAD_VS, BG_FS),
      pBlur = prog(QUAD_VS, BLUR_FS), pComp = prog(QUAD_VS, COMP_FS);

  /* ---------- fibre geometry ---------- */
  var fibVAO = gl.createVertexArray(), fibCount = 0;
  function rnd(seed) { var s = seed; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function buildFibres() {
    var R = rnd(1234567), N = LOWQ ? 900 : 2600, SEG = 72, data = [];
    for (var i = 0; i < N; i++) {
      var which = i % 2 ? 1 : -1, ang = which * Math.PI / 4;
      var ca = Math.cos(ang), sa = Math.sin(ang);
      var a = 0.99 * (0.80 + 0.26 * Math.pow(R(), 0.8));
      var sy = 1.15 + 0.5 * R();
      var amp = 0.006 + 0.075 * Math.pow(R(), 3.0);
      var f1 = 2 + R() * 9, f2 = 3 + R() * 14, ph1 = R() * 6.28, ph2 = R() * 6.28;
      var seed = R(), bright = 0.45 + 0.9 * Math.pow(R(), 2.2);
      var t0 = R() * 6.2832, span = 6.2832 * (0.55 + 0.45 * R());
      var prev = null;
      for (var k = 0; k <= SEG; k++) {
        var t = t0 + span * k / SEG, sn = Math.sin(t), cs = Math.cos(t), dn = 1 + sn * sn;
        var x = a * cs / dn, y = a * sy * sn * cs / dn;
        var nx = -sn, ny = cs, n = amp * (Math.sin(t * f1 + ph1) + 0.6 * Math.sin(t * f2 + ph2));
        x += nx * n * 0.6; y += ny * n * 0.6;
        var X = x * ca - y * sa, Y = x * sa + y * ca;
        var cur = [X, Y, k / SEG, seed, bright];
        if (prev) { Array.prototype.push.apply(data, prev); Array.prototype.push.apply(data, cur); }
        prev = cur;
      }
    }
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.bindVertexArray(fibVAO);
    var lp = gl.getAttribLocation(pFib, 'p'), ld = gl.getAttribLocation(pFib, 'd');
    gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(ld); gl.vertexAttribPointer(ld, 3, gl.FLOAT, false, 20, 8);
    fibCount = data.length / 5;
  }
  buildFibres();

  /* ---------- targets ---------- */
  var scene, b1, b2, b3, b4;
  function resize() {
    W = Math.floor(window.innerWidth * DPR); H = Math.floor(window.innerHeight * DPR);
    canvas.width = W; canvas.height = H;
    S = Math.min(W, H * 0.92);
    scene = makeTarget(W, H);
    var q = LOWQ ? 4 : 3;
    b1 = makeTarget(Math.max(2, W >> 2), Math.max(2, H >> 2));
    b2 = makeTarget(Math.max(2, W >> 2), Math.max(2, H >> 2));
    b3 = makeTarget(Math.max(2, W >> 4), Math.max(2, H >> 4));
    b4 = makeTarget(Math.max(2, W >> 4), Math.max(2, H >> 4));
  }
  window.addEventListener('resize', resize); resize();

  function bindTex(unit, tex, loc) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); }
  function toTarget(t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null); gl.viewport(0, 0, t ? t.w : W, t ? t.h : H); }

  var DIVE = [0, 0, 1], ACC = [1, 0.7, 0.3, -1];
  function drawMenu(time, tgt) {
    toTarget(tgt); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    var pulse = [];
    for (var i = 0; i < 4; i++) pulse.push(PORTALS[i].x, PORTALS[i].y, PORTAL_R, 1);
    gl.useProgram(pBg);
    gl.uniform2f(pBg.u.res, tgt.w, tgt.h); gl.uniform1f(pBg.u.S, S * (tgt.w / W)); gl.uniform1f(pBg.u.time, time);
    gl.uniform4fv(pBg.u['pt[0]'], new Float32Array(pulse)); gl.uniform2f(pBg.u.par, -tiltX * 0.12, tiltY * 0.12);
    gl.uniform3f(pBg.u.dive, DIVE[0], DIVE[1], DIVE[2]); gl.uniform4f(pBg.u.acc, ACC[0], ACC[1], ACC[2], ACC[3]);
    drawQuad();
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(pFib);
    gl.uniform1f(pFib.u.time, time); gl.uniform2f(pFib.u.tilt, tiltX, tiltY); gl.uniform1f(pFib.u.kind, 0);
    gl.uniform2f(pFib.u.sc, (S / tgt.w) * 1.0, (S / tgt.h) * 1.0);
    gl.uniform3f(pFib.u.dive, DIVE[0], DIVE[1], DIVE[2]);
    gl.bindVertexArray(fibVAO); gl.drawArrays(gl.LINES, 0, fibCount);
    gl.uniform1f(pFib.u.kind, 1); gl.drawArrays(gl.POINTS, 0, fibCount);
    gl.disable(gl.BLEND);
  }
  function blurPass(src, dst, dx, dy, thr) {
    toTarget(dst); gl.useProgram(pBlur);
    bindTex(0, src.tex, pBlur.u.tx);
    gl.uniform2f(pBlur.u.dir, dx / src.w, dy / src.h); gl.uniform1f(pBlur.u.thr, thr);
    drawQuad();
  }
  function composite(src, zc, zoom, bk, dark, vmask) {
    blurPass(src, b1, 1, 0, 0.35); blurPass(b1, b2, 0, 1, 0);
    blurPass(b2, b3, 1, 0, 0); blurPass(b3, b4, 0, 1, 0);
    blurPass(b4, b3, 1.5, 0, 0); blurPass(b3, b4, 0, 1.5, 0);
    toTarget(null); gl.useProgram(pComp);
    bindTex(0, src.tex, pComp.u.scene); bindTex(1, b2.tex, pComp.u.bloom); bindTex(2, b4.tex, pComp.u.bloom2);
    gl.uniform2f(pComp.u.zc, zc[0], zc[1]); gl.uniform1f(pComp.u.zoom, zoom);
    gl.uniform1f(pComp.u.bk, bk); gl.uniform1f(pComp.u.dark, dark);
    gl.uniform3f(pComp.u.rs, W, H, S); gl.uniform1f(pComp.u.vm, vmask);
    var pv = []; for (var i = 0; i < 4; i++) pv.push(PORTALS[i].x, PORTALS[i].y, PORTAL_R, 0);
    gl.uniform4fv(pComp.u['pv[0]'], new Float32Array(pv));
    drawQuad();
  }

  /* ---------- UI + transitions ---------- */
  var overlay = document.getElementById('overlay'), host = document.getElementById('modhost'),
      labels = document.getElementById('labels'), backBtn = document.getElementById('back'),
      title = document.getElementById('modtitle'), modulePanel = null;
  var labelEls = PORTALS.map(function (p) {
    var e = document.createElement('div'); e.className = 'plabel'; e.textContent = MODULES[p.id].label; labels.appendChild(e); return e;
  });
  function portalScreen(p) { // unit -> css px
    var cw = window.innerWidth, ch = window.innerHeight, s = S / DPR / 2;
    return { x: cw / 2 + p.x * s, y: ch / 2 - p.y * s, r: PORTAL_R * s };
  }
  var coreLabel = document.createElement('div'); coreLabel.className = 'plabel core'; coreLabel.textContent = 'CORE'; labels.appendChild(coreLabel);
  function layoutLabels() {
    coreLabel.style.left = '50%'; coreLabel.style.top = (window.innerHeight / 2) + 'px'; coreLabel.style.transform = 'translate(-50%,-50%)';
    PORTALS.forEach(function (p, i) { var s = portalScreen(p); var e = labelEls[i]; e.style.left = s.x + 'px'; e.style.top = s.y + 'px'; e.style.transform = 'translate(-50%,-50%)'; });
  }
  window.addEventListener('resize', layoutLabels); layoutLabels();

  var anim = { t0: 0, dur: 0 };
  function startAnim(dur) { anim.t0 = performance.now(); anim.dur = dur; }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  function enter(id) {
    if (Store.phase !== 'menu') return;
    try { if (prefs().haptics !== false && window.HubNative && HubNative.haptic) HubNative.haptic(); } catch (e) { }
    Store.set({ target: id, phase: 'zoomIn' }); startAnim(MOTION_OFF ? 1 : 1100); wake();
    overlay.classList.add('hide-labels'); labels.style.opacity = '0';
  }
  function leave() {
    if (Store.phase !== 'module') return;
    overlay.classList.remove('open'); backBtn.classList.remove('show');
    setTimeout(function () { if (modulePanel) { modulePanel.remove(); modulePanel = null; } }, 260);
    Store.set({ phase: 'zoomOut' }); startAnim(900);
  }
  var nativeOpen = false;
  // called by the native Hub activity when the user comes back from a module activity
  window.hubResume = function () {
    readMotion(); wake();
    if (nativeOpen && Store.phase === 'module') { nativeOpen = false; Store.set({ phase: 'zoomOut' }); startAnim(800); overlay.classList.remove('open'); }
  };
  /* Nothing is drawn while the menu is not on screen (an app is open, screen off, another app on top). */
  var running = true;
  window.hubPause = function () { running = false; };
  function wake() { if (!running) { running = true; lastNow = 0; requestAnimationFrame(frameLoop); } }
  document.addEventListener('visibilitychange', function () { if (document.hidden) running = false; else wake(); });

  /* Shared organism state, written by the apps (mfx-state): the menu breathes with them. */
  var pace = 1, stateEl = document.getElementById('mstate');
  var LOOK = { idle: [1, ''], thinking: [2.2, 'rgba(255,225,170,.16)'], loading: [1.5, 'rgba(70,140,255,.22)'], hot: [1.4, 'rgba(255,70,25,.24)'] };
  function readState() {
    var s = 'idle';
    try {
      var m = JSON.parse(localStorage.getItem('mfx-state') || '{}'), now = Date.now(), rank = { idle: 0, thinking: 1, loading: 2, hot: 3 };
      for (var k in m) if (m[k] && now - m[k].t < 9000 && rank[m[k].s] > rank[s]) s = m[k].s;
    } catch (e) { }
    pace = LOOK[s][0];
    if (stateEl) stateEl.style.background = LOOK[s][1] ? 'radial-gradient(60% 40% at 50% 50%,' + LOOK[s][1] + ',transparent 72%)' : 'transparent';
  }
  setInterval(function () { if (running && !document.hidden) readState(); }, 1500);   /* 2.4.5: no bridge reads while the menu is not on screen */
  window.addEventListener('storage', function (e) { if (e.key === 'mfx-state') readState(); });
  window.MeridianHub = { enter: enter, leave: leave };

  /* ---------- family settings (the same store every app reads: m-prefs) ---------- */
  /* the family colours in the order every app shows them (kit/fx/meridian-fx.js PAL); Meridian is the default */
  var PAL = { meridian: '#48d8ff', mint: '#34d399', amber: '#c4a46a', violet: '#a78bfa', rose: '#fb7185', copper: '#E07A3D', bronze: '#8C5B2E' };
  var SWATCH = { meridian: 'conic-gradient(from 210deg,#48d8ff,#b45cff,#48d8ff)' };
  function prefs() { try { var o = JSON.parse(localStorage.getItem('m-prefs') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function setPref(k, v) {
    var o = prefs(); o[k] = v; o._t = Date.now();
    try {
      localStorage.setItem('m-prefs', JSON.stringify(o));
      var legacy = { theme: 'm-theme', accent: 'm-accent', motion: 'm-motion', haptics: 'm-haptics' };
      if (legacy[k]) localStorage.setItem(legacy[k], k === 'haptics' ? (v ? '1' : '0') : String(v));
    } catch (e) { }
    paintPrefs(); readMotion(); if (window.MfxMotion) window.MfxMotion.refresh(); if (window.MfxGL && window.MfxGL.refresh) window.MfxGL.refresh();
    if (window.MfxSound && (k === 'sound' || k === 'vol' || k === 'taps')) { if (v !== 'off') MfxSound.arm(); MfxSound.tick(); }
  }
  var MOTION_OFF = false;
  function readMotion() {
    var m = prefs().motion; if (m === 'off') m = 'reduce'; if (m === 'on') m = 'full';
    if (!m || m === 'system') m = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'reduce' : 'full';   /* 2.5.0: System moves unless Android removes animations */
    var was = MOTION_OFF; MOTION_OFF = m === 'reduce';
    if (was && !MOTION_OFF) wake(); else if (!was && MOTION_OFF) wake();   /* draw the still frame */
  }
  var prefsEl = document.getElementById('prefs'), gear = document.getElementById('gear');
  function paintPrefs() {
    if (!prefsEl) return;
    var o = prefs(), cur = PAL[o.accent] ? o.accent : 'meridian', acc = PAL[cur];
    prefsEl.style.setProperty('--acc', acc);
    var vals = { theme: o.theme || 'oled', motion: (o.motion === 'on' ? 'full' : o.motion === 'off' ? 'reduce' : o.motion) || 'system', level: o.level || 'high', sound: o.sound === 'off' || o.sound === 'full' ? o.sound : 'events', taps: o.taps === 'on' ? 'on' : 'off', vol: o.vol || 'mid', haptics: String(o.haptics !== false), showcase: o.showcase === 'on' ? 'on' : 'off' };
    var wv = Number(o.window); wv = wv >= 0 && wv <= 100 ? wv : 85;   /* Window: how solid this sheet is, the same control as in the other apps */
    var pw = document.getElementById('pwin'); if (pw && document.activeElement !== pw) pw.value = String(wv);
    prefsEl.style.setProperty('--win-g1', String(Math.min(1, wv / 100 * .46 / .85))); prefsEl.style.setProperty('--win-g2', String(Math.min(1, wv / 100 * .58 / .85)));
    Array.prototype.forEach.call(prefsEl.querySelectorAll('.seg'), function (g) {
      var k = g.getAttribute('data-k');
      Array.prototype.forEach.call(g.children, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === vals[k]); });
    });
    var sw = prefsEl.querySelector('.sw');
    if (sw && !sw.children.length) for (var name in PAL) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-v', name); b.setAttribute('aria-label', name); b.style.setProperty('--c', SWATCH[name] || PAL[name]); b.style.setProperty('--g', PAL[name]); sw.appendChild(b); }
    if (sw) Array.prototype.forEach.call(sw.children, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === cur); });
  }
  if (gear) gear.addEventListener('click', function () { paintPrefs(); prefsEl.classList.add('on'); try { var pn = prefsEl.querySelector('.pane'); if (!MOTION_OFF && pn.animate) pn.animate([{ transform: 'translateY(30px) scale(.96)', filter: 'blur(8px)', opacity: 0 }, { transform: 'none', filter: 'blur(0)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }); } catch (e) { } });
  if (prefsEl) prefsEl.addEventListener('click', function (e) {
    if (e.target === prefsEl || e.target.id === 'pclose') { prefsEl.classList.remove('on'); return; }
    var b = e.target.closest && e.target.closest('button[data-v]'); if (!b) return;
    var k = b.parentNode.getAttribute('data-k'), v = b.getAttribute('data-v');
    if (k === 'haptics') v = v === 'true';
    setPref(k, v);
    try { if (prefs().haptics !== false && window.HubNative && HubNative.haptic) HubNative.haptic(); } catch (er) { }
  });
  if (prefsEl) prefsEl.addEventListener('input', function (e) { if (e.target && e.target.id === 'pwin') setPref('window', Math.max(0, Math.min(100, Number(e.target.value) || 0))); });
  /* Licenses: its own page, opened from Settings (the same words and texts as in the other four apps) */
  function licOpen() {
    var E = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var box = document.getElementById('mfam-lic'); if (!box) { box = document.createElement('div'); box.id = 'mfam-lic'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Licenses'); document.body.appendChild(box); }
    box.innerHTML = '<div class="lich"><b>Licenses</b><button type="button" class="ghost" id="plicclose">Close</button></div>' +
      '<p><b>Acknowledgements</b></p><p>With sincere gratitude to the AI assistants that helped build this: ChatGPT, Claude, Gemini and Grok, and to the open-source community whose work is listed below.</p>' +
      '<p>Recipes: written by Alen Požun from his own forum answers, some drafted with AI assistance.</p><p>Meridian Family © 2026 Alen Požun</p><p><b>Open-source licences</b></p>' +
      (window.MERIDIAN_LICENSES || []).map(function (l) { return '<details><summary>' + E(l.name) + ' · ' + E(l.licence) + '</summary><p>Used in: ' + E(l.where) + '</p><pre>' + E(l.text) + '</pre></details>'; }).join('');
    document.getElementById('plicclose').onclick = function () { box.remove(); };
  }
  var plic = document.getElementById('plic'); if (plic) plic.addEventListener('click', licOpen);
  var stReport = '';
  function runSelfTest() {
    var box = document.getElementById('st'), cp = document.getElementById('stcopy');
    box.innerHTML = '<div><i>…</i><span>Testing…</span></div>';
    setTimeout(function () {
      var rows = null;
      try { rows = JSON.parse(window.HubNative && HubNative.selfTest ? HubNative.selfTest() : 'null'); } catch (e) { rows = null; }
      if (!rows) rows = [{ n: 'Self-test', ok: false, d: 'only inside the Android app' }];
      rows.push({ n: '3D menu frames', ok: fpsNow >= 55, d: fpsNow ? fpsNow + ' a second at ' + W + ' x ' + H + ' px (last 2 s on screen)' : 'not measured yet: leave the menu on screen for 2 s' });
      var pass = rows.filter(function (r) { return r.ok; }).length;
      stReport = 'Meridian Family self-test ' + new Date().toISOString() + '\n' + rows.map(function (r) { return (r.ok ? 'OK   ' : 'FAIL ') + r.n + ': ' + r.d; }).join('\n');
      box.innerHTML = '<div class="' + (pass === rows.length ? 'ok' : 'no') + '"><i>' + pass + '/' + rows.length + '</i><span>checks passed</span></div>' + rows.map(function (r) {
        return '<div class="' + (r.ok ? 'ok' : 'no') + '"><i>' + (r.ok ? '✓' : '!') + '</i><span>' + esc(r.n) + '</span><small>' + esc(r.d) + '</small></div>';
      }).join('');
      if (cp) cp.hidden = false;
    }, 30);
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var strun = document.getElementById('strun'); if (strun) strun.addEventListener('click', runSelfTest);
  var stcopy = document.getElementById('stcopy'); if (stcopy) stcopy.addEventListener('click', function () {
    try { if (window.HubNative && HubNative.copy) HubNative.copy(stReport); else if (navigator.clipboard) navigator.clipboard.writeText(stReport); } catch (e) { }
    stcopy.textContent = 'Copied'; setTimeout(function () { stcopy.textContent = 'Copy report'; }, 1400);
  });
  window.addEventListener('storage', function (e) { if (e.key === 'm-prefs') { paintPrefs(); readMotion(); } });
  readMotion();

  function mountModule(id) {
    var m = MODULES[id]; title.textContent = m.label;
    // The standalone sibling UI is not bundled in Core. Never load a missing URL into a bridged iframe.
    if (modulePanel) modulePanel.remove();
    modulePanel = document.createElement('section');
    modulePanel.className = 'missingapp'; modulePanel.setAttribute('data-missing-app', id);
    var heading = document.createElement('h2'); heading.textContent = m.label;
    var message = document.createElement('p');
    message.textContent = m.label + ' is not installed or could not open. Install the standalone app, then try again.';
    var retry = document.createElement('button'); retry.type = 'button';
    retry.setAttribute('data-retry-app', id); retry.textContent = 'Try again';
    retry.addEventListener('click', function () {
      var launched = false;
      try { if (window.HubNative) launched = window.HubNative.launch(id); } catch (e) { }
      if (launched) {
        modulePanel.remove(); modulePanel = null; nativeOpen = true; running = false;
        overlay.classList.remove('open'); backBtn.classList.remove('show');
      } else {
        message.textContent = m.label + ' still could not open. Install the standalone app, then try again, or go Back.';
      }
    });
    modulePanel.appendChild(heading); modulePanel.appendChild(message); modulePanel.appendChild(retry);
    host.appendChild(modulePanel);
    overlay.classList.add('open'); backBtn.classList.add('show');
  }
  backBtn.addEventListener('click', leave);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') leave(); });
  if (window.MeridianBack === undefined) window.MeridianBack = leave; // native back button hook

  var tapStart = null;
  canvas.addEventListener('pointerdown', function (e) { tapStart = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', function (e) {
    if (Store.phase !== 'menu' || !tapStart) return;
    if (Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 14) return;
    for (var i = 0; i < 4; i++) {
      var s = portalScreen(PORTALS[i]);
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < s.r * 1.15) { enter(PORTALS[i].id); return; }
    }
    // centre tap -> Core
    var cw = window.innerWidth, ch = window.innerHeight;
    if (Math.hypot(e.clientX - cw / 2, e.clientY - ch / 2) < S / DPR * 0.16) enter('core');
  });

  /* ---------- tilt / parallax ---------- */
  var tiltX = 0, tiltY = 0, inX = 0, inY = 0, gyroOn = false;
  /* phone movement: relative to how you hold the phone (motion.js), never the absolute angle */
  window.addEventListener('deviceorientation', function (e) { if (e.gamma != null) gyroOn = true; });
  canvas.addEventListener('pointermove', function (e) {
    if (gyroOn) return; inX = (e.clientX / window.innerWidth - 0.5) * 2; inY = (e.clientY / window.innerHeight - 0.5) * 2;
  });
  function updateTilt(time) {
    if (gyroOn && window.MfxMotion) { var mv = window.MfxMotion.get(); inX = mv.x; inY = mv.y; }
    var tx = inX * 0.38 + Math.sin(time * 0.31) * 0.14, ty = inY * 0.26 + Math.cos(time * 0.23) * 0.1;
    tiltX += (tx - tiltX) * 0.06; tiltY += (ty - tiltY) * 0.06;
  }

  /* ---------- main loop ---------- */
  var simT = 0, lastNow = 0;
  /* Dive: the menu geometry itself scales around the tapped portal (stays sharp), the portal's rim takes the
     app's colour, its dark centre grows over the screen, then the app opens. Coming back runs it in reverse. */
  function setDive(id, amount) {
    var idx = -1; for (var i = 0; i < 4; i++) if (PORTALS[i].id === id) idx = i;
    var p = idx >= 0 ? PORTALS[idx] : { x: 0, y: 0 };
    var a = MODULES[id] ? MODULES[id].acc : [1, 0.85, 0.6];
    DIVE = [p.x, p.y, 1 + Math.pow(amount, 2.4) * 22];
    ACC = [a[0], a[1], a[2], idx];
  }
  /* frames drawn in the last 2 s, for the self-test (measured, not estimated) */
  var fpsT0 = 0, fpsN = 0, fpsNow = 0;
  function frameLoop(now) {
    if (!running) return;
    if (!lastNow) frameLoop.due = 0;   /* 60 frames a second at most, also on 90 and 120 Hz screens (same pacing as the scenes) */
    if (frameLoop.due && now < frameLoop.due - 4) { requestAnimationFrame(frameLoop); return; }
    frameLoop.due = frameLoop.due && now - frameLoop.due < 50 ? frameLoop.due + 1000 / 60 : now + 1000 / 60;
    if (!fpsT0 || now - fpsT0 > 4000) { fpsT0 = now; fpsN = 0; }
    fpsN++; if (now - fpsT0 >= 2000) { fpsNow = Math.round(fpsN * 1000 / (now - fpsT0)); fpsT0 = now; fpsN = 0; }
    var dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0; lastNow = now; simT += dt * pace;
    var time = simT, k = anim.dur ? Math.min(1, (now - anim.t0) / anim.dur) : 1;
    var dark = 0, phase = Store.phase; updateTilt(time);
    if (phase === 'zoomIn') {
      var e = ease(k); setDive(Store.target, e); dark = Math.max(0, (e - 0.7) / 0.3);
      drawMenu(time, scene); composite(scene, [0.5, 0.5], 1, 1.0 + e * 0.6, dark, Math.max(0, 1 - e * 5));
      if (k >= 1 || MOTION_OFF) {
        Store.set({ phase: 'module', activeModule: Store.target });
        var launched = false;
        if (Store.target === 'core' && window.MeridianCorePage) { window.MeridianCorePage.open(); launched = true; }   /* Core's own black-and-white front */
        else try { if (window.HubNative) launched = window.HubNative.launch(Store.target); } catch (er) { }
        if (launched) { nativeOpen = true; } else { mountModule(Store.target); }
        startAnim(700);
      }
    } else if (phase === 'module') {
      /* the app is on screen: a native app covers the menu, so stop drawing until we come back */
      if (nativeOpen) { running = false; return; }
      setDive(Store.target, 0); DIVE[2] = 1;
      drawMenu(time, scene); composite(scene, [0.5, 0.5], 1, 0.8, nativeOpen ? 1 : 0.55, 1);
    } else if (phase === 'zoomOut') {
      if (MOTION_OFF) k = 1;
      var e2 = ease(k); setDive(Store.target, 1 - e2); dark = Math.max(0, (1 - e2 - 0.7) / 0.3);
      drawMenu(time, scene); composite(scene, [0.5, 0.5], 1, 1.0 + (1 - e2) * 0.6, dark, Math.max(0, 1 - (1 - e2) * 5));
      if (k >= 1) { DIVE = [0, 0, 1]; ACC = [1, 0.7, 0.3, -1]; Store.set({ phase: 'menu', activeModule: 'menu', target: null }); overlay.classList.remove('hide-labels'); labels.style.opacity = ''; }
    } else {
      drawMenu(time, scene); composite(scene, [0.5, 0.5], 1, 1.0, 0, 1);
      /* Motion off: one still frame of the menu, then nothing is drawn until something changes */
      if (MOTION_OFF) { running = false; return; }
    }
    requestAnimationFrame(frameLoop);
  }
  requestAnimationFrame(frameLoop);

  // test hook
  window.__hubReady = true;
})();
