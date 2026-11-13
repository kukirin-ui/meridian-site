/* Meridian particles: one field for the website and the Showcase, shaped by the world you are in.
   Meridian: points streaming along the meridians of a turning globe.  Core: nodes on three orbits, lightning.
   Chat: an accretion disk around a dark core, jets on release.  Gaming: pixels and two crystal rings that shatter.
   Parallel: a double helix, mirrored streams.  NullCloud: data bits and a nebula that condenses, then disperses.
   Scroll streams them, a tap puffs them, a hold gathers them (0.4 s to 3 s), the release throws them out:
   the longer the hold, the farther and longer they fly. With the Meridian track playing they pulse on its beat.
   Canvas 2D with cached glow sprites, additive light, adaptive count. */
(function (W, D) {
  "use strict";
  var WCOL = { core: [.95, .72, .34], chat: [.66, .48, 1], gaming: [1, .42, .16], parallel: [.28, .6, 1], nullcloud: [.16, .86, .74] };
  var SHAPE = { meridian: "mote", core: "mote", chat: "mote", gaming: "pixel", parallel: "mote", nullcloud: "bit" };
  var TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  function create(opt) {
    var cv = opt.canvas, cx = cv.getContext("2d");
    var noop = function () {};
    if (!cx || opt.reduce) {
      return { setWorld: noop, setTheme: noop, setBeat: noop, scroll: noop, tap: noop, holdStart: noop, holdMove: noop, holdEnd: noop, holdCancel: noop, setLevel: noop, setMotion: noop, charge: function () { return 0; }, state: function () { return { n: 0 }; } };
    }
    var Wd = 1, Ht = 1, dpr = 1, lvl = opt.level == null ? 2 : opt.level, motion = opt.motion !== false, k = 1;
    var world = opt.world || "meridian", theme = { a: [.28, .85, 1], b: [.7, .36, 1], tinted: false };
    var P = [], bolts = [], sprites = {}, t = 0, last = 0, beat = 0, beatPrev = 0, scrollV = 0;
    var hold = null, simOff = 0, fpsN = 0, fpsT = 0, slowFor = 0, fastFor = 0;

    function size() {
      dpr = Math.min(W.devicePixelRatio || 1, [1, 1.5, 2][lvl]);
      Wd = W.innerWidth; Ht = W.innerHeight;
      cv.width = Math.max(1, Math.round(Wd * dpr)); cv.height = Math.max(1, Math.round(Ht * dpr));
    }
    size(); W.addEventListener("resize", size);

    /* ---------- colours and sprites */
    function pick(kind) {
      var r = Math.random();
      if (!theme.tinted && WCOL[kind] && r < .38) return WCOL[kind];
      return mixc(theme.a, theme.b, Math.random() * (theme.tinted ? .8 : 1));
    }
    function sprite(shape, c) {
      var q = [Math.round(c[0] * 15), Math.round(c[1] * 15), Math.round(c[2] * 15)], key = shape + q.join(",");
      if (sprites[key]) return sprites[key];
      var R = Math.round(q[0] * 17), G = Math.round(q[1] * 17), B = Math.round(q[2] * 17), s = D.createElement("canvas"), g, x;
      var col = function (a) { return "rgba(" + R + "," + G + "," + B + "," + a + ")"; };
      var lite = "rgba(" + Math.min(255, R + 110) + "," + Math.min(255, G + 110) + "," + Math.min(255, B + 110) + ",1)";
      if (shape === "mote") {
        s.width = s.height = 32; x = s.getContext("2d"); g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
        g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.16, lite); g.addColorStop(.38, col(.55)); g.addColorStop(1, col(0)); x.fillStyle = g; x.fillRect(0, 0, 32, 32);
      } else if (shape === "pixel") {
        s.width = s.height = 24; x = s.getContext("2d"); g = x.createRadialGradient(12, 12, 0, 12, 12, 12);
        g.addColorStop(0, col(.5)); g.addColorStop(1, col(0)); x.fillStyle = g; x.fillRect(0, 0, 24, 24);
        x.fillStyle = lite; x.fillRect(8, 8, 8, 8); x.fillStyle = "rgba(255,255,255,.9)"; x.fillRect(10, 10, 4, 4);
      } else if (shape === "bit") {
        s.width = 12; s.height = 28; x = s.getContext("2d"); g = x.createRadialGradient(6, 14, 0, 6, 14, 14);
        g.addColorStop(0, col(.45)); g.addColorStop(1, col(0)); x.fillStyle = g; x.fillRect(0, 0, 12, 28);
        x.fillStyle = lite; x.fillRect(4.5, 6, 3, 16); x.fillStyle = "rgba(255,255,255,.85)"; x.fillRect(5.25, 9, 1.5, 10);
      } else {   /* mist */
        s.width = s.height = 64; x = s.getContext("2d"); g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, col(.55)); g.addColorStop(.5, col(.22)); g.addColorStop(1, col(0)); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      }
      sprites[key] = s; return s;
    }

    /* ---------- particles */
    function add(o) {
      var p = { x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, sz: 3, a: 1, mode: "fx", kind: world, z: 1, drag: 0, g: 0, grow: 0, twin: 0, ox: 0, flash: 0, kx: 0, ky: 0, px: NaN, py: NaN, ph: Math.random() * TAU };
      for (var n in o) p[n] = o[n];
      if (!p.c) p.c = pick(p.kind);
      if (!p.shape) p.shape = SHAPE[p.kind] || "mote";
      p.spr = sprite(p.shape, p.c);
      P.push(p); return p;
    }
    function caps() { return [260, 440, 720][lvl] * k; }
    function centre() { return [Wd / 2, Ht * .44]; }

    /* ambient: always a few, each world moving its own way */
    function spawnAmb() {
      var c = centre(), w = world, z = rnd(.35, 1), d = Math.hypot(Wd, Ht);
      var o = { mode: "amb", kind: w, z: z, life: rnd(5, 10), sz: rnd(1.6, 3.6) * (.6 + z * .6), a: rnd(.35, .8) };
      if (w === "core") { o.ang = rnd(0, TAU); o.rad = rnd(.12, .62) * d * .5; o.w = rnd(.08, .22) * (Math.random() < .5 ? -1 : 1); o.tl = rnd(-.5, .5); }
      else if (w === "chat") { o.ang = rnd(0, TAU); o.rad = rnd(.35, .72) * d * .5; }
      else if (w === "gaming") { o.ang = rnd(0, TAU); o.rad = rnd(4, 70); o.sz = rnd(2, 4); }
      else if (w === "parallel") { o.y = rnd(-20, Ht + 60); o.x = c[0]; o.ox = rnd(-1, 1); o.sp = rnd(28, 70) * z; o.twin = 1; }
      else if (w === "nullcloud") {
        if (Math.random() < .14) { o.shape = "mist"; o.sz = rnd(60, 150); o.a = rnd(.08, .2); o.x = rnd(0, Wd); o.y = rnd(0, Ht); o.vx = rnd(-6, 6); o.vy = rnd(-8, -2); }
        else { o.x = rnd(0, Wd); o.y = Ht + rnd(0, 40); o.vy = -rnd(22, 64) * z; o.vx = rnd(-4, 4); }
      } else { o.x = rnd(0, Wd); o.y = rnd(0, Ht + 40); o.vy = -rnd(6, 18) * z; o.vx = 0; }
      if (o.x == null) o.x = c[0]; if (o.y == null) o.y = c[1];
      add(o);
    }
    function moveAmb(p, dt) {
      var c = centre(), sy = -scrollV * dt * p.z * .35, boost = 1 + Math.min(4, Math.abs(scrollV) / 500);
      p.kx *= Math.exp(-dt * 3); p.ky *= Math.exp(-dt * 3);
      if (p.kind === "core") { p.ang += p.w * dt * boost; var ca = Math.cos(p.tl), sa = Math.sin(p.tl), ex = Math.cos(p.ang) * p.rad, ey = Math.sin(p.ang) * p.rad * .42;
        p.oy = (p.oy || 0) + sy; p.x = c[0] + ex * ca - ey * sa + p.kx * 0; p.y = c[1] + ex * sa + ey * ca + p.oy; }
      else if (p.kind === "chat") { p.ang += (.12 + 26 / Math.max(20, p.rad)) * dt * boost; p.rad -= (4 + 900 / Math.max(20, p.rad)) * dt * .3 * boost; if (p.rad < 16) p.age = p.life;
        var e1 = Math.cos(p.ang) * p.rad, e2 = Math.sin(p.ang) * p.rad * .5, tl = -.35; p.oy = (p.oy || 0) + sy;
        p.x = c[0] + e1 * Math.cos(tl) - e2 * Math.sin(tl); p.y = c[1] + e1 * Math.sin(tl) + e2 * Math.cos(tl) + p.oy; }
      else if (p.kind === "gaming") { p.rad += (14 + p.rad * .75) * dt * p.z * boost; p.x = c[0] + Math.cos(p.ang) * p.rad; p.y = c[1] + Math.sin(p.ang) * p.rad * .8; }
      else if (p.kind === "parallel") { p.y -= p.sp * dt * boost; p.y += sy; var A = Math.min(Wd * .3, 150), ph = p.y * .011 + t * 1.1 + p.ph * .15; p.hx = A * Math.sin(ph) + p.ox * 10; p.depth = Math.cos(ph); p.x = c[0]; }
      else { p.x += p.vx * dt; p.y += p.vy * dt * (p.shape === "mist" ? 1 : boost) + sy; }
      if (p.kind === "meridian" || p.kind === "nullcloud") { p.x += p.kx * dt; p.y += p.ky * dt; }
      else { var dk = Math.exp(-dt * 1.5); p.offx = (p.offx || 0) * dk + p.kx * dt; p.offy = (p.offy || 0) * dk + p.ky * dt; p.x += p.offx; p.y += p.offy; }
    }

    /* ---------- tap */
    function tap(x, y) {
      var n = Math.round(16 * Math.max(.5, k) * (lvl ? 1 : .6)), w = world, i, a, v;
      if (w === "gaming") for (i = 0; i < n; i++) add({ x: x, y: y, vx: rnd(-260, 260), vy: -rnd(140, 420), g: 760, drag: .5, life: rnd(.7, 1.2), sz: rnd(3, 5), kind: w });
      else if (w === "parallel") for (i = 0; i < n / 2; i++) { a = rnd(-2.6, -.5); v = rnd(140, 380); add({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.2, life: rnd(.6, 1), sz: rnd(2, 3.4), kind: w, twin: 2, cxm: x }); }
      else if (w === "nullcloud") { for (i = 0; i < 3; i++) add({ x: x + rnd(-8, 8), y: y + rnd(-8, 8), shape: "mist", sz: rnd(40, 70), grow: rnd(60, 120), vx: rnd(-20, 20), vy: rnd(-30, -6), a: .4, life: rnd(1, 1.6), kind: w });
        for (i = 0; i < n * .7; i++) add({ x: x + rnd(-10, 10), y: y, vx: rnd(-30, 30), vy: -rnd(100, 260), drag: 1.2, life: rnd(.6, 1.1), kind: w }); }
      else if (w === "chat") for (i = 0; i < n; i++) { a = rnd(0, TAU); v = rnd(60, 180); var tg = rnd(150, 300); add({ x: x, y: y, vx: Math.cos(a) * v - Math.sin(a) * tg, vy: Math.sin(a) * v + Math.cos(a) * tg, drag: 2, life: rnd(.6, 1.1), sz: rnd(2, 3.4), kind: w }); }
      else { for (i = 0; i < n; i++) { a = i / n * TAU + rnd(-.15, .15); v = rnd(140, 380); add({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4, life: rnd(.5, .9), sz: rnd(2, 3.4), kind: w }); }
        if (w === "core") for (i = 0; i < 2; i++) { a = rnd(0, TAU); bolt(x, y, x + Math.cos(a) * rnd(50, 120), y + Math.sin(a) * rnd(50, 120), .22, pick("core")); } }
    }
    function bolt(x0, y0, x1, y1, life, c) {
      var pts = [], n = 9, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      for (var i = 0; i <= n; i++) { var s = i / n, j = (i === 0 || i === n) ? 0 : rnd(-1, 1) * L * .09 * Math.sin(s * Math.PI); pts.push([x0 + dx * s + nx * j, y0 + dy * s + ny * j]); }
      bolts.push({ pts: pts, age: 0, life: life, c: c });
    }

    /* ---------- hold: gather around the finger */
    function clock() { return performance.now() / 1000 + simOff; }
    function holdStart(x, y) { hold = { x: x, y: y, t0: clock(), c: 0, on: false, nb: 0 }; }
    function holdMove(x, y) { if (hold) { hold.x = x; hold.y = y; } }
    function holdCancel() { if (!hold) return; P.forEach(function (p) { if (p.mode === "hold") { p.mode = "fx"; p.life = p.age + .35; p.vx = p.vy = 0; p.drag = 3; } }); hold = null; }
    function spawnHold() {
      var c = hold.c, w = world, R0 = 70 + 90 * c, o = { mode: "hold", kind: w, life: 99, sz: rnd(1.8, 3.4), a: rnd(.6, 1) };
      if (w === "meridian") { o.lon = Math.floor(rnd(0, 6)) / 6 * Math.PI; o.phi = rnd(0, TAU); o.sp = rnd(1.4, 2.4) * (Math.random() < .5 ? 1 : -1); o.r = R0 * rnd(.9, 1.3); }
      else if (w === "core") { o.orb = Math.floor(rnd(0, 3)); o.ang = rnd(0, TAU); o.r = R0; o.w = rnd(1.6, 2.6); }
      else if (w === "chat") { o.ang = rnd(0, TAU); o.r = R0 * rnd(.9, 1.4); }
      else if (w === "gaming") { o.ring = Math.random() < .5 ? 0 : 1; o.ang = rnd(0, TAU); o.r = R0; o.sz = rnd(2.4, 3.8); }
      else if (w === "parallel") { o.s = rnd(-1, 1); o.twin = 1; o.r = R0; }
      else { o.ang = rnd(0, TAU); o.r = R0 * rnd(.9, 1.5); if (Math.random() < .3) { o.shape = "mist"; o.sz = rnd(30, 60); o.a = rnd(.15, .3); } }
      add(o);
    }
    function moveHold(p, dt) {
      var c = hold.c, hx = hold.x, hy = hold.y, sp = 1 + c * 1.6, x, y, d;
      if (p.kind === "meridian") {   /* points running along six meridians of a turning globe */
        var R = 22 + 48 * c; p.r += (R - p.r) * Math.min(1, dt * 3); p.phi += p.sp * dt * sp;
        var lam = p.lon + t * (.9 + c * 1.4), sx = Math.sin(p.phi) * Math.cos(lam), sz = Math.sin(p.phi) * Math.sin(lam);
        x = hx + sx * p.r; y = hy - Math.cos(p.phi) * p.r; p.depth = sz;
      } else if (p.kind === "core") {   /* three tilted orbits */
        var Rc = 24 + 46 * c; p.r += (Rc * (1 + p.orb * .18) - p.r) * Math.min(1, dt * 3); p.ang += p.w * dt * sp * (p.orb === 1 ? -1 : 1);
        var tl = p.orb * 1.047 + t * .3, ex = Math.cos(p.ang) * p.r, ey = Math.sin(p.ang) * p.r * .34;
        x = hx + ex * Math.cos(tl) - ey * Math.sin(tl); y = hy + ex * Math.sin(tl) + ey * Math.cos(tl); p.depth = Math.sin(p.ang);
      } else if (p.kind === "chat") {   /* the accretion disk: faster as it falls in */
        var hz = 9 + 16 * c; p.r -= (12 + 520 / Math.max(hz, p.r)) * dt * (.5 + c); p.ang += (1.6 + 60 / Math.max(hz, p.r)) * dt;
        if (p.r < hz) { p.r = (70 + 90 * c) * rnd(.9, 1.3); p.ang = rnd(0, TAU); }
        var e1 = Math.cos(p.ang) * p.r, e2 = Math.sin(p.ang) * p.r * .36, tl2 = -.35; x = hx + e1 * Math.cos(tl2) - e2 * Math.sin(tl2); y = hy + e1 * Math.sin(tl2) + e2 * Math.cos(tl2);
        p.depth = Math.sin(p.ang); p.hot = Math.min(1, 28 / p.r);
      } else if (p.kind === "gaming") {   /* two crystal rings turning against each other */
        var A = (28 + 54 * c) * (1 + p.ring * .2), B = A * (.3 + p.ring * .1), tl3 = p.ring ? -.55 : .5; p.r = A; p.ang += (p.ring ? -1 : 1) * (1.1 + 2 * c) * dt;
        var gx = Math.cos(p.ang) * A, gy = Math.sin(p.ang) * B; x = hx + gx * Math.cos(tl3) - gy * Math.sin(tl3); y = hy + gx * Math.sin(tl3) + gy * Math.cos(tl3); p.depth = Math.sin(p.ang);
      } else if (p.kind === "parallel") {   /* the double helix: one point, two mirrored strands */
        var H = 40 + 130 * c, Ah = 12 + 24 * c; p.s += dt * (.45 + c * .6); if (p.s > 1) p.s -= 2;
        var ph = p.s * TAU * 1.5 + t * 3; p.hx = Ah * Math.sin(ph); p.depth = Math.cos(ph); x = hx; y = hy + p.s * H / 2;
      } else {   /* NullCloud: the nebula condenses */
        var Rn = 16 + 30 * c; p.r += (Rn - p.r) * Math.min(1, dt * (p.shape === "mist" ? .8 : 1.6)); p.ang += (p.shape === "mist" ? .4 : 2.2 + 30 / Math.max(10, p.r)) * dt;
        x = hx + Math.cos(p.ang) * p.r; y = hy + Math.sin(p.ang) * p.r * .7;
      }
      p.vx = (x - p.x) / Math.max(dt, 1e-3); p.vy = (y - p.y) / Math.max(dt, 1e-3); p.x = x; p.y = y; d = 0;
    }
    function holdEnd() {
      if (!hold) return;
      if (!hold.on) { hold = null; return; }
      var s = Math.max(.15, hold.c), x = hold.x, y = hold.y, w = world, i, a, v, n = Math.round((40 + 150 * s) * Math.max(.45, k) * (lvl ? 1 : .6));
      var drag = 2.6 - 1.2 * s, life = function () { return rnd(.8, 1.2) * (.9 + 2.4 * s); };
      P.forEach(function (p) {
        if (p.mode !== "hold") return; p.mode = "fx"; p.age = 0; p.life = life(); p.drag = drag;
        var dx = p.x - x, dy = p.y - y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, sp = (180 + 560 * s) * rnd(.7, 1.2);
        if (w === "chat") { p.vx = -uy * sp * .9 + ux * sp * .35; p.vy = ux * sp * .9 + uy * sp * .35; }
        else if (w === "gaming") { p.vx = ux * sp - uy * sp * .4; p.vy = uy * sp + ux * sp * .4; p.g = 320; }
        else if (w === "parallel") { p.vx = 0; p.vy = (p.s < 0 ? -1 : 1) * sp; p.twin = 2; p.cxm = x; p.hx0 = p.hx || 0; }
        else if (w === "nullcloud") { var sl = p.shape === "mist" ? .3 : 1; p.vx = ux * sp * sl; p.vy = uy * sp * sl - (sl < 1 ? 0 : 80); if (sl < 1) p.grow = 60 + 160 * s; }
        else { p.vx = ux * sp; p.vy = uy * sp; }
      });
      if (w === "meridian") for (i = 0; i < n; i++) { a = i / n * TAU; v = (200 + 620 * s) * rnd(.94, 1.06); add({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: drag, life: life(), sz: rnd(2, 3.4), kind: w }); }
      else if (w === "core") { for (i = 0; i < n; i++) { a = rnd(0, TAU); v = (200 + 650 * s) * rnd(.4, 1.1); add({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: drag, life: life(), sz: rnd(1.8, 3.2), kind: w }); }
        var nb = Math.round(2 + 5 * s); for (i = 0; i < nb; i++) { a = rnd(0, TAU); var L2 = 120 + 520 * s; bolt(x, y, x + Math.cos(a) * L2, y + Math.sin(a) * L2, .18 + .2 * s, pick("core")); } }
      else if (w === "chat") { var ax = -.35 + Math.PI / 2; for (i = 0; i < n; i++) { a = ax + (i % 2 ? Math.PI : 0) + rnd(-.07, .07); v = (380 + 900 * s) * rnd(.5, 1.1); add({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: drag * .8, life: life() * .8, sz: rnd(1.6, 3), kind: w }); } }
      else if (w === "gaming") for (i = 0; i < n; i++) add({ x: x, y: y, vx: rnd(-1, 1) * (150 + 450 * s), vy: -rnd(200, 450 + 600 * s), g: 640, drag: drag * .5, life: life(), sz: rnd(2.6, 4.6), kind: w });
      else if (w === "parallel") for (i = 0; i < n; i++) { var up = i % 2 ? -1 : 1; add({ x: x, y: y + rnd(-10, 10), vx: rnd(-20, 20), vy: up * (380 + 800 * s) * rnd(.5, 1.05), drag: drag, life: life(), sz: rnd(1.8, 3.2), kind: w, twin: 2, cxm: x, hx0: 0 }); }
      else { for (i = 0; i < n * .8; i++) add({ x: x + rnd(-8, 8), y: y, vx: rnd(-50, 50) * (1 + s), vy: -(300 + 650 * s) * rnd(.4, 1), drag: drag, life: life(), kind: w });
        for (i = 0; i < 3 + 5 * s; i++) { a = rnd(0, TAU); add({ x: x, y: y, shape: "mist", sz: rnd(50, 90), grow: 50 + 120 * s, vx: Math.cos(a) * rnd(40, 120) * (1 + s), vy: Math.sin(a) * rnd(40, 120) * (1 + s), a: .2, life: life() * 1.3, drag: 1, kind: w }); } }
      hold = null;
    }

    /* ---------- the frame */
    function frame(ms) {
      requestAnimationFrame(frame);
      if (D.hidden) { last = 0; return; }
      var now = ms / 1000; if (!last) last = now; var dt = Math.min(.05, now - last); last = now;
      /* adaptive: fewer particles if the device cannot hold the pace */
      if (!fpsT) fpsT = now; fpsN++; if (now - fpsT > 1) { var f = fpsN / (now - fpsT); fpsN = 0; fpsT = now;
        if (f < 45) { slowFor++; fastFor = 0; if (slowFor >= 2 && k > .35) { k *= .75; slowFor = 0; } } else { slowFor = 0; if (f > 55 && k < 1 && ++fastFor >= 4) { k = Math.min(1, k + .1); fastFor = 0; } } }
      if (!paused) { update(dt); draw(); }
    }
    var paused = false;
    function update(dt) {
      t += dt;
      scrollV *= Math.exp(-dt * 4);
      var c0 = centre(), i, p;
      /* beat onset: a breath outward from the centre and a few sparkles */
      if (beat > .62 && beatPrev < .4) for (i = 0; i < P.length; i++) { p = P[i]; if (p.mode !== "amb") continue; var dx = p.x - c0[0], dy = p.y - c0[1], L = Math.hypot(dx, dy) || 1; p.kx += dx / L * 70 * beat; p.ky += dy / L * 70 * beat; if (Math.random() < .22) p.flash = 1; }
      beatPrev = beat;
      /* spawn */
      var amb = 0, hn = 0; for (i = 0; i < P.length; i++) { if (P[i].mode === "amb") amb++; else if (P[i].mode === "hold") hn++; }
      var want = motion ? Math.round([45, 80, 120][lvl] * k) : 0;
      for (i = 0; i < 4 && amb < want && P.length < caps(); i++, amb++) spawnAmb();
      if (hold) {
        var el = clock() - hold.t0; if (!hold.on && el > .4) hold.on = true;
        if (hold.on) { hold.c = Math.min(1, (el - .4) / 2.6);
          var hmax = Math.round((36 + 150 * hold.c) * Math.max(.45, k) * (lvl ? 1 : .6)); hold.acc = (hold.acc || 0) + dt * (30 + 160 * hold.c);
          while (hold.acc > 1 && hn < hmax && P.length < caps() + 120) { spawnHold(); hn++; hold.acc--; }
          if (world === "core" && hold.c > .15) { hold.nb -= dt; if (hold.nb <= 0) { hold.nb = rnd(.12, .35) * (1.3 - hold.c);
            var tg = null; for (i = P.length - 1; i >= 0; i--) if (P[i].mode === "hold" && Math.random() < .2) { tg = P[i]; break; }
            if (tg) bolt(hold.x, hold.y, tg.x, tg.y, .12, pick("core")); } } }
      }
      /* move */
      for (i = P.length - 1; i >= 0; i--) {
        p = P[i]; p.px = p.x; p.py = p.y; p.dt = dt;
        if (p.mode === "hold") { if (hold) { moveHold(p, dt); p.age += dt; } else { p.mode = "fx"; p.life = p.age + .3; } }
        else if (p.mode === "amb") { moveAmb(p, dt); p.age += dt; }
        else { if (p.drag) { var dk = Math.exp(-p.drag * dt); p.vx *= dk; p.vy *= dk; } p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.sz += p.grow * dt; p.age += dt;
          if (p.twin === 2) p.hx = (p.hx0 || 0) + Math.sin(p.age * 11 + p.ph) * (10 + p.age * 26); }
        p.flash *= Math.exp(-dt * 5);
        var m = 160 + (p.shape === "mist" ? p.sz : 0);
        if (p.age >= p.life || p.x < -m || p.x > Wd + m || p.y < -m || p.y > Ht + m) { if (p.mode !== "hold") P.splice(i, 1); }
      }
      for (i = bolts.length - 1; i >= 0; i--) { bolts[i].age += dt; if (bolts[i].age > bolts[i].life) bolts.splice(i, 1); }
    }
    function draw() {
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var bm = 1 + .9 * beat, sm = 1 + .3 * beat, i, p;
      /* Chat: the dark core under the disk */
      if (hold && hold.on && world === "chat") {
        var hz = 9 + 16 * hold.c; cx.globalCompositeOperation = "source-over"; cx.globalAlpha = .85 * Math.min(1, hold.c * 3 + .3);
        cx.fillStyle = "#000"; cx.beginPath(); cx.arc(hold.x, hold.y, hz * 1.15, 0, TAU); cx.fill();
      }
      cx.globalCompositeOperation = "lighter";
      if (hold && hold.on) {   /* the charge glows under the finger */
        var hc = hold.c, R = 30 + 60 * hc, gc = mixc(theme.a, theme.b, .5), gg = cx.createRadialGradient(hold.x, hold.y, 0, hold.x, hold.y, R * 1.6);
        var cs = Math.round(gc[0] * 255) + "," + Math.round(gc[1] * 255) + "," + Math.round(gc[2] * 255);
        gg.addColorStop(0, "rgba(" + cs + "," + (world === "chat" ? 0 : .35 * hc) + ")"); gg.addColorStop(world === "chat" ? .3 : .2, "rgba(" + cs + "," + .18 * hc + ")"); gg.addColorStop(1, "rgba(" + cs + ",0)");
        cx.globalAlpha = 1; cx.fillStyle = gg; cx.beginPath(); cx.arc(hold.x, hold.y, R * 1.6, 0, TAU); cx.fill();
        if (world === "chat") { cx.strokeStyle = "rgba(" + cs + "," + (.5 + .4 * hc) + ")"; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(hold.x, hold.y, (9 + 16 * hc) * 1.25, 0, TAU); cx.stroke(); }
        shape(hold.x, hold.y, hc);
      }
      for (i = 0; i < P.length; i++) {
        p = P[i];
        var env = p.mode === "amb" ? Math.sin(Math.min(1, p.age / p.life) * Math.PI) : p.mode === "hold" ? Math.min(1, p.age * 4) : Math.pow(1 - Math.min(1, p.age / p.life), 1.3);
        var depth = p.depth == null ? 1 : .45 + .55 * (p.depth + 1) / 2;
        var al = Math.min(1, p.a * env * depth * bm * (1 + p.flash * 1.5) * (p.hot ? 1 + p.hot : 1)); if (al < .01) continue;
        var s = p.sz * (p.shape === "mist" ? 1 : 3.2) * sm * (1 + p.flash * .8);
        cx.globalAlpha = al;
        var vx = (p.x - p.px), vy = (p.y - p.py), sp = Math.hypot(vx, vy) / Math.max(1e-3, p.dt || .016);
        if (p.shape !== "mist" && p.mode !== "hold" && sp > 260 && sp < 9000 && !p.twin) {   /* fast: a streak, its length from the speed */
          var L = Math.min(64, sp * .035), cc = p.c; sp = Math.hypot(vx, vy) || 1; cx.strokeStyle = "rgb(" + Math.round(cc[0] * 255) + "," + Math.round(cc[1] * 255) + "," + Math.round(cc[2] * 255) + ")";
          cx.lineWidth = Math.max(.8, p.sz * .55); cx.lineCap = "round"; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - vx / sp * L, p.y - vy / sp * L); cx.stroke();
        }
        if (p.twin) {   /* Parallel: one point, two mirrored strands */
          var bx = p.x, hx = p.hx || 0;
          cx.drawImage(p.spr, bx + hx - s / 2, p.y - s / 2, s, s);
          cx.globalAlpha = al * (p.depth == null ? 1 : .45 + .55 * (1 - p.depth) / 2) / depth;
          cx.drawImage(p.spr, bx - hx - s / 2, p.y - s / 2, s, s);
        } else cx.drawImage(p.spr, p.x - s / 2, p.y - s / 2, s, s);
      }
      /* lightning */
      for (i = 0; i < bolts.length; i++) {
        var b = bolts[i], ba = 1 - b.age / b.life, c = b.c, rgb = Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255);
        cx.globalAlpha = 1; cx.lineCap = "round"; cx.lineJoin = "round";
        [[6, "rgba(" + rgb + "," + .18 * ba + ")"], [2.2, "rgba(" + rgb + "," + .7 * ba + ")"], [1, "rgba(255,255,255," + .9 * ba + ")"]].forEach(function (L) {
          cx.lineWidth = L[0]; cx.strokeStyle = L[1]; cx.beginPath(); b.pts.forEach(function (q, j) { if (j) cx.lineTo(q[0], q[1]); else cx.moveTo(q[0], q[1]); }); cx.stroke(); });
      }
      cx.globalAlpha = 1; cx.globalCompositeOperation = "source-over";
    }
    /* the lines each world's charge is built on, so its form reads even with few particles */
    function rgba(c, a) { return "rgba(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + "," + a + ")"; }
    function ell(x, y, a, b, rot, s0, s1) { cx.beginPath(); cx.ellipse(x, y, Math.max(.1, a), Math.max(.1, b), rot, s0 || 0, s1 == null ? TAU : s1); cx.stroke(); }
    function shape(x, y, c) {
      var ca = theme.a, cb = theme.b, w = world, i;
      cx.lineCap = "round";
      if (w === "meridian") {   /* a wire globe turning: six meridians and the equator */
        var R = 22 + 48 * c; cx.lineWidth = 1.2;
        for (i = 0; i < 6; i++) { var lam = i / 6 * Math.PI + t * (.9 + c * 1.4), ex = Math.abs(Math.cos(lam)) * R; cx.strokeStyle = rgba(i % 2 ? ca : cb, .16 + .3 * c); ell(x, y, ex, R, 0); }
        cx.strokeStyle = rgba(ca, .25 + .35 * c); ell(x, y, R, R * .22, 0); cx.strokeStyle = rgba(cb, .3 + .4 * c); cx.lineWidth = 1.6; ell(x, y, R, R, 0);
      } else if (w === "core") {   /* three orbits */
        cx.lineWidth = 1;
        for (i = 0; i < 3; i++) { var Rc = (24 + 46 * c) * (1 + i * .18); cx.strokeStyle = rgba(i === 1 ? cb : ca, .14 + .3 * c); ell(x, y, Rc, Rc * .34, i * 1.047 + t * .3); }
      } else if (w === "chat") {   /* the disk, brighter on the side coming toward you */
        var Rd = 22 + 70 * c, hz = 9 + 16 * c;
        for (i = 0; i < 4; i++) { var rr = hz * 1.6 + (Rd - hz * 1.6) * i / 3; cx.lineWidth = 5 - i; cx.strokeStyle = rgba(mixc(cb, [1, 1, 1], .3 - i * .08), (.32 - i * .06) * (.4 + c)); ell(x, y, rr, rr * .36, -.35, 0, Math.PI); }
        for (i = 0; i < 4; i++) { var r2 = hz * 1.6 + (Rd - hz * 1.6) * i / 3; cx.lineWidth = 3 - i * .6; cx.strokeStyle = rgba(ca, (.16 - i * .03) * (.4 + c)); ell(x, y, r2, r2 * .36, -.35, Math.PI, TAU); }
      } else if (w === "gaming") {   /* two crystal rings, cut into facets */
        cx.lineWidth = 2.2;
        for (i = 0; i < 2; i++) { var A = (28 + 54 * c) * (1 + i * .2); cx.setLineDash([7 + 5 * c, 5]); cx.lineDashOffset = (i ? 1 : -1) * t * 40; cx.strokeStyle = rgba(i ? cb : ca, .3 + .45 * c); ell(x, y, A, A * (.3 + i * .1), i ? -.55 : .5); }
        cx.setLineDash([]);
      } else if (w === "parallel") {   /* the two strands */
        var H = 40 + 130 * c, Ah = 12 + 24 * c; cx.lineWidth = 1.6;
        for (var sgn = -1; sgn <= 1; sgn += 2) { cx.strokeStyle = rgba(sgn < 0 ? ca : cb, .22 + .4 * c); cx.beginPath();
          for (i = 0; i <= 40; i++) { var s1 = i / 20 - 1, ph = s1 * TAU * 1.5 + t * 3, px = x + sgn * Ah * Math.sin(ph), py = y + s1 * H / 2; if (i) cx.lineTo(px, py); else cx.moveTo(px, py); } cx.stroke(); }
      } else {   /* the nebula condensing */
        for (i = 0; i < 3; i++) { var an = t * .5 + i * 2.1, rx = x + Math.cos(an) * (8 + 14 * (1 - c)), ry = y + Math.sin(an) * (6 + 10 * (1 - c)), Rn = 26 + 40 * c;
          var g = cx.createRadialGradient(rx, ry, 0, rx, ry, Rn); g.addColorStop(0, rgba(i % 2 ? cb : ca, .28 * (.3 + c))); g.addColorStop(1, rgba(ca, 0)); cx.fillStyle = g; cx.beginPath(); cx.arc(rx, ry, Rn, 0, TAU); cx.fill(); }
      }
    }
    requestAnimationFrame(frame);

    return {
      __sim: function (sec, fps) { paused = true; var st = 1 / (fps || 60), n = Math.round(sec / st); for (var j = 0; j < n; j++) { simOff += st; update(st); } draw(); },
      __run: function () { paused = false; },
      setWorld: function (w) { if (w !== world) world = w || "meridian"; },
      setTheme: function (th) { theme = th; },
      setBeat: function (v) { beat = Math.max(0, Math.min(1, v || 0)); },
      scroll: function (v) { scrollV = scrollV * .6 + v * .4; },
      tap: tap, holdStart: holdStart, holdMove: holdMove, holdEnd: holdEnd, holdCancel: holdCancel,
      setLevel: function (n) { lvl = n; size(); }, setMotion: function (m) { motion = !!m; },
      charge: function () { return hold && hold.on ? Math.max(.001, hold.c) : 0; },
      state: function () { return { n: P.length, world: world, k: k, hold: hold ? { on: hold.on, c: hold.c } : null, bolts: bolts.length }; }
    };
  }
  W.MeridianParticles = { create: create };
})(window, document);
