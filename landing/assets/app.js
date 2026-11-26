(function () {
  var root = document.documentElement;

  // Тема: светлая по умолчанию, выбор хранится локально. Скрипт в <head>
  // ставит data-theme до отрисовки, здесь только переключение.
  function currentTheme() {
    return root.dataset.theme === "dark" ? "dark" : "light";
  }

  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("adpulse-theme", next); } catch (e) {}
      btn.setAttribute("aria-label", next === "dark" ? "Светлая тема" : "Тёмная тема");
    });
  });

  // Мобильное меню
  var menuBtn = document.querySelector("[data-menu-toggle]");
  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      document.body.classList.toggle("mobile-open");
    });
    document.querySelectorAll(".nav a").forEach(function (link) {
      link.addEventListener("click", function () { document.body.classList.remove("mobile-open"); });
    });
  }

  // Форма поддержки на статическом лендинге: отправляем в Пульс.
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

  // Перевод документации: бесплатный виджет Google Translate.
  window.googleTranslateElementInit = function () {
    if (!window.google || !window.google.translate) return;
    new window.google.translate.TranslateElement(
      { pageLanguage: "ru", autoDisplay: false },
      "google_translate_element"
    );
  };
  var holder = document.getElementById("google_translate_element");
  if (holder) {
    var script = document.createElement("script");
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.body.appendChild(script);
  }
})();
