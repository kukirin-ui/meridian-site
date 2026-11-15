/* Meridian motion engine (2.5.2): one way every scene reads the phone's movement.
   - Your position when a screen opens (or comes back, or Motion turns on) is zero. Everything after is the difference.
   - Tilt is read from gravity, which every phone measures well. Turning (the part of a movement that goes around the
     vertical) comes from the browser's heading, which on many phones is the compass or a drifting gyroscope: it is
     used for quick movements only: anything slower than 5 degrees a second is ignored, the rest fades back to zero
     in about 3 seconds, and a jump in the heading is ignored.
     So a compass that wanders, a magnet nearby or turning round in a chair no longer tilts the picture.
   - The phone's full 3D orientation is used, so lying down, on your side or flat overhead all behave the same, and
     the result is turned to match the screen when the phone is in landscape.
   - The first readings after the sensor starts are skipped (some browsers send zeros first), and a single reading
     that is wildly off is dropped.
   - Dead zone of about 1 degree, low-pass filter, step limit against jerks.
   - Hold a new position for a few seconds and the zero slowly moves there. Double tap the background to recentre.
   window.MfxMotion.get() -> { x, y, z } in -1..1 (x = left/right, y = forward/back, z = twist). 0 when Motion is off. */
(function () {
  'use strict';
  if (window.MfxMotion) return;
  var D2R = Math.PI / 180, RANGE = 25 * D2R;   /* full effect at this many degrees */
  var q0 = null, q = null, g0 = null, yaw0 = 0, yawPrev = 0, gPrev = null, seen = 0, bad = 0;
  var raw = { x: 0, y: 0, z: 0 }, out = { x: 0, y: 0, z: 0 }, lastT = 0, steadyAt = 0, last = { x: 0, y: 0 }, settling = false, on = true;
  function quat(a, b, g) {   /* W3C device orientation, Z-X'-Y'' */
    var x = (b || 0) * D2R / 2, y = (g || 0) * D2R / 2, z = (a || 0) * D2R / 2;
    var cX = Math.cos(x), cY = Math.cos(y), cZ = Math.cos(z), sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
    return [cX * cY * cZ - sX * sY * sZ, sX * cY * cZ - cX * sY * sZ, cX * sY * cZ + sX * cY * sZ, cX * cY * sZ + sX * sY * cZ];
  }
  function mul(a, b) { return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]]; }
  function conj(a) { return [a[0], -a[1], -a[2], -a[3]]; }
  function norm(a) { var n = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]) || 1; return [a[0] / n, a[1] / n, a[2] / n, a[3] / n]; }
  function slerp(a, b, t) {
    var d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
    if (d > .9995) return norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
    var th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
  }
  function clamp(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  /* which way is down, in the phone's own axes: this does not depend on the heading */
  function down(p) { return [-2 * (p[1] * p[3] - p[0] * p[2]), -2 * (p[2] * p[3] + p[0] * p[1]), -(1 - 2 * (p[1] * p[1] + p[2] * p[2]))]; }
  function between(a, b) { var c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; return Math.atan2(Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]); }
  /* how far the phone has turned around the vertical since the zero */
  function yawNow() {
    var d = mul(conj(q0), q), p = d[1] * g0[0] + d[2] * g0[1] + d[3] * g0[2];
    return wrap(2 * Math.atan2(p, d[0]));
  }
  /* rotation since the zero, in the phone's own axes: x = around the phone's side axis (forward/back), y = around its long axis (left/right) */
  function delta(dt) {
    var g = down(q), c = [g0[1] * g[2] - g0[2] * g[1], g0[2] * g[0] - g0[0] * g[2], g0[0] * g[1] - g0[1] * g[0]];
    var s = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]), tilt = Math.atan2(s, g0[0] * g[0] + g0[1] * g[1] + g0[2] * g[2]), k = s > 1e-9 ? -tilt / s : 0;
    var yaw = yawNow(), step = wrap(yaw - yawPrev), moved = gPrev ? between(gPrev, g) : 0;
    if (Math.abs(step) > 20 * D2R && moved < 6 * D2R) yaw0 = wrap(yaw0 + step);   /* the heading jumped while the phone did not move: not a movement */
    else if (Math.abs(step) < 5 * D2R * dt) yaw0 = wrap(yaw0 + step);              /* slower than 5 degrees a second: drift, or the user turning round */
    yawPrev = yaw; gPrev = g;
    yaw0 = wrap(yaw0 + wrap(yaw - yaw0) * (1 - Math.exp(-dt / 3)));              /* turning fades back to zero */
    var y = wrap(yaw - yaw0), yk = Math.max(0, Math.min(1, (Math.abs(y) - 1 * D2R) / (2 * D2R)));   /* under about 1 degree it is sensor noise */
    y = Math.max(-RANGE, Math.min(RANGE, y)) * yk * yk * (3 - 2 * yk);
    return { rx: c[0] * k + y * g0[0], ry: c[1] * k + y * g0[1], rz: c[2] * k + y * g0[2], ang: Math.max(tilt, Math.abs(y)), tilt: tilt };
  }
  function screenAngle() {
    var a = 0;
    try { a = window.screen && screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0); } catch (e) { a = 0; }
    return ((Math.round(a / 90) * 90) % 360 + 360) % 360;
  }
  function zero() { q0 = null; g0 = null; seen = 0; bad = 0; settling = false; out.x = out.y = out.z = raw.x = raw.y = raw.z = 0; }
  function onEvent(e) {
    if (!on || e.beta == null || e.gamma == null) return;
    var now = performance.now();
    if (!q0) {
      /* some browsers send a reading of all zeros, or two stale ones, before the sensor has started */
      if (!e.alpha && !e.beta && !e.gamma && seen < 12) { seen++; return; }
      if (++seen < 3) return;
      q = norm(quat(e.alpha, e.beta, e.gamma)); q0 = q; g0 = down(q); gPrev = g0; yaw0 = yawPrev = 0; lastT = now; steadyAt = now;
      out.x = out.y = out.z = raw.x = raw.y = raw.z = 0; return;
    }
    var qn = norm(quat(e.alpha, e.beta, e.gamma)), gn = down(qn);
    /* one reading far from the last (a sensor glitch): dropped; three in a row are believed */
    if (gPrev && between(gPrev, gn) > 50 * D2R && bad < 2) { bad++; return; }
    bad = 0; q = qn;
    var dt = lastT ? Math.min(.2, (now - lastT) / 1000) : .016; lastT = now;
    var dl = delta(dt);
    var dz = function (v) { var a2 = Math.abs(v), z = .05; return a2 <= z ? 0 : (v < 0 ? -1 : 1) * (a2 - z) / (1 - z); };
    /* the phone's axes, turned to the screen's: in landscape the long axis lies sideways */
    var ax = dl.ry, ay = dl.rx, sa = screenAngle();
    if (sa === 90) { ax = dl.rx; ay = -dl.ry; } else if (sa === 270) { ax = -dl.rx; ay = dl.ry; } else if (sa === 180) { ax = -dl.ry; ay = -dl.rx; }
    var nx = dz(clamp(ax / RANGE)), ny = dz(clamp(ay / RANGE)), nz = dz(clamp(dl.rz / RANGE));   /* z: the twist around the screen's axis */
    /* jerk limit per reading */
    raw.x += Math.max(-.3, Math.min(.3, nx - raw.x)); raw.y += Math.max(-.3, Math.min(.3, ny - raw.y)); raw.z += Math.max(-.3, Math.min(.3, nz - raw.z));
    /* low-pass */
    var a = 1 - Math.exp(-dt / .12);
    out.x += (raw.x - out.x) * a; out.y += (raw.y - out.y) * a; out.z += (raw.z - out.z) * a;
    /* new posture held for a while: the zero follows it slowly */
    if (Math.abs(raw.x - last.x) > .04 || Math.abs(raw.y - last.y) > .04) { steadyAt = now; last.x = raw.x; last.y = raw.y; }
    if (!settling && now - steadyAt > 2000 && dl.tilt > 10 * D2R) settling = true;
    if (settling) { q0 = slerp(q0, q, Math.min(1, dt * 1.6)); g0 = down(q0); yaw0 = wrap(yaw0 * (1 - Math.min(1, dt * 1.6))); yawPrev = yawNow(); if (dl.tilt < 1.5 * D2R) settling = false; }
  }
  function recenter() { zero(); seen = 2; steadyAt = performance.now(); }
  function motionOn() {
    try { var m = (JSON.parse(localStorage.getItem('m-prefs') || '{}') || {}).motion; if (m === 'reduce' || m === 'off') return false; if (m === 'full' || m === 'on') return true; } catch (e) { }
    return !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function setEnabled(v) {
    v = !!v; if (v === on) return; on = v;
    if (on) { zero(); window.addEventListener('deviceorientation', onEvent); }     /* the next steady reading becomes zero */
    else { window.removeEventListener('deviceorientation', onEvent); zero(); }
  }
  on = false; setEnabled(motionOn());
  window.addEventListener('storage', function (e) { if (e.key === 'm-prefs' || e.key === 'm-motion') setEnabled(motionOn()); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { setEnabled(motionOn()); zero(); } });   /* back on screen: new zero */
  /* the phone was turned to landscape or back: the axes changed, so start from a new zero */
  try { if (window.screen && screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', zero); } catch (e) { }
  window.addEventListener('orientationchange', zero);
  /* double tap on the background (not on a button, field or link): recentre */
  var lastTap = 0;
  document.addEventListener('pointerup', function (e) {
    var t = e.target; if (t && t.closest && t.closest('button,a,input,textarea,select,label,[role=button],[contenteditable]')) return;
    var now = performance.now(); if (now - lastTap < 320) { recenter(); lastTap = 0; } else lastTap = now;
  }, { passive: true });
  window.MfxMotion = {
    get: function () { return on ? { x: out.x, y: out.y, z: out.z } : { x: 0, y: 0, z: 0 }; },
    recenter: recenter, refresh: function () { setEnabled(motionOn()); }, enabled: function () { return on; },
    _feed: onEvent   /* tests */
  };
})();
