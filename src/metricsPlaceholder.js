const config = require('./config');
const os = require('os');
const { MetricBuilder } = require('./metricBuilder');

let requestCounts = {
  GET: 0,
  POST: 0,
  PUT: 0,
  DELETE: 0
};

let activeUsers = new Map();

function cleanupOldTokens() {
  const now = Date.now();
  for (let [token, timestamp] of activeUsers) {
    if (now - timestamp > 10 * 60 * 1000) {
      activeUsers.delete(token);
    }
  }
}

let authAttempts = { success: 0, failure: 0 };

function requestTracker(req, res, next) {
  if (req.method in requestCounts) {
    requestCounts[req.method]++;
  }

  if (req.path.startsWith('/api/auth')) {
    res.on('finish', () => {
      if (res.statusCode === 200) {
        authAttempts.success++;
      } else {
        authAttempts.failure++;
      }
    });
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    if (token) {
      activeUsers.set(token, Date.now());
    }
  }



  next();
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

function httpMetrics(buf) {
  buf.add('http_requests_total', requestCounts.GET, 'sum', 'requests', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'method', value: { stringValue: 'GET' } }
  ]);
  buf.add('http_requests_total', requestCounts.POST, 'sum', 'requests', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'method', value: { stringValue: 'POST' } }
  ]);
  buf.add('http_requests_total', requestCounts.PUT, 'sum', 'requests', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'method', value: { stringValue: 'PUT' } }
  ]);
  buf.add('http_requests_total', requestCounts.DELETE, 'sum', 'requests', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'method', value: { stringValue: 'DELETE' } }
  ]);

  buf.add('auth_attempts', authAttempts.success, 'sum', 'attempts', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'status', value: { stringValue: 'success' } }
  ]);

  buf.add('auth_attempts', authAttempts.failure, 'sum', 'attempts', [
    { key: 'source', value: { stringValue: config.metrics.source } },
    { key: 'status', value: { stringValue: 'failure' } }
  ]);

  cleanupOldTokens();
  buf.add('active_users', activeUsers.size, 'gauge', 'users', [
    { key: 'source', value: { stringValue: config.metrics.source } }
  ]);
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
                        timeUnixNano: Date.now() * 1e6,
                        attributes: metric.attributes,
                        value: Number.isInteger(metric.metricValue)
                          ? { asInt: metric.metricValue }
                          : { asDouble: parseFloat(metric.metricValue) },
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
      formattedMetric.resourceMetrics[0].scopeMetrics[0].metrics[0][metric.type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
      formattedMetric.resourceMetrics[0].scopeMetrics[0].metrics[0][metric.type].isMonotonic = true;
    }

    try {
      const body = JSON.stringify(formattedMetric);

      fetch(`${config.metrics.url}`, {
        method: 'POST',
        body: body,
        headers: {
          Authorization: `Bearer ${config.metrics.apiKey}`,
          'Content-Type': 'application/json'
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
  const timer = setInterval(() => {
    try {
      const buf = new MetricBuilder();
      httpMetrics(buf);
      systemMetrics(buf);



      sendMetricToGrafana(buf.metrics);
      requestCounts = { GET: 0, POST: 0, PUT: 0, DELETE: 0 };
      authAttempts = { success: 0, failure: 0 };
    } catch (error) {
      console.log('Error sending metrics', error);
    }
  }, period);
}

module.exports = {
  requestTracker,
  sendMetricsPeriodically
};
