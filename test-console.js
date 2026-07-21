import { chromium } from 'playwright';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  
  console.log('Navigating to page...');
  await page.goto('http://localhost:5174/RAG_Viz/');
  
  console.log('Waiting for network idle...');
  await page.waitForLoadState('networkidle');
  
  console.log('Clicking Index Structure...');
  await page.click('text="Index Structure"');
  
  // Wait for the panel to open
  await page.waitForTimeout(1000);
  
  console.log('Clicking HNSW...');
  await page.click('text="HNSW"');
  
  await page.waitForTimeout(1000);
  
  console.log('Clicking In depth...');
  await page.click('text="In depth"');
  
  console.log('Waiting for animation to run...');
  await page.waitForTimeout(5000);
  
  await browser.close();
  console.log('Done.');
})();
