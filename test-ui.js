const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  await page.goto('http://localhost:3002');
  await page.waitForSelector('.nav-item[data-page="pedidos"]');
  
  console.log('Clicking Pedidos...');
  await page.click('.nav-item[data-page="pedidos"]');
  
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
