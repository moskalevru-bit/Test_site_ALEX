/*
 * Скрипты сайта гостиницы (демоверсия) (JavaScript ES2020, без библиотек).
 * Модули: меню, карусели номеров, просмотр фото, форма предварительной брони,
 * панель «Написать» на телефоне, появление блоков при прокрутке.
 * Логи пишутся через appLogger (js/logger.js).
 */
(function () {
  "use strict";

  var log = window.appLogger;
  var OPEN_FROM = "2026-12-30";       // гостиница открывается после консервации (совпадает с сервером)
  var CONSENT_VERSION = "2026-10-24"; // версия документа consent.html
  var MAX_NIGHTS = 60;
  var AUTOPLAY_MS = 4500;              // как часто сами меняются фото номеров

  document.documentElement.classList.remove("no-js");

  // ── Мобильное меню ──
  function initMenu() {
    var dialog = document.getElementById("menu");
    var openBtn = document.querySelector("[data-menu-open]");
    if (!dialog || !openBtn || typeof dialog.showModal !== "function") return;

    openBtn.addEventListener("click", function () {
      dialog.showModal();
      openBtn.setAttribute("aria-expanded", "true");
    });
    dialog.addEventListener("close", function () { openBtn.setAttribute("aria-expanded", "false"); });
    dialog.querySelector("[data-menu-close]").addEventListener("click", function () { dialog.close(); });
    dialog.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { dialog.close(); });
    });
  }

  // ── Карусели фото номеров ──
  function initCarousels() {
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll("[data-carousel]").forEach(function (box, index) {
      var track = box.querySelector(".room__track");
      var slides = track.querySelectorAll("img");
      var count = box.querySelector("[data-count]");
      var prev = box.querySelector("[data-prev]");
      var next = box.querySelector("[data-next]");

      function current() { return Math.round(track.scrollLeft / track.clientWidth); }
      function go(i) {
        var target = Math.max(0, Math.min(slides.length - 1, i));
        track.scrollTo({ left: target * track.clientWidth, behavior: "smooth" });
      }
      function update() {
        var i = current();
        count.textContent = (i + 1) + " / " + slides.length;
        prev.disabled = i === 0;
        next.disabled = i === slides.length - 1;
      }

      // Автосмена фото: по кругу, пауза при наведении, касании, фокусе и когда карусель не видна
      var paused = false;
      var visible = true; // пока наблюдатель не сообщит обратное
      var timer = null;
      function tick() {
        if (paused || !visible || document.hidden) return;
        var i = current();
        go(i >= slides.length - 1 ? 0 : i + 1);
      }
      function restart() {
        window.clearInterval(timer);
        if (!reducedMotion) timer = window.setInterval(tick, AUTOPLAY_MS + index * 700);
      }

      prev.addEventListener("click", function () { go(current() - 1); restart(); });
      next.addEventListener("click", function () { go(current() + 1); restart(); });
      track.addEventListener("scroll", function () { window.requestAnimationFrame(update); }, { passive: true });
      track.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { e.preventDefault(); go(current() + 1); restart(); }
        if (e.key === "ArrowLeft") { e.preventDefault(); go(current() - 1); restart(); }
      });
      box.addEventListener("mouseenter", function () { paused = true; });
      box.addEventListener("mouseleave", function () { paused = false; });
      box.addEventListener("focusin", function () { paused = true; });
      box.addEventListener("focusout", function () { paused = false; });
      track.addEventListener("touchstart", function () { paused = true; }, { passive: true });
      track.addEventListener("touchend", function () { paused = false; restart(); }, { passive: true });
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }, { threshold: 0.25 }).observe(box);
      } else {
        visible = true;
      }
      update();
      restart();
    });
  }

  // ── Просмотр фото на весь экран ──
  function initLightbox() {
    var box = document.querySelector("[data-lightbox]");
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-gallery] button"));
    if (!box || !buttons.length || typeof box.showModal !== "function") return;

    var img = box.querySelector("[data-lightbox-img]");
    var caption = box.querySelector("[data-lightbox-caption]");
    var index = 0;
    var touchX = null;

    function show(i) {
      index = (i + buttons.length) % buttons.length;
      var thumb = buttons[index].querySelector("img");
      img.src = buttons[index].getAttribute("data-full");
      img.alt = thumb.alt;
      caption.textContent = thumb.alt + " · " + (index + 1) + " из " + buttons.length;
    }

    buttons.forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        show(i);
        box.showModal();
        log.debug("Открыт просмотр фото", { fn: "initLightbox", index: i });
      });
    });
    box.querySelector("[data-lightbox-close]").addEventListener("click", function () { box.close(); });
    box.querySelector("[data-lightbox-prev]").addEventListener("click", function () { show(index - 1); });
    box.querySelector("[data-lightbox-next]").addEventListener("click", function () { show(index + 1); });
    box.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") show(index + 1);
      if (e.key === "ArrowLeft") show(index - 1);
    });
    // Клик по тёмному фону закрывает просмотр
    box.addEventListener("click", function (e) { if (e.target === box) box.close(); });
    // Свайп влево-вправо на телефоне
    box.addEventListener("touchstart", function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      touchX = null;
    });
  }

  // ── Панель «Написать» на телефоне ──
  function initSheet() {
    var toggle = document.querySelector("[data-sheet-toggle]");
    var sheet = document.getElementById("msg-sheet");
    if (!toggle || !sheet) return;

    function set(open) {
      sheet.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    }
    var lastToggle = 0;
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      // Защита от двойного срабатывания (касание + эмулированный клик на некоторых устройствах)
      if (e.timeStamp - lastToggle < 400) return;
      lastToggle = e.timeStamp;
      set(sheet.hidden);
    });
    document.addEventListener("click", function (e) {
      if (!sheet.hidden && !sheet.contains(e.target)) set(false);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
  }

  // ── Появление блоков при прокрутке ──
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  // ── Даты: работа с форматом ГГГГ-ММ-ДД без сдвигов часового пояса ──
  function toISO(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function addDays(iso, n) {
    var p = iso.split("-").map(Number);
    return toISO(new Date(p[0], p[1] - 1, p[2] + n));
  }
  function nightsBetween(a, b) {
    var pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }

  // ── Форма предварительной брони ──
  function initBooking() {
    var form = document.getElementById("booking-form");
    if (!form) return;

    var done = document.querySelector("[data-done]");
    var statusEl = form.querySelector("[data-status]");
    var submit = form.querySelector("[data-submit]");
    var label = submit.querySelector(".btn__label");
    var room = form.elements.room;
    var guests = form.elements.guests;
    var checkin = form.elements.checkin;
    var checkout = form.elements.checkout;

    var today = toISO(new Date());
    var firstDay = today > OPEN_FROM ? today : OPEN_FROM;
    checkin.min = firstDay;
    checkin.max = addDays(today, 365);

    // Количество гостей зависит от номера
    function syncGuests() {
      var max = Number(room.selectedOptions[0].getAttribute("data-max"));
      var keep = Math.min(Number(guests.value) || 2, max);
      guests.innerHTML = "";
      for (var i = 1; i <= max; i++) {
        var opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = String(i);
        if (i === keep) opt.selected = true;
        guests.appendChild(opt);
      }
    }
    function syncCheckout() {
      if (!checkin.value) return;
      checkout.min = addDays(checkin.value, 1);
      checkout.max = addDays(checkin.value, MAX_NIGHTS);
      if (!checkout.value || checkout.value <= checkin.value) checkout.value = addDays(checkin.value, 1);
    }
    room.addEventListener("change", syncGuests);
    checkin.addEventListener("change", syncCheckout);
    syncGuests();

    // Кнопки «Забронировать этот номер» в карточках
    document.querySelectorAll("[data-book-room]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        room.value = btn.getAttribute("data-book-room");
        syncGuests();
        document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
        window.setTimeout(function () { form.elements.name.focus({ preventScroll: true }); }, 600);
        log.info("Выбран номер из карточки", { fn: "bookRoom", room: room.value });
      });
    });

    function setError(name, message) {
      var holder = form.querySelector('[data-error-for="' + name + '"]');
      var input = form.elements[name];
      if (holder) holder.textContent = message || "";
      if (input && input.setAttribute) {
        if (message) input.setAttribute("aria-invalid", "true");
        else input.removeAttribute("aria-invalid");
      }
    }
    function clearErrors() {
      ["name", "phone", "room", "guests", "checkin", "checkout", "consent"].forEach(function (n) { setError(n, ""); });
    }

    function validate(data) {
      var errors = {};
      if (data.name.length < 2) errors.name = "Напишите, как к вам обращаться.";
      var digits = data.phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 12) errors.phone = "Проверьте номер: нужно 11 цифр, например +7 900 123-45-67.";
      if (!data.checkin) errors.checkin = "Выберите дату заезда.";
      else if (data.checkin < firstDay) errors.checkin = "Принимаем заезды с " + firstDay.split("-").reverse().join(".") + ".";
      if (!data.checkout) errors.checkout = "Выберите дату выезда.";
      else if (data.checkin) {
        var n = nightsBetween(data.checkin, data.checkout);
        if (n < 1) errors.checkout = "Выезд должен быть позже заезда.";
        else if (n > MAX_NIGHTS) errors.checkout = "Больше " + MAX_NIGHTS + " ночей - позвоните, обсудим отдельно.";
      }
      if (!data.consent) errors.consent = "Без согласия мы не можем принять заявку.";
      return errors;
    }

    function setState(state, text, kind) {
      submit.setAttribute("data-state", state);
      submit.disabled = state === "loading";
      label.textContent = state === "loading" ? "Отправляем…" : state === "error" ? "Попробовать ещё раз" : "Отправить заявку";
      statusEl.textContent = text || "";
      if (kind) statusEl.setAttribute("data-kind", kind); else statusEl.removeAttribute("data-kind");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var requestId = window.newRequestId();
      var flog = log.child({ requestId: requestId, fn: "submitBooking" });

      var data = {
        name: form.elements.name.value.trim(),
        phone: form.elements.phone.value.trim(),
        room: room.value,
        guests: Number(guests.value),
        checkin: checkin.value,
        checkout: checkout.value,
        comment: form.elements.comment.value.trim(),
        website: form.elements.website.value,
        consent: form.elements.consent.checked,
        consentVersion: CONSENT_VERSION
      };

      clearErrors();
      var errors = validate(data);
      var keys = Object.keys(errors);
      if (keys.length) {
        keys.forEach(function (k) { setError(k, errors[k]); });
        var first = form.elements[keys[0]];
        if (first && first.focus) first.focus();
        flog.info("Форма не прошла проверку в браузере", { invalid: keys });
        return;
      }

      // Демоверсия: заявка никуда не отправляется
      flog.info("Демоверсия: заявка не отправлена", { room: data.room });
      setState("idle", "Всё заполнено верно. Это демоверсия сайта, поэтому заявка никуда не отправлена.");
    });

    document.querySelector("[data-again]").addEventListener("click", function () {
      form.reset();
      syncGuests();
      done.hidden = true;
      form.hidden = false;
      form.elements.name.focus();
    });
  }

  function safeInit(name, fn) {
    try { fn(); } catch (err) { log.error("Модуль не запустился", { fn: name }, err); }
  }

  safeInit("initMenu", initMenu);
  safeInit("initCarousels", initCarousels);
  safeInit("initLightbox", initLightbox);
  safeInit("initSheet", initSheet);
  safeInit("initReveal", initReveal);
  safeInit("initBooking", initBooking);
  log.debug("Страница готова", { fn: "main" });
})();
