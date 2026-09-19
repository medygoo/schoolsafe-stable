/* Animation behavior, theme isolation, lifecycle and reduced motion. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.SCHOOLSAFE_URL || 'http://127.0.0.1:4176/';
const output = process.env.JASPE_QA_OUTPUT;
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('response', r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(new URL('jaspe-assise-preview.html',base).href);
    await page.waitForFunction(()=>document.querySelectorAll('.jaspe-seated[data-ready="true"]').length===2);
    for (const action of ['speak','speakBoth','think','smile','read']) {
      await page.locator(`[data-action="${action}"]`).click();
      await page.waitForFunction(action=>[...document.querySelectorAll('.jaspe-seated')].every(e=>e.dataset.action===action),action);
      const start=await page.locator('#light').getAttribute('data-frame');
      await page.waitForFunction(start=>document.getElementById('light').dataset.frame!==start,start);
      for(const [id,suffix] of [['light','-clair.png'],['dark','-sombre.png']]) {
        assert.equal(await page.locator(`#${id}`).getAttribute('data-theme'),id);
        assert.ok(await page.locator(`#${id} .jaspe-seated__frame`).evaluateAll((els,s)=>els.some(e=>e.style.opacity==='1' && e.style.backgroundImage.includes(s)),suffix));
      }
    }
    await page.waitForTimeout(120);
    if(output) await page.screenshot({path:output+'/jaspe-assise-animee.png',fullPage:true});
    await page.locator('#pause').click();
    await page.waitForFunction(()=>document.querySelectorAll('.jaspe-seated[data-playing="false"]').length===2);
    const paused=await page.locator('#light').getAttribute('data-frame');
    await page.waitForTimeout(850);
    assert.equal(await page.locator('#light').getAttribute('data-frame'),paused);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('[data-action="think"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.jaspe-seated[data-frame="0"][data-playing="false"]').length===2);
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#dark').getAttribute('data-frame'),'0');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('[data-action="speak"]').click();
    await page.evaluate(()=>{
      const spacer=document.createElement('div');spacer.style.height='2000px';document.body.append(spacer);scrollTo(0,2000);
    });
    await page.waitForFunction(()=>document.querySelectorAll('.jaspe-seated[data-playing="false"]').length===2);
    await page.evaluate(()=>{document.body.lastElementChild.remove();scrollTo(0,0);});
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>{
      speechSynthesis.cancel=()=>{};
      speechSynthesis.speak=u=>{window.qaVoice=u;u.onstart();};
    });
    await page.locator('[data-action="speakBoth"]').click();
    await page.locator('#voiceForm button[type="submit"]').click();
    await page.waitForFunction(()=>document.getElementById('light').dataset.action==='speakBoth');
    await page.evaluate(()=>window.qaVoice.onend());
    await page.waitForFunction(()=>document.getElementById('light').dataset.action==='smile');
    assert.deepEqual(errors,[]);
    console.log('PASS: 5 actions / 2 themes, changing frames, both-hands audio start/end, pause, viewport pause, reduced motion, 390/320px, no page errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
