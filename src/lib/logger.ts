type LogLevel = "info" | "warn" | "error";

interface LogMeta {
  [key: string]: unknown;
}

function write(
  level: LogLevel,
  message: string,
  meta?: LogMeta
) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const line = JSON.stringify(payload);

  switch (level) {
    case "error":
      console.error(line);
      break;

    case "warn":
      console.warn(line);
      break;

    default:
      console.log(line);
  }
}

export const logger = {
  info(message: string, meta?: LogMeta) {
    write("info", message, meta);
  },

  warn(message: string, meta?: LogMeta) {
    write("warn", message, meta);
  },

  error(message: string, meta?: LogMeta) {
    write("error", message, meta);
  },
};