// eslint-disable-next-line no-unused-expressions
async page => {
  const base='http://127.0.0.1:53170', checks=[], requests=[];
  const fixture=await (await page.request.get(base+'/phase14-smoke-fixture.json')).json();
  const check=(name,result) => { if (!result) throw new Error(name); checks.push(name); };
  await page.setViewportSize({width:375,height:850});
  await page.goto(base+'/login'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.goto(`${base}/portal/push/${fixture.notificationId}`);
  await page.waitForURL('**/login');
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill('client.admin.a@omnia.local');
  await page.locator('#login-password').fill('OmniaTest!2026');
  await page.getByRole('button',{name:'Entrar a OMNIA'}).click();
  await page.waitForURL(`**/portal/messages/${fixture.channelId}`);
  await page.locator('#message-body').waitFor();
  check('authenticated push return resolves persisted notification to authorized message channel',true);
  await page.getByRole('link',{name:'Notificaciones',exact:true}).first().click();
  await page.waitForURL('**/portal/notifications');
  await page.goBack();
  await page.waitForURL(`**/portal/messages/${fixture.channelId}`);
  await page.locator('#message-body').waitFor();
  check('SPA history/back preserves authenticated push destination',true);
  page.on('request',request => { if (request.url().endsWith('/rpc/send_message')) requests.push(request.url()); });
  const body='Phase14 online retry '+Date.now();
  await page.locator('#message-body').fill(body);
  const cdp=await page.context().newCDPSession(page);
  await page.context().setOffline(true);
  await cdp.send('Network.overrideNetworkState',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await page.getByText(/Estás sin conexión/).waitFor();
  check('offline composer submit disabled with draft retained',await page.getByRole('button',{name:'Enviar',exact:true}).isDisabled() && await page.locator('#message-body').inputValue()===body);
  await page.context().setOffline(false);
  await cdp.send('Network.overrideNetworkState',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await page.getByText(/Estás sin conexión/).waitFor({state:'hidden'});
  await page.waitForTimeout(250);
  check('reconnect never automatically sends offline draft',requests.length===0);
  await page.getByRole('button',{name:'Enviar',exact:true}).click();
  await page.getByRole('log',{name:'Historial de mensajes'}).getByText(body,{exact:true}).waitFor();
  check('explicit online retry sends one persisted message',requests.length===1);
  // These are permission/feature fixtures; do not claim native OS permission QA.
  await page.evaluate(() => {
    window.phase14PermissionCalls=0;
    Object.defineProperty(Notification,'permission',{configurable:true,get:() => 'denied'});
    Notification.requestPermission=async () => {window.phase14PermissionCalls++;return 'denied';};
  });
  await page.getByRole('button',{name:'Menú del portal',exact:true}).click();
  await page.getByRole('navigation',{name:'Navegación del portal'}).getByRole('link',{name:'Configuración',exact:true}).click();
  await page.getByRole('button',{name:'Activar Push'}).waitFor();
  check('denied state explains browser settings without prompting again',await page.getByRole('button',{name:'Activar Push'}).isDisabled()
    && await page.getByText(/Permiso bloqueado/).isVisible() && await page.evaluate(() => window.phase14PermissionCalls===0));
  await page.getByRole('button',{name:'Menú del portal',exact:true}).click();
  await page.getByRole('navigation',{name:'Navegación del portal'}).getByRole('link',{name:'Proyectos',exact:true}).click();
  await page.evaluate(() => {delete window.PushManager;});
  await page.getByRole('button',{name:'Menú del portal',exact:true}).click();
  await page.getByRole('navigation',{name:'Navegación del portal'}).getByRole('link',{name:'Configuración',exact:true}).click();
  await page.getByText(/Push no está disponible/).waitFor();
  check('unsupported Push keeps core portal functional',await page.getByRole('button',{name:'Activar Push'}).isDisabled());
  // Regression of safe error handling for the profile's logout action offline.
  await page.context().setOffline(true);
  await cdp.send('Network.overrideNetworkState',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await page.locator('.portal-settings-list').locator('..').getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await page.waitForFunction(() => location.pathname==='/login' || document.body.innerText.includes('No pudimos cerrar sesión'));
  const locallySignedOut=page.url().endsWith('/login');
  check('offline logout clears private view or exposes recoverable error',locallySignedOut
    ? await page.getByRole('heading',{name:'Vuelve a tu espacio'}).isVisible()
    : await page.getByText(/No pudimos cerrar sesión/).isVisible());
  await page.context().setOffline(false);
  await cdp.send('Network.overrideNetworkState',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  if (!locallySignedOut) {
    await page.locator('.portal-header__identity').getByRole('button',{name:'Cerrar sesión',exact:true}).click();
    await page.waitForURL('**/login');
  }
  await page.goto(`${base}/portal/push/${fixture.notificationId}`); await page.waitForURL('**/login');
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill('client.user.b@omnia.local');
  await page.locator('#login-password').fill('OmniaTest!2026');
  await page.getByRole('button',{name:'Entrar a OMNIA'}).click();
  await page.getByText(/Esta notificación no está disponible para tu sesión/).waitFor();
  check('foreign user cannot resolve or read A notification after push login',page.url().includes(`/portal/push/${fixture.notificationId}`));
  return {passed:checks.length,checks,permissionStates:'denied/unsupported feature fixtures',mutations:'actual local Auth/RPC/notification fetch and message send'};
}
