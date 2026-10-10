// Playwright CLI requires a single function expression (no module exports).
// eslint-disable-next-line no-unused-expressions
async page => {
  const base = 'http://127.0.0.1:53170';
  const query = 'from=2026-09-01&to=2026-09-30&project=60000000-0000-0000-0000-0000000012a1';
  const checks = [];
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/rpc/analytics_')) requests.push(request.url().split('/').pop()); });
  const check = (label, value) => { if (!value) throw new Error(label); checks.push(label); };
  const dd = name => page.locator('dl > div').filter({ has: page.getByText(name, { exact: true }) }).locator('dd');
  async function overflow(label) { check(label, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
  await page.goto(base);
  await page.waitForURL(/\/(app|portal|login)$/);
  if (!page.url().endsWith('/login')) await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('textbox', { name: 'Correo', exact: true }).fill('director@omnia.local');
  await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill('OmniaTest!2026');
  await page.getByRole('button', { name: 'Entrar a OMNIA' }).click();
  await page.waitForURL('**/app');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/app/analytics?${query}`);
  await page.getByRole('heading', { name: 'Estado actual de tu alcance' }).waitFor();
  await page.getByRole('combobox', { name: 'Proyecto', exact: true }).waitFor({ state: 'visible' });
  check('Overview open=3', (await dd('Trabajo abierto').innerText()).includes('3'));
  check('Overview overdue=1', (await dd('Trabajo vencido').innerText()).includes('1'));
  check('Overview completed=2', (await dd('Periodo elegido').innerText()) === '2');
  check('Options usable', await page.getByRole('combobox', { name: 'Proyecto', exact: true }).isEnabled());
  const initialQueries = [...requests];
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await overflow(`Analytics overview no overflow ${width}`);
    await page.screenshot({ path: `artifacts/phase-12/analytics-overview-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: '1 · Ver detalle', exact: true }).first().click();
  await page.getByRole('cell', { name: 'Overdue', exact: true }).waitFor();
  check('Overdue drilldown linked and filtered', page.url().includes('section=work') && page.url().includes('detail=overdue'));
  check('Work median matches SQL', (await dd('Mediana creación → finalización').innerText()).includes('2.5'));
  const statusChart = page.locator('.analytics-distribution').filter({ has: page.getByRole('heading', { name: 'Estado actual', exact: true }) });
  check('Status chart equals known SQL count', await statusChart.locator('li').filter({ hasText: 'Terminado' }).locator('strong').innerText() === '2');
  const seriesChart = page.locator('.analytics-distribution').filter({ has: page.getByRole('heading', { name: 'Completados por día', exact: true }) });
  check('Completion chart values sum to two server completions', (await seriesChart.locator('strong').allTextContents()).reduce((sum, count) => sum + Number(count), 0) === 2);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await overflow(`Work chart/table no overflow ${width}`);
    await page.screenshot({ path: `artifacts/phase-12/analytics-work-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Cobros operativos', exact: true }).click();
  await page.getByRole('heading', { name: 'MXN', exact: true }).waitFor();
  check('Billing MXN correct', (await page.locator('main').innerText()).includes('15,000.00'));
  check('Billing USD separate', (await page.locator('main').innerText()).includes('1,000.00'));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await overflow(`Billing table no overflow ${width}`);
    await page.screenshot({ path: `artifacts/phase-12/analytics-billing-${width}.png`, fullPage: true });
  }
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar resumen CSV' }).click();
  await (await downloadPromise).saveAs('artifacts/phase-12/analytics-billing.csv');
  await page.getByRole('button', { name: 'Exportar resumen CSV' }).waitFor();
  check('Export recovers UI', await page.getByRole('button', { name: 'Exportar resumen CSV' }).isVisible());
  await page.getByRole('combobox', { name: 'Moneda' }).selectOption('USD');
  await page.getByRole('heading', { name: 'USD', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'MXN', exact: true }).waitFor({ state: 'hidden' });
  check('Currency control URL persistence', page.url().includes('currency=USD'));
  await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
  await page.getByRole('cell', { name: /Analytics fixture/ }).waitFor();
  await page.getByRole('button', { name: 'Editorial', exact: true }).click();
  await page.getByRole('heading', { name: 'Planificación editorial' }).waitFor();
  check('Editorial accessible channel values', (await page.locator('main').innerText()).includes('instagram'));
  await page.getByRole('button', { name: 'Entregas y revisiones', exact: true }).click();
  await page.getByRole('heading', { name: 'Revisión cliente durante el periodo' }).waitFor();
  check('Review internal/client duration values visible', (await page.locator('main').innerText()).includes('24 horas'));
  await page.getByRole('button', { name: 'Reportes cliente', exact: true }).click();
  await page.getByText('September report', { exact: true }).waitFor();
  check('Published report management visible', await page.getByRole('button', { name: 'Retirar publicación' }).isVisible());
  await page.goto(`${base}/app/analytics?from=2030-01-01&to=2030-01-30&project=60000000-0000-0000-0000-0000000012a1&section=editorial`);
  await page.getByText('No hay datos para este periodo.').first().waitFor();
  check('Empty period meaningful', !(await page.locator('main').innerText()).match(/NaN|Infinity/));
  await page.goto(`${base}/app/analytics?from=invalid`);
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Restablecer filtros' }).click();
  await page.getByRole('heading', { name: 'Estado actual de tu alcance' }).waitFor();
  check('Invalid URL recovered', !page.url().includes('invalid'));
  let releaseRequest;
  const pendingRequest = new Promise(resolve => { releaseRequest = resolve; });
  await page.route('**/rest/v1/rpc/analytics_overview', async route => {
    await pendingRequest;
    await route.fulfill({ status: 503, contentType: 'application/json',
      body: '{"code":"QA_UNAVAILABLE","message":"Simulated unavailable"}' });
  });
  await page.goto(`${base}/app/analytics?from=2001-01-01&to=2001-01-01`);
  await page.getByText('Cargando reporte…', { exact: true }).waitFor();
  check('Loading state announced', await page.getByRole('status').filter({ hasText: 'Cargando reporte' }).isVisible());
  releaseRequest();
  await page.getByText('No se pudo consultar este reporte. Comprueba tus filtros y permisos e intenta actualizar.').waitFor();
  check('Server error state actionable', await page.getByRole('alert').isVisible());
  await page.unroute('**/rest/v1/rpc/analytics_overview');
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await page.getByRole('heading', { name: 'Estado actual de tu alcance' }).waitFor();
  check('Manual refresh recovers server error', await page.getByRole('heading', { name: 'Estado actual de tu alcance' }).isVisible());
  await page.getByRole('button', { name: 'Actualizar', exact: true }).focus();
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => ({ tag: document.activeElement.tagName, outline: getComputedStyle(document.activeElement).outlineStyle }));
  check('Keyboard focus visible', focus.tag === 'BUTTON' && focus.outline !== 'none');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('textbox', { name: 'Correo', exact: true }).fill('client.admin.a@omnia.local');
  await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill('OmniaTest!2026');
  await page.getByRole('button', { name: 'Entrar a OMNIA' }).click();
  await page.waitForURL('**/portal');
  await page.goto(`${base}/portal/reports?report=70000000-0000-0000-0000-000000001201`);
  await page.getByRole('heading', { name: 'September report', exact: true }).waitFor();
  check('Client known report correct', await dd('Hitos completos').innerText() === '1');
  const contrast = await page.evaluate(() => {
    const color = el => getComputedStyle(el).color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = channels => channels.map(c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; })
      .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const shell = document.querySelector('.portal-shell');
    const background = luminance(getComputedStyle(shell).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number));
    return ['h1', '.analytics-page p', '.analytics-metrics dt'].map(selector => {
      const text = luminance(color(document.querySelector(selector)));
      return (Math.max(text, background) + .05) / (Math.min(text, background) + .05);
    });
  });
  check('Portal heading/body/metric labels contrast at least 4.5:1', contrast.every(ratio => ratio >= 4.5));
  check('Client report contains no internal analytics', !(await page.locator('main').innerText()).match(/Trabajo abierto|Mediana creación|Revisión interna|Total documentado/));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await overflow(`Portal reports no overflow ${width}`);
    await page.screenshot({ path: `artifacts/phase-12/portal-reports-${width}.png`, fullPage: true });
  }
  check('No page runtime errors', errors.length === 0);
  return { checks, count: checks.length, initialAnalyticsRequests: initialQueries, runtimeErrors: errors };
}
