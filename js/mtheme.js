/* Meridian colour theme for the website: Meridian (the sign's blue-purple) first, then the apps' accent colours.
   One choice, kept in this browser only (meridian-site3.color), applied to every page. */
(function (W, D) {
  "use strict";
  var KEY = "meridian-site3";
  var PAL = {
    meridian: ["#48d8ff", "#b45cff"], cyan: ["#00D4FF", "#7AEEFF"], mint: ["#34d399", "#a7f3d0"], amber: ["#c4a46a", "#e4d2ae"],
    violet: ["#a78bfa", "#ddd6fe"], rose: ["#fb7185", "#fecdd3"], copper: ["#E07A3D", "#F6C7A1"], blue: ["#3B9EFF", "#BAE0FF"], teal: ["#22D3A6", "#9EF5DD"]
  };
  var ORDER = ["meridian", "cyan", "mint", "amber", "violet", "rose", "copper", "blue", "teal"];
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function current() { var c = read().color; return PAL[c] ? c : "meridian"; }
  function save(name) { var o = read(); o.color = name; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  var subs = [];
  function apply(name) {
    if (!PAL[name]) name = "meridian";
    var p = PAL[name], a = rgb(p[0]), b = rgb(p[1]), R = D.documentElement.style;
    R.setProperty("--cyan", p[0]); R.setProperty("--violet", p[1]);
    R.setProperty("--c1rgb", a.join(", ")); R.setProperty("--c2rgb", b.join(", "));
    if (name === "meridian") R.removeProperty("--ember"); else R.setProperty("--ember", p[0]);
    D.documentElement.classList.toggle("tinted", name !== "meridian");
    var t = { name: name, a: a.map(function (v) { return v / 255; }), b: b.map(function (v) { return v / 255; }), hex: p, tinted: name !== "meridian" };
    MT.now = t;
    subs.forEach(function (f) { try { f(t); } catch (e) {} });
    return t;
  }
  var MT = W.MeridianTheme = {
    PAL: PAL, ORDER: ORDER, now: null,
    set: function (name) { save(name); return apply(name); },
    on: function (f) { subs.push(f); if (MT.now) f(MT.now); },
    /* a row of colour circles: Meridian first */
    row: function (el) {
      ORDER.forEach(function (n) {
        var b = D.createElement("button"); b.type = "button"; b.className = "sw-c"; b.setAttribute("data-v", n);
        b.setAttribute("aria-label", n === "meridian" ? "Meridian blue-purple" : n);
        b.style.background = n === "meridian" ? "conic-gradient(from 210deg, " + PAL[n][0] + ", " + PAL[n][1] + ", " + PAL[n][0] + ")" : PAL[n][0];
        el.appendChild(b);
      });
      function paint() { Array.prototype.forEach.call(el.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === MT.now.name ? "true" : "false"); }); }
      el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; MT.set(b.getAttribute("data-v")); paint(); });
      paint();
    }
  };
  apply(current());
  W.addEventListener("storage", function (e) { if (e.key === KEY) apply(current()); });
})(window, document);
