class MemoryStorage {
  constructor() { this.values = new Map(); this.failWrites = false; this.failReads = false; this.failKey = null; this.beforeWrite = null; }
  get length() { return this.values.size; }
  key(i) { return [...this.values.keys()][i] ?? null; }
  getItem(k) { if (this.failReads) throw Error('SecurityError'); return this.values.get(String(k)) ?? null; }
  setItem(k,v) { k=String(k);v=String(v); if (this.failWrites || this.failKey?.(k,v)) throw Error('QuotaExceededError'); this.beforeWrite?.(k,v); this.values.set(k,v); }
  removeItem(k) { this.values.delete(String(k)); }
}
module.exports = { MemoryStorage };
