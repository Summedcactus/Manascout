/* Native Chromium end-to-end checks with deterministic catalogue responses.
 * Run separately: node --test tests/card-phase7-browser.cjs
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { readFile, mkdtemp, rm } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const { join, resolve, extname, sep } = require("node:path");
const { setTimeout: pause } = require("node:timers/promises");

const root = resolve(__dirname, "..");
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sets = [
  { code: "j25", name: "Foundations Jumpstart" }, { code: "mh3", name: "Modern Horizons 3" },
  { code: "dmu", name: "Dominaria United" }, { code: "cmm", name: "Commander Masters" }
];
const sol = {
  object: "card", id: id(1), oracle_id: id(11), name: "Sol Ring", set: "cmm",
  set_name: "Commander Masters", collector_number: "410", lang: "en", illustration_id: id(21),
  artist: "Test artist", rarity: "uncommon", released_at: "2023-08-04", layout: "normal",
  games: ["paper"], finishes: ["nonfoil", "foil"], frame: "2015", border_color: "black",
  oversized: false, cmc: 1, type_line: "Artifact", color_identity: [], oracle_text: "{T}: Add {C}{C}.",
  scryfall_uri: "https://scryfall.com/card/cmm/410", legalities: { commander: "legal" }
};
const japanese = { ...sol, id: id(2), lang: "ja", scryfall_uri: "https://scryfall.com/card/cmm/410/ja" };
const german = { ...sol, id: id(3), lang: "de", finishes: ["nonfoil"] };
const phyrexian = { ...sol, id: id(4), lang: "ph", illustration_id: id(24), collector_number: "411" };
const cynette = { ...sol, id: "8810b817-7349-468b-bcca-ba0843bbc852", oracle_id: id(12),
  name: "Cynette, Jelly Drover", set: "j25", set_name: "Foundations Jumpstart",
  collector_number: "35", finishes: ["nonfoil"], type_line: "Legendary Creature — Human Wizard" };
const sheoldred = { ...sol, id: id(5), oracle_id: id(13), name: "Sheoldred, the Apocalypse",
  set: "dmu", set_name: "Dominaria United", collector_number: "107", rarity: "mythic" };
const mh3 = { ...sol, id: id(6), oracle_id: id(14), name: "Test Dragon", set: "mh3",
  set_name: "Modern Horizons 3", collector_number: "383", rarity: "mythic", type_line: "Creature — Dragon" };
const solGuide = { ...sol, id: "c4300d24-1cae-4dd5-be7e-38cc677cf5bd", set: "lea",
  set_name: "Limited Edition Alpha", collector_number: "269", lang: "en", finishes: ["nonfoil"], illustration_id: id(25) };
const japaneseSheoldred = { ...sheoldred, id: id(7), lang: "ja" };
const records = [sol, japanese, german, phyrexian, cynette, sheoldred, mh3, solGuide, japaneseSheoldred];
for (const card of records) {
  card.image_uris = { normal: `https://cards.scryfall.io/normal/front/1/0/${card.id}.jpg`,
    small: `https://cards.scryfall.io/small/front/1/0/${card.id}.jpg` };
}
const image = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const fixture = `(() => {
  window.fixtureEvents = [];
  window.fixtureRequests = [];
  const info = console.info.bind(console);
  console.info = (label, event, props) => {
    if (label === "[ManaScout event]") fixtureEvents.push({ event, props });
    info(label, event, props);
  };
  const cards = ${JSON.stringify(records)};
  const setData = ${JSON.stringify(sets)};
  const realFetch = fetch.bind(window);
  const json = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status,
    headers: { "Content-Type": "application/json", "Retry-After": "1" } }));
  const list = cards => json({ data: cards, total_cards: cards.length, has_more: false });
  window.fetch = (value, options) => {
    const url = new URL(value, location.href);
    if (url.hostname === "api.frankfurter.dev") return json({ rate: 1 });
    if (url.hostname !== "api.scryfall.com") return realFetch(value, options);
    fixtureRequests.push(url.pathname + url.search);
    const q = url.searchParams.get("q") || "";
    const parts = url.pathname.split("/").slice(2);
    if (url.pathname === "/sets") return json({ data: setData });
    if (url.pathname === "/cards/named") {
      const exact = url.searchParams.get("exact"), fuzzy = url.searchParams.get("fuzzy");
      if (exact === "Rate limited") return json({}, 429);
      if (exact === "Malformed") return json({ object: "card" });
      if (exact === "Network failure") return Promise.reject(new TypeError("fixture network failure"));
      if (exact === "Stale search") return new Promise(resolve => setTimeout(() => resolve(json(cards[0])), 1200));
      return exact?.toLowerCase() === "sol ring" || fuzzy === "Soll Ring" ? json(cards[0]) : json({}, 404);
    }
    if (url.pathname === "/cards/autocomplete") return json({ data: q.toLowerCase().startsWith("so") ? ["Sol Ring"] : [] });
    if (url.pathname === "/cards/search") {
      if (q.includes("oracleid:")) {
        let found = cards.filter(card => q.includes(card.oracle_id));
        if (window.fixtureLanguages && found.some(card => card.name === "Sol Ring")) {
          found = found.filter(card => fixtureLanguages.includes(card.lang));
        }
        return list(found);
      }
      if (q.includes('cn="35"') && !q.includes("set:j25")) {
        const matches = Array.from({ length: 33 }, (_, index) =>
          index === 0 ? cards[4] : { ...cards[6], id: "candidate-" + index, collector_number: "35" });
        if (url.searchParams.has("page")) return json({ data: matches.slice(17), total_cards: 33, has_more: false });
        url.searchParams.set("page", "2");
        return json({ data: matches.slice(0, 17), total_cards: 33, has_more: true, next_page: url.href });
      }
      if (q.includes("set:dmu") && q.includes('cn="107"')) return list([q.includes("lang:ja") ? cards[8] : cards[5]]);
      if (q.includes("set:j25") && q.includes('cn="35"')) return list([cards[4]]);
      if (q.includes("set:mh3") || q.includes('t:"dragon"')) return list([cards[6]]);
      if (q.includes('a:"Mark Poole"')) return list([cards[6]]);
      return json({}, 404);
    }
    const card = parts.length === 1 ? cards.find(card => card.id === parts[0]) :
      cards.find(card => card.set === parts[0] && card.collector_number === parts[1] && card.lang === parts[2]);
    return card ? json(card) : json({}, 404);
  };
})();`;

async function waitFor(read, description) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const value = await read();
    if (value) return value;
    await pause(40);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function setup(t) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/assets/js/analytics-config.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end('window.ManaScoutAnalyticsConfig={enabled:true,provider:"debug",debug:true};');
      return;
    }
    const path = resolve(root, "." + url.pathname, ...(url.pathname.endsWith("/") ? ["index.html"] : []));
    if (!path.startsWith(root + sep)) { response.writeHead(404).end(); return; }
    try {
      const data = await readFile(path);
      const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }[extname(path)];
      if (type) response.setHeader("Content-Type", type);
      response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const profile = await mkdtemp(join(tmpdir(), "manascout-browser-"));
  const browser = spawn(process.env.MANASCOUT_CHROMIUM || "chromium", ["--headless", "--no-sandbox", "--disable-gpu",
    "--disable-dev-shm-usage", "--disable-crash-reporter", `--user-data-dir=${profile}`,
    "--remote-debugging-port=0", "about:blank"], { stdio: "ignore" });
  let launchError;
  browser.on("error", error => { launchError = error; });
  t.after(async () => {
    if (browser.pid && browser.exitCode === null) {
      const exiting = new Promise(resolve => browser.once("exit", resolve));
      browser.kill();
      await exiting;
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
  });
  const port = await waitFor(async () => {
    if (launchError) throw launchError;
    return (await readFile(join(profile, "DevToolsActivePort"), "utf8").catch(() => "")).split("\n")[0];
  }, "Chromium debugging port");
  const target = await waitFor(async () => {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
    return targets.find(item => item.type === "page");
  }, "Chromium page target");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  t.after(() => socket.close());
  let index = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++index;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    } else if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      const url = new URL(request.url);
      if (request.url.startsWith(base)) void send("Fetch.continueRequest", { requestId });
      else if (["cards.scryfall.io", "mtg.wtf"].includes(url.hostname)) void send("Fetch.fulfillRequest", {
        requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "image/gif" }], body: image.toString("base64")
      });
      else void send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    }
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "http*" }] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: fixture });
  const run = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const ready = (expression, label) => waitFor(() => run(expression), label || expression);
  const navigate = async path => {
    await send("Page.navigate", { url: base + path });
    await ready(`location.pathname === ${JSON.stringify(path.split("?")[0])} && document.readyState === "complete" && typeof fixtureEvents !== "undefined"`);
  };
  return { send, errors, run, ready, navigate, base };
}

function search(query) {
  return `document.querySelector("#search-input").value = ${JSON.stringify(query)}; document.querySelector("#search-form").requestSubmit();`;
}
const status = 'document.querySelector("#printings-status").textContent';
const rows = 'document.querySelectorAll("#ms-print-body tr button[data-print-id]")';
const currentId = 'document.querySelector("#card-details [data-compare-id]")?.dataset.compareId';

test("Phase 7 Chromium journeys", { timeout: 90000 }, async t => {
  const browser = await setup(t);
  const { run, ready, send, navigate, errors } = browser;
  for (const width of [320, 390, 768, 1280]) {
    await t.test(`${width}px search, language, compare and Deck Studio`, async () => {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width < 500 });
      await send("Emulation.setTouchEmulationEnabled", { enabled: width < 500, maxTouchPoints: 1 });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await navigate("/");
      assert.equal(await run('fixtureRequests.some(url => url === "/sets")'), false);
      assert.equal(await run('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
      assert.match(await run('document.querySelector("#card-week-printing").textContent'), /SPM #271/);
      await run(search("Sol Ring"));
      await ready('document.querySelector("#ms-show-languages")');
      assert.equal(await run(status), "2 English printings");
      assert.equal(await run('[...document.querySelectorAll("#ms-print-lang option")].length'), 5);
      assert.equal(await run('document.querySelector("#ms-language-filter").hidden'), true);
      assert.equal(await run(`Array.from(${rows}).some(button => button.dataset.printId === "${japanese.id}")`), false);
      assert.equal(await run('Boolean(document.querySelector(".ms-live-printings").compareDocumentPosition(document.querySelector("#ms-card-information")) & Node.DOCUMENT_POSITION_FOLLOWING)'), true);
      const layout = await run(`Object.fromEntries(["#card-details", ".ms-compact-card", ".ms-card-image", "#printings-heading", "#ms-show-languages"].map(selector => {
        const element = document.querySelector(selector), rect = element.getBoundingClientRect();
        return [selector, [rect.top, rect.width, rect.height, getComputedStyle(element).display]];
      }))`);
      assert.ok(layout["#ms-show-languages"][0] - layout["#card-details"][0] < layout[".ms-card-image"][2] + 470, JSON.stringify(layout));
      assert.equal(await run('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), true);
      assert.equal(await run('document.querySelector(".ms-live-printings").scrollWidth <= document.querySelector(".ms-live-printings").clientWidth + 1'), true);

      await run('document.querySelector("#ms-show-languages").focus()');
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
      await ready('document.querySelector("#ms-show-languages").checked');
      assert.equal(await run('document.querySelector("#ms-language-filter").hidden'), false);
      assert.equal(await run(status), "5 printings · 4 languages");
      assert.match(await run('document.querySelector(".ms-print-variants summary").textContent'), /2 other language versions/);
      for (const [lang, expected] of [["de", german.id], ["ph", phyrexian.id], ["ja", japanese.id]]) {
        await run(`(() => { const select = document.querySelector("#ms-print-lang"); select.value = "${lang}"; select.dispatchEvent(new Event("change")); })()`);
        assert.deepEqual(await run(`[...new Set(Array.from(${rows}, button => button.dataset.printId))]`), [expected]);
      }
      await run(`document.querySelector('#ms-print-body button[data-print-id="${japanese.id}"]').click()`);
      await ready(`${currentId} === "${japanese.id}"`);
      if (width < 500) {
        const point = await run(`(() => {
          const label = document.querySelector(".ms-language-toggle");
          label.scrollIntoView({ block: "center", behavior: "instant" });
          const rect = label.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`);
        await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
        await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } else {
        await run('document.querySelector("#ms-show-languages").click()');
      }
      await ready('!document.querySelector("#ms-show-languages").checked');
      assert.match(await run('document.querySelector("#ms-language-selection").textContent'), /Japanese printing is still selected/);
      assert.equal(await run(currentId), japanese.id);
      assert.equal(await run(status), "2 English printings");
      await run('document.querySelector("#ms-show-languages").click(); document.querySelector("#ms-print-lang").value = "all"; document.querySelector("#ms-print-lang").dispatchEvent(new Event("change"));');
      assert.equal(await run(status), "5 printings · 4 languages");
      assert.equal(await run('document.querySelector("#ms-selected-finish").value'), "foil");
      await run('document.querySelector("#card-details [data-compare-id]").click()');
      await ready('document.querySelector(".cmp-grid").textContent.includes("Japanese")');
      assert.match(await run('document.querySelector(".cmp-grid").textContent'), /foil/i);
      assert.deepEqual(await run('fixtureEvents.filter(x => x.event === "exact_printing_select").map(x => x.props)'), [
        { source: "search", language_group: "other", finish: "foil" }
      ]);
      assert.deepEqual(await run('fixtureEvents.filter(x => x.event === "search_success").map(x => x.props)'), [
        { surface: "home", exact_printing: false, search_type: "name", result_band: "one" }
      ]);
      const url = new URL(await run('document.querySelector("[data-build-deck]").href'));
      assert.equal(url.searchParams.get("printing"), japanese.id);
      assert.equal(url.searchParams.get("finish"), "foil");
      await navigate(url.pathname + url.search);
      await ready(`document.querySelector("#preview-id").textContent === "${japanese.id}"`);
      assert.equal(await run('document.querySelector("#preview-language").textContent'), "JA");
      assert.equal(await run('document.querySelector("#preview-finish").textContent'), "Foil");

      await navigate("/");
      await run(search("J25 35"));
      await ready(`${currentId} === "${cynette.id}"`);
      await run(search("#35"));
      await ready('document.querySelector("#ms-search-results").textContent.includes("multiple sets")');
      assert.equal(await run(currentId), undefined);
      await run(search("Modern Horizons 3"));
      await ready('document.querySelector("#ms-search-results").textContent.includes("Modern Horizons 3") && !document.querySelector("#ms-search-results").textContent.includes("multiple sets")');
      assert.equal(await run('document.querySelector("#ms-search-results h2").textContent'), "Printing matches");
      await run(search("mythic dragon"));
      await ready('document.querySelector("#ms-search-results h2")?.textContent === "Card matches"');
      await run(search("mythic dragon foil"));
      await ready('document.querySelector("#ms-search-results h2")?.textContent === "Printing matches"');
      await run(search("mythic dragon"));
      await ready('document.querySelector("#ms-search-results h2")?.textContent === "Card matches"');
      assert.equal(await run('document.querySelectorAll("#search-form input").length'), 1);
      assert.equal(await run('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), true);
      assert.deepEqual(errors, []);
    });
  }
  await t.test("keyboard suggestions, bounded pagination, combined filters and utility indexing", async () => {
    await navigate("/");
    await run('document.querySelector("#search-input").focus(); document.querySelector("#search-input").value = "J25 35"; document.querySelector("#search-input").dispatchEvent(new Event("input"))');
    await ready('document.querySelector("#autocomplete-list").textContent.includes("J25 #35 — Cynette")');
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
    await ready('document.querySelector("#search-input").getAttribute("aria-activedescendant") === "ms-autocomplete-0"');
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await ready(`${currentId} === "${cynette.id}"`);
    await ready(`document.querySelector('meta[name="robots"]').content === "noindex,follow"`);
    assert.equal(await run(`document.querySelector('link[rel="canonical"]').href`), "https://manascout.co.uk/");
    assert.equal(await run('fixtureRequests.filter(value => value === "/cards/j25/35/en").length'), 1);

    await run(search("#35"));
    await ready('document.querySelectorAll("#ms-search-results li").length === 16');
    const next = 'Array.from(document.querySelectorAll("#ms-search-results button")).find(button => button.textContent === "Next results")';
    const previous = 'Array.from(document.querySelectorAll("#ms-search-results button")).find(button => button.textContent === "Previous results")';
    assert.equal(await run('fixtureRequests.some(value => value.includes("page=2"))'), false);
    await run(`${next}.click()`);
    await ready('document.querySelector("#ms-search-status").textContent.includes("17–32 of 33")');
    assert.equal(await run('document.querySelectorAll("#ms-search-results li").length'), 16);
    await run(`${next}.click()`);
    await ready('document.querySelector("#ms-search-status").textContent.includes("33 of 33")');
    assert.equal(await run('document.querySelectorAll("#ms-search-results li").length'), 1);
    await run(`${previous}.click()`);
    assert.equal(await run('fixtureRequests.filter(value => value.includes("page=2")).length'), 1);

    await run(search("Japanese Sheoldred DMU 107 foil"));
    await ready(`${currentId} === "${japaneseSheoldred.id}"`);
    await ready('document.querySelector("#ms-language-selection")?.textContent.includes("Japanese printing is still selected")');
    const used = await run('fixtureRequests.filter(value => value.startsWith("/cards/search")).map(value => new URL(value, location.href).searchParams.get("q"))');
    assert.ok(used.some(q => q.includes('lang:ja "Sheoldred" set:dmu cn="107" finish:foil')));
    assert.deepEqual(errors, []);
  });
  await t.test("guide and single-language catalogues retain their selected records", async () => {
    await navigate(`/card/sol-ring/?printing=${solGuide.id}&finish=nonfoil`);
    await ready('document.querySelector("#ms-show-languages")');
    assert.equal(await run(currentId), solGuide.id);
    assert.equal(await run(status), "2 English printings");
    assert.equal(await run('document.querySelector("#card-details").closest("section").nextElementSibling.contains(document.querySelector("#printings-container"))'), true);
    await navigate("/");
    for (const langs of [["en"], ["en", "ja"]]) {
      await run(`window.fixtureLanguages = ${JSON.stringify(langs)};`);
      await run(search("Soll Ring"));
      await ready(`${status} === "2 English printings" && !document.querySelector("#ms-show-languages").checked`);
      await run('document.querySelector("#ms-show-languages").click()');
      assert.deepEqual(await run('[...document.querySelectorAll("#ms-print-lang option")].map(option => option.value)'), ["all", ...langs]);
    }
    assert.deepEqual(errors, []);
  });
  await t.test("cancelled, malformed, network and 429 searches preserve exact selection", async () => {
    await navigate("/");
    await run(search("DMU 107"));
    await ready(`${currentId} === "${sheoldred.id}"`);
    await run(search("Stale search"));
    await ready('fixtureRequests.some(value => value.includes("Stale%20search"))');
    await run(search("MH3 383"));
    await ready(`${currentId} === "${mh3.id}"`);
    for (const query of ["Malformed", "Network failure", "Rate limited"]) {
      await run(search(query));
      await ready('document.querySelector("#ms-search-status").textContent.includes("retry")');
      assert.equal(await run(currentId), mh3.id);
    }
    await pause(1300);
    assert.equal(await run(currentId), mh3.id);
    assert.deepEqual(errors, []);
  });
});

test("Phase 8 Deck Studio Chromium journeys", { timeout: 90000 }, async t => {
  const { run, ready, send, navigate, errors } = await setup(t);
  const deckUrl = "https://manascout.co.uk/deck/";
  const title = "Deck Studio — Build Your MTG Deck | ManaScout";
  const indexMetadata = `[
    document.querySelector('link[rel="canonical"]').href,
    document.querySelector('meta[name="robots"]').content,
    document.title
  ]`;

  for (const width of [320, 390, 768, 1280]) {
    await t.test(`${width}px tool-first layout, import, generation and exact handoffs`, async () => {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: width < 500 });
      await navigate("/contact/");
      await run("localStorage.clear()");
      await navigate("/deck/");
      assert.deepEqual(await run(indexMetadata), [deckUrl, "index,follow", title]);
      const layout = await run(`(() => {
        const workspace = document.querySelector(".ds-workspace");
        const about = document.querySelector(".ds-about");
        return {
          heading: document.querySelector("h1").textContent,
          controlsTop: document.querySelector("#deck-name").getBoundingClientRect().top,
          workspaceBottom: workspace.getBoundingClientRect().bottom,
          aboutTop: about.getBoundingClientRect().top,
          pageWidth: document.documentElement.clientWidth,
          contentWidth: document.documentElement.scrollWidth,
          viewportHeight: innerHeight
        };
      })()`);
      assert.equal(layout.heading, "Deck Studio");
      assert.ok(layout.controlsTop < 245, JSON.stringify(layout));
      assert.ok(layout.aboutTop >= layout.viewportHeight && layout.aboutTop >= layout.workspaceBottom, JSON.stringify(layout));
      assert.equal(layout.contentWidth, layout.pageWidth, JSON.stringify(layout));
      await run('document.querySelector(".ds-about h2").scrollIntoView()');
      assert.ok(await run('scrollY > 0'));
      await run('scrollTo(0, 0); document.querySelector("#deck-import").click()');
      await ready('document.querySelector("#portable-import").closest("dialog").open');
      await run(`document.querySelector("#portable-text").value = "1 Sol Ring (CMM) 410 [foil] [lang:ja]";
        document.querySelector("#portable-preview").click()`);
      await ready('!document.querySelector("#portable-accept").disabled');
      await run('document.querySelector("#portable-close").click()');
      assert.equal(await run('document.querySelector("#portable-import").closest("dialog").open'), false);

      await navigate(`/deck/?card=Sol+Ring&printing=${japanese.id}&finish=foil&guide=%2Fcard%2Fsol-ring%2F&source=home`);
      await ready(`document.querySelector("#preview-id").textContent === "${japanese.id}"`);
      assert.deepEqual(await run(indexMetadata), [deckUrl, "noindex,follow", title]);
      assert.equal(await run('document.querySelector("#preview-language").textContent'), "JA");
      assert.equal(await run('document.querySelector("#preview-finish").textContent'), "Foil");
      assert.match(await run('document.querySelector("#preview-printing").textContent'), /CMM #410/);
      assert.ok(await run('fixtureEvents.some(item => item.event === "deck_studio_open" && item.props.source === "home")'));

      await navigate(`/deck/?printing=${cynette.id}&finish=nonfoil&set=j25&number=35&source=cotw`);
      await ready(`document.querySelector("#preview-id").textContent === "${cynette.id}"`);
      assert.deepEqual(await run(indexMetadata), [deckUrl, "noindex,follow", title]);
      assert.match(await run('document.querySelector("#preview-printing").textContent'), /J25 #35/);
      assert.equal(await run('document.querySelector("#preview-finish").textContent'), "Nonfoil");
      await ready('!document.querySelector("#preview-commander").hidden && !document.querySelector("#preview-commander").disabled');
      await run('document.querySelector("#preview-commander").click()');
      await ready('!document.querySelector("#generation-controls").hidden && !document.querySelector("#generate-deck").disabled');
      await run('document.querySelector("#generate-deck").click(); document.querySelector("#cancel-generation").click()');
      await ready('document.querySelector("#generation-status").textContent.includes("cancel")');
      assert.deepEqual(errors, []);
    });
  }

  await t.test("Contact and non-card state crawl directives", async () => {
    await navigate("/contact/");
    assert.equal(await run(`document.querySelector('meta[name="robots"]').content`), "noindex,follow");
    assert.equal(await run(`document.querySelector('link[rel="canonical"]').href`), "https://manascout.co.uk/contact/");
    await navigate("/deck/?format=commander");
    assert.deepEqual(await run(indexMetadata), [deckUrl, "noindex,follow", title]);
    assert.deepEqual(errors, []);
  });
});
