const { chromium } = require('playwright');

async function checkPage(page, name) {
  const viewports = [
    { width: 1440, height: 900, name: '1440px' },
    { width: 768, height: 1024, name: '768px' },
    { width: 390, height: 844, name: '390px' }
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500); // let layout settle
    const result = await page.evaluate(() => {
      let isOverflow = false;
      const elements = [];
      document.querySelectorAll('*').forEach(el => {
        // Exclude elements that are meant to scroll horizontally
        const style = window.getComputedStyle(el);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'hidden') return;
        
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth || el.offsetWidth > window.innerWidth) {
          elements.push({ 
            tag: el.tagName, 
            className: el.className, 
            offsetW: el.offsetWidth,
            rectRight: rect.right
          });
          isOverflow = true;
        }
      });
      return { hasOverflow: isOverflow, elements };
    });
    console.log(`[${vp.name}] ${name}: Overflow=${result.hasOverflow}`);
    if (result.hasOverflow) {
      console.log('Overflowing elements:', JSON.stringify(result.elements, null, 2));
    }
  }
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('pageerror', error => console.log('Uncaught exception:', error.message));
  page.on('requestfailed', request => console.log('Failed request:', request.url(), request.failure()?.errorText));

  try {
    console.log('Logging in as PM...');
    await page.goto('http://localhost:53170/login');
    await page.fill('input[type="email"]', 'pm.scoped@omnia.local');
    await page.fill('input[type="password"]', 'OmniaTest!2026');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/app');

    console.log('Checking /app/billing...');
    await page.goto('http://localhost:53170/app/billing');
    await page.waitForSelector('text=Billing');
    await checkPage(page, '/app/billing');

    console.log('Document Creation...');
    const newDocBtn = await page.$('button:has-text("New Document"), button:has-text("Create")');
    if (newDocBtn) {
      await newDocBtn.click();
      await page.waitForTimeout(1000);
      await checkPage(page, 'Billing Document creation');
      const cancelBtn = await page.$('button:has-text("Cancel")');
      if (cancelBtn) await cancelBtn.click();
    } else {
      console.log('No New Document button found');
    }

    console.log('Clicking first document...');
    const firstRow = await page.$('tbody tr');
    if (firstRow) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      await checkPage(page, 'Billing Document detail');
      
      const paymentBtn = await page.$('button:has-text("Record Payment"), button:has-text("Payment")');
      if (paymentBtn) {
        await paymentBtn.click();
        await page.waitForTimeout(1000);
        await checkPage(page, 'Payment UI');
        const cancelPay = await page.$('button:has-text("Cancel")');
        if (cancelPay) await cancelPay.click();
      }

      const voidBtn = await page.$('button:has-text("Void")');
      if (voidBtn) {
        await voidBtn.click();
        await page.waitForTimeout(1000);
        await checkPage(page, 'Void/reverse UI');
        const cancelVoid = await page.$('button:has-text("Cancel")');
        if (cancelVoid) await cancelVoid.click();
      }
    } else {
      console.log('No documents found!');
    }

    console.log('Logging in as Client...');
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:53170/login');
    await page.fill('input[type="email"]', 'client.admin.a@omnia.local');
    await page.fill('input[type="password"]', 'OmniaTest!2026');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/portal*');

    console.log('Checking /portal/documents...');
    await page.goto('http://localhost:53170/portal/documents');
    await page.waitForTimeout(1000);
    await checkPage(page, '/portal/documents');
    
    const portalRow = await page.$('tbody tr');
    if (portalRow) {
      await portalRow.click();
      await page.waitForTimeout(1000);
      await checkPage(page, 'published Billing Document');
    }

  } catch (e) {
    console.error('Error during smoke test:', e);
  } finally {
    await browser.close();
  }
})();
