let pino;

try {
  // Optional dependency for structured production logs
  // eslint-disable-next-line global-require
  pino = require("pino");
} catch (_error) {
  pino = null;
}

const toFallbackLogger = () => {
  const write = (level, payload, message) => {
    const body = {
      level,
      message,
      ...(payload && typeof payload === "object" ? payload : {}),
      time: new Date().toISOString(),
    };

    if (level === "error") {
      console.error(JSON.stringify(body));
      return;
    }

    if (level === "warn") {
      console.warn(JSON.stringify(body));
      return;
    }

    console.log(JSON.stringify(body));
  };

  return {
    info: (payload, message) => write("info", payload, message),
    warn: (payload, message) => write("warn", payload, message),
    error: (payload, message) => write("error", payload, message),
    debug: (payload, message) => write("debug", payload, message),
    child: (bindings = {}) => {
      return {
        info: (payload, message) => write("info", { ...bindings, ...payload }, message),
        warn: (payload, message) => write("warn", { ...bindings, ...payload }, message),
        error: (payload, message) => write("error", { ...bindings, ...payload }, message),
        debug: (payload, message) => write("debug", { ...bindings, ...payload }, message),
      };
    },
  };
};

const baseLogger = pino
  ? pino({
    level: process.env.LOG_LEVEL || "info",
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
  })
  : toFallbackLogger();

module.exports = baseLogger;
