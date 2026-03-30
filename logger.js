const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const supabase = require('./supabaseClient');

const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE === 'true';
const LOG_DB_TABLE = process.env.LOG_DB_TABLE || 'app_log';

function formatArgs(args) {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack || arg.message;
      }
      if (typeof arg === 'string') {
        return arg;
      }
      try {
        return JSON.stringify(arg);
      } catch (error) {
        return String(arg);
      }
    })
    .join(' ');
}

function buildLogPayload(level, args) {
  const message = formatArgs(args);
  return {
    level,
    message: message || 'empty_log_message',
  };
}

async function writeErrorToDb(payload) {
  try {
    const { error } = await supabase.from(LOG_DB_TABLE).insert(payload);
    if (error) {
      console.error(`[logger] DB insert failed: ${error.message}`);
      console.error(`[logger] original error: ${payload.message}`);
    }
  } catch (error) {
    console.error(`[logger] Unexpected DB log failure: ${error.message}`);
    console.error(`[logger] original error: ${payload.message}`);
  }
}

const dailyRotateTransportInfo = new winston.transports.DailyRotateFile({
  filename: path.join(__dirname, './logs/app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '5d',
  level: 'info',
  zippedArchive: false,
  maxSize: '20m',
});

const dailyRotateTransportDebug = new winston.transports.DailyRotateFile({
  filename: path.join(__dirname, './logs/debug-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '2d',
  level: 'debug',
  zippedArchive: false,
  maxSize: '20m',
});

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  ),
  level: LOG_LEVEL
});

const transports = [
  dailyRotateTransportInfo,
  dailyRotateTransportDebug
];

if (LOG_TO_CONSOLE) {
  transports.push(consoleTransport);
}

const baseLogger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf((info) => `[${info.timestamp}] [${info.level}] ${info.message}`)
  ),
  transports,
  exitOnError: false,
});

const logger = {
  error: (...args) => {
    const payload = buildLogPayload('error', args);

    if (LOG_TO_CONSOLE) {
      console.error(payload.message);
    }

    // Не ждём insert, чтобы не тормозить пользовательские запросы.
    void writeErrorToDb(payload);
  },
  warn: (...args) => {
    baseLogger.warn(formatArgs(args));
  },
  info: (...args) => {
    baseLogger.info(formatArgs(args));
  },
  debug: (...args) => {
    baseLogger.debug(formatArgs(args));
  },
};

module.exports = logger;
