(function () {
  /* ── Мобильное меню ───────────────────────────────────── */
  var menuBtn = document.querySelector("[data-menu-toggle]");
  if (menuBtn) {
    function closeMenu() {
      document.body.classList.remove("mobile-open");
      menuBtn.setAttribute("aria-expanded", "false");
    }
    menuBtn.addEventListener("click", function () {
      var open = document.body.classList.toggle("mobile-open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".mobile-nav a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  }

  /* ── Локализация: словари вместо Google Translate ─────── */
  if (window.ADPULSE_I18N) window.ADPULSE_I18N.init();

  /* ── Кастомный языковой переключатель ─────────────────── */
  var langWrap = document.querySelector("[data-lang]");
  if (langWrap) {
    var langBtn = langWrap.querySelector("[data-lang-toggle]");
    var langMenu = langWrap.querySelector(".lang-menu");
    var langItems = Array.prototype.slice.call(langWrap.querySelectorAll("[data-lang-choice]"));
    function closeLang() {
      langMenu.hidden = true;
      langWrap.removeAttribute("data-open");
      langBtn.setAttribute("aria-expanded", "false");
    }
    if (langBtn) langBtn.addEventListener("click", function () {
      var open = langMenu.hidden;
      langMenu.hidden = !open;
      langBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        langWrap.setAttribute("data-open", "true");
        var selected = langItems.filter(function (i) { return i.getAttribute("aria-selected") === "true"; })[0] || langItems[0];
        selected.focus();
      } else {
        langWrap.removeAttribute("data-open");
      }
    });
    langItems.forEach(function (item) {
      item.addEventListener("click", function () {
        var code = item.getAttribute("data-lang-choice");
        if (window.ADPULSE_I18N) window.ADPULSE_I18N.setLang(code);
        closeLang();
      });
      item.addEventListener("keydown", function (e) {
        var i = langItems.indexOf(item);
        if (e.key === "ArrowDown") { e.preventDefault(); langItems[(i + 1) % langItems.length].focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); langItems[(i - 1 + langItems.length) % langItems.length].focus(); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); item.click(); }
        else if (e.key === "Home") { e.preventDefault(); langItems[0].focus(); }
        else if (e.key === "End") { e.preventDefault(); langItems[langItems.length - 1].focus(); }
        else if (e.key === "Escape") { closeLang(); langBtn.focus(); }
      });
    });
    document.addEventListener("click", function (e) { if (!langWrap.contains(e.target)) closeLang(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !langMenu.hidden) closeLang(); });
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
    var submitBtn = form.querySelector("button[type=submit]");
    function statusText(key, fallback) {
      return window.ADPULSE_I18N ? window.ADPULSE_I18N.t(key, fallback) : fallback;
    }
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (submitBtn && submitBtn.disabled) return;
      if (submitBtn) submitBtn.disabled = true;
      if (status) { status.className = "form-status"; status.textContent = statusText("form.sending", "Отправляем…"); }
      var data = Object.fromEntries(new FormData(form).entries());
      try {
        var res = await fetch("https://pulse.altaidynamics.kz/api/support/public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        var payload = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(payload.error || statusText("form.err", "Не удалось отправить обращение"));
        form.reset();
        if (status) {
          status.className = "form-status ok";
          status.textContent = payload.emailSent === false
            ? statusText("form.okNoEmail", "Обращение сохранено. Письмо не ушло, но мы увидим его в системе.")
            : statusText("form.ok", "Обращение отправлено. Ответ придёт на указанный email.");
        }
      } catch (error) {
        if (status) {
          status.className = "form-status err";
          status.textContent = error.message || statusText("form.err", "Не удалось отправить обращение");
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
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
