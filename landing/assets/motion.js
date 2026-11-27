/* AD Motion Engine — лёгкий контроллер качества и отрисовка Altai Field.
   MASTER_DESIGN_SPEC §13–14. Без WebGL: Canvas 2D, профили Lite/High/Ultra.
   Core = статический SVG в разметке, этот модуль к нему не прикасается.

   Правила:
   - старт с Lite (самый лёгкий из «живых» профилей);
   - окно измерения 3 с, p95 кадрового интервала;
   - понижение при устойчивой перегрузке (3 окна подряд), мгновенно при
     критической (p95 > 40 мс);
   - повышение после ≥3 стабильных окон и cooldown 10 с;
   - reduced motion / Save-Data / без Canvas 2D → Core (только SVG);
   - вкладка скрыта или поле вне viewport → циклы остановлены;
   - ошибки (нет сети, canvas недоступен) → Core. */
(function () {
  if (window.__AD_MOTION__) return;

  var FIELD_URL = "/assets/field/altai-field-lite.json";
  var HIGH_URL = "/assets/field/altai-field-high.json";
  var DPR_CAP = { LITE: 1, HIGH: 1.5, ULTRA: 2 };
  var WINDOW_MS = 3000;
  var OVERLOAD_P95 = 22;   // p95 кадрового интервала, мс — признак перегрузки
  var CRITICAL_P95 = 40;   // мгновенное понижение
  var STABLE_P95 = 18;     // порог стабильности для повышения
  var UPGRADE_COOLDOWN = 10000;

  var state = {
    profile: "CORE",
    canvasActive: false,
    driftActive: false,
    running: false,
    reduced: false,
    saveData: false,
    error: null,
  };

  var api = {
    getState: function () { return state; },
  };
  window.__AD_MOTION__ = api;

  function supports2d() {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext && c.getContext("2d"));
    } catch (e) { return false; }
  }

  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  state.reduced = !!(mq && mq.matches);
  state.saveData = !!(navigator.connection && navigator.connection.saveData);

  var field = document.querySelector("[data-altai-field]");
  if (!field || state.reduced || state.saveData || !supports2d()) {
    return; // Core: статический SVG остаётся единственным представлением
  }

  var canvas = field.querySelector("canvas.field-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "field-canvas";
    canvas.setAttribute("aria-hidden", "true");
    field.appendChild(canvas);
  }

  var cached = {};
  function fetchJson(url) {
    if (!cached[url]) {
      cached[url] = fetch(url)
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .catch(function (e) { delete cached[url]; throw e; });
    }
    return cached[url];
  }

  var geometry = null;
  var viewBox = null;
  var dpr = 1;
  var width = 0, height = 0;
  var needsDraw = false;

  function setProfile(p) {
    if (state.profile === p) return;
    state.profile = p;
    var dprCap = DPR_CAP[p] || 1;
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    state.driftActive = p === "ULTRA";
    canvas.classList.toggle("ultra-drift", state.driftActive);
    needsDraw = true;
    if (p === "CORE") {
      state.canvasActive = false;
      canvas.style.display = "none";
      stopLoop();
      return;
    }
    state.canvasActive = true;
    canvas.style.display = "";
    ensureGeometry(p);
    startLoop();
  }

  function ensureGeometry(p) {
    var url = p === "LITE" ? FIELD_URL : HIGH_URL;
    fetchJson(url).then(function (data) {
      geometry = data.polylines;
      viewBox = data.viewBox;
      needsDraw = true;
    }).catch(function (e) {
      state.error = "geometry: " + e.message;
      setProfile("CORE");
    });
  }

  function draw() {
    if (!geometry || !viewBox) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) { state.error = "no 2d context"; setProfile("CORE"); return; }
    var css = getComputedStyle(field);
    var base = css.getPropertyValue("--border-strong").trim() || "#474747";
    var lime = css.getPropertyValue("--lime").trim() || "#B2F230";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Та же геометрия, что у <img> с object-fit: cover — масштаб по
    // большей стороне, центрирование, чтобы контуры совпадали пиксель в пиксель.
    var scale = Math.max(canvas.width / viewBox.w, canvas.height / viewBox.h);
    var ox = (canvas.width - viewBox.w * scale) / 2;
    var oy = (canvas.height - viewBox.h * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (var i = 0; i < geometry.length; i++) {
      var line = geometry[i];
      ctx.strokeStyle = i === 1 || i % 13 === 5 ? lime : base;
      ctx.globalAlpha = i === 1 || i % 13 === 5 ? 0.55 : 1;
      ctx.beginPath();
      ctx.moveTo(line[0], line[1]);
      for (var k = 2; k < line.length; k += 2) ctx.lineTo(line[k], line[k + 1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    needsDraw = false;
  }

  function resize() {
    var rect = field.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === width && h === height) return;
    width = w; height = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    needsDraw = true;
  }

  /* ── Измерительный цикл (rAF) ───────────────────────── */
  var frames = [];
  var lastT = 0;
  var overloadWindows = 0;
  var stableWindows = 0;
  var lastUpgradeAt = 0;
  var rafId = 0;

  function tick(t) {
    if (!state.running) return;
    rafId = requestAnimationFrame(tick);
    if (lastT > 0) frames.push(t - lastT);
    lastT = t;
    if (t - frames._t0 >= WINDOW_MS || frames.length > 600) {
      var sorted = frames.slice().sort(function (a, b) { return a - b; });
      var p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      frames.length = 0;
      frames._t0 = t;
      evaluate(p95, t);
    }
    if (needsDraw) draw();
  }

  function evaluate(p95, t) {
    if (p95 > CRITICAL_P95) { downgrade(); return; }
    if (p95 > OVERLOAD_P95) {
      overloadWindows++;
      stableWindows = 0;
      if (overloadWindows >= 3) { downgrade(); }
      return;
    }
    overloadWindows = 0;
    stableWindows++;
    if (stableWindows >= 3 && t - lastUpgradeAt >= UPGRADE_COOLDOWN) {
      upgrade();
      lastUpgradeAt = t;
      stableWindows = 0;
    }
  }

  function downgrade() {
    overloadWindows = 0;
    stableWindows = 0;
    if (state.profile === "ULTRA") setProfile("HIGH");
    else if (state.profile === "HIGH") setProfile("LITE");
    else if (state.profile === "LITE") setProfile("CORE");
  }

  function upgrade() {
    if (state.profile === "LITE") setProfile("HIGH");
    else if (state.profile === "HIGH") setProfile("ULTRA");
  }

  function startLoop() {
    if (state.running) return;
    state.running = true;
    frames.length = 0;
    frames._t0 = 0;
    lastT = 0;
    resize();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    state.running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ── Видимость и viewport ───────────────────────────── */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopLoop();
    else if (state.canvasActive) startLoop();
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      var visible = entries[0].isIntersecting;
      if (!visible) stopLoop();
      else if (state.canvasActive) startLoop();
    }, { threshold: 0 });
    io.observe(field);
  }

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (state.canvasActive) { resize(); draw(); } }, 120);
  });

  if (mq && mq.addEventListener) {
    mq.addEventListener("change", function (e) {
      if (e.matches) { state.reduced = true; setProfile("CORE"); }
    });
  }

  /* ── Редакционные появления (только при включённом JS) ── */
  var revealItems = document.querySelectorAll("[data-reveal]");
  if (revealItems.length && !state.reduced) {
    document.documentElement.classList.add("js-anim");
    revealItems.forEach(function (el) { el.classList.add("reveal-hidden"); });
    if ("IntersectionObserver" in window) {
      var rio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-in");
            rio.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      revealItems.forEach(function (el) { rio.observe(el); });
    } else {
      revealItems.forEach(function (el) { el.classList.add("reveal-in"); });
    }
  }

  setProfile("LITE");
})();
