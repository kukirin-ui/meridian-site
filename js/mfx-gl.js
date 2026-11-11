/* Meridian living backgrounds (2.5.1): one WebGL2 engine for all five apps. Chat, Gaming, Parallel and NullCloud draw it
   behind their pages; Core draws it inside Core's page in the 3D menu (MfxGL.mount(host), MfxGL.show()).
   Each app's picture (img/bg/<app>.js, made by tools/brand/bg.py: the picture, a data map and the picture's own lines)
   comes alive in layers, back to front: room -> particles -> orbits -> motif -> light pillar -> lake.
   - the motif (Chat's face, the dragon, the infinity sign, the cloud, the sphere) stays still and sharp; the layers
     around it move with depth (the room slowly the other way, the orbits a middle amount, the lake the most)
   - light pulses run along the picture's lines, glow spots breathe, light strands with comets race along the lines
   - each app has its own orbit engine (ORBITS) and lake (FS_PHOTO): Gaming crystal shards in opposite directions with
     boost pulses from the CPU load and shock waves; Parallel three streams braided along the infinity sign and lake
     rings crossing in its shape; NullCloud holographic arcs and shards at different tilts and bit streams rising into
     the cloud; Core three gyroscope rings (outer slow, middle the other way, inner precessing) and calm rings with pulses
     from the core; Chat concentric orbits (inner faster) and particles rising from the lake into the portal
   - at start the entrance plays once: the lines rise from the bottom, particles energise, the picture rises into 3D,
     the orbits form, then it settles (a tap skips it)
   Motion: Off = the picture, centred and still. System = no gyroscope. On = the gyroscope in every direction (tilt both
   ways and twist). Level (m-prefs.level): High = every effect up to 120 frames a second, Mid = fewer particles and
   strands, softer glow, up to 90, Low = the picture's own light and breathing only, up to 60. System follows Android's
   "Remove animations" (then it is still). Nothing is drawn while the app is hidden. */
(function () {
  'use strict';
  if (window.MfxGL) return;
  var W = window, D = document;
  var path = (location.href || '').toLowerCase();
  var NAME = window.MERIDIAN_APP || (/www_gaming/.test(path) ? 'gaming' : /www_parallel/.test(path) ? 'parallel' : /www_nullcloud/.test(path) ? 'nullcloud' : /\/hub\//.test(path) ? 'core' : 'chat');
  var api = { active: false, name: NAME, speed: 1, bright: 1, hot: 0, boost: 0, load: 0.3, busy: 0, shown: NAME !== 'core', photo: false };
  W.MfxGL = api;
  if (/[?&]nogl\b/.test(location.search)) return;
  var cv = D.createElement('canvas'), gl = null;
  try { gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance', desynchronized: true, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
  if (!gl) return;
  var hasHalf = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
  cv.id = 'mfx-gl'; cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-2;pointer-events:none;display:block';
  api.active = true;

  /* ---------------- shaders ---------------- */
  var VS = '#version 300 es\nin vec2 a;out vec2 uv;void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  var LIB = 'float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n' +
    'float band(float x,float w){return smoothstep(1.-w,1.,x)*smoothstep(1.,.985,x);}\n';

  /* the picture: parallax by depth (tilt both ways, twist, a slow drift), its pulses and breathing, the lake, dust,
     the entrance (intro 0..1). live = 0: the plain picture, centred. lvl: 0 low, 1 mid, 2 high. sty: the app (STYLE). */
  var FS_PHOTO = '#version 300 es\nprecision highp float;\nin vec2 uv;out vec4 o;\n' +
    'uniform sampler2D col;uniform sampler2D map;uniform vec2 cover;uniform float focus;uniform float veil;uniform float live;uniform float lvl;uniform float sty;\n' +
    'uniform float time;uniform vec3 tilt;uniform float busy;uniform float boost;uniform float load;uniform float intro;uniform vec4 motif;uniform vec4 lake;uniform vec2 res;\n' + LIB +
    'vec2 par(vec2 u,float d){vec2 m=vec2(motif.x,1.-motif.y);float e=(d-focus);vec2 q=u-m;float r=tilt.z*.09*e;q=mat2(cos(r),sin(r),-sin(r),cos(r))*q;\n' +
    ' vec2 drift=vec2(sin(time*.13),sin(time*.091+1.3))*.3*live;return m+q+e*(vec2(-tilt.x,tilt.y)*vec2(.045,.034)+drift*vec2(.03,.022));}\n' +
    'void main(){\n' +
    ' vec2 u=(uv-.5)*cover+.5;\n' +
    ' float d=texture(map,u).r; vec2 u1=par(u,d); d=texture(map,u1).r; u1=clamp(par(u,d),vec2(.001),vec2(.999));\n' +
    ' vec3 c=texture(col,u1).rgb; vec4 m=texture(map,u1);\n' +
    ' float t=time, act=1.+busy*1.6+boost*.8+(sty==1.?load*1.2:0.), li=m.g*m.g, ph=m.b;\n' +
    ' float p=band(fract(ph*4.-t*.16*act),.18)+.6*band(fract(ph*7.+.37-t*.23*act),.12);\n' +
    ' c+=c*li*p*(1.1+busy*1.2)*live;\n' +
    ' float g=max(0.,(m.a-.5)*2.), br=.5+.5*sin(t*(1.3+busy*2.)+ph*18.85);\n' +
    ' c+=c*g*br*(.6+busy*1.4)*live;\n' +   /* Chat's eyes and face lines glow up while the model answers */
    ' vec2 lc=vec2(lake.x,1.-lake.y), lr=lake.zw; vec3 lw=vec3(0.);\n' +
    ' if(lvl>.5&&live>.5){\n' +   /* the lake */
    '  vec2 q=(u1-lc)/lr; float e=length(q), fade=smoothstep(1.6,.2,e)*smoothstep(0.,.15,e);\n' +
    '  if(sty==2.){float e1=length(q-vec2(.45,0.)),e2=length(q+vec2(.45,0.));lw=vec3(.7,.5,1.)*(band(fract(e1*2.5-t*.45),.22)+band(fract(e2*2.5-t*.45+.5),.22))*smoothstep(1.6,.3,min(e1,e2));}\n' +   /* Parallel: two ring sets crossing in an infinity */
    '  else if(sty==1.){float s=.55+load*1.4+boost;vec3 sh=vec3(band(fract(e*1.6-t*.7*s),.12),band(fract(e*1.6-t*.7*s-.012),.12),band(fract(e*1.6-t*.7*s-.024),.12));lw=sh*vec3(1.,.55,1.4)*fade*(.8+load);}\n' +   /* Gaming: shock waves, RGB split, with the load */
    '  else if(sty==3.){lw=vec3(.4,.7,1.)*band(fract(e*2.2-t*.4),.2)*fade; float cx=abs(u1.x-lc.x); if(cx<.09&&u1.y>lc.y&&u1.y<1.-motif.y){float k=floor(u1.x*180.);float bit=step(.82,h2(vec2(k,floor((u1.y-t*.18*(1.+h2(vec2(k,3.))))*90.))));lw+=vec3(.5,.8,1.)*bit*smoothstep(.09,.02,cx)*.7;}}\n' +   /* NullCloud: data lake, bits rising into the cloud */
    '  else if(sty==4.){lw=vec3(1.,.8,.45)*band(fract(e*1.8-t*.25),.3)*fade*.8+vec3(1.,.9,.7)*band(fract(e*.7-t*.18),.08)*fade*1.4;}\n' +   /* Core: calm rings, pulses from the core */
    '  else{lw=vec3(.45,.75,1.)*band(fract(e*2.4-t*.35),.25)*fade;}\n' +   /* Chat */
    '  c+=lw*(1.+busy*.8)*(lvl>1.5?1.:.7);}\n' +
    ' if(lvl>1.5&&live>.5){vec2 a=vec2(res.x/res.y,1.);for(int l=0;l<2;l++){float fl=float(l);vec2 w=(uv+vec2(-tilt.x,tilt.y)*.02*(1.+fl))*a*(14.+fl*9.)+vec2(fl*7.1,t*(.05+fl*.03));vec2 id=floor(w),f=fract(w)-.5;\n' +
    '  float r=h2(id+fl*13.7);if(r>.82){vec2 o2=vec2(h2(id+1.3),h2(id+4.7))-.5;c+=vec3(.55,.75,1.)*smoothstep(.06,0.,length(f-o2*.7))*(.18+.25*sin(t*1.7+r*40.))*(.5+.5*r);}}}\n' +
    ' if(intro<1.){float h=smoothstep(.12,.62,intro)*1.08;float vis=1.-smoothstep(h-.05,h,uv.y);\n' +   /* the entrance: lines first, the picture rises from the bottom */
    '  c=mix(c*li*.55*smoothstep(0.,.15,intro),c,vis)+vec3(.55,.75,1.)*exp(-abs(uv.y-h)*90.)*(1.-smoothstep(.62,.7,intro))*1.2;}\n' +
    ' o=vec4(c*veil,1.);}';

  /* the strands: each traced line is a bundle of fibres (5 at High, 3 at Mid) with comets of light; heads throw sparks */
  var VS_STR = '#version 300 es\nin vec4 a;in vec4 b;uniform float time;uniform vec3 tilt;uniform float focus;uniform vec2 cover;uniform float speed;uniform float pt;uniform float px;uniform float intro;uniform vec4 motif;\n' +
    'out vec2 vU;out float vF;out float vE;\n' +
    'void main(){\n' +
    ' float sd=b.x; vec2 u=a.xy, m=vec2(motif.x,1.-motif.y);\n' +
    ' float w=sin(time*.9+sd*50.+a.z*40.)*.0011+sin(time*1.7+sd*23.-a.z*25.)*.0007; u+=vec2(w,-w*.7)*(b.z-2.)*1.6;\n' +
    ' float e=a.w-focus; vec2 q=u-m; float r=-tilt.z*.09*e; q=mat2(cos(r),sin(r),-sin(r),cos(r))*q;\n' +
    ' vec2 drift=vec2(sin(time*.13),sin(time*.091+1.3))*.3; u=m+q-e*(vec2(-tilt.x,tilt.y)*vec2(.045,.034)+drift*vec2(.03,.022));\n' +
    ' vU=u;\n' +
    ' float f=fract(a.z*9.-time*speed*.85+sd*7.), fl=pow(f,8.)*smoothstep(1.,.97,f);\n' +
    ' vF=fl*smoothstep(0.,.2,intro); vE=smoothstep(0.,.12,b.y)*smoothstep(1.,.88,b.y);\n' +
    ' gl_Position=vec4(((u-.5)/cover+.5)*2.-1.,0.,1.);\n' +
    ' gl_PointSize=pt>.5?((f>.9&&fract(sd*91.7+b.z*.37)<.4)?(2.+4.*fl)*px:0.):1.;}';
  var FS_STR = '#version 300 es\nprecision highp float;\nin vec2 vU;in float vF;in float vE;uniform sampler2D col;uniform float pt;uniform float gain;out vec4 o;\n' +
    'void main(){vec3 c=texture(col,clamp(vU,.001,.999)).rgb; float l=dot(c,vec3(.3,.59,.11)); c=max(mix(vec3(l),c,1.5),0.)*1.5+.04;\n' +
    ' if(pt>.5){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);float g=exp(-r*9.)*.6+exp(-r*45.)*2.;o=vec4((c*1.4+.8)*g*vF*gain*3.,1.);return;}\n' +
    ' o=vec4((c*(.15+5.*vF)+vec3(1.)*vF*vF*2.2)*vE*gain,1.);}';

  /* the orbits: rings (or, for Parallel, braided streams on an infinity) in 3D around the motif, each a bundle of
     fibres with comets; turned by the phone (a middle amount), with perspective; behind the motif they dim.
     a = 0..1 around, ring, fibre, seed. Per ring (up to 4): R = radius, speed, dashes, duty; T = tilt x, tilt y,
     precession, phase; C = colour. shape 0 rings, 1 braid. form: the entrance (orbits form from small and dim). */
  var VS_ORB = '#version 300 es\nin vec4 a;uniform float time;uniform vec3 tilt;uniform vec2 ctr;uniform vec2 scl;uniform float pt;uniform float px;uniform float shape;uniform float form;uniform float pace;\n' +
    'uniform vec4 R[4];uniform vec4 T[4];uniform vec3 C[4];out vec3 vC;out float vF;\n' +
    'mat3 rx(float t){float c=cos(t),s=sin(t);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}mat3 ry(float t){float c=cos(t),s=sin(t);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}mat3 rz(float t){float c=cos(t),s=sin(t);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}\n' +
    'void main(){\n' +
    ' int i=int(a.y); vec4 r=R[i], tt=T[i]; float fb=a.z, sd=a.w;\n' +
    ' float th=a.x*6.28318+time*r.y*pace+tt.w; vec3 p;\n' +
    ' float off=(fb-1.)*.012+sin(th*5.+time*1.3+sd*9.)*.004;\n' +
    ' if(shape>.5){float s=sin(th),c=cos(th),dn=1.+s*s;p=vec3(c/dn*(1.+off),s*c/dn*(1.+off)+.07*sin(th*2.+tt.w*3.)*.9,.22*sin(th*2.+tt.w));}\n' +   /* braid: three streams on an infinity, woven in depth */
    ' else{p=vec3(cos(th),sin(th),0.)*(r.x+off);}\n' +
    ' p=rz(time*tt.z*pace)*rx(tt.x)*ry(tt.y)*p;\n' +
    ' p=rz(tilt.z*.5)*rx(-tilt.y*.45)*ry(tilt.x*.55)*p;\n' +   /* the phone turns the orbits */
    ' p*=mix(.35,1.,form);\n' +
    ' float persp=1./(1.-p.z*.42);\n' +
    ' float f=fract(a.x*(r.z>0.?r.z:3.)*.5-time*.35*pace+sd*3.),fl=pow(f,6.);\n' +
    ' float dash=r.z>0.?step(1.-r.w,fract(a.x*r.z+sd*.02)):1.;\n' +   /* crystal / shard segments */
    ' float back=p.z<0.?.35:1.;\n' +
    ' vC=C[i]*dash*back*form; vF=fl;\n' +
    ' gl_Position=vec4(ctr+p.xy*persp*scl,0.,1.);\n' +
    ' gl_PointSize=pt>.5?((f>.9&&dash>.5&&fract(sd*77.3+fb*.31)<.5)?(2.+4.*fl)*persp*px:0.):1.;}';
  var FS_ORB = '#version 300 es\nprecision highp float;\nin vec3 vC;in float vF;uniform float pt;uniform float gain;out vec4 o;\n' +
    'void main(){if(pt>.5){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);o=vec4((vC*1.2+.6)*(exp(-r*9.)*.6+exp(-r*45.)*2.)*vF*gain*2.4,1.);return;}\n' +
    ' o=vec4((vC*(.22+2.6*vF)+vec3(1.)*vF*vF*1.4)*gain,1.);}';

  /* particles rising from the lake into the portal (the motif), the portal moving the most with the phone */
  var VS_PT = '#version 300 es\nuniform float time;uniform vec3 tilt;uniform vec4 motif;uniform vec4 lake;uniform vec2 cover;uniform float px;uniform float boost;uniform float intro;out vec3 vC;out float vA;\n' +
    'float h1(float n){return fract(sin(n)*43758.5453);}\n' +
    'void main(){float id=float(gl_VertexID),s=h1(id*1.37),s2=h1(id*3.11),s3=h1(id*7.7);\n' +
    ' float life=fract(time*(.06+.08*s2)*(1.+boost)+s);\n' +
    ' vec2 a=vec2(lake.x,1.-lake.y)+vec2((s3-.5)*lake.z*2.,(s2-.5)*lake.w*.6);\n' +
    ' vec2 b=vec2(motif.x,1.-motif.y)+vec2((s3-.5)*motif.z*.9,-motif.w*.4);\n' +
    ' vec2 u=mix(a,b,life*life*(3.-2.*life))+vec2(sin(life*9.+s*30.)*.012,0.);\n' +
    ' u+=vec2(-tilt.x,tilt.y)*.05*(1.-life*.5);\n' +
    ' vA=sin(life*3.1416)*(.5+.5*s)*smoothstep(.15,.45,intro); vC=mix(vec3(.5,.75,1.),vec3(1.,.8,1.),s2);\n' +
    ' gl_Position=vec4(((u-.5)/cover+.5)*2.-1.,0.,1.); gl_PointSize=(1.2+2.8*s*s)*px;}';
  var FS_PT = '#version 300 es\nprecision highp float;\nin vec3 vC;in float vA;out vec4 o;\n' +
    'void main(){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);o=vec4(vC*(exp(-r*6.)+exp(-r*40.))*vA*1.6,1.);}';

  /* bloom and composite: only the brightest light glows, in its own colour; a soft shoulder keeps the photo's contrast */
  var FS_DOWN = '#version 300 es\nprecision highp float;\nin vec2 uv;uniform sampler2D tx;uniform vec2 px;uniform float thr;out vec4 o;\n' +
    'void main(){vec3 c=texture(tx,uv+px*vec2(-1,-1)).rgb+texture(tx,uv+px*vec2(1,-1)).rgb+texture(tx,uv+px*vec2(-1,1)).rgb+texture(tx,uv+px*vec2(1,1)).rgb;c*=.25;\n' +
    ' float m=max(c.r,max(c.g,c.b));o=vec4(c*max(m-thr,0.)/max(m,1e-4),1.);}';
  var FS_BLUR = '#version 300 es\nprecision highp float;\nin vec2 uv;uniform sampler2D tx;uniform vec2 dir;out vec4 o;\n' +
    'void main(){float w[5]=float[](.227027,.1945946,.1216216,.054054,.016216);vec3 c=texture(tx,uv).rgb*w[0];for(int i=1;i<5;i++){c+=texture(tx,uv+dir*float(i)*1.5).rgb*w[i];c+=texture(tx,uv-dir*float(i)*1.5).rgb*w[i];}o=vec4(c,1.);}';
  var FS_COMP = '#version 300 es\nprecision highp float;\nin vec2 uv;uniform sampler2D sc;uniform sampler2D b1;uniform sampler2D b2;uniform float light;uniform float time;uniform vec3 acc;uniform float bloom;out vec4 o;\n' +
    'void main(){vec3 c=texture(sc,uv).rgb+(texture(b1,uv).rgb*.26+texture(b2,uv).rgb*.38)*bloom;\n' +
    ' float m=max(c.r,max(c.g,c.b)); if(m>.86) c*=(.86+.14*(1.-exp(-(m-.86)/.14)))/m;\n' +
    ' vec2 q=uv-.5; c*=1.-dot(q,q)*.5;\n' +
    ' c+=(fract(sin(dot(gl_FragCoord.xy+time,vec2(12.9898,78.233)))*43758.5453)-.5)*.012;\n' +
    ' if(light>.5){float l=dot(c,vec3(.3,.59,.11));c=vec3(.955,.957,.97)*(1.-l*.55)+acc*l*.18;}\n' +
    ' o=vec4(c,1.);}';

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { var log = gl.getShaderInfoLog(s); try { console.warn('mfx-gl shader', log); } catch (e) { } api.error = log; return null; }
    return s;
  }
  function prog(fs, vs) {
    var v = sh(gl.VERTEX_SHADER, vs || VS), f = sh(gl.FRAGMENT_SHADER, fs); if (!v || !f) return null;
    var p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'a'); gl.bindAttribLocation(p, 1, 'b'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { api.error = gl.getProgramInfoLog(p); return null; }
    p.u = {}; var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var nm = gl.getActiveUniform(p, i).name; p.u[nm.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, nm); }
    return p;
  }
  var pPhoto = prog(FS_PHOTO), pStr = prog(FS_STR, VS_STR), pOrb = prog(FS_ORB, VS_ORB), pPt = prog(FS_PT, VS_PT);
  var pDown = prog(FS_DOWN), pBlur = prog(FS_BLUR), pComp = prog(FS_COMP);
  if (!pPhoto || !pStr || !pOrb || !pPt || !pDown || !pBlur || !pComp) { api.active = false; return; }
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  var vaoNone = gl.createVertexArray();
  function quad() { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  function target(w, h) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    if (hasHalf) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && hasHalf) { hasHalf = false; gl.deleteFramebuffer(f); gl.deleteTexture(t); return target(w, h); }
    return { t: t, f: f, w: w, h: h };
  }
  function drop(x) { if (x) { gl.deleteFramebuffer(x.f); gl.deleteTexture(x.t); } }
  function use(t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.f : null); gl.viewport(0, 0, t ? t.w : cv.width, t ? t.h : cv.height); }
  function tex(u, t, loc) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t.t); gl.uniform1i(loc, u); }
  function lines(v, stride) {   /* a static vertex buffer: attribute a (and b) of 4 floats */
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    var va = gl.createVertexArray(); gl.bindVertexArray(va);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride * 4, 0);
    if (stride > 4) { gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride * 4, 16); }
    gl.bindVertexArray(null);
    return { vao: va, n: v.length / stride };
  }

  /* ---------------- the app's picture ---------------- */
  var STYLE = { concentric: 0, crystal: 1, braid: 2, shards: 3, gyro: 4 };
  /* each app's orbit engine: rings as [radius, speed, dashes, duty], [tilt x, tilt y, precession, phase], colour */
  var ORBITS = {
    gyro: [[[1.3, .12, 0, 1], [1.35, .35, 0, 0], [1, .82, .45]], [[1.16, -.3, 0, 1], [.5, -.9, 0, 1.2], [.45, .7, 1]], [[1.02, .55, 0, 1], [1.05, .4, .35, 2.3], [.85, .55, 1]]],
    crystal: [[[1.32, .32, 9, .55], [1.2, .3, 0, 0], [.75, .45, 1]], [[1.18, -.45, 7, .5], [-.9, .6, 0, 1], [1, .55, .2]], [[1.06, .6, 12, .45], [.4, -1.1, 0, 2], [.4, .8, 1]]],
    braid: [[[1.15, .2, 0, 1], [0, 0, 0, 0], [.35, .65, 1]], [[1.15, .2, 0, 1], [0, 0, 0, 2.094], [1, .4, .9]], [[1.15, .2, 0, 1], [0, 0, 0, 4.189], [1, .6, .25]]],
    shards: [[[1.3, .18, 3, .62], [1.25, .5, 0, 0], [.5, .75, 1]], [[1.18, -.24, 5, .4], [-.8, -.7, .05, 1.3], [.8, .5, 1]], [[1.42, .12, 4, .3], [.6, 1.2, -.04, 2.6], [1, .6, .3]]],
    concentric: [[[1.05, .55, 0, 1], [1.3, 0, 0, 0], [.4, .75, 1]], [[1.25, .35, 0, 1], [1.3, .15, 0, 1], [.7, .45, 1]], [[1.48, .22, 0, 1], [1.3, -.15, 0, 2], [1, .4, .85]], [[1.72, .14, 0, 1], [1.3, 0, 0, 3], [.45, .65, 1]]]
  };
  var PH = null, STR = null, ORB = null, intro0 = 0, introDone = false;
  function photoTex(src, mip) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 128]));
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (src && mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, src && mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { t: t };
  }
  /* fibre by fibre, so a lower level simply draws the first part of the buffer (Mid 3 of 5 strand fibres, 1 of 3 orbit fibres) */
  function strandBuffer(L) {   /* a = x, y (y up), distance along (screen heights), depth; b = seed, 0..1 along, fibre */
    var v = [], R = 9301, D2 = L.map(function (p) {
      var n = p.length / 3, len = 0, d = [0];
      for (var j = 1; j < n; j++) { len += Math.hypot(p[j * 3] - p[j * 3 - 3], (p[j * 3 + 1] - p[j * 3 - 2]) * 2.17); d.push(len); }
      return { d: d, len: Math.max(len, 1e-4) };
    });
    for (var f = 0; f < 5; f++) for (var i = 0; i < L.length; i++) {
      var p = L[i], n = p.length / 3, d = D2[i].d, len = D2[i].len;
      R = (R * 16807) % 2147483647; var seed = R / 2147483647;
      for (var j = 1; j < n; j++) for (var e = j - 1; e <= j; e++) v.push(p[e * 3], 1 - p[e * 3 + 1], d[e], p[e * 3 + 2], seed, d[e] / len, f, 0);
    }
    return lines(v, 8);
  }
  function orbitBuffer(rings) {   /* a = 0..1 around, ring, fibre (3 per ring), seed */
    var v = [], SEG = 160, R = 7;
    for (var f = 0; f < 3; f++) for (var i = 0; i < rings.length; i++) {
      R = (R * 16807) % 2147483647; var seed = R / 2147483647;
      for (var k = 0; k < SEG; k++) v.push(k / SEG, i, f, seed, (k + 1) / SEG, i, f, seed);
    }
    return lines(v, 4);
  }
  function loadPhoto() {
    var blank = photoTex(null, false);
    PH = { col: blank, map: blank, aspect: 1080 / 2340, conf: null, ready: false };
    var ready = function () {
      var P = W.MFX_PHOTO; if (!P) return;
      var a = new Image(), b = new Image(), n = 0;
      a.onload = b.onload = function () {
        if (++n < 2) return;
        var conf = P.conf || {};
        PH = { col: photoTex(a, true), map: photoTex(b, false), aspect: a.naturalWidth / a.naturalHeight, conf: conf, ready: true };
        STR = P.lines && P.lines.length ? strandBuffer(P.lines) : null;
        ORB = orbitBuffer(ORBITS[conf.style] || ORBITS.concentric);
        W.MFX_PHOTO = null; api.photo = true; D.documentElement.classList.add('mfx-photo');
        if (mounted && !run) frame(0);
      };
      a.src = P.color; b.src = P.map;
    };
    if (W.MFX_PHOTO) { ready(); return; }
    var sc = D.createElement('script'); sc.src = 'img/bg/' + NAME + '.js'; sc.onload = ready;
    (D.head || D.documentElement).appendChild(sc);
  }

  /* the phone's full pixels, up to FHD: the picture stays sharp */
  var rs = null, b1 = null, b2 = null, b3 = null, b4 = null, cw = 0, ch = 0;
  function size() {
    var w = Math.max(1, innerWidth), h = stableH(), dpr = Math.min(W.devicePixelRatio || 1, 1080 / Math.max(1, Math.min(w, h)));
    if (cv.parentNode === D.body) cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    if (cv.width === cw && cv.height === ch) return; cw = cv.width; ch = cv.height;
    [rs, b1, b2, b3, b4].forEach(drop);
    rs = target(cw, ch); b1 = target(Math.max(8, cw >> 1), Math.max(8, ch >> 1)); b2 = target(b1.w, b1.h); b3 = target(Math.max(4, cw >> 3), Math.max(4, ch >> 3)); b4 = target(b3.w, b3.h);
  }

  /* ---------------- settings: Motion (off / system / on) and Level (low / mid / high) ---------------- */
  var t = 0, last = 0, run = false, raf = 0, mounted = false, tx = 0, ty = 0, tz = 0;
  var MM = { v: '', l: 'high', at: 0 };   /* read twice a second instead of every frame */
  function prefsNow() {
    var now = Date.now(); if (now - MM.at < 500) return MM; MM.at = now;
    var o = {}; try { o = JSON.parse(localStorage.getItem('m-prefs') || '{}') || {}; } catch (e) { }
    var m = o.motion, reduce = W.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    MM.v = m === 'reduce' || m === 'off' ? 'off' : m === 'full' || m === 'on' ? 'on' : reduce ? 'off' : 'system';
    MM.l = o.level === 'low' || o.level === 'mid' ? o.level : 'high';
    return MM;
  }
  var LVL = { low: 0, mid: 1, high: 2 }, FPS = { low: 60, mid: 90, high: 120 };
  var SH = { w: 0, h: 0 };   /* the keyboard shrinks the window: the background keeps the full height */
  function stableH() { var w = innerWidth, h = innerHeight; if (w !== SH.w || h > SH.h) { if (w !== SH.w) SH.h = 0; SH.w = w; SH.h = Math.max(SH.h, h); } return Math.max(1, SH.h); }
  function accent() {
    var v = ''; try { v = getComputedStyle(D.documentElement).getPropertyValue('--mfx-a') || getComputedStyle(D.documentElement).getPropertyValue('--accent'); } catch (e) { }
    var m = String(v).trim().match(/^#([0-9a-f]{6})$/i);
    if (!m) return [.6, .7, 1]; var n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  var ACC = accent(), accAt = 0;
  function isLight() { var r = D.documentElement; return r.classList.contains('mfx-light') || r.getAttribute('data-theme') === 'light'; }
  function busyNow() {
    try {
      if (NAME === 'chat') return W.__turnLocal !== undefined && D.querySelector('.x-live,.x-thinking,.x-typing') ? 1 : 0;
      if (NAME === 'parallel') return typeof busy !== 'undefined' && busy ? 1 : 0;
      if (NAME === 'nullcloud') return typeof state !== 'undefined' && state && (state.running || state.fetching || state.busy) ? 1 : 0;
    } catch (e) { }
    return 0;
  }

  /* ---------------- one frame ---------------- */
  function cover() { var sa = rs.w / rs.h; return [sa > PH.aspect ? 1 : sa / PH.aspect, sa > PH.aspect ? PH.aspect / sa : 1]; }
  function frame(dt) {
    if (!rs) size();
    var P = prefsNow(), live = run ? 1 : 0, lvl = LVL[P.l], gyro = run && P.v === 'on';
    var mv = gyro && W.MfxMotion ? W.MfxMotion.get() : { x: 0, y: 0, z: 0 }, k = dt ? Math.min(1, dt * 6) : 1;
    tx += (mv.x - tx) * k; ty += (mv.y - ty) * k; tz += ((mv.z || 0) - tz) * k;
    t += dt * api.speed;
    if (dt && api.boost > 0) api.boost = Math.max(0, api.boost - dt * 1.2);
    var bz = busyNow(); api.busy += (bz - api.busy) * Math.min(1, (dt || 1) * 2);
    if (performance.now() - accAt > 2000) { ACC = accent(); accAt = performance.now(); }
    var intro = 1;
    if (run && PH.ready && !introDone) { if (!intro0) intro0 = performance.now(); intro = Math.min(1, (performance.now() - intro0) / 2600); if (intro >= 1) introDone = true; }
    var C = PH.conf || { motif: [.5, .4, .2, .2], lake: [.5, .7, .4, .05], focus: .74, veil: .94, style: 'concentric' }, cvr = cover(), tm = t + 7, sty = STYLE[C.style] || 0;

    use(rs); gl.useProgram(pPhoto); var u = pPhoto.u;
    tex(3, PH.col, u.col); tex(4, PH.map, u.map);
    gl.uniform2f(u.cover, cvr[0], cvr[1]); gl.uniform1f(u.focus, C.focus); gl.uniform1f(u.veil, PH.ready ? C.veil : 0);
    gl.uniform1f(u.live, live); gl.uniform1f(u.lvl, lvl); gl.uniform1f(u.sty, sty); gl.uniform1f(u.time, tm); gl.uniform3f(u.tilt, tx, ty, tz);
    gl.uniform1f(u.busy, api.busy); gl.uniform1f(u.boost, api.boost); gl.uniform1f(u.load, api.load); gl.uniform1f(u.intro, intro);
    gl.uniform4fv(u.motif, C.motif); gl.uniform4fv(u.lake, C.lake); gl.uniform2f(u.res, rs.w, rs.h);
    quad();
    if (PH.ready && live && lvl > 0) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      var px = rs.w / 1080 * 1.6, mxc = ((C.motif[0] - .5) / cvr[0]) * 2, myc = ((.5 - C.motif[1]) / cvr[1]) * 2, rad = Math.max(C.motif[2], C.motif[3] * PH.aspect);
      if (STR) {   /* the strands */
        u = pStr.u; gl.useProgram(pStr); tex(3, PH.col, u.col);
        gl.uniform1f(u.time, tm); gl.uniform3f(u.tilt, tx, ty, tz); gl.uniform1f(u.focus, C.focus); gl.uniform2f(u.cover, cvr[0], cvr[1]); gl.uniform4fv(u.motif, C.motif);
        gl.uniform1f(u.speed, api.speed * (1 + api.busy * .9 + api.boost * .5)); gl.uniform1f(u.gain, C.veil * (1 + api.busy * .6)); gl.uniform1f(u.px, px);
        gl.uniform1f(u.intro, intro);
        var ns = lvl > 1 ? STR.n : Math.round(STR.n * 3 / 5 / 2) * 2;
        gl.bindVertexArray(STR.vao); gl.uniform1f(u.pt, 0); gl.drawArrays(gl.LINES, 0, ns); gl.uniform1f(u.pt, 1); gl.drawArrays(gl.POINTS, 0, ns);
      }
      var rings = ORBITS[C.style] || ORBITS.concentric, form = Math.max(0, Math.min(1, (intro - .55) / .25));
      if (form > 0) {   /* the orbits */
        u = pOrb.u; gl.useProgram(pOrb);
        var Rv = [], Tv = [], Cv = [];
        for (var i = 0; i < 4; i++) { var r = rings[Math.min(i, rings.length - 1)]; Rv.push.apply(Rv, r[0]); Tv.push.apply(Tv, r[1]); Cv.push.apply(Cv, r[2]); }
        gl.uniform4fv(u.R, Rv); gl.uniform4fv(u.T, Tv); gl.uniform3fv(u.C, Cv);
        gl.uniform1f(u.time, tm); gl.uniform3f(u.tilt, tx, ty, tz); gl.uniform2f(u.ctr, mxc, myc); gl.uniform2f(u.scl, rad / cvr[0] * 2, rad / cvr[0] * 2 * rs.w / rs.h);
        gl.uniform1f(u.px, px); gl.uniform1f(u.shape, C.style === 'braid' ? 1 : 0); gl.uniform1f(u.form, form);
        gl.uniform1f(u.pace, 1 + api.busy * .8 + (NAME === 'gaming' ? api.load * 1.2 + api.boost : api.boost * .5)); gl.uniform1f(u.gain, .55 * (1 + api.busy * .5));
        var no = lvl > 1 ? ORB.n : ORB.n / 3;
        gl.bindVertexArray(ORB.vao); gl.uniform1f(u.pt, 0); gl.drawArrays(gl.LINES, 0, no); gl.uniform1f(u.pt, 1); gl.drawArrays(gl.POINTS, 0, no);
      }
      u = pPt.u; gl.useProgram(pPt);   /* the particles rising into the portal */
      gl.uniform1f(u.time, tm); gl.uniform3f(u.tilt, tx, ty, tz); gl.uniform4fv(u.motif, C.motif); gl.uniform4fv(u.lake, C.lake); gl.uniform2f(u.cover, cvr[0], cvr[1]);
      gl.uniform1f(u.px, px); gl.uniform1f(u.boost, api.boost + api.busy); gl.uniform1f(u.intro, intro);
      gl.bindVertexArray(vaoNone); gl.drawArrays(gl.POINTS, 0, lvl > 1 ? 1400 : 600);
      gl.disable(gl.BLEND);
    }
    var bloom = lvl > 1 ? 1 : lvl > 0 ? .7 : .45;
    use(b1); gl.useProgram(pDown); tex(0, rs, pDown.u.tx); gl.uniform2f(pDown.u.px, 1 / rs.w, 1 / rs.h); gl.uniform1f(pDown.u.thr, .62); quad();
    gl.useProgram(pBlur);
    use(b2); tex(0, b1, pBlur.u.tx); gl.uniform2f(pBlur.u.dir, 1 / b1.w, 0); quad();
    use(b1); tex(0, b2, pBlur.u.tx); gl.uniform2f(pBlur.u.dir, 0, 1 / b1.h); quad();
    use(b3); gl.useProgram(pDown); tex(0, b1, pDown.u.tx); gl.uniform2f(pDown.u.px, 1 / b1.w, 1 / b1.h); gl.uniform1f(pDown.u.thr, 0); quad();
    gl.useProgram(pBlur);
    use(b4); tex(0, b3, pBlur.u.tx); gl.uniform2f(pBlur.u.dir, 1 / b3.w, 0); quad();
    use(b3); tex(0, b4, pBlur.u.tx); gl.uniform2f(pBlur.u.dir, 0, 1 / b3.h); quad();
    use(null); gl.useProgram(pComp);
    tex(0, rs, pComp.u.sc); tex(1, b1, pComp.u.b1); tex(2, b3, pComp.u.b2);
    gl.uniform1f(pComp.u.light, isLight() ? 1 : 0); gl.uniform1f(pComp.u.time, t); gl.uniform3f(pComp.u.acc, ACC[0], ACC[1], ACC[2]); gl.uniform1f(pComp.u.bloom, bloom);
    quad();
  }
  function loop(now) {
    raf = 0; if (!run) return;
    var fps = FPS[prefsNow().l], dt = last ? Math.min(.1, (now - last) / 1000) : 0;
    if (!last) loop.due = 0;   /* at most the level's frame rate (60 / 90 / 120), and never more than the screen gives */
    if (loop.due && now < loop.due - 2) { raf = requestAnimationFrame(loop); return; }
    loop.due = loop.due && now - loop.due < 50 ? loop.due + 1000 / fps : now + 1000 / fps;
    last = now; frame(dt || 1 / fps); raf = requestAnimationFrame(loop);
  }
  function schedule() {
    if (!mounted) return;
    var want = !D.hidden && api.shown && prefsNow().v !== 'off';
    if (want && !run) { run = true; last = 0; if (!raf) raf = requestAnimationFrame(loop); }
    else if (!want && run) { run = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    if (!want && !D.hidden && api.shown) { tx = ty = tz = 0; frame(0); }
  }
  function mount(host) {   /* the web apps: behind the page; Core's page: inside the page it is given */
    if (mounted || !D.body) return; mounted = true;
    if (host) cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block';
    (host || D.body).insertBefore(cv, (host || D.body).firstChild);
    loadPhoto(); size(); schedule();
    W.addEventListener('resize', function () { size(); if (!run && api.shown) frame(0); });
    D.addEventListener('visibilitychange', schedule);
    W.addEventListener('storage', function (e) { if (e.key === 'm-prefs') { MM.at = 0; schedule(); } });
    D.addEventListener('pointerdown', function () { introDone = true; api.boost = Math.max(api.boost, NAME === 'gaming' ? 1 : .6); }, { passive: true });   /* a tap skips the entrance */
    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); run = false; api.active = false; D.documentElement.classList.remove('mfx-gl', 'mfx-photo'); var f = D.getElementById('mfx-field'); if (f) f.style.display = ''; });
    D.documentElement.classList.add('mfx-gl');
    if (NAME === 'gaming') { readLoad(); setInterval(function () { if (!D.hidden) readLoad(); }, 2000); }
  }
  function readLoad() {   /* how hard the CPU works now: current clock / max clock, averaged over every core */
    try {
      var P = W.MeridianPhone; if (!P || !P.sysRead) return;
      var cur = 0, max = 0;
      for (var c = 0; c < 12; c++) {
        var m = Number(P.sysRead('/sys/devices/system/cpu/cpu' + c + '/cpufreq/cpuinfo_max_freq')) || 0; if (!m) continue;
        cur += Number(P.sysRead('/sys/devices/system/cpu/cpu' + c + '/cpufreq/scaling_cur_freq')) || 0; max += m;
      }
      if (max > 0) api.load += (Math.min(1, cur / max) - api.load) * .5;
    } catch (e) { }
  }
  api.mood = function (sp, br, tint) { api.speed = sp || 1; api.bright = br || 1; api.hot = tint === '#ff4a1f' ? 1 : 0; if (!run && mounted && api.shown) frame(0); };
  api.kick = function (v) { api.boost = Math.max(api.boost, v || 0); };
  api.redraw = function () { if (mounted && !run && api.shown) frame(0); };
  api.refresh = function () { MM.at = 0; schedule(); };   /* a setting changed in this page (Motion, Level) */
  api.show = function (on) { api.shown = !!on; schedule(); };   /* Core's page: draw only while it is open */
  api.mount = mount; api.schedule = schedule;
  if (NAME !== 'core') { if (D.body) mount(); else D.addEventListener('DOMContentLoaded', function () { mount(); }); }
})();
