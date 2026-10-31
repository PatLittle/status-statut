// Run with Node >=20 and Playwright available through NODE_PATH.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.STATUS_URL || 'http://127.0.0.1:3000/status-statut/';
const screenshots = process.env.SCREENSHOT_DIR || 'screenshots';
(async () => {
  fs.mkdirSync(screenshots, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = new URL(base); url.searchParams.set('lang', 'en'); url.searchParams.set('test', 'preserved');
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.locator('.gcds-language-link').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.live-status article').length > 0);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('.gcds-language-link').textContent(), 'Français');
  assert.equal(await page.locator('h1').textContent().then(x => x.trim()), 'Open Government Portal');
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily.includes('Noto Sans')), true);
  assert.equal(await page.locator('input[type=radio]').first().isVisible(), true);
  // A language change must preserve the chosen measurement interval and URL state.
  await page.locator('#data_month').check();
  await page.screenshot({ path: path.join(screenshots, 'desktop-en.png'), fullPage: true });
  await page.locator('.gcds-language-link').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.lang === 'fr');
  assert.equal(await page.locator('h1').textContent().then(x => x.trim()), 'Portail du gouvernement ouvert');
  assert.equal(await page.locator('#data_month').isChecked(), true);
  assert.equal(new URL(page.url()).searchParams.get('test'), 'preserved');
  assert.equal(await page.locator('.gcds-language-link').getAttribute('lang'), 'en');
  assert.equal(await page.locator('.gcds-language-link').evaluate(el => el === document.activeElement), true);
  assert.ok((await page.locator('.live-status').textContent()).includes('Temps de réponse moyen'));
  assert.ok((await page.locator('.live-status .data').allTextContents()).some(x => /\d+\s*ms/.test(x)));
  assert.ok(!(await page.locator('main').textContent()).includes('Overall uptime'));
  await page.screenshot({ path: path.join(screenshots, 'desktop-fr.png'), fullPage: true });
  for (const lang of ['fr', 'en']) {
    await page.setViewportSize({ width: 390, height: 844 });
    if (await page.locator('html').getAttribute('lang') !== lang) await page.locator('.gcds-language-link').click();
    await page.waitForFunction(expected => document.documentElement.lang === expected, lang);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal overflow');
    await page.screenshot({ path: path.join(screenshots, `mobile-${lang}.png`), fullPage: true });
  }
  // The adapter must handle future asynchronous text updates, not only initial HTML.
  await page.locator('.gcds-language-link').click();
  await page.evaluate(() => {
    const fixture = document.createElement('div'); fixture.id = 'gcds-test-fixture';
    fixture.innerHTML = '<span>Incident #123 report / Rapport d\'incident #123 →</span><div>Posted at <a href="https://example.com/date">Oct 31</a> by <a href="https://example.com/author">@author</a> / Posté à <a href="https://example.com/date">Oct 31</a> par <a href="https://example.com/author">@author</a></div>';
    document.querySelector('main').append(fixture);
  });
  await page.waitForFunction(() => document.querySelector('#gcds-test-fixture span').textContent.includes("Rapport d'incident #123"));
  await page.waitForFunction(() => document.querySelectorAll('#gcds-test-fixture a').length === 2);
  assert.ok((await page.locator('#gcds-test-fixture div').textContent()).startsWith('Posté à'));
  await page.locator('.gcds-language-link').click();
  await page.waitForFunction(() => document.querySelector('#gcds-test-fixture span').textContent === 'Incident #123 report');
  assert.equal(await page.locator('#gcds-test-fixture a').count(), 2);
  await page.evaluate(() => { document.querySelector('#gcds-test-fixture span').firstChild.nodeValue = "Incident #456 report / Rapport d'incident #456 →"; });
  await page.waitForFunction(() => document.querySelector('#gcds-test-fixture span').textContent === 'Incident #456 report');
  await page.locator('#gcds-test-fixture').evaluate(el => el.remove());
  // Persisted preference and explicit URL override.
  await page.locator('.gcds-language-link').click();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.lang === 'fr');
  await page.goto(new URL('?lang=en', base).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.locator('.gcds-language-link').click();
  await page.goBack();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  // No JavaScript: source bilingual copy remains visible.
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noJS.newPage();
  await fallback.goto(base);
  assert.ok((await fallback.locator('h1').textContent()).includes(' / '));
  assert.equal(await fallback.locator('.gcds-language-link').count(), 0);
  await noJS.close();
  assert.deepEqual(errors, [], 'No browser runtime errors');
  await browser.close();
  console.log('PASS: EN/FR, keyboard, responsive layout, numbers/units, dynamic updates, metadata links, persistence, URL precedence, Back, and bilingual no-JS fallback.');
})().catch(error => { console.error(error); process.exit(1); });
