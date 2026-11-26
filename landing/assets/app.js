(function () {
  var root = document.documentElement;

  /* ── Тема ─────────────────────────────────────────────── */
  function currentTheme() { return root.dataset.theme === "dark" ? "dark" : "light"; }
  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("adpulse-theme", next); } catch (e) {}
      btn.setAttribute("aria-label", next === "dark" ? "Светлая тема" : "Тёмная тема");
    });
  });

  /* ── Мобильное меню ───────────────────────────────────── */
  var menuBtn = document.querySelector("[data-menu-toggle]");
  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      document.body.classList.toggle("mobile-open");
    });
    document.querySelectorAll(".mobile-nav a, .nav a").forEach(function (link) {
      link.addEventListener("click", function () { document.body.classList.remove("mobile-open"); });
    });
  }

  /* ── Язык: Google Translate + язык браузера ───────────── */
  var LANG_MAP = {
    ru: "ru", en: "en", kk: "kk", kz: "kk", zh: "zh-CN", cn: "zh-CN",
    tr: "tr", de: "de", sv: "sv", ja: "ja"
  };
  function setTranslateCookie(lang) {
    document.cookie = "googtrans=/ru/" + lang + ";path=/;max-age=31536000;SameSite=Lax";
  }
  function browserLang() {
    var raw = (navigator.language || navigator.userLanguage || "ru").toLowerCase();
    return LANG_MAP[raw.split("-")[0]] || "ru";
  }
  function ensureTranslateScript() {
    if (document.getElementById("google-translate-script")) return;
    var holder = document.createElement("div");
    holder.id = "google_translate_element";
    holder.style.cssText = "position:absolute;left:-9999px;height:1px;width:1px;overflow:hidden";
    document.body.appendChild(holder);
    window.googleTranslateElementInit = function () {
      if (!window.google || !window.google.translate) return;
      new window.google.translate.TranslateElement({ pageLanguage: "ru", autoDisplay: false }, "google_translate_element");
    };
    var script = document.createElement("script");
    script.id = "google-translate-script";
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.body.appendChild(script);
  }

  var savedLang = null;
  try { savedLang = localStorage.getItem("adpulse-lang"); } catch (e) {}
  if (!savedLang) {
    savedLang = browserLang();
    try { localStorage.setItem("adpulse-lang", savedLang); } catch (e) {}
    if (savedLang !== "ru") setTranslateCookie(savedLang);
  }

  var select = document.querySelector("[data-lang]");
  if (select) {
    select.value = savedLang;
    select.addEventListener("change", function () {
      var lang = select.value;
      try { localStorage.setItem("adpulse-lang", lang); } catch (e) {}
      if (lang === "ru") {
        document.cookie = "googtrans=;path=/;max-age=0";
      } else {
        setTranslateCookie(lang);
      }
      location.reload();
    });
  }
  var hasTranslation = document.cookie.indexOf("googtrans=") !== -1;
  if (hasTranslation || (savedLang && savedLang !== "ru")) {
    if (hasTranslation) ensureTranslateScript();
  }

  /* ── Cookie-баннер ────────────────────────────────────── */
  var banner = document.querySelector("[data-cookie-banner]");
  if (banner) {
    var accepted = false;
    try { accepted = localStorage.getItem("adpulse-cookie-consent") === "1"; } catch (e) {}
    if (!accepted) banner.hidden = false;
    var acceptBtn = banner.querySelector("[data-cookie-accept]");
    if (acceptBtn) acceptBtn.addEventListener("click", function () {
      try { localStorage.setItem("adpulse-cookie-consent", "1"); } catch (e) {}
      banner.hidden = true;
    });
  }

  /* ── Форма поддержки ──────────────────────────────────── */
  var form = document.querySelector("[data-support-form]");
  if (form) {
    var status = form.querySelector("[data-status]");
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (status) { status.className = "form-status"; status.textContent = "Отправляем…"; }
      var data = Object.fromEntries(new FormData(form).entries());
      try {
        var res = await fetch("https://pulse.altaidynamics.kz/api/support/public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        var payload = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(payload.error || "Не удалось отправить обращение");
        form.reset();
        if (status) {
          status.className = "form-status ok";
          status.textContent = payload.emailSent === false
            ? "Обращение сохранено. Письмо не ушло, но мы увидим его в системе."
            : "Обращение отправлено. Ответ придёт на указанный email.";
        }
      } catch (error) {
        if (status) {
          status.className = "form-status err";
          status.textContent = error.message || "Не удалось отправить обращение";
        }
      }
    });
  }

  /* ── Документация: поиск, мобильное меню, оглавление ──── */
  var docs = document.querySelector(".docs");
  if (docs) {
    var search = docs.querySelector("[data-docs-search]");
    if (search) {
      search.addEventListener("input", function () {
        var q = search.value.trim().toLowerCase();
        docs.querySelectorAll(".docs-side a").forEach(function (link) {
          link.style.display = !q || link.textContent.toLowerCase().indexOf(q) !== -1 ? "" : "none";
        });
      });
    }
    var toggle = docs.querySelector("[data-docs-toggle]");
    if (toggle) toggle.addEventListener("click", function () { docs.classList.toggle("mobile-open"); });

    var toc = document.querySelector("[data-docs-toc]");
    if (toc) {
      docs.querySelectorAll(".docs-content h2[id]").forEach(function (h2) {
        var a = document.createElement("a");
        a.href = "#" + h2.id;
        a.textContent = h2.textContent;
        toc.appendChild(a);
      });
    }
  }
})();
