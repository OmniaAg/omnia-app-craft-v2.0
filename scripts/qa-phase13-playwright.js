// Playwright CLI accepts a single function expression.
// eslint-disable-next-line no-unused-expressions
async page => {
  const base = 'http://127.0.0.1:53170';
  const project = '60000000-0000-0000-0000-0000000013a1';
  const suffix = Date.now().toString(36);
  const signingFixture = 'phase13-local-test-signing-material-00000000000000';
  const checks = [], errors = [], networkErrors = [], requests = [], leaks = [];
  const initialRequests = {};
  // The CLI pauses on native dialogs; the preceding manual QA observed the prompt.
  // Explicitly accept the test-send confirmation within this reproducible harness.
  await page.addInitScript(() => { window.confirm = () => true; });
  const check = (name, condition) => { if (!condition) throw new Error(name); checks.push(name); };
  const runtimeError = error => errors.push(error.message);
  const consoleError = message => { if (message.type() === 'error') errors.push(message.text()); };
  const requestEvent = request => {
    if (/\/rpc\/phase13_|\/functions\/v1\/automation-api/.test(request.url())) requests.push(request.url().split('/').pop());
  };
  const responseEvent = async response => {
    if (!response.url().includes('127.0.0.1:56321')) return;
    if (response.status() >= 400) networkErrors.push({ endpoint: response.url().split('/').pop(), status: response.status() });
    try { if ((await response.text()).includes(signingFixture)) leaks.push('secret in network response'); } catch { /* Navigation may cancel a response. */ }
  };
  page.on('pageerror', runtimeError);
  page.on('console', consoleError);
  page.on('request', requestEvent);
  page.on('response', responseEvent);
  async function login(email, destination) {
    await page.goto(base);
    await page.waitForURL(/\/(app|portal|login)$/);
    if (!page.url().endsWith('/login')) await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await page.getByRole('textbox', { name: 'Correo', exact: true }).fill(email);
    await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill('OmniaTest!2026');
    await page.getByRole('button', { name: 'Entrar a OMNIA' }).click();
    await page.waitForURL(`**/${destination}`);
  }
  async function responsive(surface) {
    check(`${surface}: card text contrast at least 4.5:1`, await page.locator('.p13-card h2,.p13-card h3,.p13-card p,.p13-card label,.p13-card legend').evaluateAll(elements => {
      const lum = rgb => rgb.slice(0, 3).map(value => { const normalized = value / 255; return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
      return elements.every(element => {
        let background = element;
        while (background && /rgba\(.*?,\s*0\)/.test(getComputedStyle(background).backgroundColor)) background = background.parentElement;
        if (!background) return false;
        const foreground = lum(getComputedStyle(element).color.match(/[\d.]+/g).map(Number));
        const behind = lum(getComputedStyle(background).backgroundColor.match(/[\d.]+/g).map(Number));
        return (Math.max(foreground, behind) + .05) / (Math.min(foreground, behind) + .05) >= 4.5;
      });
    }));
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      check(`${surface}: no horizontal overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `artifacts/phase-13/${surface}-${width}.png`, fullPage: true });
    }
  }
  async function privacy(label) {
    check(`${label}: no secret in DOM/storage`, !(await page.evaluate(() => document.documentElement.outerHTML + JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).includes(signingFixture));
  }
  async function idle(label) {
    await page.waitForTimeout(300);
    const before = requests.length;
    await page.waitForTimeout(2000);
    check(`${label}: no idle polling`, before === requests.length);
  }
  try {
    await login('director@omnia.local', 'app');
    await page.setViewportSize({ width: 1440, height: 1000 });
    let start = requests.length;
    await page.goto(`${base}/app/integrations?project=${project}`);
    await page.getByRole('button', { name: 'Conectar webhook', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Conexiones del proyecto', exact: true }).waitFor();
    await page.getByText('Cargando conexiones…', { exact: true }).waitFor({ state: 'hidden' });
    initialRequests.integrations = requests.slice(start);
    await page.getByRole('button', { name: 'Conectar webhook', exact: true }).click();
    const connectionName = `QA webhook ${suffix}`;
    await page.getByLabel('Nombre de conexión', { exact: true }).fill(connectionName);
    await page.getByLabel('Destino HTTPS', { exact: false }).fill('http://host.docker.internal:56413/hook');
    await page.getByLabel('Secreto de firma', { exact: false }).fill(signingFixture);
    await page.getByLabel('Autorizo esta conexión', { exact: false }).check();
    check('Integration secret input is masked', await page.getByLabel('Secreto de firma', { exact: false }).getAttribute('type') === 'password');
    check('Form controls have labels', await page.locator('.p13-form input,.p13-form select').evaluateAll(fields => fields.every(field => field.labels?.length > 0)));
    check('Checkbox label touch targets at least 44px', await page.locator('.p13-check').evaluateAll(labels => labels.every(label => label.getBoundingClientRect().height >= 44)));
    // Capture forms before entering secret material into any screenshot artifact.
    await page.getByLabel('Secreto de firma', { exact: false }).fill('');
    await responsive('integration-form');
    await page.getByLabel('Secreto de firma', { exact: false }).fill(signingFixture);
    await page.getByRole('button', { name: 'Guardar conexión', exact: true }).click();
    await page.getByText('Conexión guardada.', { exact: false }).waitFor();
    check('Secret form cleared after save', await page.locator('input[name="secret"]').count() === 0);
    await privacy('Integration saved');
    await page.getByRole('button', { name: `Probar ${connectionName}`, exact: true }).click();
    await page.getByText('Prueba registrada.', { exact: false }).waitFor();
    await page.locator('.p13-history > li').filter({ has: page.getByRole('heading', { name: connectionName, exact: true }) }).getByText('Salud: delivered', { exact: true }).waitFor();
    check('Signed integration test delivered', await page.getByText('Entregada', { exact: true }).count() > 0);
    await responsive('integrations');
    await idle('Integrations');
    // A permanent failure is visible in automation history without raw errors.
    const failedName = `QA forbidden ${suffix}`;
    await page.getByRole('button', { name: 'Conectar webhook', exact: true }).click();
    await page.getByLabel('Nombre de conexión', { exact: true }).fill(failedName);
    await page.getByLabel('Destino HTTPS', { exact: false }).fill('http://host.docker.internal:56413/forbidden');
    await page.getByLabel('Secreto de firma', { exact: false }).fill(signingFixture);
    await page.getByLabel('Autorizo esta conexión', { exact: false }).check();
    await page.getByRole('button', { name: 'Guardar conexión', exact: true }).click();
    await page.getByRole('heading', { name: failedName, exact: true }).waitFor();
    await privacy('Second integration saved');
    start = requests.length;
    await page.goto(`${base}/app/automations?project=${project}`);
    await page.getByRole('button', { name: 'Nuevo workflow', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Workflows del proyecto', exact: true }).waitFor();
    await page.getByText('Cargando workflows…', { exact: true }).waitFor({ state: 'hidden' });
    initialRequests.automations = requests.slice(start);
    const workflow = `QA workflow ${suffix}`;
    await page.getByRole('button', { name: 'Nuevo workflow', exact: true }).click();
    await page.getByLabel('Nombre', { exact: true }).fill(workflow);
    await page.getByRole('combobox', { name: 'Disparador', exact: true }).selectOption('manual');
    await page.getByLabel('Título del trabajo 1', { exact: true }).fill(`QA created ${suffix}`);
    await page.getByRole('button', { name: 'Añadir acción', exact: true }).click();
    await page.getByRole('combobox', { name: 'Tipo de acción 2', exact: true }).selectOption('outbound_webhook');
    await page.getByLabel('Conexión 2', { exact: false }).selectOption({ label: connectionName });
    await page.getByRole('checkbox', { name: 'Habilitar este workflow y autorizar sus acciones en el proyecto seleccionado', exact: true }).check();
    await responsive('automation-form');
    await page.getByRole('button', { name: 'Guardar workflow', exact: true }).click();
    await page.getByRole('heading', { name: workflow, exact: true }).waitFor();
    await page.getByRole('button', { name: `Deshabilitar ${workflow}`, exact: true }).click();
    await page.getByRole('button', { name: `Habilitar ${workflow}`, exact: true }).waitFor();
    check('Disabled workflow cannot manually execute', await page.getByRole('button', { name: `Ejecutar ${workflow}`, exact: true }).isDisabled());
    await page.getByRole('button', { name: `Habilitar ${workflow}`, exact: true }).click();
    await page.getByRole('button', { name: `Deshabilitar ${workflow}`, exact: true }).waitFor();
    await page.getByRole('button', { name: `Ejecutar ${workflow}`, exact: true }).click();
    await page.getByRole('heading', { name: 'Pasos de la ejecución', exact: true }).waitFor();
    await page.getByText('2 · outbound_webhook · Intento 1', { exact: true }).waitFor();
    check('Manual run succeeded and exposes ordered steps', await page.locator('.p13-card').filter({ has: page.getByRole('heading', { name: 'Pasos de la ejecución', exact: true }) }).getByText('Completada', { exact: true }).count() === 2);
    await responsive('automations');
    await idle('Automations');
    await page.getByRole('button', { name: 'Nuevo workflow', exact: true }).click();
    const failedWorkflow = `QA failed ${suffix}`;
    await page.getByLabel('Nombre', { exact: true }).fill(failedWorkflow);
    await page.getByRole('combobox', { name: 'Disparador', exact: true }).selectOption('manual');
    await page.getByRole('combobox', { name: 'Tipo de acción 1', exact: true }).selectOption('outbound_webhook');
    await page.getByLabel('Conexión 1', { exact: false }).selectOption({ label: failedName });
    await page.getByRole('checkbox', { name: 'Habilitar este workflow y autorizar sus acciones en el proyecto seleccionado', exact: true }).check();
    await page.getByRole('button', { name: 'Guardar workflow', exact: true }).click();
    await page.getByRole('heading', { name: failedWorkflow, exact: true }).waitFor();
    const failedResponse = page.waitForResponse(response => response.url().endsWith('/automation-api') && response.request().postDataJSON()?.operation === 'runAutomation');
    await page.getByRole('button', { name: `Ejecutar ${failedWorkflow}`, exact: true }).click();
    const failedId = (await (await failedResponse).json()).id;
    const failedRow = page.locator('.p13-history > li').filter({ has: page.getByRole('button', { name: `Ver pasos ${failedId.slice(0, 8)}`, exact: true }) });
    await failedRow.getByText('El destino rechazó las credenciales.', { exact: true }).waitFor();
    const retryButton = page.getByRole('button', { name: `Reintentar ${failedId.slice(0, 8)}`, exact: true });
    check('Failed run safe diagnosis and manual retry available', await retryButton.isVisible());
    await retryButton.click();
    await page.locator('.p13-card').filter({ has: page.getByRole('heading', { name: 'Pasos de la ejecución', exact: true }) }).getByText('1 · outbound_webhook · Intento 2', { exact: true }).waitFor();
    check('Manual retry preserves failed history and attempts', await page.getByText('Fallida', { exact: true }).count() >= 2);
    await page.screenshot({ path: 'artifacts/phase-13/automation-failed-390.png', fullPage: true });
    start = requests.length;
    await page.goto(`${base}/app/projects/${project}/assistant`);
    await page.getByRole('heading', { name: 'Mis resultados', exact: true }).waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => /^(Habilitar asistencia de IA|Revocar consentimiento de IA)$/.test(button.textContent) && !button.disabled));
    initialRequests.ai = requests.slice(start);
    if (await page.getByRole('button', { name: 'Habilitar asistencia de IA', exact: true }).isVisible()) await page.getByRole('button', { name: 'Habilitar asistencia de IA', exact: true }).click();
    await page.getByRole('button', { name: 'Generar resultado', exact: true }).waitFor();
    await page.getByLabel('Autorizo esta solicitud', { exact: false }).check();
    await page.getByRole('button', { name: 'Generar resultado', exact: true }).click();
    await page.getByText('Resultado registrado.', { exact: false }).waitFor();
    check('Summary result marks local provenance', await page.getByText('Generado por IA · Proveedor local determinista', { exact: true }).count() > 0);
    await page.getByRole('combobox', { name: 'Tarea', exact: true }).selectOption('draft_work');
    await page.getByLabel('Indicaciones para el borrador (opcional)', { exact: false }).fill('Preparar seguimiento y revisar los pendientes de este proyecto.');
    await page.getByRole('button', { name: 'Generar resultado', exact: true }).click();
    await page.getByRole('button', { name: 'Aprobar y crear trabajo', exact: true }).first().waitFor();
    check('Draft creation requires review', await page.getByRole('button', { name: 'Aprobar y crear trabajo', exact: true }).first().isDisabled());
    await page.getByLabel('He revisado el borrador', { exact: false }).first().check();
    await page.getByRole('button', { name: 'Aprobar y crear trabajo', exact: true }).first().click();
    await page.getByText('Borrador aprobado y trabajo creado.', { exact: true }).waitFor();
    check('Approved draft links authoritative work', await page.getByRole('link', { name: 'Ver trabajo aprobado', exact: true }).count() > 0);
    await responsive('ai');
    await idle('AI');
    await privacy('AI and integration privacy');
    check('Visible action targets at least 44px', await page.locator('.p13-page button').evaluateAll(buttons => buttons.filter(button => button.getBoundingClientRect().height > 0).every(button => button.getBoundingClientRect().height >= 44)));
    await page.getByRole('button', { name: 'Actualizar resultados', exact: true }).focus();
    await page.keyboard.press('Tab');
    check('Keyboard focus visible', await page.evaluate(() => document.activeElement !== document.body && getComputedStyle(document.activeElement).outlineStyle !== 'none'));
    await login('pm.basic@omnia.local', 'app');
    await page.goto(`${base}/app/automations?project=${project}`);
    await page.getByText('No tienes un proyecto autorizado para automatizaciones.', { exact: true }).waitFor();
    check('PM without capability cannot create automation', await page.getByRole('button', { name: 'Nuevo workflow', exact: true }).count() === 0);
    await page.goto(`${base}/app/integrations?project=${project}`);
    await page.getByText('No tienes un proyecto autorizado para integraciones.', { exact: true }).waitFor();
    check('PM without capability cannot configure integration', await page.getByRole('button', { name: 'Conectar webhook', exact: true }).count() === 0);
    await page.goto(`${base}/app/projects/${project}/assistant`);
    await page.getByText('No tienes permiso para usar IA en este proyecto.', { exact: true }).waitFor();
    check('PM without capability cannot generate AI', await page.getByRole('button', { name: 'Generar resultado', exact: true }).count() === 0);
    await login('client.admin.a@omnia.local', 'portal');
    check('Client portal exposes no Phase13 navigation', await page.getByRole('link', { name: /Automatizaciones|Integraciones|Asistente/ }).count() === 0);
    await page.goto(`${base}/app/automations?project=${project}`);
    await page.getByRole('heading', { name: 'Acceso denegado', exact: true }).waitFor();
    check('Client internal route blocked', await page.getByRole('button', { name: 'Nuevo workflow', exact: true }).count() === 0);
    await page.waitForTimeout(500);
    check('No page or console errors', errors.length === 0);
    check('No unexpected HTTP errors', networkErrors.length === 0);
    check('No network secret leakage', leaks.length === 0);
    await login('director@omnia.local', 'app');
    await page.goto(`${base}/app/automations?project=${project}`);
    await page.getByRole('heading', { name: workflow, exact: true }).waitFor();
    return { passed: checks.length, checks, initialRequests, phase13Requests: requests.length, runtimeErrors: errors, networkErrors, leaks };
  } finally {
    page.removeListener('pageerror', runtimeError);
    page.removeListener('console', consoleError);
    page.removeListener('request', requestEvent);
    page.removeListener('response', responseEvent);
  }
}
