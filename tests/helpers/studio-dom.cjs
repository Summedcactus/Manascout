/* Deliberately limited DOM double. It tests controller events, not browser rendering. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
function mount({ client, narrow = false, search = '', storage } = {}) {
  let document;
  const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.attributes = {}; this.dataset = {}; this.listeners = {}; this._text = ''; this._value = undefined; this.hidden = false; this.disabled = false; this.open = false; this.scrollTop = 0; this.className = ''; this.files = []; this.style = {}; }
    get id() { return this.attributes.id || ''; } set id(v) { this.attributes.id = v; }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this.replaceChildren(); this._text = String(v); }
    get value() { return this._value ?? this.attributes.value ?? (this.tagName === 'SELECT' ? (this.querySelector('option[selected]') || this.querySelector('option'))?.value || '' : this.tagName === 'OPTION' ? this.textContent : ''); }
    set value(v) { this._value = String(v); }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get classList() { return { contains: c => this.className.split(/\s+/).includes(c), add: c => { if (!this.className.split(/\s+/).includes(c)) this.className += ' ' + c; }, remove: c => { this.className = this.className.split(/\s+/).filter(x => x !== c).join(' '); } }; }
    append(...nodes) { for (const n of nodes) { if (n.tagName === '#FRAGMENT') { this.append(...[...n.children]); n.children = []; continue; } n.parentElement?.removeChild(n); n.parentElement = this; this.children.push(n); } }
    removeChild(n) { this.children = this.children.filter(c => c !== n); n.parentElement = null; }
    replaceChildren(...nodes) { for (const n of this.children) n.parentElement = null; this.children = []; this._text = ''; this.append(...nodes); }
    remove() { this.parentElement?.removeChild(this); }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = v; if (k === 'hidden') this.hidden = true; if (k === 'disabled') this.disabled = true; if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); }
    getAttribute(k) { return this.attributes[k]; }
    removeAttribute(k) { delete this.attributes[k]; if (k === 'src') delete this.src; if (k === 'hidden') this.hidden = false; }
    contains(n) { for (; n; n = n.parentElement) if (n === this) return true; return false; }
    matches(selector) {
      const attrs = [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
      const base = selector.replace(/\[[^\]]*\]/g, '');
      const tag = base.match(/^[a-z][a-z0-9]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const id = base.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
      for (const c of base.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(c[1])) return false;
      return attrs.every(([, k, v]) => {
        const value = k.startsWith('data-') ? this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.getAttribute(k);
        return value !== undefined && (v === undefined || value === v);
      });
    }
    querySelectorAll(selector) {
      const parts = selector.trim().split(/\s+(?=[^\]]*(?:\[|$))/);
      const last = parts.pop(); const out = [];
      const visit = e => { for (const c of e.children) { if (c.matches(last)) { let ancestor = c.parentElement; let ok = true; for (let i = parts.length - 1; i >= 0; i--) { while (ancestor && !ancestor.matches(parts[i])) ancestor = ancestor.parentElement; if (!ancestor) { ok = false; break; } ancestor = ancestor.parentElement; } if (ok) out.push(c); } visit(c); } };
      visit(this); return out;
    }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    closest(s) { for (let e = this; e; e = e.parentElement) if (e.matches(s)) return e; return null; }
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
    async emit(t, extra = {}) { const event = { target: this, preventDefault() {}, ...extra }; for (let e = this; e; e = e.parentElement) await Promise.all((e.listeners[t] || []).map(fn => fn(event))); }
    focus() { document.activeElement = this; }
    getClientRects() { for (let e = this; e; e = e.parentElement) if (e.hidden || (e.tagName === 'DIALOG' && !e.open)) return []; return this.isConnected ? [{}] : []; }
    getBoundingClientRect() { return { left: narrow ? 0 : 800, top: narrow ? 70 : 0, right: 1200, bottom: 800 }; }
    showModal() { this.open = true; } close() { this.open = false; this.emit('close'); }
    click() { return this.emit('click'); }
  }
  const outer = new Element('html');
  const docListeners = {};
  document = { body: null, activeElement: null, createElement: t => new Element(t), createDocumentFragment: () => new Element('#fragment'), getElementById: id => outer.querySelector('#' + id), querySelector: s => outer.querySelector(s), querySelectorAll: s => outer.querySelectorAll(s), addEventListener(t,fn) { (docListeners[t] ||= []).push(fn); }, visibilityState:'visible' };
  const html = fs.readFileSync(path.join(root, 'deck/index.html'), 'utf8').replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<!--[^]*?-->/g, '');
  const stack = [outer]; const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  for (const m of html.matchAll(/<\/?[a-z][^>]*>|([^<]+)/gi)) {
    const token = m[0];
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (!token.startsWith('<')) { stack[stack.length - 1]._text += decode(token); continue; }
    const tag = token.match(/^<([a-z][a-z0-9]*)/i)[1].toLowerCase(); const e = new Element(tag);
    for (const a of token.slice(tag.length + 1, -1).matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) e.setAttribute(a[1], decode(a[2] ?? ''));
    stack[stack.length - 1].append(e); if (tag === 'body') document.body = e;
    if (!voids.has(tag)) stack.push(e);
  }
  const media = { matches: narrow, listeners: [], addEventListener(_name, fn) { this.listeners.push(fn); } };
  const listeners = {};
  const window = { ManaScoutDeckFormats: require('../../assets/js/deck-formats.js'), location: { search }, matchMedia: () => media, ManaScoutDeckData: require('../../assets/js/deck-data.js'), ManaScoutDeckModel: require('../../assets/js/deck-model.js'), ManaScoutDeckClient: { createClient: () => client }, addEventListener(t, fn) { (listeners[t] ||= []).push(fn); }, localStorage: storage, confirm: () => false };
  for (const [file, global] of [['deck-rules.js','ManaScoutDeckRules'],['deck-store.js','ManaScoutDeckStore'],['deck-generator.js','ManaScoutDeckGenerator']]) if (fs.existsSync(path.join(root,'assets/js',file))) window[global] = require('../../assets/js/' + file);
  const timers = new Set();
  const timerTasks = new Map();
  const context = { window, document, console, URL, URLSearchParams, AbortController, Blob, Date, structuredClone,
    setTimeout(fn,ms) { const t = setTimeout(() => { timerTasks.delete(t); fn(); },ms); timers.add(t); timerTasks.set(t,{fn,ms}); return t; }, clearTimeout(t) { clearTimeout(t); timerTasks.delete(t); }, setInterval: () => 0, clearInterval() {} };
  vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(root,'assets/js/deck-view.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js/deck-studio.js'),'utf8'),context);
  return { document, window, el: id => document.getElementById(id), resize(value) { media.matches = value; media.listeners.forEach(fn => fn()); }, cleanup() { for (const t of timers) clearTimeout(t); }, async runTimers(ms) { for (const [t,task] of [...timerTasks]) if (task.ms===ms) { clearTimeout(t); timerTasks.delete(t); await task.fn(); } }, listeners, docListeners };
}
module.exports = { mount };
