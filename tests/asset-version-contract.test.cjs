const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const tool = path.join(__dirname, "..", "scripts", "stage-asset-versions.py");
const version = content => createHash("sha256").update(content).digest("hex").slice(0, 16);
const first = "window.ManaScoutFixture = true;\n";
const css = "body{min-width:0}\n";
const other = "window.SecondFixture = true;\n";
const homepage = [
  '<!DOCTYPE html>\r\n<HTML lang="en"><meta charset="utf-8">',
  '<link rel="canonical" href="https://manascout.co.uk/?v=keep">',
  "<LINK HREF = '/assets/css/shared.css?v=phase102&amp;stability=1#tab' REL=stylesheet>",
  '<link rel="preload" as="script" href="/assets/js/app.js?phase=1">',
  '<script defer data-note="/assets/js/app.js?growth=5" src="/assets/js/app.js?v=phase9&amp;growth=5"></script>',
  '<script async src=/assets/js/next.js?presentation=10></script>',
  '<script src="https://static.example/external.js?v=old&amp;keep=1"></script>',
  '<script src="//static.example/other.js?phase=3"></script>',
  '<script type="application/json">{"text":"<script src=\'/assets/js/app.js?v=keep\'>"}</script>',
  '<!-- <script src="/assets/js/app.js?v=keep"></script> -->',
  '<a href="/assets/js/app.js?phase=keep">Mémoire</a>',
  '<img src="/assets/art.jpg?v=keep"><p>Editorial bytes remain intact.\r\n</p>'
].join("\r\n");
const guide = [
  '<script defer src="../../assets/js/app.js?v=stability2&amp;transport=2&#35;pane"></script>',
  "<link rel='stylesheet' href='../../assets/css/shared.css#theme'>",
  '<script defer src=../../assets/js/next.js></script>'
].join("\n");

function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "manascout-asset-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const source = path.join(folder, "source");
  const assets = {
    "index.html": homepage, "card/example/index.html": guide, "robots.txt": "User-agent: *\n",
    "assets/js/app.js": first, "assets/js/next.js": other, "assets/css/shared.css": css,
    "assets/art.jpg": Buffer.from([0, 255, 35]), "tests/fixture.html": "test material",
    "docs/notes.md": "authoring notes"
  };
  const write = (relative, contents) => {
    const file = path.join(source, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  for (const [relative, contents] of Object.entries(assets)) write(relative, contents);
  const run = (command, output) => spawnSync("python", [tool, command, "--source", source,
    ...(output ? ["--output", output] : [])], { encoding: "utf8" });
  const out = name => path.join(folder, name);
  const build = output => {
    const result = run("build", output);
    assert.equal(result.status, 0, result.stderr);
  };
  const read = (base, relative) => fs.readFileSync(path.join(base, relative), "utf8");
  const hashes = stage => JSON.parse(read(stage, "asset-versions.json"));
  return { assets, source, write, run, out, build, read, hashes };
}

test("two staging builds are byte-identical and leave the source unchanged", t => {
  const f = fixture(t);
  const a = f.out("a");
  const b = f.out("b");
  f.build(a);
  f.build(b);
  for (const relative of [...Object.keys(f.assets), "asset-versions.json"]) {
    const one = path.join(a, relative);
    const two = path.join(b, relative);
    if (relative.startsWith("docs/") || relative.startsWith("tests/")) {
      assert.equal(fs.existsSync(one), false);
      continue;
    }
    assert.deepEqual(fs.readFileSync(one), fs.readFileSync(two), relative);
    if (relative in f.assets) {
      assert.deepEqual(fs.readFileSync(path.join(f.source, relative)), Buffer.from(f.assets[relative]));
    }
  }
  assert.deepEqual(fs.readFileSync(path.join(a, "assets/art.jpg")), f.assets["assets/art.jpg"]);
  assert.equal(f.run("check", a).status, 0);
  fs.appendFileSync(path.join(a, "index.html"), "changed");
  assert.match(f.run("check", a).stderr, /Staged content differs: index.html/);
});

test("only local JS/CSS attribute values change and script/style ordering stays byte-identical", t => {
  const f = fixture(t);
  const stage = f.out("stage");
  f.build(stage);
  const expectedHome = homepage
    .replace("shared.css?v=phase102&amp;stability=1#tab", `shared.css?v=${version(css)}#tab`)
    .replace('href="/assets/js/app.js?phase=1"', `href="/assets/js/app.js?v=${version(first)}"`)
    .replace("app.js?v=phase9&amp;growth=5", `app.js?v=${version(first)}`)
    .replace("next.js?presentation=10", `next.js?v=${version(other)}`);
  const expectedGuide = guide
    .replace("app.js?v=stability2&amp;transport=2&#35;pane", `app.js?v=${version(first)}&#35;pane`)
    .replace("shared.css#theme", `shared.css?v=${version(css)}#theme`)
    .replace("next.js>", `next.js?v=${version(other)}>`);
  assert.equal(f.read(stage, "index.html"), expectedHome);
  assert.equal(f.read(stage, "card/example/index.html"), expectedGuide);
  assert.equal(f.hashes(stage)["assets/js/app.js"].version, version(first));
});

test("changing one asset updates only that asset's version on every referencing page", t => {
  const f = fixture(t);
  const a = f.out("before");
  const b = f.out("after");
  f.build(a);
  f.write("assets/js/app.js", first + "// changed\n");
  f.build(b);
  const before = f.hashes(a);
  const after = f.hashes(b);
  assert.notEqual(after["assets/js/app.js"].version, before["assets/js/app.js"].version);
  const normalize = html => html.replaceAll(after["assets/js/app.js"].version, before["assets/js/app.js"].version);
  for (const page of ["index.html", "card/example/index.html"]) {
    assert.equal(normalize(f.read(b, page)), f.read(a, page));
  }
  after["assets/js/app.js"] = before["assets/js/app.js"];
  assert.deepEqual(after, before);
});

test("audit records historical query variants, exact referencing pages and full content hashes", t => {
  const f = fixture(t);
  const result = f.run("audit");
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  const app = report["assets/js/app.js"];
  assert.equal(app.sha256, createHash("sha256").update(first).digest("hex"));
  assert.equal(app.page_count, 2);
  assert.deepEqual(app.variants, {
    "phase=1": { page_count: 1, pages: ["index.html"] },
    "v=phase9&growth=5": { page_count: 1, pages: ["index.html"] },
    "v=stability2&transport=2": { page_count: 1, pages: ["card/example/index.html"] }
  });
  assert.deepEqual(Object.keys(report).sort(), ["assets/css/shared.css", "assets/js/app.js", "assets/js/next.js"]);
});

test("a missing local script fails audit and build without creating partial output", t => {
  const f = fixture(t);
  f.write("card/example/index.html", '<script src="/assets/js/missing.js?v=old"></script>');
  assert.match(f.run("audit").stderr, /card\/example\/index.html: Missing publishable asset/);
  const output = f.out("stage");
  assert.equal(f.run("build", output).status, 1);
  assert.equal(fs.existsSync(output), false);
});

test("reference traversal, symlinks and outputs inside the source tree are rejected", t => {
  const f = fixture(t);
  const output = f.out("stage");
  for (const ref of ["/../other.js", "../../other.js", "/%2e%2e/other.js", "/assets%5cother.js"]) {
    f.write("index.html", `<script src="${ref}"></script>`);
    const result = f.run("build", output);
    assert.equal(result.status, 1, ref);
    assert.match(result.stderr, /Asset path escapes source|Unsafe asset path/);
    assert.equal(fs.existsSync(output), false);
  }
  f.write("index.html", homepage);
  assert.match(f.run("build", path.join(f.source, "stage")).stderr, /Output must be separate/);
  assert.match(f.run("build", path.dirname(f.source)).stderr, /Output must be separate/);
  fs.symlinkSync(f.out("unwritten"), f.out("alias"));
  assert.match(f.run("build", f.out("alias")).stderr, /Output cannot be a symbolic link/);
  const localLink = path.join(f.source, "assets/js/link.js");
  fs.symlinkSync(f.out("other.js"), localLink);
  assert.match(f.run("build", output).stderr, /Symbolic link in publishable source/);
});
