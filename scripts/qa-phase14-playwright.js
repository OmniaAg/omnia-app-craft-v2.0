// Playwright CLI evaluates this single function expression.
// eslint-disable-next-line no-unused-expressions
async page => {
  const base='http://127.0.0.1:53170', project='60000000-0000-0000-0000-0000000000a1';
  const checks=[], findings=[], errors=[], requests=[];
  const check=(name,result) => { if (!result) throw new Error(name); checks.push(name); };
  page.on('pageerror',error => errors.push(error.message));
  page.on('request',request => { if (/push-api|notification_preferences|push_subscription_status|register_push_subscription|unregister_push_subscription/.test(request.url())) requests.push(request.url().split('/').pop()); });
  await page.context().clearCookies();
  await page.goto(base+'/login');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  async function login(email,surface) {
    await page.goto(base+'/login');
    await page.getByRole('textbox',{name:'Correo',exact:true}).fill(email);
    await page.getByRole('textbox',{name:'Contraseña',exact:true}).fill('OmniaTest!2026');
    await page.getByRole('button',{name:'Entrar a OMNIA'}).click();
    await page.waitForURL(`**/${surface}`);
    await page.getByRole('heading',{level:1}).waitFor();
  }
  async function navigate(label,path,width,surface) {
    if (width<=768) await page.getByRole('button',{name:surface==='app' ? 'Menú' : 'Menú del portal',exact:true}).click();
    const nav=page.getByRole('navigation',{name:surface==='app' ? 'Navegación de contexto' : 'Navegación del portal'});
    await nav.getByRole('link',{name:label,exact:true}).click();
    await page.waitForURL(`**${path}`);
    await page.getByRole('heading',{level:1}).waitFor();
  }
  async function inspect(surface,width,label) {
    await page.waitForTimeout(150);
    const layout=await page.evaluate(() => {
      const bad=[...document.querySelectorAll('main button, nav a, .mobile-menu-toggle')].filter(element => {
        const box=element.getBoundingClientRect(); return box.width>0 && box.height>0 && getComputedStyle(element).visibility!=='hidden' && box.height<43;
      }).map(element => element.textContent.trim());
      const overflow=[...document.querySelectorAll('main, main > *, .device-settings, .messaging-layout')].filter(element => {
        const box=element.getBoundingClientRect(); return box.width>0 && (box.right>innerWidth+1 || box.left< -1);
      }).map(element => element.className);
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow,bad};
    });
    if (layout.scrollWidth>width || layout.overflow.length) findings.push({surface,width,label,overflow:layout});
    else check(`${surface} ${label} ${width}: no global overflow`,true);
    if (layout.bad.length) findings.push({surface,width,label,smallTargets:layout.bad});
    if (['messages','settings','home','projects','billing','reports'].includes(label)) await page.screenshot({path:`artifacts/phase-14/${surface}-${label}-${width}.png`,fullPage:true});
  }
  await login('director@omnia.local','app');
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  check('preview production SW controls authenticated internal page',true);
  for (const width of [1440,768,390,375]) {
    await page.setViewportSize({width,height:900});
    for (const [label,path,slug] of [['Interno','/app','home'],['Mi Espacio','/app/my-space','my-space'],['Proyectos','/app/projects','projects'],['Mensajes','/app/messages','messages'],['Notificaciones','/app/notifications','notifications'],['Archivos','/app/content-manager','files'],['Billing','/app/billing','billing'],['Analytics','/app/analytics','analytics'],['Automatizaciones','/app/automations','automations'],['Integraciones','/app/integrations','integrations'],['Configuración','/app/settings','settings']]) {
      await navigate(label,path,width,'app'); await inspect('app',width,slug);
      if (slug==='projects') {
        await page.locator('main a[href="/app/projects/'+project+'"]').first().click();
        await page.getByRole('heading',{level:1}).waitFor(); await inspect('app',width,'project-detail');
      }
      if (slug==='messages') {
        const channel=page.locator('.messaging-channel').first();
        if (await channel.count()) {
          await channel.click(); await page.locator('#message-body').waitFor();
          await page.locator('#message-body').fill('Borrador móvil Phase14');
          check(`composer visible ${width}`,await page.getByRole('button',{name:'Enviar',exact:true}).isEnabled());
          await inspect('app',width,'conversation');
          if (width<=768) { await page.getByRole('button',{name:'Cambiar canal'}).click(); check(`change channel ${width}`,await page.getByRole('navigation',{name:'Canales'}).isVisible()); }
        }
      }
    }
  }
  // Installation instructions only appear after the explicit action.
  check('no automatic install instructions',await page.getByText(/En iPhone o iPad, abre Safari/).count()===0);
  await page.getByRole('button',{name:'Instalar aplicación'}).click();
  check('explicit install action offers platform instructions',await page.getByText(/En iPhone o iPad, abre Safari/).isVisible());
  // Headless provider subscriptions depend on external browser services. Use a
  // deterministic browser PushManager fixture with actual Auth/RPC/Edge config.
  const fixture=await page.evaluate(async () => {
    const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
    const encoded=bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
    return {keys:{p256dh:encoded(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:encoded(crypto.getRandomValues(new Uint8Array(16)))},suffix:crypto.randomUUID()};
  });
  await page.addInitScript(fixture => {
    const stored=()=>JSON.parse(sessionStorage.getItem('phase14-push-fixture') || 'null');
    const wrap=data => data ? {...data,toJSON:()=>data,unsubscribe:async () => {sessionStorage.removeItem('phase14-push-fixture');return true;}} : null;
    Object.defineProperty(PushManager.prototype,'getSubscription',{value:async () => wrap(stored())});
    Object.defineProperty(PushManager.prototype,'subscribe',{value:async () => {
      const data={endpoint:'https://fcm.googleapis.com/fcm/send/phase14_browser_'+fixture.suffix,keys:fixture.keys};
      sessionStorage.setItem('phase14-push-fixture',JSON.stringify(data));return wrap(data);
    }});
    Object.defineProperty(Notification,'permission',{get:() => sessionStorage.getItem('phase14-permission') || 'default',configurable:true});
    Notification.requestPermission=async () => {sessionStorage.setItem('phase14-permission','granted');sessionStorage.setItem('phase14-requested','yes');return 'granted';};
  },fixture);
  await page.reload(); await page.getByRole('button',{name:'Activar Push'}).waitFor();
  check('permission never requested on settings load',await page.evaluate(() => sessionStorage.getItem('phase14-requested')===null));
  await page.getByRole('button',{name:'Activar Push'}).click(); await page.getByRole('button',{name:'Desactivar Push'}).waitFor();
  check('explicit permission then real authenticated registration',await page.evaluate(() => sessionStorage.getItem('phase14-requested')==='yes'));
  await page.getByRole('button',{name:'Desactivar Push'}).click(); await page.getByRole('button',{name:'Activar Push'}).waitFor();
  check('disable removes browser subscription',await page.evaluate(() => sessionStorage.getItem('phase14-push-fixture')===null));
  await page.getByRole('button',{name:'Activar Push'}).click(); await page.getByRole('button',{name:'Desactivar Push'}).waitFor();
  await page.getByRole('button',{name:'Menú',exact:true}).click();
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click(); await page.waitForURL('**/login');
  check('real app logout unsubscribes shared-device browser',await page.evaluate(() => sessionStorage.getItem('phase14-push-fixture')===null));
  await login('client.admin.a@omnia.local','portal');
  for (const width of [1440,768,390,375]) {
    await page.setViewportSize({width,height:900});
    for (const [label,path,slug] of [['Resumen','/portal','home'],['Proyectos','/portal/projects','projects'],['Aprobaciones','/portal/approvals','approvals'],['Documentos','/portal/documents','documents'],['Mensajes','/portal/messages','messages'],['Reportes','/portal/reports','reports'],['Configuración','/portal/settings','settings']]) {
      await navigate(label,path,width,'portal'); await inspect('portal',width,slug);
      if (slug==='projects') {
        const projectLink=page.locator('main a[href^="/portal/projects/"]').first();
        if (await projectLink.count()) { await projectLink.click(); await page.getByRole('heading',{level:1}).waitFor(); await inspect('portal',width,'project-detail'); }
      }
      if (slug==='messages') { await page.locator('.messaging-channel').first().click(); await page.locator('#message-body').waitFor(); await inspect('portal',width,'conversation'); }
    }
  }
  check('user B does not inherit user A Push',await page.getByRole('button',{name:'Activar Push'}).isVisible());
  const cdp=await page.context().newCDPSession(page);
  await page.context().setOffline(true);
  await cdp.send('Network.overrideNetworkState',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await page.getByText(/Estás sin conexión/).waitFor();
  check('portal offline status and disabled Push mutation',await page.getByRole('button',{name:'Activar Push'}).isDisabled());
  await page.context().setOffline(false);
  await cdp.send('Network.overrideNetworkState',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await page.getByText(/Estás sin conexión/).waitFor({state:'hidden'});
  check('portal reconnect restores action',await page.getByRole('button',{name:'Activar Push'}).isEnabled());
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Menú del portal',exact:true}).focus();
  await page.keyboard.press('Enter');
  check('mobile menu keyboard and aria-expanded',await page.getByRole('button',{name:'Cerrar menú',exact:true}).getAttribute('aria-expanded')==='true');
  await page.keyboard.press('Enter');
  check('visible focus indicator',await page.getByRole('button',{name:'Menú del portal',exact:true}).evaluate(el => getComputedStyle(el).outlineStyle!=='none'));
  // This Chrome build does not emulate display-mode through CDP. Exercise the
  // installed-platform feature branch without claiming a real OS installation.
  await page.addInitScript(() => Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
  await page.reload(); await page.getByRole('heading',{name:'Configuración',exact:true}).waitFor();
  check('standalone feature fixture keeps navigation and session',await page.getByRole('button',{name:'Menú del portal',exact:true}).isVisible()
    && await page.getByRole('button',{name:'Instalar aplicación'}).count()===0);
  await page.screenshot({path:'artifacts/phase-14/portal-standalone-375.png',fullPage:true});
  const cache=await page.evaluate(async () => {
    const result=[]; for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) result.push(new URL(request.url).pathname); return result;
  });
  check('authenticated Cache Storage excludes Supabase/private routes',cache.every(path => /^\/assets\/|^\/icons\/|^\/favicon-|^\/index.html$|^\/manifest.webmanifest$/.test(path)));
  return {passed:checks.length,checks,findings,runtimeErrors:errors,pushRequests:requests,pushBrowser:'deterministic PushManager fixture; real Auth/RPC/Edge configuration',widths:[1440,768,390,375]};
}
