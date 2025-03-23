const config = require('./config');
const os = require('os');
const { MetricBuilder } = require('./metricBuilder');

// Same structure for request counts and auth attempts
let requestCounts = {
  GET: 0,
  POST: 0,
  PUT: 0,
  DELETE: 0,
  latency: []
};


let activeUsers = new Map();

function cleanupOldUsers() {
  const now = Date.now();
  for (let [email, timestamp] of activeUsers) {
    if (now - timestamp > 60 * 60 * 1000) { // 60 minutes
      activeUsers.delete(email);
    }
  }
}

let authAttempts = { success: 0, failure: 0 };
let pizzaPurchases = { success: 0, failure: 0, revenue: 0, latency: [] };

function requestTracker(req, res, next) {
  const start = process.hrtime(); // Capture start time
  let path = req.path

  res.on('finish', () => {
    const duration = process.hrtime(start);
    const latencyMs = (duration[0] * 1000) + (duration[1] / 1e6); // Convert to milliseconds

    // Track HTTP request counts
    if (req.method in requestCounts) {
      requestCounts[req.method]++;
    }

    // Track authentication attempts

    if (path.startsWith('/api/auth') && (req.method === 'POST' || req.method === 'PUT')) {
      if (res.statusCode === 200) {
        authAttempts.success++;
      } else {
        authAttempts.failure++;
      }
    }

    // Track active users
    const email = req.body['email'];
    if (email) {
      activeUsers.set(email, Date.now());
    }

    // Track purchase attempts and revenue
    if (path.startsWith('/api/order') && req.method === 'POST') {
      if (res.statusCode === 200) {
        pizzaPurchases.success++;
        let revenue = req.body.items.reduce((sum, item) => sum + item.price, 0);
        pizzaPurchases.revenue += revenue;
        pizzaPurchases.latency.push(latencyMs);
      } else {
        pizzaPurchases.failure++;
      }
    }

    // Store request latency
    requestCounts.latency.push(latencyMs);
  });

  next();
}

function getCpuUsagePercentage() {
  const cpus = os.cpus();

  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach((cpu) => {
    for (let type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const idlePercentage = totalIdle / totalTick;
  const cpuUsagePercentage = (1 - idlePercentage) * 100;

  return cpuUsagePercentage.toFixed(2);
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();

  const memoryUsage = (totalMemory - freeMemory) / totalMemory;

  return (memoryUsage * 100).toFixed(2);
}

function httpMetrics(buf) {
  ['GET', 'POST', 'PUT', 'DELETE'].forEach(method => {
    buf.add('http_requests_total', requestCounts[method], 'sum', 'requests', [
      { key: 'source', value: { stringValue: config.metrics.source } },
      { key: 'method', value: { stringValue: method } }
    ]);
  });

  buf.add('auth_attempts', authAttempts.success, 'sum', 'attempts', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'status', value: { stringValue: 'success' } }
  ]);

  buf.add('auth_attempts', authAttempts.failure, 'sum', 'attempts', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'status', value: { stringValue: 'failure' } }
  ]);

  cleanupOldUsers();
  buf.add('active_users', activeUsers.size, 'gauge', 'users', [
    { key: 'source', value: { stringValue: config.metrics.source } }
  ]);

  if (requestCounts.latency && requestCounts.latency.length > 0) {
    const avgLatency = requestCounts.latency.reduce((a, b) => a + b, 0) / requestCounts.latency.length;

    buf.add('http_request_latency', avgLatency, 'gauge', 'milliseconds', [
      { key: 'source', value: { stringValue: config.metrics.source } }
    ]);

    requestCounts.latency = [];
  }
}


function systemMetrics(buf) {
  let cpu = parseFloat(getCpuUsagePercentage());
  let memory = parseFloat(getMemoryUsagePercentage());

  buf.add('cpu_usage', cpu, 'gauge', 'percentage', [
    { key: 'source', value: { stringValue: config.metrics.source } }
  ]);

  buf.add('memory_usage', memory, 'gauge', 'percentage', [
    { key: 'source', value: { stringValue: config.metrics.source } }
  ]);
}

function purchaseMetrics(buf) {
  buf.add('purchase_metrics', pizzaPurchases.success, 'sum', 'attempts', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'status', value: { stringValue: 'success' } }
  ]);
  buf.add('purchase_metrics', pizzaPurchases.failure, 'sum', 'attempts', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'status', value: { stringValue: 'failure' } }
  ]);
  buf.add('purchase_metrics', pizzaPurchases.revenue, 'gauge', 'attempts', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'status', value: { stringValue: 'revenue' } }
  ]);

  if (pizzaPurchases.latency.length > 0) {
    const avgLatency = pizzaPurchases.latency.reduce((a, b) => a + b, 0) / pizzaPurchases.latency.length;

    buf.add('purchase_metrics', avgLatency, 'gauge', 'milliseconds', [
      { key: 'source', value: { stringValue: config.metrics.source } },
      { key: 'status', value: { stringValue: 'latency' } }
    ]);

    pizzaPurchases.latency = [];
  }
}

function sendMetricToGrafana(metrics) {
  for (let metric of metrics) {
    const formattedMetric = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: metric.metricName,
                  unit: metric.unit,
                  [metric.type]: {
                    dataPoints: [
                      {
                        timeUnixNano: Date.now() * 1000000, // Time in nanoseconds
                        attributes: metric.attributes,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    if (metric.type === 'sum') {
      formattedMetric.resourceMetrics[0].scopeMetrics[0].metrics[0][metric.type].dataPoints[0].asInt = metric.metricValue;
      formattedMetric.resourceMetrics[0].scopeMetrics[0].metrics[0][metric.type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
      formattedMetric.resourceMetrics[0].scopeMetrics[0].metrics[0][metric.type].isMonotonic = true;
    }

    if (metric.type === 'gauge') {
      if (Number.isInteger(metric.metricValue)) {
        formattedMetric.resourceMetrics[0].scopeMetrics[0].metrics[0][metric.type].dataPoints[0].asDouble = parseFloat(metric.metricValue);
      } else {
        formattedMetric.resourceMetrics[0].scopeMetrics[0].metrics[0][metric.type].dataPoints[0].asDouble = metric.metricValue;
      }
    }

    try {
      const body = JSON.stringify(formattedMetric);

      fetch(`${config.metrics.url}`, {
        method: 'POST',
        body: body,
        headers: {
          Authorization: `Bearer ${config.metrics.apiKey}`,
          'Content-Type': 'application/json',
        },
      })
        .then((response) => {
          if (!response.ok) {
            response.text().then((text) => {
              console.error(`Failed to push metrics data to Grafana: ${text}\nSent Data: ${body}`);
            });
          }
        })
        .catch((error) => {
          console.error('Error pushing metrics:', error);
        });

    } catch (error) {
      console.error('JSON Serialization Error:', error);
    }
  }
}



function sendMetricsPeriodically(period) {
  setInterval(() => {
    try {
      const buf = new MetricBuilder();
      httpMetrics(buf);
      systemMetrics(buf);
      purchaseMetrics(buf);

      sendMetricToGrafana(buf.metrics);
      requestCounts = { GET: 0, POST: 0, PUT: 0, DELETE: 0, latency: [] };
      authAttempts = { success: 0, failure: 0 };
      pizzaPurchases = { success: 0, failure: 0, revenue: 0, latency: [] };
    } catch (error) {
      console.log('Error sending metrics', error);
    }
  }, period);
}

module.exports = {
  requestTracker,
  sendMetricsPeriodically
};
