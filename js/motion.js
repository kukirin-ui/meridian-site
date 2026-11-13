/* Meridian motion engine (2.3.3): one way every scene reads the phone's movement.
   - Your position when a screen opens (or comes back, or Motion turns on) is zero. Everything after is the difference.
   - Uses the phone's full 3D orientation (quaternion), not the two tilt angles, so lying down, on your side, upside down
     or flat overhead all behave the same (no sudden flips).
   - Dead zone of about 1 degree, low-pass filter on the sensor, step limit against jerks, clamp at about 25 degrees.
   - Hold a new position for about 2 s and the zero slowly moves there. Double tap the background to recentre at once.
   window.MfxMotion.get() -> { x, y, z } in -1..1 (x = left/right, y = forward/back, z = twist). 0 when Motion is off. */
(function () {
  'use strict';
  if (window.MfxMotion) return;
  var D2R = Math.PI / 180, RANGE = 15 * D2R;   /* full effect at 15 degrees */
  var q0 = null, q = null, raw = { x: 0, y: 0, z: 0 }, out = { x: 0, y: 0, z: 0 }, lastT = 0, steadyAt = 0, last = { x: 0, y: 0 }, settling = false, on = true;
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
  /* rotation since the zero, in the phone's own axes: x = around the phone's side axis (forward/back), y = around its long axis (left/right) */
  function delta() {
    var d = mul(conj(q0), q); if (d[0] < 0) d = [-d[0], -d[1], -d[2], -d[3]];
    var s = Math.sqrt(d[1] * d[1] + d[2] * d[2] + d[3] * d[3]), ang = 2 * Math.atan2(s, d[0]), k = s > 1e-6 ? ang / s : 2;
    return { rx: d[1] * k, ry: d[2] * k, rz: d[3] * k, ang: ang };
  }
  function onEvent(e) {
    if (!on || e.beta == null || e.gamma == null) return;
    q = norm(quat(e.alpha, e.beta, e.gamma));
    var now = performance.now(), dt = lastT ? Math.min(.2, (now - lastT) / 1000) : .016; lastT = now;
    if (!q0) { q0 = q; out.x = out.y = out.z = raw.x = raw.y = raw.z = 0; steadyAt = now; return; }
    var dl = delta();
    var dz = function (v) { var a2 = Math.abs(v), z = .025; return a2 <= z ? 0 : (v < 0 ? -1 : 1) * (a2 - z) / (1 - z); };   /* about 1.2 degrees of rest */
    var nx = dz(clamp(dl.ry / RANGE)), ny = dz(clamp(dl.rx / RANGE)), nz = dz(clamp(dl.rz / RANGE));   /* z: the twist around the screen's axis */
    /* jerk limit: at most 0.3 of the range per reading */
    raw.x += Math.max(-.6, Math.min(.6, nx - raw.x)); raw.y += Math.max(-.6, Math.min(.6, ny - raw.y)); raw.z += Math.max(-.6, Math.min(.6, nz - raw.z));
    /* low-pass: about 120 ms time constant */
    var a = 1 - Math.exp(-dt / .07);
    out.x += (raw.x - out.x) * a; out.y += (raw.y - out.y) * a; out.z += (raw.z - out.z) * a;
    /* new posture held for 2 s: the zero follows it slowly */
    if (Math.abs(raw.x - last.x) > .04 || Math.abs(raw.y - last.y) > .04) { steadyAt = now; last.x = raw.x; last.y = raw.y; }
    if (!settling && now - steadyAt > 4000 && dl.ang > 10 * D2R) settling = true;
    if (settling) { q0 = slerp(q0, q, Math.min(1, dt * 1.6)); if (dl.ang < 1.5 * D2R) settling = false; }
  }
  function recenter() { q0 = q; raw.x = raw.y = raw.z = 0; settling = false; steadyAt = performance.now(); }
  function motionOn() {
    try { var m = (JSON.parse(localStorage.getItem('m-prefs') || '{}') || {}).motion; if (m === 'reduce' || m === 'off') return false; if (m === 'full' || m === 'on') return true; } catch (e) { }
    return !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function setEnabled(v) {
    v = !!v; if (v === on) return; on = v;
    if (on) { q0 = null; window.addEventListener('deviceorientation', onEvent); }     /* the next reading becomes zero */
    else { window.removeEventListener('deviceorientation', onEvent); out.x = out.y = out.z = raw.x = raw.y = raw.z = 0; }
  }
  on = false; setEnabled(motionOn());
  window.addEventListener('storage', function (e) { if (e.key === 'm-prefs' || e.key === 'm-motion') setEnabled(motionOn()); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { setEnabled(motionOn()); q0 = null; } });   /* back on screen: new zero */
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
