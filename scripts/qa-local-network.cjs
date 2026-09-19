// Preload for existing browser tests. No provider, school API or VPS is contacted.
const { chromium } = require('playwright');
const origin = new URL(process.env.SCHOOLSAFE_URL).origin;
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...options) => {
    const context = await newContext(...options);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.hostname === '127.0.0.1' && url.port === '8787' && url.pathname === '/config') {
        return route.fulfill({ json: { setup_available: false, auth_mode: 'native' } });
      }
      return route.abort();
    });
    return context;
  };
  return browser;
};
