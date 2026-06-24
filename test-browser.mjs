import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR CONSOLE:', msg.text());
    }
  });
  page.on('pageerror', error => {
    console.log('BROWSER PAGEERROR:', error.message, error.stack);
  });
  
  await page.goto('http://localhost:4321', { waitUntil: 'networkidle' });
  await browser.close();
})();
