// selenium/utils/driver.js
const { Builder } = require("selenium-webdriver");

const chrome = require("selenium-webdriver/chrome");
require("chromedriver");

// Optional Firefox support (only if installed)
// npm i geckodriver --save-dev  (or --save)
let firefox;
try {
  firefox = require("selenium-webdriver/firefox");
  require("geckodriver");
} catch (_) {
  firefox = null;
}

function buildDriver() {
  const browser = (process.env.BROWSER || "chrome").toLowerCase();

  if (browser === "firefox") {
    if (!firefox) {
      throw new Error(
        'Firefox requested but geckodriver not installed. Run: npm i geckodriver --save-dev'
      );
    }

    const options = new firefox.Options();
    // options.addArguments("-headless"); // uncomment if you want headless

    return new Builder().forBrowser("firefox").setFirefoxOptions(options).build();
  }

  // default: chrome
  const options = new chrome.Options();
  options.addArguments("--disable-gpu");
  options.addArguments("--no-sandbox");
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--log-level=3");
  // options.addArguments("--headless=new"); // optional

  return new Builder().forBrowser("chrome").setChromeOptions(options).build();
}

module.exports = { buildDriver };