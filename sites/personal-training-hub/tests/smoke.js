/* Functional verification for the four Personal Training routes.
 *
 *   npm i playwright && node sites/personal-training-hub/tests/smoke.js
 *
 * Asserts the behaviours the build brief specifies rather than how the page
 * looks: CTA placement rules, the sticky-bar suppression rule, the specialty
 * filter, disclosure state, tap-target sizes, locked section order, and the
 * markup the brief forbids (AggregateRating, forms, price above section 09).
 *
 * CHROMIUM may point at a browser binary; otherwise Playwright's own is used.
 */
const { chromium } = require('playwright');
const path = require('path');

const SITE = path.join(__dirname, '..');
const url = p => 'file://' + path.join(SITE, p);

let fails = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'ok   ' : 'FAIL '}${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
}

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

  // ── desktop ───────────────────────────────────────────────────────────
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 920 } });
  const p = await desktop.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION|fonts\.googleapis/.test(m.text())) errors.push(m.text()); });

  await p.goto(url('index.html'));
  await p.waitForLoadState('load');

  check('no console/page errors on hub', errors.length === 0, errors.join(' | '));

  // FAQ: all collapsed, one-at-a-time
  const faqOpen = await p.locator('.faq-a:visible').count();
  check('hub FAQ starts fully collapsed', faqOpen === 0, `${faqOpen} visible`);

  await p.locator('.faq-q').first().click();
  check('FAQ item 1 opens', await p.locator('#faq-1').isVisible());
  check('FAQ chevron flips to en dash', (await p.locator('.faq-q').first().locator('[data-chev]').textContent()).trim() === '–');
  await p.locator('.faq-q').nth(3).click();
  check('opening item 4 closes item 1', !(await p.locator('#faq-1').isVisible()) && await p.locator('#faq-4').isVisible());
  await p.locator('.faq-q').nth(3).click();
  check('clicking item 4 again closes it', !(await p.locator('#faq-4').isVisible()));

  // trainer philosophy expanders
  check('philosophies start collapsed', (await p.locator('.t-phil:visible').count()) === 0);
  const firstToggle = p.locator('.t-toggle').first();
  check('expander label starts as TRAINING PHILOSOPHY', (await firstToggle.textContent()).includes('TRAINING PHILOSOPHY'));
  await firstToggle.click();
  check('JR philosophy opens', await p.locator('#phil-jr-romero').isVisible());
  check('expander label becomes LESS', (await firstToggle.textContent()).includes('LESS'));
  await p.locator('.t-toggle').nth(1).click();
  check('one philosophy open at a time', !(await p.locator('#phil-jr-romero').isVisible()) && await p.locator('#phil-jess-caze').isVisible());

  // tap targets
  const small = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.faq-q, .t-toggle, .chip, .hamburger, .f-link').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.height < 44) out.push(`${el.className.split(' ')[0]} h=${r.height.toFixed(1)}`);
    });
    return out;
  });
  check('all interactive controls ≥44px tall', small.length === 0, small.join(', '));

  // nav dropdown
  await p.locator('.nav-parent--current').hover();
  check('dropdown opens on hover', await p.locator('#pt-drop').isVisible());
  await p.locator('.nav-disclose').click();
  check('clicking the caret pins the dropdown open', await p.locator('#pt-drop').isVisible());
  await p.locator('.brand').hover();
  check('pinned dropdown survives the pointer leaving', await p.locator('#pt-drop').isVisible());
  await p.locator('.nav-parent--current').hover();
  await p.locator('.nav-disclose').click();
  check('clicking again unpins and closes it', !(await p.locator('#pt-drop').isVisible()));
  check('Personal Training parent is a real link', await p.locator('.nav-parent--current > a.nav-link').getAttribute('href') === 'index.html');

  // no horizontal overflow, sticky hidden on desktop
  check('no horizontal scroll at 1280', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    `scrollWidth=${await p.evaluate(() => document.documentElement.scrollWidth)}`);
  check('sticky CTA hidden on desktop', !(await p.locator('[data-sticky-cta]').isVisible()));

  // analytics event
  await p.evaluate(() => {
    window.dataLayer = [];
    document.addEventListener('click', e => e.preventDefault());
  });
  await p.evaluate(() => document.querySelector('[data-cta-section="how-it-works"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  const ev = await p.evaluate(() => window.dataLayer[0]);
  check('CTA click pushes one event with section param',
    ev && ev.event === 'consultation_cta_click' && ev.cta_section === 'how-it-works', JSON.stringify(ev));

  // section order locked, and nothing above 09 names a price
  const order = await p.evaluate(() =>
    [...document.querySelectorAll('main .sec-num')].map(e => e.textContent.trim()));
  check('section numbers run in order', order.join(',') === '03,04,05,06,07,08,09,10,11', order.join(','));

  const aboveNine = await p.evaluate(() => {
    const nine = [...document.querySelectorAll('.sec-num')].find(e => e.textContent.trim() === '09');
    const stop = nine.closest('section');
    let text = '';
    for (const s of document.querySelectorAll('main > section')) {
      if (s === stop) break;
      text += ' ' + s.innerText;
    }
    return text;
  });
  check('no price or SKU above section 09',
    !/\$|\bper session\b|\bpackage price\b|PACK Training/i.test(aboveNine));
  check('"PACK Training" retired site-wide', !(await p.evaluate(() => /PACK Training/.test(document.body.innerText))));

  // ── mobile ────────────────────────────────────────────────────────────
  const mobile = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const m = await mobile.newPage();
  const merr = [];
  m.on('pageerror', e => merr.push(String(e)));
  await m.goto(url('index.html'));
  await m.waitForLoadState('load');
  check('no page errors at 375', merr.length === 0, merr.join(' | '));

  check('no horizontal scroll at 375', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    `scrollWidth=${await m.evaluate(() => document.documentElement.scrollWidth)}`);

  // primary CTA fully above the 667 fold
  const ctaBox = await m.locator('[data-cta-section="hero"]').boundingBox();
  check('hero primary CTA fully visible at 375×667 without scrolling',
    ctaBox && ctaBox.y + ctaBox.height <= 667, `bottom=${ctaBox && (ctaBox.y + ctaBox.height).toFixed(1)}`);

  // header button label fits without wrapping
  const hdr = await m.evaluate(() => {
    const el = document.querySelector('.nav-mobile .btn');
    return { w: el.getBoundingClientRect().width, lines: Math.round(el.getBoundingClientRect().height / 14), text: el.textContent.trim() };
  });
  check('mobile header CTA says FREE CONSULTATION', hdr.text === 'FREE CONSULTATION');
  check('header row does not overflow', await m.evaluate(() => {
    const r = document.querySelector('.header-bar');
    return r.scrollWidth <= r.clientWidth + 1;
  }), `btn width=${hdr.w.toFixed(1)}`);

  // sticky CTA: hidden over hero, appears after, suppressed beside in-page primary
  const stickyOn = () => m.evaluate(() => document.querySelector('[data-sticky-cta]').classList.contains('is-on'));
  await m.waitForTimeout(250);
  check('sticky CTA suppressed while hero is on screen', !(await stickyOn()));

  await m.evaluate(() => {
    const r = document.querySelectorAll('main > section')[2]; // recognition, well past the hero
    window.scrollTo(0, r.offsetTop + 200);
  });
  await m.waitForTimeout(350);
  check('sticky CTA appears once the hero has exited', await stickyOn());

  await m.evaluate(() => {
    const cta = document.querySelector('[data-cta-section="how-it-works"]');
    cta.scrollIntoView({ block: 'center' });
  });
  await m.waitForTimeout(350);
  check('sticky CTA suppressed beside an in-page primary CTA', !(await stickyOn()));

  // never two primary CTAs in one viewport
  const doubled = await m.evaluate(() => {
    const inView = el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };
    const primaries = [...document.querySelectorAll('[data-primary-cta]')].filter(inView).length;
    const sticky = document.querySelector('[data-sticky-cta]');
    return primaries + (sticky.classList.contains('is-on') ? 1 : 0);
  });
  check('at most one primary CTA in the viewport', doubled <= 1, `${doubled} visible`);

  // mobile menu
  await m.evaluate(() => window.scrollTo(0, 0));
  check('mobile menu starts closed', !(await m.locator('#mobile-menu').isVisible()));
  await m.locator('[data-menu-toggle]').click();
  check('mobile menu opens', await m.locator('#mobile-menu').isVisible());
  check('menu exposes the three PT children', await m.locator('#mobile-menu .sub').count() === 3);

  // recognition grid is 1-up, no carousel
  const recCols = await m.evaluate(() => {
    const cards = [...document.querySelectorAll('.rec-card')];
    return new Set(cards.map(c => Math.round(c.getBoundingClientRect().left))).size;
  });
  check('recognition grid is 1-up on mobile', recCols === 1, `${recCols} columns`);
  check('all 13 recognition cards rendered', await m.locator('.rec-card').count() === 13);

  // The comparison stacks into two labelled blocks. Page-level horizontal
  // scroll is asserted above; the blueprint registration marks intentionally
  // sit 6px outside each frame, so a card's own scrollWidth is not the test.
  const cmp = await m.evaluate(() => {
    const cards = [...document.querySelectorAll('.compare-card')];
    return {
      cols: new Set(cards.map(c => Math.round(c.getBoundingClientRect().left))).size,
      rows: cards.map(c => c.querySelectorAll('.cmp-row').length),
      marksInViewport: [...document.querySelectorAll('.compare-card .corner')]
        .every(i => i.getBoundingClientRect().right <= window.innerWidth)
    };
  });
  check('comparison stacks into one column', cmp.cols === 1, `${cmp.cols} columns`);
  check('both blocks carry all five labelled rows', cmp.rows.join(',') === '5,5', cmp.rows.join(','));
  check('registration marks stay inside the viewport', cmp.marksInViewport);
  check('no text is clipped in the comparison', await m.evaluate(() =>
    [...document.querySelectorAll('.cmp-label, .cmp-val, .cmp-title')]
      .every(el => el.scrollWidth <= el.clientWidth + 1)));

  // ── trainers index: the specialty filter ──────────────────────────────
  const t = await desktop.newPage();
  const terr = [];
  t.on('pageerror', e => terr.push(String(e)));
  await t.goto(url('trainers/index.html'));
  await t.waitForLoadState('load');
  check('no page errors on trainers index', terr.length === 0, terr.join(' | '));
  check('8 trainers shown unfiltered', await t.locator('[data-trainer]:visible').count() === 8);
  check('count line reads 8 trainers published', (await t.locator('[data-roster-count]').textContent()).trim() === '8 trainers published');

  await t.locator('[data-specialty="Pre and Postnatal"]').click();
  check('filtering to Pre and Postnatal leaves 1 trainer', await t.locator('[data-trainer]:visible').count() === 1);
  check('the remaining trainer is Becca Reeve', (await t.locator('[data-trainer]:visible .t-name').textContent()).trim() === 'Becca Reeve');
  check('count line updates', (await t.locator('[data-roster-count]').textContent()).includes('1 trainer · Pre and Postnatal'));
  check('chip reads as pressed', await t.locator('[data-specialty="Pre and Postnatal"]').getAttribute('aria-pressed') === 'true');

  await t.locator('[data-specialty="Strength"]').click();
  check('Strength matches 8 trainers', await t.locator('[data-trainer]:visible').count() === 8);

  await t.locator('[data-specialty="Injury and Rehabilitation"]').click();
  check('an unclaimed specialty shows the empty state', await t.locator('[data-roster-empty]').isVisible());
  check('empty state names the specialty',
    (await t.locator('[data-roster-empty-title]').textContent()).includes('Injury and Rehabilitation'));
  check('roster grid hidden when empty', !(await t.locator('[data-roster]').isVisible()));

  await t.locator('[data-specialty=""]').click();
  check('All trainers restores the full roster',
    (await t.locator('[data-trainer]:visible').count()) === 8 && !(await t.locator('[data-roster-empty]').isVisible()));

  // ── consultation + profile ────────────────────────────────────────────
  const c = await desktop.newPage();
  const cerr = [];
  c.on('pageerror', e => cerr.push(String(e)));
  await c.goto(url('consultation/index.html'));
  await c.waitForLoadState('load');
  check('no page errors on consultation', cerr.length === 0, cerr.join(' | '));
  check('consultation FAQ opens on the first item', await c.locator('#cfaq-1').isVisible());
  check('only that one is open', (await c.locator('.faq-a:visible').count()) === 1);
  check('no forms anywhere on the consultation page', await c.locator('form, input, textarea, select').count() === 0);
  check('"free" appears in the H1', (await c.locator('h1').textContent()).toLowerCase().includes('free'));

  const pr = await desktop.newPage();
  const perr = [];
  pr.on('pageerror', e => perr.push(String(e)));
  await pr.goto(url('trainers/jr-romero/index.html'));
  await pr.waitForLoadState('load');
  check('no page errors on profile', perr.length === 0, perr.join(' | '));
  check('profile CTA points at the consultation, not a trainer calendar',
    (await pr.locator('[data-cta-section="profile"]').getAttribute('href')).includes('products=8aff2d32'));
  check('no forms on the profile', await pr.locator('form, input, textarea, select').count() === 0);

  // no AggregateRating anywhere
  for (const [name, page] of [['hub', p], ['trainers', t], ['consultation', c], ['profile', pr]]) {
    const has = await page.evaluate(() =>
      [...document.querySelectorAll('script[type="application/ld+json"]')]
        .some(s => /aggregateRating/i.test(s.textContent)));
    check(`no AggregateRating markup on ${name}`, !has);
  }

  await browser.close();
  console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURE(S)'}`);
  process.exit(fails === 0 ? 0 : 1);
})();
