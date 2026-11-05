// H4 real-browser check (SPEC v3.0, milestones H3 and H4). Parts 1–3 are the H3 check: two parts,
// Find, Browse, scanning, labels. Part 4 is H4: displays, the item's usual display, a season's
// tasks, Start setup and the setup list (ticks, Unpack a whole bin, Finish setup), the Holiday
// home after it, a display's screen and setup photos by season, Put out / Put back on an item, Find
// by display, Add to Calendar, removing a display; then the new screens at iPhone width.
// Part 1 builds a database exactly as 0.1.2 declared it (schema v2), then opens 0.1.4: the
// in-place upgrade must put everything in Household and the seasons in Holiday. Part 2 starts
// fresh and drives both parts: Set up, the part switch and tab bars, areas with codes across
// parts, bins and items, Find with the other part's count, Browse views, a typed bin code from
// the other part (switch + Undo), bin labels and "Label out of date", moving an item and a bin
// to the other part, the Season home and Lists, then the iPhone layout. Real IndexedDB, headless
// Chrome. Usage: npm run build && node scripts/h4-ui-check.mjs <chrome.exe> <screenshot dir>
import { tempDir, track } from './tmp-cleanup.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [chrome, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORIGIN = 'http://localhost:4372';

const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4372', '--strictPort'], { stdio: 'ignore' });
const port = 9403;
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${tempDir('cdp-')}`, 'about:blank'], { stdio: 'ignore' });
track(proc);

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') problems.push('exception: ' + JSON.stringify(d.params.exceptionDetails).slice(0, 400));
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) problems.push(`console.${d.params.type}: ` + JSON.stringify(d.params.args).slice(0, 400));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${H} ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  return r.result?.result?.value;
};
const waitFor = async (cond, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(`return !!(${cond})`)) return; await sleep(150); }
  throw new Error('timeout waiting for ' + cond);
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, name + '.png'), Buffer.from(r.result.data, 'base64'));
};
const size = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const navigate = async (url) => {
  await send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    const r = await send('Runtime.evaluate', { expression: 'location.href + "|" + document.readyState', returnByValue: true });
    const [href, state] = String(r.result?.result?.value ?? '').split('|');
    if (href === url && state === 'complete') break;
    await sleep(100);
  }
  await sleep(300);
};
const results = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
};
/** Recorded for H7 (the phone pass over the screens H3 didn't rework), not a pass/fail of H3. */
const info = (name, value) => results.push(`INFO  ${name}: ${JSON.stringify(value)}`);

const H = `
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const settle = (ms = 350) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => s.replace(/\\s+/g, ' ').trim();
  const byText = (sel, t) => $$(sel).find((b) => norm(b.textContent).includes(t));
  const clickExact = async (sel, t) => { const b = $$(sel).find((x) => norm(x.textContent) === t); if (!b) throw new Error('nothing exactly ' + t); b.click(); await settle(); return b; };
  const click = async (sel, t) => { const b = byText(sel, t); if (!b) throw new Error('nothing like ' + sel + ' with text ' + t); b.click(); await settle(); return b; };
  const type = async (el, v) => { if (typeof el === 'string') el = $(el); if (!el) throw new Error('no field'); el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); await settle(150); };
  const pick = async (sel, v) => { const el = $(sel); if (!el) throw new Error('no select ' + sel); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); await settle(150); };
  const pickText = async (sel, t) => { const o = [...$(sel).options].find((x) => norm(x.textContent).includes(t)); if (!o) throw new Error('no option ' + t); await pick(sel, o.value); };
  const idb = (store) => new Promise((res, rej) => {
    const r = indexedDB.open('home-inventory');
    r.onsuccess = () => {
      const db = r.result;
      const q = db.transaction(store).objectStore(store).getAll();
      q.onsuccess = () => { res(q.result); db.close(); };
      q.onerror = () => rej(q.error);
    };
    r.onerror = () => rej(r.error);
  });
  const go = async (h) => { location.hash = h; await settle(700); };
  const toast = () => norm(document.querySelector('.toast span')?.textContent ?? '');
  const tabs = () => $$('.tabs .tab').map((t) => norm(t.textContent));
  const current = () => norm($('.tabs .tab[aria-current=page]')?.textContent ?? '');
  const part = () => document.querySelector('.app')?.dataset.part;
  const dlg = (label) => $('[role=dialog][aria-label="' + label + '"], [role=alertdialog][aria-label="' + label + '"]');
  const jpeg = (color) => new Promise((res) => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 640, 480); c.toBlob((b) => res(new File([b], 'p.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.8); });
  const choosePhoto = async (scope, color) => { const input = $(scope + ' input[data-photo=gallery]'); const dt = new DataTransfer(); dt.items.add(await jpeg(color)); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); await settle(1200); };
`;

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await size(1280, 800);

  // ── Part 1: a 0.1.2 phone upgrades in place ──
  await navigate(`${ORIGIN}/manifest.webmanifest`);
  await js(`
    await new Promise((res, rej) => {
      // Dexie stores version 2 as IndexedDB version 20, with these stores and indexes (0.1.2's db.ts).
      const r = indexedDB.open('home-inventory', 20);
      r.onupgradeneeded = () => {
        const d = r.result;
        const st = (name, key, idx) => { const s = d.createObjectStore(name, { keyPath: key }); for (const i of idx) s.createIndex(i, i); };
        st('items', 'id', ['category', 'binId', 'spotId', 'seasonId', 'barcode']);
        st('areas', 'id', ['order']);
        st('spots', 'id', ['areaId']);
        st('bins', 'id', ['code', 'spotId', 'seasonId']);
        st('seasons', 'id', ['order']);
        st('tags', 'key', ['order']);
        st('pictures', 'id', ['ownerId']);
        st('categories', 'name', ['order']);
        st('settings', 'key', []);
      };
      r.onsuccess = () => {
        const d = r.result;
        const tx = d.transaction(['items', 'areas', 'spots', 'bins', 'seasons', 'tags', 'categories', 'settings'], 'readwrite');
        const item = { category: 'Decorations', subcategory: '', binId: '', spotId: '', quantity: 1, approx: false, seasonId: '', tags: [], status: 'stored', outWhere: '', outSince: null, lentTo: '', lentOn: '', condition: 'ok', conditionNote: '', barcode: '', notes: '', value: null, purchaseDate: '', model: '', serial: '', warrantyUntil: '', keepAtLeast: null, hasPhoto: false, updatedAt: 1 };
        tx.objectStore('areas').put({ id: 'ar-ATTIC001', name: 'Attic', letter: 'A', order: 0, notes: '' });
        tx.objectStore('spots').put({ id: 'sp-SHELFB01', areaId: 'ar-ATTIC001', name: 'Shelf B', order: 0, notes: '' });
        tx.objectStore('seasons').put({ id: 'se-XMAS0001', name: 'Christmas', order: 0, color: 'red', setupNotes: '' });
        tx.objectStore('bins').put({ id: 'bn-XMAS0004', code: 'A-04', name: 'Christmas 4', spotId: 'sp-SHELFB01', seasonId: 'se-XMAS0001', tags: ['Fragile'], state: 'stored', notes: '', labelPrintedAt: null, labelContents: null });
        tx.objectStore('items').put({ ...item, id: 'it-LIGHTS01', name: 'Snowman lights', binId: 'bn-XMAS0004', quantity: 3, seasonId: 'se-XMAS0001', tags: ['Fragile'] });
        tx.objectStore('categories').put({ name: 'Decorations', order: 0, subcategories: [] });
        tx.objectStore('categories').put({ name: 'Other', order: 1, subcategories: [] });
        tx.objectStore('tags').put({ key: 'fragile', name: 'Fragile', order: 0 });
        tx.objectStore('settings').put({ key: 'schemaVersion', value: 2 });
        tx.objectStore('settings').put({ key: 'setupDoneAt', value: 1 });
        tx.oncomplete = () => { d.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
      r.onerror = () => rej(r.error);
    });`);
  await navigate(`${ORIGIN}/`);
  await waitFor(`document.querySelector('.tabs')`, 60000);
  await waitFor(`document.querySelector('.hbody, .fbody')`);
  const up = await js(`return { areas: await idb('areas'), bins: await idb('bins'), items: await idb('items'), seasons: await idb('seasons'), cats: await idb('categoryList'), tags: await idb('tagList'), schema: (await idb('settings')).find((s) => s.key === 'schemaVersion')?.value }`);
  check('upgrade: schema 6; area, bin and item in Household; codes from names (A-04 → ATTIC-04); the bin and item lose their season', [up.schema, up.areas.map((a) => [a.part, a.code]), up.bins.map((b) => [b.part, b.seasonId, b.code]), up.items.map((i) => [i.part, i.seasonId, i.binId])], [6, [['household', 'ATTIC']], [['household', '', 'ATTIC-04']], [['household', '', 'bn-XMAS0004']]]);
  check('upgrade: Christmas kept with its default dates; lists in Household, Holiday defaults added', [up.seasons.map((s) => [s.name, s.setupFrom, s.takedownBy]), up.cats.filter((c) => c.part === 'household').map((c) => c.name), up.cats.filter((c) => c.part === 'holiday').length, up.tags.map((t) => [t.part, t.name])], [[['Christmas', '11-25', '01-06']], ['Decorations', 'Other'], 10, [['household', 'Fragile']]]);
  check('first open: the Holiday part, Season tab (§12.5)', await js(`return [part(), tabs(), current()]`), ['holiday', ['Season', 'Find', 'Browse', 'Scan', 'Lists', 'More'], 'Season']);
  await shot('01-upgraded-season-home');
  await js(`await click('.psw a', 'Household'); await settle(600);`);
  check('the switch opens Household at Find, with its own tab bar', await js(`return [part(), location.hash, tabs(), current()]`), ['household', '#/household/find', ['Find', 'Browse', 'Scan', 'Lists', 'More'], 'Find']);
  await js(`await type('.fbox input', 'snowman'); await settle(300);`);
  check('upgraded item found in Household with its path', await js(`return $$('.fres .rt').map((e) => [...e.children].map((c) => norm(c.textContent)))`), [['Snowman lights', 'Attic › Shelf B › ATTIC-04 Christmas 4']]);
  await shot('02-upgraded-find');

  // ── Part 2: start fresh ──
  await navigate(`${ORIGIN}/manifest.webmanifest`);
  await js(`localStorage.clear(); await new Promise((res, rej) => { const r = indexedDB.deleteDatabase('home-inventory'); r.onsuccess = res; r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked')); });`);
  await navigate(`${ORIGIN}/`);
  await waitFor(`document.querySelector('.setup')`, 60000);
  await js(`await click('.setup-acts .btn.pri', 'Start fresh'); await settle(800);`);
  await waitFor(`document.querySelector('.done-ic')`);
  check('start fresh: 11 + 10 categories, 10 seasons with dates, no areas', await js(`const c = await idb('categoryList'); const s = await idb('seasons'); return [c.filter((x) => x.part === 'household').length, c.filter((x) => x.part === 'holiday').length, s.length, s.every((x) => /^\\d\\d-\\d\\d$/.test(x.setupFrom)), (await idb('areas')).length]`), [11, 10, 10, true, 0]);
  check('setup offers both parts’ areas', await js(`return $$('.setup-acts .btn').map((b) => norm(b.textContent))`), ['Add Holiday storage areas', 'Add Household areas', 'Later']);
  await js(`await click('.setup-acts .btn.pri', 'Add Holiday storage areas'); await settle(800);`);
  await waitFor(`location.hash === '#/more/places'`);
  check('Holiday areas: Holiday suggestions', await js(`return [part(), $$('.empty-card .fchip').map((b) => norm(b.textContent))]`), ['holiday', ['Storage room', 'Attic', 'Basement', 'Crawl space', 'Shed', 'Closet']]);
  await js(`await click('.empty-card .fchip', 'Storage room'); await settle(400);`);
  await js(`const row = byText('.area-row', 'Storage room'); [...row.querySelectorAll('.btn')].find((b) => norm(b.textContent).includes('Spot')).click(); await settle(400); await type('#en-name', 'Rack 1'); await click('[role=dialog] .btn.pri', 'Add spot'); await settle(500);`);
  await js(`await click('.spot-row .spot-link', 'Rack 1'); await settle(600);`);
  await waitFor(`location.hash.startsWith('#/spot/')`);
  check('spot screen: Holiday color in the top bar', await js(`return [$('.top').classList.contains('tint'), norm($('.top .ptag')?.textContent ?? '')]`), [true, 'Holiday']);
  await js(`await click('.dacts .btn', 'Add bin here'); await settle(600);`);
  await waitFor(`document.querySelector('#bn')`);
  check('Holiday bin: code from the area, season field offered', await js(`return [$('#bc').placeholder, !!$('#bs')]`), ['STORAGE-01', true]);
  await js(`await type('#bn', 'Christmas lights'); await pickText('#bs', 'Christmas'); await click('.top .btn.pri', 'Add bin'); await settle(800);`);
  await waitFor(`location.hash.startsWith('#/bin/')`);
  const sBin = (await js(`return await idb('bins')`))[0];
  check('bin STORAGE-01 stored in Holiday with Christmas', [sBin?.part, sBin?.code, !!sBin?.seasonId], ['holiday', 'STORAGE-01', true]);
  await js(`await click('.dacts .btn', 'Add item here'); await settle(700);`);
  await waitFor(`document.querySelector('#nm')`);
  check('Holiday item editor: Holiday categories, season follows the bin', await js(`return [$$('#cat option').map((o) => o.textContent).slice(0, 2), norm($('#sea').options[0].textContent)]`), [['Ornaments', 'Lights'], 'Same as its bin (Christmas)']);
  await js(`await type('#nm', 'Icicle lights'); await pick('#cat', 'Lights'); await type($('input[aria-label="Quantity"]'), '6'); await click('.top .btn.pri', 'Add item'); await settle(900);`);
  await waitFor(`location.hash.startsWith('#/item/')`);
  const icicle = (await js(`return await idb('items')`)).find((i) => i.name === 'Icicle lights');
  check('Holiday item stored', [icicle?.part, icicle?.binId === sBin.id, icicle?.category, icicle?.quantity], ['holiday', true, 'Lights', 6]);

  // Household: Garage › Pegboard, a bin and a drill.
  await js(`await go('#/household/more'); await click('.mrow', 'Areas & spots'); await settle(600);`);
  check('Household areas: its own suggestions', await js(`return [part(), $$('.empty-card .fchip').map((b) => norm(b.textContent)).slice(0, 2)]`), ['household', ['Garage', 'Utility room']]);
  await js(`await click('.top .btn.pri', 'Add area'); await type('#ar-name', 'Shed'); await type('#ar-letter', 'storage'); await settle(200);`);
  check('a code used by the other part is refused, naming the part', await js(`return norm($('[role=dialog] .err')?.textContent ?? '')`), 'STORAGE is already used by “Storage room” in Holiday.');
  await js(`await type('#ar-letter', ''); await click('[role=dialog] .btn', 'Cancel'); await settle(300); await click('.empty-card .fchip', 'Garage'); await settle(400);`);
  await js(`const row = byText('.area-row', 'Garage'); [...row.querySelectorAll('.btn')].find((b) => norm(b.textContent).includes('Spot')).click(); await settle(400); await type('#en-name', 'Pegboard'); await click('[role=dialog] .btn.pri', 'Add spot'); await settle(500);`);
  check('areas: codes from their names, unique across parts', await js(`return (await idb('areas')).map((a) => [a.part, a.name, a.code]).sort()`), [['holiday', 'Storage room', 'STORAGE'], ['household', 'Garage', 'GARAGE']]);
  await js(`await click('.spot-row .spot-link', 'Pegboard'); await settle(600); await click('.dacts .btn', 'Add bin here'); await settle(600);`);
  await waitFor(`document.querySelector('#bn')`);
  check('Household bin: no season field', await js(`return [$('#bc').placeholder, !!$('#bs')]`), ['GARAGE-01', false]);
  await js(`await type('#bn', 'Cords'); await click('.top .btn.pri', 'Add bin'); await settle(800); await click('.dacts .btn', 'Add item here'); await settle(700);`);
  await waitFor(`document.querySelector('#nm')`);
  check('Household item editor: Household categories, no season', await js(`return [$$('#cat option').map((o) => o.textContent)[0], !!$('#sea')]`), ['Tools', false]);
  await js(`await type('#nm', 'Extension cord'); await pick('#cat', 'Electronics'); await click('.top .btn.pri', 'Add item'); await settle(900);`);
  await waitFor(`location.hash.startsWith('#/item/')`);
  check('detail: Household color in the top bar', await js(`return [part(), norm($('.top .ptag')?.textContent ?? '')]`), ['household', 'Household']);

  // Find: the part only, and the other part's count.
  await js(`await go('#/household/find'); await type('.fbox input', 'lights'); await settle(300);`);
  check('Find in Household: no match here; "2 matches in Holiday" (the item and its bin)', await js(`return [$$('.fres').length, norm($('.fother')?.textContent ?? '')]`), [0, '2 matches in Holiday']);
  await js(`await type('.fbox input', 'garage1'); await settle(300);`);
  check('a typed bin code finds the bin', await js(`return $$('.fres .rt').map((e) => [...e.children].map((c) => norm(c.textContent)))`), [['GARAGE-01', 'Cords · Garage › Pegboard']]);
  await js(`await type('.fbox input', 'cord'); await settle(300);`);
  check('Find groups Items / Bins', await js(`return $$('.flbl').map((e) => norm(e.textContent))`), ['Items · 1', 'Bins · 1']);
  await shot('03-household-find');
  await js(`await type('.fbox input', 'icicle'); await settle(300); await click('.fother', 'match'); await settle(700);`);
  check('the other part’s line opens its Find with the same search', await js(`return [part(), location.hash, $$('.fres .rt strong').map((e) => norm(e.textContent))]`), ['holiday', '#/holiday/find?q=icicle', ['Icicle lights']]);
  await shot('04-holiday-find');

  // Browse.
  await js(`await go('#/holiday/browse'); await click('.vsw .fchip', 'By season'); await settle(400); await click('.ghdr-t', 'Christmas'); await settle(300);`);
  check('Holiday Browse by season: Christmas › STORAGE-01', await js(`return $$('.ghdr .gn').map((e) => norm(e.textContent)).slice(0, 2)`), ['Christmas', 'STORAGE-01 Christmas lights']);
  check('Holiday Browse has its own tab (PR #12); Household Browse has no By season', await js(`const a = current(); await go('#/household/browse'); return [a, current(), $$('.vsw .fchip').map((b) => norm(b.textContent))]`), ['Browse', 'Browse', ['By place', 'By category']]);
  await js(`await click('.vsw .fchip', 'By place'); await settle(300); await click('.ghdr-t', 'Garage'); await settle(300); await click('.ghdr-t', 'Pegboard'); await settle(300); await click('.ghdr-t', 'GARAGE-01'); await settle(300);`);
  check('Household Browse by place: Garage › Pegboard › GARAGE-01 › the cord', await js(`return [$$('.ghdr .gn').map((e) => norm(e.textContent)), $$('.row .rname').map((e) => norm(e.textContent))]`), [['Garage', 'Pegboard', 'GARAGE-01 Cords'], ['Extension cord']]);
  await shot('05-household-browse');

  // Scan: a typed Holiday bin code while in Household switches part, with Undo.
  // Headless Chrome has no camera, so Scan shows its typed-code form; with a camera it's "Type a code".
  await js(`await go('#/household/scan'); await settle(1500);
    if ($('#mc')) { await type('#mc', 'storage1'); await click('.denied-type .btn', 'Find'); }
    else { await click('.ctop .btn', 'Type a code'); await type('.spanel input', 'storage1'); await click('.spanel .btn.pri', 'Find'); }
    await settle(900);`);
  check('a Holiday bin opened from Household: switched, with the toast', await js(`return [location.hash === '#/bin/${sBin.id}', part(), toast()]`), [true, 'holiday', 'Switched to Holiday · this label is a Holiday bin']);
  await shot('06-bin-scanned-across');
  await js(`await click('.toast-btn', 'Undo'); await settle(900);`);
  check('Undo goes back to Household’s Scan', await js(`return [location.hash, part()]`), ['#/household/scan', 'household']);

  // Labels: a bin label carries code, name, season and contents; printing records it.
  await js(`await go('#/bin/${sBin.id}'); await click('.dacts .btn', 'Print label'); await settle(800);`);
  check('bin label on 5163 by default: code, name, season chip, contents', await js(`return [norm(byText('.lay.on', 'Avery')?.textContent ?? '').slice(0, 21), [...($('.sheet .lab .lab-t')?.children ?? [])].map((e) => norm(e.textContent))]`), ['Avery 5163-compatible', ['STORAGE-01', 'Christmas lights', 'Christmas', 'Icicle lights ×6']]);
  await shot('07-bin-label');
  await js(`window.print = () => {}; await click('.btn.pri', 'Print 1 label'); await settle(300); await click('[role=dialog] .btn.pri', 'Open print dialog'); await settle(800);`);
  check('printing records the bin’s label', await js(`const b = (await idb('bins')).find((x) => x.id === '${sBin.id}'); return [typeof b.labelPrintedAt, b.labelContents]`), ['number', 'Icicle lights ×6']);
  await js(`await go('#/item/${icicle.id}'); $('button[aria-label="Plus one"]').click(); await settle(600); await go('#/bin/${sBin.id}');`);
  check('a change to its contents shows "Label out of date" with Reprint', await js(`return [norm($('.stale strong')?.textContent ?? ''), !!byText('.stale .btn', 'Reprint')]`), ['Label out of date.', true]);
  await js(`await go('#/labels'); await settle(600);`);
  check('Labels: bins, spots or items; out-of-date bins offered', await js(`return [$$('[aria-label="What to label"] .fchip').map((b) => norm(b.textContent)), norm($('.stale strong')?.textContent ?? '')]`), [['Bins', 'Spots', 'Items'], '1 bin label out of date.']);

  // Move an item to the other part (F7, §3).
  await js(`await go('#/item/${icicle.id}'); await click('.dacts .btn', 'Move…'); await settle(400); await click('[role=dialog] .btn', 'Show Household places'); await settle(300); await click('.hp-row', 'Pegboard'); await settle(200);`);
  check('the picker names the other part on its button', await js(`return norm($('[role=dialog] .btn.pri').textContent)`), 'Move to Household');
  await js(`await click('[role=dialog] .btn.pri', 'Move to Household'); await settle(800);`);
  check('moved to Household: season cleared, category matched (Lights → Other), app follows', await js(`const i = (await idb('items')).find((x) => x.id === '${icicle.id}'); return [i.part, i.seasonId, i.category, part()]`), ['household', '', 'Other', 'household']);
  check('Household’s list gained Other only if missing (it has one)', await js(`return (await idb('categoryList')).filter((c) => c.part === 'household' && c.name === 'Other').length`), 1);

  // The Season home and Lists.
  await js(`await go('#/holiday/season');`);
  check('Season home: a lead card or "No season on now", and Coming up', await js(`return [!!$('.hcard .hd'), $$('.hup').length]`), [true, 3]);
  await shot('08-season-home');
  await js(`await go('#/household/lists');`);
  check('Household Lists: Out on loan, Warranties ending', await js(`return $$('.lsec h2').map((e) => norm(e.textContent).replace(/ ·.*/, ''))`), ['Out on loan', 'Warranties ending']);
  await js(`await go('#/holiday/lists');`);
  check('Holiday Lists: To buy, Needs attention, Out now', await js(`return $$('.lsec h2').map((e) => norm(e.textContent).replace(/ ·.*/, ''))`), ['To buy', 'Needs attention', 'Out now']);
  await js(`await go('#/holiday/more');`);
  check('Holiday More: Areas & spots, Seasons, Displays, Categories, Tags, Labels…; Activity; version 0.1.5', await js(`return $$('.mrow .mt').map((e) => norm(e.textContent))`), ['Areas & spots', 'Seasons', 'Displays', 'Categories', 'Tags', 'Labels', 'Backup & restore', 'Activity', 'Settings', 'Hiebert Home Inventory', 'App version 0.1.5']);
  await js(`await go('#/household/more');`);
  check('Household More has no Seasons or Displays', await js(`const t = $$('.mrow .mt').map((e) => norm(e.textContent)); return [t.includes('Seasons'), t.includes('Displays')]`), [false, false]);

  // The part is remembered across a reload.
  await navigate(`${ORIGIN}/`);
  await waitFor(`document.querySelector('.tabs')`);
  check('reopening the app opens the part used last (Household, Find)', await js(`return [part(), current()]`), ['household', 'Find']);

  // ── Part 3: the H2a flows, now in Household (editor, Move, Split, Duplicate, tags, delete bin, bulk Move) ──
  const gBin = (await js(`return await idb('bins')`)).find((b) => b.code === 'GARAGE-01');
  await js(`await go('#/bin/${gBin.id}'); await click('.dacts .btn', 'Add item here'); await settle(700);`);
  await waitFor(`document.querySelector('#nm')`);
  await js(`
    await type('#nm', 'Drill bits'); await pick('#cat', 'Tools');
    await type($('input[aria-label="Quantity"]'), '40'); const ap = byText('.tick', 'About this many').querySelector('input'); ap.click(); await settle(150);
    await pick('#cond', 'needs repair'); await settle(200); await type('#cn', 'two dull');
    await type('#tg', 'Sharp'); await click('.inline-add .btn', 'Add');
    await type('#val', '24.99');
    $('details.records').open = true; await settle(100);
    await type('#md', 'DB-40'); await type('#pd', '2023-11-24');
  `);
  await js(`await choosePhoto('.fbody', '#0a0');`);
  await js(`await choosePhoto('.fbody', '#a0a');`);
  await js(`await click('.top .btn.pri', 'Add item'); await settle(1000);`);
  await waitFor(`location.hash.startsWith('#/item/')`);
  const bits = (await js(`return await idb('items')`)).find((i) => i.name === 'Drill bits');
  check('Household item with every field and two photos', bits && [bits.part, bits.binId === gBin.id, bits.quantity, bits.approx, bits.seasonId, bits.tags, bits.condition, bits.conditionNote, bits.value, bits.model, bits.purchaseDate, bits.hasPhoto], ['household', true, 40, true, '', ['Sharp'], 'needs repair', 'two dull', 2499, 'DB-40', '2023-11-24', true]);
  check('its tag joined the Household Tags list only', await js(`return (await idb('tagList')).filter((t) => t.name === 'Sharp').map((t) => t.part)`), ['household']);
  await js(`await click('.dacts .btn', 'Move…'); await settle(400); await clickExact('.hp-row', 'Pegboard'); await click('[role=dialog] .btn.pri', 'Move here'); await settle(600);`);
  check('Move: a loose item on the Pegboard', await js(`const i = (await idb('items')).find((x) => x.id === '${bits.id}'); return [i.binId, norm($('.top-title .small').textContent)]`), ['', 'Garage › Pegboard']);
  await js(`await click('.dacts .btn', 'More…'); await click('.menu-acts .btn', 'Split this line'); await settle(300); await type('#split-n', '6'); await click('[role=dialog] .btn', 'Garage › Pegboard'); await settle(300); await clickExact('.hp-row', 'GARAGE-01 Cords'); await click('[role=dialog] .btn.pri', 'Choose'); await settle(300); await click('[role=dialog] .btn.pri', 'Split off 6'); await settle(800);`);
  check('Split a line: 6 into the bin, 34 stay', await js(`return (await idb('items')).filter((i) => i.name === 'Drill bits').map((i) => [i.quantity, i.binId ? 'bin' : 'spot', i.part]).sort((a, b) => a[0] - b[0])`), [[6, 'bin', 'household'], [34, 'spot', 'household']]);
  await js(`await go('#/item/${bits.id}'); await click('.dacts .btn', 'More…'); await click('.menu-acts .btn', 'Duplicate'); await settle(800);`);
  check('Duplicate: a copy with the photos, opened', await js(`const c = (await idb('items')).find((i) => i.name === 'Drill bits (copy)'); const p = (await idb('pictures')).filter((x) => x.ownerId === c?.id); return [!!c, p.length, location.hash === '#/item/' + c?.id]`), [true, 2, true]);
  await js(`await go('#/more/tags'); const row = byText('.lrow', 'Sharp'); [...row.querySelectorAll('.btn')].find((b) => norm(b.textContent) === 'Rename').click(); await settle(300); await type('#en-name', 'Pointy'); await click('[role=dialog] .btn.pri', 'Save'); await settle(500);`);
  check('Tags: a rename reaches every Household item with it', await js(`return (await idb('items')).filter((i) => i.name.startsWith('Drill bits')).map((i) => i.tags.join()).sort()`), ['Pointy', 'Pointy', 'Pointy']);
  await js(`await go('#/bin/${gBin.id}'); await click('.dacts .btn.danger', 'Delete bin'); await settle(300);`);
  check('delete bin asks what happens to its items', await js(`return !!dlg('Delete bin')`), true);
  await js(`await click('[role=alertdialog] .btn.danger', 'Delete bin'); await settle(700);`);
  check('bin deleted; its items are loose on the Pegboard', await js(`const p = (await idb('spots')).find((s) => s.name === 'Pegboard'); return [(await idb('bins')).some((b) => b.id === '${gBin.id}'), (await idb('items')).filter((i) => i.spotId === p.id).length]`), [false, 5]);
  await js(`await go('#/household/more'); await click('.mrow', 'Areas & spots'); await settle(500); const row = byText('.area-row', 'Garage'); [...row.querySelectorAll('.btn')].find((b) => norm(b.textContent).includes('Spot')).click(); await settle(400); await type('#en-name', 'Bench'); await click('[role=dialog] .btn.pri', 'Add spot'); await settle(500);`);
  await js(`await go('#/household/browse'); await click('.top .btn', 'Select'); await click('.selbar .btn', 'Select all shown'); await click('.selbar .btn.pri', 'Move to'); await settle(300); await clickExact('.hp-row', 'Bench'); await click('[role=dialog] .btn.pri', 'Move here'); await settle(700);`);
  check('Browse › Select all › Move to… a spot', await js(`const b = (await idb('spots')).find((s) => s.name === 'Bench'); return (await idb('items')).filter((i) => i.spotId === b.id).length`), 5);
  await js(`await go('#/more/backup');`);
  check('Backup: restore names 0.1.2 backups and says 0.1.1 ones can’t be read', await js(`return [/0\\.1\\.2/.test($('.bk').textContent), /0\\.1\\.1 can no longer be read/.test($('.bk').textContent)]`), [true, true]);
  const manifest = await js(`const l = $('link[rel=manifest]'); return l ? await (await fetch(l.href)).json() : null`);
  check('manifest name, short name and portrait', [manifest?.name, manifest?.short_name, manifest?.orientation], ['Hiebert Home Inventory', 'Home Inventory', 'portrait']);

  // ── Part 4: H4, the Holiday setup ──
  // Displays (F22).
  await js(`await go('#/holiday/more'); await click('.mrow', 'Displays'); await settle(500);`);
  check('More › Displays: empty, in Holiday', await js(`return [part(), location.hash, !!$('.empty-card')]`), ['holiday', '#/more/displays', true]);
  for (const name of ['Mantel', 'Front porch']) {
    await js(`await click('.top .btn.pri', 'Add display'); await type('#dp-name', '${name}'); await click('[role=dialog] .btn.pri', 'Add display'); await settle(500);`);
  }
  await js(`await click('.top .btn.pri', 'Add display'); await type('#dp-name', 'mantel'); await settle(200);`);
  check('a duplicate display name is refused as you type', await js(`return [/already in the list/.test($('[role=dialog] .err')?.textContent ?? ''), $('[role=dialog] .btn.pri').disabled]`), [true, true]);
  await js(`await click('[role=dialog] .btn', 'Cancel'); await settle(300);`);
  const displays = await js(`return (await idb('displays')).sort((a, b) => a.order - b.order).map((d) => [d.name, d.order])`);
  check('displays stored in walk order', displays, [['Mantel', 0], ['Front porch', 1]]);
  const dIds = Object.fromEntries((await js(`return await idb('displays')`)).map((d) => [d.name, d.id]));

  // Items with their usual display, in the Christmas bin STORAGE-01 (empty since the icicles moved).
  for (const [name, cat, disp] of [['Garland', 'Wreaths & garland', 'Mantel'], ['Wreath', 'Wreaths & garland', 'Front porch'], ['Angel', 'Ornaments', '']]) {
    await js(`await go('#/bin/${sBin.id}'); await click('.dacts .btn', 'Add item here'); await settle(700);`);
    await waitFor(`document.querySelector('#nm')`);
    await js(`await type('#nm', '${name}'); await pick('#cat', '${cat}'); ${disp ? `await pickText('#dsp', '${disp}');` : ''} await click('.top .btn.pri', 'Add item'); await settle(900);`);
    await waitFor(`location.hash.startsWith('#/item/')`);
  }
  const hItems = Object.fromEntries((await js(`return await idb('items')`)).filter((i) => i.binId === sBin.id).map((i) => [i.name, i]));
  check('the item editor stores the usual display', [hItems.Garland?.displayId === dIds.Mantel, hItems.Wreath?.displayId === dIds['Front porch'], hItems.Angel?.displayId], [true, true, '']);
  check('item detail shows the usual display', await js(`await go('#/item/${hItems.Garland.id}'); return byText('.kv a', 'Mantel')?.getAttribute('href')`), `#/display/${dIds.Mantel}`);
  await js(`await go('#/item/${hItems.Garland.id}/edit'); await settle(500);`);
  check('a Household item has no display field', await js(`const a = !!$('#dsp'); const cord = (await idb('items')).find((i) => i.name === 'Extension cord'); await go('#/item/' + cord.id + '/edit'); await settle(500); return [a, !!$('#dsp')]`), [true, false]);

  // A season: tasks, then Start setup (F25).
  const xmasId = (await js(`return await idb('seasons')`)).find((x) => x.name === 'Christmas').id;
  await js(`await go('#/season/${xmasId}'); await settle(500);`);
  check('Christmas: not started, Start setup offered, Holiday bar', await js(`return [/^Not started/.test(norm($('.hsbody .card .h2').textContent)), !!byText('.hsbody .btn.pri', 'Start setup'), norm($('.top .ptag')?.textContent ?? '')]`), [true, true, 'Holiday']);
  await js(`await type('input[aria-label="New setup task"]', 'Test the lights'); await click('.hsbody .inline-add .btn', 'Add'); await settle(400);`);
  await js(`await type('input[aria-label="New takedown task"]', 'Recycle the tree'); byText('[aria-label="Takedown tasks"] .btn', 'Add').click(); await settle(400);`);
  check('season tasks stored by phase', await js(`return (await idb('seasonTasks')).map((t) => [t.phase, t.text]).sort()`), [['setup', 'Test the lights'], ['takedown', 'Recycle the tree']]);
  await js(`await click('.hsbody .btn.pri', 'Start setup'); await settle(900);`);
  await waitFor(`location.hash === '#/season/${xmasId}/setup'`);
  const run1 = (await js(`return await idb('seasonRuns')`))[0];
  check('Start setup: this year’s run, setting up', [run1?.seasonId === xmasId, run1?.phase, typeof run1?.startedAt], [true, 'setting up', 'number']);
  check('setup list: the three sections with counts', await js(`return [norm($('.sl-head .h1').textContent), $$('.slsec').map((e) => [...e.children].map((c) => norm(c.textContent)).join(' '))]`), ['Christmas setup', ['1 · Bins to bring out 0 of 1', '2 · Put out 0 of 3', '3 · Tasks 0 of 1']]);
  check('Put out: by display in walk order, then No display', await js(`return $$('.slsub span').map((e) => norm(e.textContent))`), ['Mantel · 0 of 1', 'Front porch · 0 of 1', 'No display · 0 of 1']);
  await shot('11-setup-list');
  await js(`$('.tbox[aria-label="Put out Garland"]').click(); await settle(600);`);
  check('ticking an item puts it out on its usual display', await js(`const g = (await idb('items')).find((i) => i.name === 'Garland'); return [g.status, g.outWhere, g.outDisplayId === '${dIds.Mantel}', norm($('.slsub span').textContent)]`), ['out', 'Mantel', true, 'Mantel · 1 of 1']);
  await js(`$('.tbox[aria-label="Test the lights"]').click(); await settle(600);`);
  check('ticking a task records it in the run', await js(`return (await idb('seasonRuns'))[0].doneTaskIds.length`), 1);
  await js(`await type('input[aria-label="New setup task"]', 'Get the ladder'); await click('.sladd .btn', 'Add'); await settle(500);`);
  check('a task added from the list', await js(`return $$('.slrow .rt strong').map((e) => norm(e.textContent)).slice(-2)`), ['Test the lights', 'Get the ladder']);
  await js(`await click('.slpad .btn', 'Unpack a whole bin'); await settle(500);`);
  check('Unpack: the bin’s stored items, each to its usual display, the bin out too', await js(`const d = dlg('Unpack STORAGE-01'); return [!!d, $$('.uprow .rt').map((e) => [...e.children].map((c) => norm(c.textContent))), d.querySelector('.tick input')?.checked, norm(d.querySelector('.btn.pri').textContent)]`), [true, [['Angel ×1', '→ No display'], ['Wreath ×1', '→ Front porch']], true, 'Take all 2 out']);
  await shot('12-unpack');
  await js(`await click('[role=dialog] .btn.pri', 'Take all 2 out'); await settle(800);`);
  check('unpacked: items out on their displays, the bin out', await js(`const it = await idb('items'); const w = it.find((i) => i.name === 'Wreath'); const a = it.find((i) => i.name === 'Angel'); const b = (await idb('bins')).find((x) => x.id === '${sBin.id}'); return [w.status, w.outWhere, a.status, a.outWhere, b.state]`), ['out', 'Front porch', 'out', '', 'out']);
  check('progress: 5 of 6 (one task left)', await js(`return norm($('.sl-meta').textContent).replace(/ ·.*/, '')`), '5 of 6 done');
  await js(`await click('.slfoot .btn', 'Finish setup'); await settle(400);`);
  check('Finish setup names what’s unticked', await js(`return norm(dlg('Finish setup').querySelector('.dlg-p').textContent)`), 'Still unticked: 1 task. They stay as they are.');
  await js(`await click('[role=dialog] .btn.pri', 'Finish setup'); await settle(900);`);
  check('finished: the run is up, the app is on the Season home', await js(`return [(await idb('seasonRuns'))[0].phase, location.hash]`), ['up', '#/holiday/season']);
  check('the Season home shows Christmas up until its takedown date', await js(`const cards = [...$$('.hcard'), ...$$('.hmini')]; const c = cards.find((x) => norm(x.textContent).includes('Christmas')); return /Up · take down by Jan 6/.test(norm(c?.textContent ?? ''))`), true);
  await shot('13-season-home-up');

  // A display's screen (F22) and setup photos by season (F8).
  await js(`await go('#/display/${dIds.Mantel}'); await settle(600);`);
  check('display: on it now and usually here', await js(`return $$('.hsbody .card .h2').map((e) => norm(e.textContent))`), ['Setup photos', 'On it now · 1', 'Usually goes here · 1']);
  await js(`await click('.seasonpick .chip', 'Christmas'); await settle(300); await choosePhoto('[aria-label="Setup photos"]', '#c00');`);
  check('a setup photo is stored with the display and the season', await js(`return (await idb('pictures')).filter((p) => p.ownerId === '${dIds.Mantel}').map((p) => [p.ownerType, p.kind, p.seasonId === '${xmasId}'])`), [['display', 'setup', true]]);
  await js(`await click('.seasonpick .chip', 'Easter'); await settle(400);`);
  check('another season shows its own (none yet)', await js(`return norm($('[aria-label="Setup photos"] .nophoto-t')?.textContent ?? '')`), 'No Easter setup photos yet');
  await shot('14-display');

  // Put back and Put out on an item (F5).
  await js(`await go('#/item/${hItems.Garland.id}'); await click('.dacts .btn', 'Put back'); await settle(600);`);
  check('Put back: stored again in its bin', await js(`const g = (await idb('items')).find((i) => i.name === 'Garland'); return [g.status, g.outWhere, g.binId === '${sBin.id}']`), ['stored', '', true]);
  await js(`await click('.dacts .btn', 'Put out'); await settle(400); await pickText('#po-to', 'Somewhere else'); await type('[role=dialog] input[aria-label="Where"]', 'Stairs'); await click('[role=dialog] .btn.pri', 'Put out'); await settle(600);`);
  check('Put out somewhere typed', await js(`const g = (await idb('items')).find((i) => i.name === 'Garland'); return [g.status, g.outWhere, g.outDisplayId]`), ['out', 'Stairs', '']);

  // Find matches an item's display (F1).
  await js(`await go('#/holiday/find'); await type('.fbox input', 'porch'); await settle(300);`);
  check('Find in Holiday by display name', await js(`return $$('.fres .rt strong').map((e) => norm(e.textContent))`), ['Wreath']);

  // Add to Calendar (F23): the .ics file (headless Chrome can't share, so it downloads).
  const ics = await js(`
    let got = null;
    const click0 = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) got = [this.download, this.href]; else click0.call(this); };
    await go('#/holiday/season'); await click('.hbody .btn', 'Add the season dates to Calendar'); await settle(500);
    HTMLAnchorElement.prototype.click = click0;
    if (!got) return null;
    const text = await (await fetch(got[1])).text();
    return [got[0], text.startsWith('BEGIN:VCALENDAR'), text.includes('SUMMARY:Christmas: set up'), (text.match(/BEGIN:VEVENT/g) ?? []).length];`);
  check('Add to Calendar: holiday-seasons.ics with each season’s two dates', ics, ['holiday-seasons.ics', true, true, 20]);

  // Removing a display (F22, §6).
  await js(`await go('#/more/displays'); const row = byText('.lrow', 'Front porch'); [...row.querySelectorAll('.btn')].find((b) => norm(b.textContent) === 'Remove').click(); await settle(400);`);
  check('removing a display in use names what uses it', await js(`return norm(dlg('Remove display').querySelector('.dlg-big').textContent)`), '1 item usually goes there, and 1 item is out on it. It’s cleared from them; items out there stay out. Its setup photos are deleted.');
  await js(`await click('[role=alertdialog] .btn.danger', 'Remove display'); await settle(600);`);
  check('removed: the wreath keeps where it is as text', await js(`const w = (await idb('items')).find((i) => i.name === 'Wreath'); return [w.displayId, w.outDisplayId, w.outWhere, w.status, (await idb('displays')).length]`), ['', '', 'Front porch', 'out', 1]);

  // The new screens have no console errors at desktop width either; iPhone width follows.

  // ── iPhone size ──
  await size(390, 844, true);
  const peg = await js(`return (await idb('spots')).find((s) => s.name === 'Pegboard').id`);
  const xmas = (await js(`return await idb('seasons')`)).find((x) => x.name === 'Christmas');
  const mantel = (await js(`return await idb('displays')`)).find((x) => x.name === 'Mantel');
  for (const [h, name] of [['#/holiday/season', 'season'], ['#/household/find', 'find'], ['#/household/browse', 'browse'], ['#/holiday/lists', 'lists'], ['#/holiday/more', 'more'], [`#/season/${xmas.id}`, 'h4-season'], [`#/season/${xmas.id}/setup`, 'h4-setup-list'], [`#/display/${mantel.id}`, 'h4-display'], ['#/more/displays', 'h4-displays']]) {
    await js(`await go('${h}');`);
    await shot(`09-iphone-${name}`);
    check(`iPhone 390 px, ${name}: nothing scrolls sideways`, await js(`return document.documentElement.scrollWidth > innerWidth`), false);
  }
  for (const [h, name] of [[`#/bin/${sBin.id}`, 'bin'], [`#/spot/${peg}`, 'spot'], [`#/item/${icicle.id}`, 'item'], ['#/more/places', 'places'], ['#/labels', 'labels']]) {
    await js(`await go('${h}');`);
    await shot(`10-iphone-${name}`);
    info(`iPhone 390 px, ${name}: page wider than the screen`, await js(`return document.documentElement.scrollWidth > innerWidth`));
  }
} catch (e) {
  results.push('FAIL  script error: ' + e.message);
  await shot('zz-error').catch(() => {});
} finally {
  console.log(results.join('\n'));
  process.exitCode = results.some((r) => /^(FAIL|ERROR)/.test(r)) ? 1 : 0;
  console.log(problems.length ? 'Console problems:\n' + problems.join('\n') : 'No console errors or warnings');
  ws.close();
  proc.kill();
  preview.kill();
}
