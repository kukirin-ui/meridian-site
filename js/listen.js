/* Listen mode: the device's own voice reads a part of the page, paragraph by paragraph (free, offline where the
   system voice is offline, no keys). The paragraph being read lights up and stays in view; Pause, Stop, or tap any
   paragraph to read from there. */
(function (W, D) {
  "use strict";
  var S = W.speechSynthesis;
  function clean(t) { return String(t || "").replace(/\s+/g, " ").replace(/\s·\s/g, ", ").replace(/[↯‹›]/g, "").trim(); }
  function chunks(t) {   /* short pieces: some voices stop on long utterances */
    var out = [], parts = t.match(/[^.!?;:]+[.!?;:]*\s*/g) || [t], cur = "";
    parts.forEach(function (p) { if ((cur + p).length > 190 && cur) { out.push(cur.trim()); cur = p; } else cur += p; });
    if (cur.trim()) out.push(cur.trim()); return out;
  }
  var voice = null;
  function pickVoice() {
    if (!S) return; var vs = S.getVoices() || [], best = null, score = -1;
    vs.forEach(function (v) { var l = (v.lang || "").toLowerCase(), s = 0; if (l.indexOf("en") !== 0) return;
      if (l === "en-us" || l === "en_us") s += 3; else if (l === "en-gb" || l === "en_gb") s += 2; else s += 1;
      if (/google|natural|neural|premium|enhanced|samantha|daniel/i.test(v.name)) s += 3; if (v.localService) s += 1; if (s > score) { score = s; best = v; } });
    voice = best;
  }
  if (S) { pickVoice(); try { S.addEventListener("voiceschanged", pickVoice); } catch (e) { S.onvoiceschanged = pickVoice; } }

  function attach(o) {
    var box = o.box, root = o.root, reduce = W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!S || !W.SpeechSynthesisUtterance) { if (box) box.hidden = true; return null; }
    box.innerHTML = '<button type="button" class="lsn-go" aria-pressed="false"><span class="lsn-ic" aria-hidden="true">🔊</span><span class="lsn-t">Listen</span></button>' +
      '<button type="button" class="lsn-stop" hidden aria-label="Stop reading">■</button>';
    var go = box.querySelector(".lsn-go"), stop = box.querySelector(".lsn-stop"), lab = box.querySelector(".lsn-t"), ic = box.querySelector(".lsn-ic");
    var units = [], idx = 0, state = "idle", run = 0, curEl = null;
    function paint() {
      go.setAttribute("aria-pressed", state === "play" ? "true" : "false"); stop.hidden = state === "idle";
      lab.textContent = state === "play" ? "Pause" : state === "pause" ? "Resume" : "Listen"; ic.textContent = state === "play" ? "❚❚" : "🔊";
      box.classList.toggle("on", state !== "idle");
      /* while reading, the controls float at the bottom of the screen (moved to <body>: a card's blur would hold them inside it) */
      if (state !== "idle" && box.parentNode !== D.body) { home = [box.parentNode, box.nextSibling]; D.body.appendChild(box); }
      else if (state === "idle" && home) { home[0].insertBefore(box, home[1]); home = null; }
    }
    var home = null;
    function mark(el) {
      if (curEl) curEl.classList.remove("speaking"); curEl = el; if (!el) return; el.classList.add("speaking");
      var d = el.closest && el.closest("details"); if (d && !d.open) d.open = true;
      var r = el.getBoundingClientRect(), h = W.innerHeight; if (r.top < h * .14 || r.bottom > h * .78) el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
    function speak(i) {
      run++; var my = run, busy = false; try { busy = S.speaking || S.pending; S.cancel(); } catch (e) {}
      if (i >= units.length) { end(); return; }
      idx = i; state = "play"; paint(); mark(units[i].el);
      var parts = chunks(units[i].text), k = 0;
      function next() {
        if (my !== run) return;
        if (k >= parts.length) { speak(i + 1); return; }
        var u = new SpeechSynthesisUtterance(parts[k++]); if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-US";
        u.rate = 1; u.pitch = 1; u.onend = function () { if (my === run) next(); }; u.onerror = function (e) { if (my === run && e.error !== "interrupted" && e.error !== "canceled") next(); };
        S.speak(u);
      }
      /* some Android voices drop a speak() that follows cancel() at once: give the cancel a moment */
      if (busy) setTimeout(next, 120); else next();
    }
    function end() { run++; try { S.cancel(); } catch (e) {} state = "idle"; idx = 0; mark(null); paint(); if (o.onStop) o.onStop(); }
    go.addEventListener("click", function () {
      if (state === "play") { run++; try { S.cancel(); } catch (e) {} state = "pause"; paint(); return; }
      if (state === "idle") { units = o.units(); idx = 0; if (o.onStart) o.onStart(); }
      speak(idx);
    });
    stop.addEventListener("click", end);
    /* tap a paragraph while listening: read from there */
    root.addEventListener("click", function (e) {
      if (state === "idle" || e.target.closest("a, button, summary, .lsn")) return;
      for (var i = 0; i < units.length; i++) if (units[i].el === e.target || units[i].el.contains(e.target)) { speak(i); return; }
    });
    D.addEventListener("visibilitychange", function () { if (D.hidden && state === "play") { run++; try { S.cancel(); } catch (e) {} state = "pause"; paint(); } });
    W.addEventListener("pagehide", function () { try { S.cancel(); } catch (e) {} });
    paint();
    return { stop: end, state: function () { return { state: state, idx: idx, n: units.length, text: units[idx] && units[idx].text }; } };
  }
  /* the readable pieces under a root, in page order */
  function collect(root, sel, skip) {
    var out = [];
    Array.prototype.forEach.call(root.querySelectorAll(sel), function (el) {
      if (skip && el.closest(skip)) return;
      var t;
      if (el.matches(".stat")) t = (el.querySelector("b") || {}).getAttribute ? el.querySelector("b").getAttribute("data-count") + " " + clean(el.querySelector("span").textContent) : clean(el.textContent);
      else if (el.matches("details")) t = clean(el.querySelector("summary").textContent) + ". " + clean(el.querySelector("div").textContent);
      else if (el.matches(".chips")) t = "Built with: " + Array.prototype.map.call(el.children, function (c) { return clean(c.textContent); }).join(", ") + ".";
      else if (el.matches(".app, .lic > div, .help > div, .road li")) t = Array.prototype.map.call(el.children, function (c) { return clean(c.textContent).replace(/[.:]?$/, "."); }).join(" ");
      else { var c = el.cloneNode(true); Array.prototype.forEach.call(c.querySelectorAll(".n, .lsn"), function (x) { x.remove(); }); t = clean(c.textContent); }
      if (t) out.push({ el: el, text: t });
    });
    return out;
  }
  W.MeridianListen = { attach: attach, collect: collect, supported: !!S };
})(window, document);
