const { test } = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { createClient, origin, searchPageUrl } = require("../assets/js/scryfall-client.js");

const url = resource => origin + "/cards/" + resource;
const success = data => ({ ok: true, status: 200, json: async () => data });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test("only absolute HTTPS Scryfall API URLs with no credentials or fragments are accepted", async () => {
  let calls = 0;
  const client = createClient({ interval: 0, fetchImpl: async () => { calls++; return success({ id: "one" }); } });
  for (const bad of [
    "http://api.scryfall.com/cards/search", "https://scryfall.com/cards/search",
    "https://api.scryfall.com.example.net/cards/search", "https://api.scryfall.com:81/cards/search",
    "https://name:secret@api.scryfall.com/cards/search", "https://api.scryfall.com/cards/search#foo",
    "https://api.scryfall.com@evil.example/cards/search", "https://api.scryfall.com/ca\trds/search",
    "/cards/search", "//api.scryfall.com/cards/a", "not a URL", null
  ]) {
    await assert.rejects(client.get(bad), { code: "invalid_url" });
    assert.equal(searchPageUrl(bad), "");
  }
  assert.equal(searchPageUrl(url("random?page=2")), "");
  assert.equal(searchPageUrl(url("search?page=2")), url("search?page=2"));
  assert.deepEqual(await client.get(url("search?q=bolt")), { id: "one" });
  assert.equal(calls, 1);
});

test("redirects are never followed and unsafe or redirected response URLs are rejected", async () => {
  for (const meta of [{ url: "https://evil.example/cards/one" }, { redirected: true, url: url("two") }]) {
    const client = createClient({ interval: 0, fetchImpl: async (_, options) => {
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Accept, "application/json");
      return { ...success({}), ...meta, json: () => assert.fail("Untrusted response was read") };
    } });
    await assert.rejects(client.get(url("one")), { code: "invalid_response" });
  }
});

test("concurrent requests start in FIFO order at a shared pace, even while a previous body is pending", async () => {
  const body = deferred();
  const controller = new AbortController();
  const addresses = ["one", "two", "three"].map(url);
  const starts = [];
  const interval = 15;
  let readingFirstBody = false;
  const client = createClient({ interval, fetchImpl: async address => {
    starts.push([address, performance.now()]);
    if (address === addresses[0]) return { ...success({}), json: () => {
      readingFirstBody = true;
      return body.promise;
    } };
    return success({ address });
  } });
  const requests = addresses.map(address => client.get(address, { signal: controller.signal }));
  const settled = Promise.allSettled(requests);
  try {
    assert.deepEqual(await Promise.race([requests[0], requests[2]]), { address: addresses[2] });
    assert.ok(readingFirstBody);
    assert.deepEqual(starts.map(([address]) => address), addresses);
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i][1] - starts[i - 1][1];
      assert.ok(gap >= interval, `Request ${i + 1} started after ${gap} ms (minimum ${interval} ms)`);
    }
    body.resolve({ address: addresses[0] });
    await Promise.all(requests);
  } finally {
    body.resolve();
    controller.abort();
    await settled;
  }
});

test("a failed start and a cancelled queued request leave the next slot usable", async () => {
  const entered = deferred();
  const seen = [];
  const client = createClient({ interval: 25, fetchImpl: async address => {
    seen.push(address);
    if (address === url("break")) {
      entered.resolve();
      throw Error("offline");
    }
    return success({ address });
  } });
  const controller = new AbortController();
  const first = assert.rejects(client.get(url("break")), { code: "network" });
  const cancelled = assert.rejects(client.get(url("queued"), { signal: controller.signal }), { name: "AbortError" });
  const later = client.get(url("later"));
  await entered.promise;
  controller.abort();
  await Promise.all([first, cancelled, later]);
  assert.deepEqual(seen, [url("break"), url("later")]);
});

test("a pre-aborted request never reaches the transport, including on a cache hit", async () => {
  let starts = 0;
  const client = createClient({ interval: 0, fetchImpl: async () => { starts++; return success({}); } });
  await client.get(url("one"), { cache: true });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.get(url("one"), { signal: controller.signal, cache: true }), { name: "AbortError", code: "abort" });
  await assert.rejects(client.get(url("two"), { signal: controller.signal }), { name: "AbortError" });
  assert.equal(starts, 1);
});

for (const phase of ["fetch", "body"]) {
  test(`hard timeout settles when ${phase} ignores its signal`, async () => {
    let signal;
    const never = new Promise(() => {});
    const client = createClient({ interval: 0, timeout: 8, fetchImpl: async (address, options) => {
      signal = options.signal;
      if (address === url("healthy")) return success({ healthy: true });
      return phase === "fetch" ? never : { ...success({}), json: () => never };
    } });
    await assert.rejects(client.get(url("stalled")), { code: "timeout" });
    assert.ok(signal.aborted);
    assert.deepEqual(await client.get(url("healthy")), { healthy: true });
  });

  test(`caller abort settles while ${phase} is in progress and allows same-URL retry`, async () => {
    let attempts = 0;
    let transportSignal;
    const started = deferred();
    const never = new Promise(() => {});
    const client = createClient({ interval: 0, fetchImpl: async (_, options) => {
      attempts++;
      if (attempts > 1) return success({ retried: true });
      transportSignal = options.signal;
      const stall = () => { started.resolve(); return never; };
      return phase === "fetch" ? stall() : { ...success({}), json: stall };
    } });
    const controller = new AbortController();
    const result = assert.rejects(client.get(url("one"), { signal: controller.signal }), { name: "AbortError", code: "abort" });
    await started.promise;
    controller.abort();
    await result;
    assert.ok(transportSignal.aborted);
    assert.deepEqual(await client.get(url("one")), { retried: true });
  });
}

const baseTime = Date.parse("Wed, 25 Nov 2026 22:29:49 GMT");
for (const [label, header, expected] of [
  ["numeric", "10", 10000], ["HTTP-date", "Wed, 25 Nov 2026 22:30:00 GMT", 11000],
  ["missing", null, 10000], ["malformed", "something batched", 10000], ["large", "9999", 60000],
  ["expired date", "Wed, 25 Nov 2026 22:29:40 GMT", 1000], ["zero", "0", 1000]
]) {
  test(`429 ${label} Retry-After sets one bounded cooldown and expires without auto-retry`, async () => {
    let now = baseTime;
    let calls = 0;
    const client = createClient({ now: () => now, interval: 0, fetchImpl: async () => {
      calls++;
      return calls === 1 ? { ok: false, status: 429, headers: { get: () => header } } : success({ ready: true });
    } });
    const limited = { code: "http", status: 429, retryAt: baseTime + expected };
    await assert.rejects(client.get(url("one")), limited);
    await assert.rejects(client.get(url("two")), limited);
    now += expected - 1;
    await assert.rejects(client.get(url("two")), limited);
    assert.equal(calls, 1);
    now += 1;
    assert.deepEqual(await client.get(url("two")), { ready: true });
  });
}

test("a rate-limit response prevents requests already waiting for their pacing slot", async () => {
  const client = createClient({ interval: 20, fetchImpl: async address => {
    assert.equal(address, url("one"));
    return { ok: false, status: 429, headers: { get: () => null } };
  } });
  await Promise.all([
    assert.rejects(client.get(url("one")), { status: 429 }),
    assert.rejects(client.get(url("two")), { status: 429 })
  ]);
});

test("opt-in caching is bounded, expires by TTL, and retains recently accessed entries", async () => {
  let now = 0;
  let calls = 0;
  const client = createClient({ interval: 0, now: () => now, cacheLimit: 2, cacheTtl: 10,
    fetchImpl: async address => success({ address, call: ++calls }) });
  const get = name => client.get(url(name), { cache: true });
  const one = await get("one");
  await get("two");
  assert.equal(await get("one"), one);
  await get("three");
  assert.equal(await get("one"), one);
  assert.equal((await get("two")).call, 4);
  now += 10;
  assert.equal((await get("one")).call, 5);
  assert.equal((await client.get(url("one"))).call, 6);
});

test("compatible subscribers share a GET, while one caller can cancel independently", async () => {
  const body = deferred();
  let calls = 0;
  let transportSignal;
  const client = createClient({ interval: 0, fetchImpl: async (_, options) => {
    calls++;
    transportSignal = options.signal;
    return { ...success({}), json: () => body.promise };
  } });
  const controller = new AbortController();
  const cancelled = assert.rejects(client.get(url("one"), { signal: controller.signal }), { name: "AbortError" });
  const other = client.get(url("one"));
  controller.abort();
  await cancelled;
  body.resolve({ valid: true });
  assert.deepEqual(await other, { valid: true });
  assert.equal(calls, 1);
  assert.ok(!transportSignal.aborted);
});

test("shared failures are evicted and later retries can succeed and populate the cache", async () => {
  let calls = 0;
  const client = createClient({ interval: 0, fetchImpl: async () => ++calls === 1
    ? { ok: false, status: 404 } : success({ valid: true }) });
  const get = () => client.get(url("one"), { cache: true });
  await Promise.all([assert.rejects(get(), { status: 404 }), assert.rejects(get(), { status: 404 })]);
  assert.equal(calls, 1);
  assert.deepEqual(await get(), { valid: true });
  assert.deepEqual(await get(), { valid: true });
  assert.equal(calls, 2);
});

test("random calls are never deduplicated or cached, and invalid JSON has its own error", async () => {
  let calls = 0;
  const client = createClient({ interval: 0, fetchImpl: async (address, options) => {
    if (address === url("random")) {
      assert.equal(options.cache, "no-store");
      return success({ call: ++calls });
    }
    return { ...success({}), json: async () => { throw new SyntaxError("bad JSON"); } };
  } });
  const random = () => client.get(url("random"), { cache: true });
  assert.notDeepEqual(...await Promise.all([random(), random()]));
  assert.equal((await random()).call, 3);
  await assert.rejects(client.get(url("bad")), { code: "invalid_response" });
});
