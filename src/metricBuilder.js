class MetricBuilder {
  constructor() {
    this.metrics = [];
  }

  add(metricName, metricValue, type, unit, attributes) {
    this.metrics.push({
      metricName,
      metricValue,
      type,
      unit,
      attributes 
    });
  }

  toString() {
    return "";
  }
}

module.exports = {
  MetricBuilder
}