/* Meridian lens: one touch effect for every tap and hold, drawn inside the picture on the GPU.
   Tap: the picture ripples like glass, with a thin ring of light.  Hold (from 0.35 s, growing to 3 s): the picture is
   pulled into a turning lens under the finger, a core and a ring of light grow.  Release: it snaps back as a shockwave
   across the screen, the longer the hold the bigger.  With the track playing, the light breathes on its beat.
   This file only tracks the touch; the shader part is LENS_GLSL, used by the page's own final pass. */
(function (W, D) {
  "use strict";
  var GLSL =
    "uniform vec2 lRes;uniform vec4 lTch;uniform vec4 lW0;uniform vec4 lW1;uniform vec3 lTa;uniform vec3 lTb;uniform float lBeat;uniform float lTime;\n" +
    "vec2 lWave(vec2 uv,vec4 w,vec2 a){if(w.w<=0.)return vec2(0.);vec2 p=(uv-w.xy)*a;float r=length(p),s=w.w,rad=w.z*(.42+.55*s);\n" +
    " float env=exp(-w.z*(2.6-1.5*s))*smoothstep(0.,.04,w.z);float b=exp(-pow((r-rad)*(26.-12.*s),2.));return -normalize(p+1e-5)/a*b*env*(.010+.034*s);}\n" +
    "vec2 lensUV(vec2 uv){vec2 a=vec2(lRes.x/lRes.y,1.),d=uv;\n" +
    " if(lTch.w>.001){vec2 p=(uv-lTch.xy)*a;float r=length(p),c=lTch.z,R=.04+.07*c,f=exp(-r*r/(R*R))*lTch.w;float an=f*(.25+.85*c);\n" +
    "  p=mat2(cos(an),sin(an),-sin(an),cos(an))*p;p*=1.+f*(.08+.3*c);d=lTch.xy+p/a;}\n" +
    " return d+lWave(uv,lW0,a)+lWave(uv,lW1,a);}\n" +
    "vec3 lWaveLight(vec2 uv,vec4 w,vec2 a){if(w.w<=0.)return vec3(0.);vec2 p=(uv-w.xy)*a;float r=length(p),s=w.w,rad=w.z*(.42+.55*s);\n" +
    " float env=exp(-w.z*(2.6-1.5*s))*smoothstep(0.,.04,w.z);float b=exp(-pow((r-rad)*(48.-18.*s),2.)),bb=exp(-pow((r-rad)*(12.-4.*s),2.));\n" +
    " return (lTa*b*(.55+.9*s)+lTb*bb*.18*(.4+s)+vec3(1.)*pow(b,6.)*.35*s)*env*(1.+.6*lBeat);}\n" +
    "vec3 lensLight(vec2 uv){vec2 a=vec2(lRes.x/lRes.y,1.);vec3 L=lWaveLight(uv,lW0,a)+lWaveLight(uv,lW1,a);\n" +
    " if(lTch.w>.001){vec2 p=(uv-lTch.xy)*a;float r=length(p),c=lTch.z,an=atan(p.y,p.x),bt=1.+.7*lBeat;\n" +
    "  float Rr=.03+.1*c+.006*sin(lTime*3.)*c;float ring=exp(-pow((r-Rr)*(150.-60.*c),2.))*(.45+.9*c)*(.7+.3*sin(an*3.-lTime*(3.+5.*c)));\n" +
    "  float ring2=exp(-pow((r-Rr*1.55)*(90.-30.*c),2.))*.35*c*(.6+.4*sin(-an*5.+lTime*2.5));\n" +
    "  float core=exp(-r*r/(.0003+.0012*c))*(.25+.55*c),halo=exp(-r*(9.-4.*c))*.22*c;\n" +
    "  L+=(lTa*ring+lTb*(ring2+halo)+mix(lTb,vec3(1.),.65)*core)*bt*lTch.w;}\n" +
    " return L;}\n";

  function create(opt) {
    opt = opt || {};
    var quiet = opt.quiet || "button, a, input, select, label";
    var reduce = W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var down = null, hold = 0, holdAt = 0, rel = null, waves = [null, null], wi = 0, beat = 0;
    function now() { return performance.now() / 1000; }
    function uvOf(x, y) { return [x / W.innerWidth, 1 - y / W.innerHeight]; }
    function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
    function wave(x, y, s) { waves[wi] = { p: uvOf(x, y), t0: now(), s: s }; wi = 1 - wi; }
    function charge(t) { if (!down || !hold) return 0; var k = Math.min(1, (t - holdAt) / 2.65); return 1 - Math.pow(1 - k, 2); }
    if (!reduce) {
      W.addEventListener("pointerdown", function (e) {
        if (e.button > 0 || (e.target.closest && e.target.closest(quiet))) return;
        down = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: now(), moved: false }; hold = 0;
      }, { passive: true });
      W.addEventListener("pointermove", function (e) {
        if (!down) return;
        if (!hold && Math.hypot(e.clientX - down.x0, e.clientY - down.y0) > 18) { down = null; return; }
        down.x = e.clientX; down.y = e.clientY;
      }, { passive: true });
      function end(ok, e) {
        if (!down) return; var t = now(), d = down;
        if (hold) { var c = charge(t); rel = { p: uvOf(d.x, d.y), c: c, t0: t }; wave(d.x, d.y, .35 + .65 * c); buzz(Math.round(12 + 30 * c)); if (opt.onRelease) opt.onRelease(c); }
        else if (ok && t - d.t0 < .35) { wave(d.x, d.y, .22); if (opt.onTap) opt.onTap(e.clientX, e.clientY); }
        down = null; hold = 0;
      }
      W.addEventListener("pointerup", function (e) { end(true, e); });
      W.addEventListener("pointercancel", function (e) { end(false, e); });
    }
    return {
      GLSL: GLSL,
      setBeat: function (b) { beat = b || 0; },
      holding: function () { return !!(down && hold); },
      /* the uniforms for this frame: touch [x, y, charge, on], two waves [x, y, age, strength], beat */
      frame: function () {
        var t = now();
        if (down && !hold && t - down.t0 > .35) { hold = 1; holdAt = t; buzz(8); if (opt.onHold) opt.onHold(); }
        var tch = [0, 0, 0, 0];
        if (down && hold) { var p = uvOf(down.x, down.y); tch = [p[0], p[1], charge(t), Math.min(1, (t - holdAt) * 5)]; }
        else if (rel && t - rel.t0 < .25) tch = [rel.p[0], rel.p[1], rel.c, 1 - (t - rel.t0) / .25];
        var w = waves.map(function (v) { if (!v) return [0, 0, 0, 0]; var age = t - v.t0; if (age > 1.6 + 1.6 * v.s) return [0, 0, 0, 0]; return [v.p[0], v.p[1], age, v.s]; });
        return { tch: tch, w0: w[0], w1: w[1], beat: beat, time: t % 1000 };
      }
    };
  }
  W.MeridianLens = { create: create, GLSL: GLSL };
})(window, document);
