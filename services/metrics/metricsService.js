const client = require('prom-client');

const PROJECT_NAME = process.env.METRICS_PROJECT || 'miniapp-serg';
const SERVICE_NAME = process.env.METRICS_SERVICE || 'backend';
const METRICS_ENABLED = process.env.METRICS_ENABLED !== 'false';
const METRICS_TOKEN = String(process.env.METRICS_TOKEN || '').trim();

const register = new client.Registry();

client.collectDefaultMetrics({
  register,
  prefix: 'nodejs_',
  labels: {
    project: PROJECT_NAME,
    service: SERVICE_NAME,
  },
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests by route, method and status code.',
  labelNames: ['project', 'service', 'method', 'route', 'status_code', 'status_class'],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds by route, method and status code.',
  labelNames: ['project', 'service', 'method', 'route', 'status_code', 'status_class'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

const aiRequestsTotal = new client.Counter({
  name: 'ai_requests_total',
  help: 'Total AI calls by feature and status.',
  labelNames: ['project', 'service', 'feature', 'status', 'error_type'],
  registers: [register],
});

const aiRequestDurationSeconds = new client.Histogram({
  name: 'ai_request_duration_seconds',
  help: 'AI call duration in seconds by feature and status.',
  labelNames: ['project', 'service', 'feature', 'status', 'error_type'],
  buckets: [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 240],
  registers: [register],
});

const externalRequestsTotal = new client.Counter({
  name: 'external_requests_total',
  help: 'Total external dependency calls by feature and status.',
  labelNames: ['project', 'service', 'feature', 'status', 'error_type'],
  registers: [register],
});

const externalRequestDurationSeconds = new client.Histogram({
  name: 'external_request_duration_seconds',
  help: 'External dependency call duration in seconds by feature and status.',
  labelNames: ['project', 'service', 'feature', 'status', 'error_type'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 240],
  registers: [register],
});

function statusClass(statusCode) {
  const code = Number(statusCode || 0);
  return code ? `${Math.floor(code / 100)}xx` : 'unknown';
}

function normalizeRoute(req) {
  if (req.route?.path) {
    return `${req.baseUrl || ''}${req.route.path}`;
  }
  return 'unmatched_route';
}

function metricsMiddleware(req, res, next) {
  if (!METRICS_ENABLED || req.path === '/metrics') {
    return next();
  }

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const labels = {
      project: PROJECT_NAME,
      service: SERVICE_NAME,
      method: req.method,
      route: normalizeRoute(req),
      status_code: String(res.statusCode),
      status_class: statusClass(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  return next();
}

function classifyError(error) {
  const message = String(error?.message || error?.code || error || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  const providerStatus = Number(
    error?.response?.status || error?.status || error?.statusCode || error?.telegramStatus || 0
  );

  if (
    code === 'econnaborted'
    || code === 'etimedout'
    || message.includes('timeout')
    || message.includes('timed out')
  ) {
    return 'timeout';
  }
  if (
    providerStatus === 403
    || code === 'provider_forbidden'
    || message.includes('403')
    || message.includes('forbidden')
  ) {
    return 'provider_forbidden';
  }
  if (
    providerStatus === 429
    || code === 'provider_rate_limit'
    || message.includes('429')
    || message.includes('rate limit')
    || message.includes('rate_limit')
  ) {
    return 'provider_rate_limit';
  }
  if (providerStatus >= 500 || message.includes('provider_5xx')) {
    return 'provider_5xx';
  }
  if (
    message.includes('invalid_response')
    || message.includes('invalid_s_response')
    || message.includes('neural_failed')
    || message.includes('invalid response')
    || message.includes('too_short')
    || message.includes('not_string')
    || message.includes('empty result')
  ) {
    return 'invalid_response';
  }
  if (
    ['econnrefused', 'econnreset', 'enotfound', 'eai_again', 'epipe'].includes(code)
    || message.includes('network')
    || message.includes('fetch failed')
    || message.includes('socket hang up')
  ) {
    return 'network_error';
  }
  return 'error';
}

function recordCall(counter, histogram, feature, status, durationSeconds, errorType = 'none') {
  if (!METRICS_ENABLED) return;

  const labels = {
    project: PROJECT_NAME,
    service: SERVICE_NAME,
    feature: String(feature || 'unknown'),
    status,
    error_type: errorType || 'none',
  };

  counter.inc(labels);
  histogram.observe(labels, durationSeconds);
}

async function trackCall(counter, histogram, feature, fn) {
  if (!METRICS_ENABLED) return fn();

  const startedAt = process.hrtime.bigint();
  try {
    const result = await fn();
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;

    if (result && result.ok === false) {
      const errorType = classifyError(result.error || result.code || 'error');
      recordCall(counter, histogram, feature, 'error', durationSeconds, errorType);
    } else {
      recordCall(counter, histogram, feature, 'success', durationSeconds, 'none');
    }
    return result;
  } catch (error) {
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    recordCall(counter, histogram, feature, 'error', durationSeconds, classifyError(error));
    throw error;
  }
}

function trackAiCall(feature, fn) {
  return trackCall(aiRequestsTotal, aiRequestDurationSeconds, feature, fn);
}

function trackExternalCall(feature, fn) {
  return trackCall(externalRequestsTotal, externalRequestDurationSeconds, feature, fn);
}

async function metricsHandler(req, res) {
  if (!METRICS_ENABLED) {
    return res.status(404).json({ error: 'metrics_disabled' });
  }
  if (!METRICS_TOKEN) {
    return res.status(503).json({ error: 'metrics_token_missing' });
  }

  const authHeader = String(req.headers.authorization || '');
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (bearerToken !== METRICS_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  res.set('Content-Type', register.contentType);
  return res.end(await register.metrics());
}

module.exports = {
  register,
  metricsMiddleware,
  metricsHandler,
  trackAiCall,
  trackExternalCall,
  classifyError,
};
