// eslint-disable-next-line no-unused-expressions
async page => {
  const base = 'http://127.0.0.1:53170';
  const project = '60000000-0000-0000-0000-0000000013a1';
  const routes = [
    ['automations', `/app/automations?project=${project}`, 'Automatizaciones'],
    ['integrations', `/app/integrations?project=${project}`, 'Integraciones'],
    ['ai', `/app/projects/${project}/assistant`, 'Asistente del proyecto'],
  ];
  const requestCounts = {};
  const requests = [];
  const requestEvent = request => {
    if (/\/rpc\/phase13_|\/rpc\/project_access_allowed|\/rest\/v1\/ai_project_consents/.test(request.url())) requests.push(request.url().split('/').pop().split('?')[0]);
  };
  page.on('request', requestEvent);
  try {
    for (const [surface, path, heading] of routes) {
      const start = requests.length;
      await page.goto(base + path);
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      await page.getByRole('heading', { name: surface === 'ai' ? 'Mis resultados' : surface === 'automations' ? 'Workflows del proyecto' : 'Conexiones del proyecto', exact: true }).waitFor();
      await page.getByText(/Cargando (workflows|conexiones|resultados|ejecuciones)…/).first().waitFor({ state: 'hidden' });
      await page.waitForTimeout(300);
      requestCounts[surface] = requests.slice(start);
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => window.scrollTo(0, 0));
        if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error(`Overflow: ${surface}/${width}`);
        await page.screenshot({ path: `artifacts/phase-13/${surface}-${width}-viewport.png` });
        await page.screenshot({ path: `artifacts/phase-13/${surface}-${width}.png`, fullPage: true });
      }
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `artifacts/phase-13/${surface}-390-light.png` });
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    }
    return { surfaces: 3, widths: [1440, 768, 390], requestCounts, screenshots: 21 };
  } finally { page.removeListener('request', requestEvent); }
}
