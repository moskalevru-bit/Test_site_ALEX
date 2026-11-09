/*
 * Световая волна от точки касания на кнопках мессенджеров (.msg, .chip).
 * Не мешает переходу по ссылке: волна только рисуется и сама удаляется.
 */
(function () {
  "use strict";

  var log = window.appLogger ? window.appLogger.child({ fn: "pressRipple" }) : null;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  document.addEventListener("pointerdown", function (e) {
    var btn = e.target.closest && e.target.closest(".msg, .chip");
    if (!btn) return;
    try {
      var rect = btn.getBoundingClientRect();
      var dot = document.createElement("span");
      dot.className = "m-ripple";
      dot.style.left = (e.clientX - rect.left) + "px";
      dot.style.top = (e.clientY - rect.top) + "px";
      btn.appendChild(dot);
      dot.addEventListener("animationend", function () { dot.remove(); });
    } catch (err) {
      if (log) log.warn("Не удалось показать волну нажатия", { button: btn.className }, err);
    }
  }, { passive: true });
})();
