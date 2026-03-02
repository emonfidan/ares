// selenium/utils/driver.js
const { Builder } = require('selenium-webdriver');
require('chromedriver'); // ensures chromedriver is on PATH for selenium-webdriver

function buildDriver() {
  return new Builder().forBrowser('chrome').build();
}

module.exports = { buildDriver };

options.addArguments('--disable-gpu');
options.addArguments('--no-sandbox');
options.addArguments('--disable-dev-shm-usage');
options.addArguments('--log-level=3');