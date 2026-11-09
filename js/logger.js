/*
 * Logger - переиспользуемый модуль логирования для браузера (JavaScript ES2020).
 *
 * Уровни: debug < info < warn < error.
 * Каждая запись - плоский JSON-объект, его можно без переделок отправить
 * во внешнюю систему (Sentry, ELK, Cloud Logging): см. Logger.setTransport().
 *
 * Пример записи об ошибке:
 * {
 *   "ts": "2026-10-21T12:00:00.000Z",
 *   "level": "error",
 *   "message": "Запись не отправлена",
 *   "app": "runa-hotel",
 *   "requestId": "req-lq2x9a-4f1c",
 *   "fn": "submitBooking",
 *   "context": { "service": "Стрижка и борода", "date": "2026-10-24" },
 *   "error": { "name": "TypeError", "message": "Failed to fetch", "stack": "TypeError: Failed to fetch\n    at ..." },
 *   "page": "https://example.local/#booking",
 *   "userAgent": "Mozilla/5.0 (iPhone; ...)"
 * }
 */
(function (global) {
  "use strict";

  var LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

  // Поля, которые нельзя писать в лог как есть (персональные данные)
  var SENSITIVE_KEYS = ["phone", "name", "email"];

  function newRequestId() {
    return "req-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  }

  function maskSensitive(context) {
    var safe = {};
    Object.keys(context || {}).forEach(function (key) {
      var value = context[key];
      if (SENSITIVE_KEYS.indexOf(key) !== -1 && typeof value === "string") {
        safe[key] = value.length > 2 ? value.slice(0, 2) + "***" : "***";
      } else {
        safe[key] = value;
      }
    });
    return safe;
  }

  function serializeError(err) {
    if (!err) return undefined;
    return {
      name: err.name || "Error",
      message: err.message || String(err),
      stack: err.stack || "(stack недоступен)"
    };
  }

  function Logger(options) {
    options = options || {};
    this.app = options.app || "app";
    this.minLevel = LEVELS[options.level] || LEVELS.info;
    this.base = options.context || {};
    this.transport = options.transport || null;
  }

  // Дочерний логгер с постоянным контекстом (requestId, fn и т. п.)
  Logger.prototype.child = function (context) {
    var child = new Logger({ app: this.app, transport: this.transport });
    child.minLevel = this.minLevel;
    child.base = Object.assign({}, this.base, context);
    return child;
  };

  // Подключение внешней системы: функция получает готовую запись (объект)
  Logger.prototype.setTransport = function (fn) {
    this.transport = typeof fn === "function" ? fn : null;
  };

  Logger.prototype.log = function (level, message, context, error) {
    if (LEVELS[level] < this.minLevel) return null;

    var merged = Object.assign({}, this.base, context);
    var entry = {
      ts: new Date().toISOString(),
      level: level,
      message: message,
      app: this.app,
      requestId: merged.requestId,
      fn: merged.fn,
      context: maskSensitive(omit(merged, ["requestId", "fn"])),
      error: serializeError(error),
      page: global.location ? global.location.href : undefined,
      userAgent: global.navigator ? global.navigator.userAgent : undefined
    };

    var out = level === "debug" ? "log" : level;
    if (global.console && typeof global.console[out] === "function") {
      global.console[out]("[" + level.toUpperCase() + "] " + message, entry);
    }

    if (this.transport) {
      try { this.transport(entry); } catch (e) { /* сбой отправки логов не ломает страницу */ }
    }
    return entry;
  };

  Logger.prototype.debug = function (msg, ctx) { return this.log("debug", msg, ctx); };
  Logger.prototype.info  = function (msg, ctx) { return this.log("info", msg, ctx); };
  Logger.prototype.warn  = function (msg, ctx) { return this.log("warn", msg, ctx); };
  Logger.prototype.error = function (msg, ctx, err) { return this.log("error", msg, ctx, err); };

  function omit(obj, keys) {
    var copy = Object.assign({}, obj);
    keys.forEach(function (k) { delete copy[k]; });
    return copy;
  }

  // Уровень можно поднять до debug, добавив к адресу ?debug=1
  var isDebug = /[?&]debug=1\b/.test(global.location ? global.location.search : "");

  global.Logger = Logger;
  global.newRequestId = newRequestId;
  global.appLogger = new Logger({ app: "runa-hotel", level: isDebug ? "debug" : "info" });

  // Ошибки, которые никто не поймал, тоже попадают в лог со стеком
  global.addEventListener("error", function (event) {
    global.appLogger.error("Необработанная ошибка", { fn: "window.onerror", source: event.filename, line: event.lineno }, event.error);
  });
  global.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    global.appLogger.error("Необработанный отказ Promise", { fn: "window.onunhandledrejection" }, reason);
  });
})(window);
