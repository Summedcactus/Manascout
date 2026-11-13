/* One source of truth: printing records are stored once; entries refer to them. */
((root) => {
  "use strict";
  const formatRegistry = typeof module === "object" && module.exports ? require("./deck-formats.js") : root.ManaScoutDeckFormats;
  const data = typeof module === "object" && module.exports ? require("./deck-data.js") : root.ManaScoutDeckData;
  const zones = new Set(["main", "sideboard", "commander", "signature", "maybeboard"]);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const entryKey = (id, finish, zone, assignedTo = "") => `${id}:${finish}:${zone}${zone === "signature" ? ":" + (assignedTo || "unassigned") : ""}`;
  const newId = () => root.crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function createDeck({ id = newId(), name = "Untitled deck", format = "commander" } = {}) {
    if (!formatRegistry.get(format)) throw Error("Choose a supported Constructed format.");
    return { schemaVersion: 1, id, name, format, view: "artwork", cards: {}, entries: [], selection: null, revision: 0, updatedAt: Date.now() };
  }
  function changed(deck, patch) {
    const entries=patch.entries||deck.entries;
    const schemaVersion=deck.schemaVersion===2||entries.some(e=>e.identityChoices||e.zone==="maybeboard")?2:1;
    return { ...deck, ...patch, schemaVersion, revision: deck.revision + 1, updatedAt: Date.now() };
  }
  function edit(deck, patch) {
    if (patch.format !== undefined && !formatRegistry.get(patch.format)) throw Error("Unsupported format.");
    if (patch.view !== undefined && !["artwork", "list"].includes(patch.view)) throw Error("Unsupported view.");
    if (patch.name !== undefined) patch = { ...patch, name: String(patch.name).trim().slice(0, 80) || "Untitled deck" };
    return changed(deck, patch);
  }
  const choiceKinds = ["automatic","manual","bulk","unknown"];
  function printingChoices(entry) {
    const value=entry.printingChoices;
    if(value===undefined)return {automatic:0,manual:0,bulk:0,unknown:entry.quantity};
    if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(key=>!choiceKinds.includes(key)))throw Error("Invalid printing-choice history.");
    const result=Object.fromEntries(choiceKinds.map(key=>[key,Object.hasOwn(value,key)?value[key]:0]));
    if(Object.values(result).some(n=>!Number.isSafeInteger(n)||n<0)||Object.values(result).reduce((a,b)=>a+b,0)!==entry.quantity)throw Error("Printing-choice counts do not match the entry quantity.");
    return result;
  }
  const choicesFor = (kind,quantity) => {
    if(!choiceKinds.includes(kind))throw Error("Unknown printing-choice source.");
    return Object.fromEntries(choiceKinds.map(key=>[key,key===kind?quantity:0]));
  };
  const mergeChoices = (a,b) => Object.fromEntries(choiceKinds.map(key=>[key,a[key]+b[key]]));
  function resizedChoices(entry,quantity) {
    const result=printingChoices(entry);
    if(quantity>entry.quantity){const kind=result.unknown?"unknown":result.manual?"manual":result.bulk?"bulk":"automatic";result[kind]+=quantity-entry.quantity;}
    else {let remove=entry.quantity-quantity;for(const kind of ["automatic","bulk","unknown","manual"]){const count=Math.min(remove,result[kind]);result[kind]-=count;remove-=count;}}
    return result;
  }
  // Optional versioned identity provenance. Legacy entries already record exact identities.
  const identityKinds = ["unspecified","finishOnly","printingOnly","exact"];
  function identityChoices(entry) {
    const value=entry.identityChoices;
    if(value===undefined)return Object.fromEntries(identityKinds.map(k=>[k,k==="exact"?entry.quantity:0]));
    if(!value||value.version!==1||Object.keys(value).some(k=>k!=="version"&&!identityKinds.includes(k)))throw Error("Invalid imported identity history.");
    const counts=Object.fromEntries(identityKinds.map(k=>[k,value[k]??0]));
    if(Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0)||Object.values(counts).reduce((a,b)=>a+b,0)!==entry.quantity)throw Error("Identity history does not match entry quantity.");
    return counts;
  }
  function resizedIdentity(entry,quantity) {
    const counts=identityChoices(entry);
    if(quantity>entry.quantity){const kind=identityKinds.find(k=>counts[k]>0)||"exact";counts[kind]+=quantity-entry.quantity;}
    else {let remove=entry.quantity-quantity;for(const k of identityKinds){const n=Math.min(remove,counts[k]);counts[k]-=n;remove-=n;}}
    return {version:1,...counts};
  }
  function add(deck, card, { finish = card.finish, zone = "main", quantity = 1, assignedTo = "", printingChoice = "automatic", printingChoices: incoming = null, identityChoice = "exact", identityChoices: identities = null } = {}) {
    if (!uuid.test(card?.id || "") || !card.name) throw Error("This card has no valid printing identity.");
    if (!zones.has(zone)) throw Error("Unsupported deck section.");
    if (!card.availableFinishes?.includes(finish)) throw Error("That finish is not listed for this printing.");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw Error("Enter a quantity from 1 to 10,000.");
    if (assignedTo && !uuid.test(assignedTo)) throw Error("The signature spell needs a valid Oathbreaker assignment.");
    const key = entryKey(card.id, finish, zone, assignedTo);
    const existing = deck.entries.find(e => e.key === key);
    const total = (existing?.quantity || 0) + quantity;
    if (total > 10000) throw Error("One entry cannot exceed 10,000 copies.");
    const added=incoming?printingChoices({quantity,printingChoices:incoming}):choicesFor(printingChoice,quantity);
    if(!identityKinds.includes(identityChoice))throw Error("Unknown imported identity choice.");
    const identityAdded=identities?identityChoices({quantity,identityChoices:identities}):Object.fromEntries(identityKinds.map(k=>[k,k===identityChoice?quantity:0]));
    const identityPrevious=existing?identityChoices(existing):Object.fromEntries(identityKinds.map(k=>[k,0]));
    const identityHistory=(identities||existing?.identityChoices||identityChoice!=="exact")?{version:1,...Object.fromEntries(identityKinds.map(k=>[k,identityPrevious[k]+identityAdded[k]]))}:null;
    const entry = { ...existing, ...(identityHistory?{identityChoices:identityHistory}:{}), key, printingId: card.id, finish, zone, quantity: total, printingChoices:existing?mergeChoices(printingChoices(existing),added):added, ...(zone === "signature" ? { assignedTo } : {}) };
    return changed(deck, { cards: { ...deck.cards, [card.id]: card }, entries: existing ? deck.entries.map(e => e.key === key ? entry : e) : [...deck.entries, entry] });
  }
  function setQuantity(deck, key, quantity) {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 10000) throw Error("Enter a quantity from 0 to 10,000.");
    if (!deck.entries.some(e => e.key === key)) throw Error("That entry is no longer in this deck.");
    const entries = quantity ? deck.entries.map(e => e.key === key ? { ...e, quantity, printingChoices:resizedChoices(e,quantity), ...(e.identityChoices?{identityChoices:resizedIdentity(e,quantity)}:{}) } : e) : deck.entries.filter(e => e.key !== key);
    const used = new Set([...entries.map(e => e.printingId), deck.selection?.printingId].filter(Boolean));
    return changed(deck, { entries, cards: Object.fromEntries(Object.entries(deck.cards).filter(([id]) => used.has(id))) });
  }
  function moveOne(deck, key, zone, assignedTo = "") {
    const entry = deck.entries.find(e => e.key === key);
    if (!entry) throw Error("That entry is no longer in this deck.");
    if (entry.zone === zone && (zone !== "signature" || entry.assignedTo === assignedTo)) return deck;
    const card = deck.cards[entry.printingId];
    const full=printingChoices(entry),rest=resizedChoices(entry,entry.quantity-1);
    const taken=Object.fromEntries(choiceKinds.map(kind=>[kind,full[kind]-rest[kind]]));
    return add(setQuantity(deck, key, entry.quantity - 1), card, { finish: entry.finish, zone, assignedTo, printingChoices:taken, ...(entry.identityChoices?{identityChoices:{version:1,...Object.fromEntries(identityKinds.map(k=>[k,identityChoices(entry)[k]-resizedIdentity(entry,entry.quantity-1)[k]]))}}:{}) });
  }
  function replaceRecords(deck, cards) {
    const records = { ...deck.cards };
    for (const card of cards) if (records[card.id]) records[card.id] = card;
    return changed(deck, { cards: records });
  }
  function select(deck, card, finish = card.finish) {
    if (!uuid.test(card?.id || "")) throw Error("This selection has no valid printing identity.");
    if (deck.selection?.printingId === card.id && deck.selection.finish === finish && deck.cards[card.id] === card) return deck;
    const used = new Set([...deck.entries.map(e => e.printingId), card.id]);
    return changed(deck, { selection: { printingId: card.id, finish }, cards: Object.fromEntries(Object.entries({ ...deck.cards, [card.id]: card }).filter(([id]) => used.has(id))) });
  }
  // All changes refer to ORIGINAL entry keys. Group once, so collisions cannot cascade.
  function replacePrintings(deck, changes) {
    if(!Array.isArray(changes)||changes.length>deck.entries.length)throw Error("Invalid printing replacement plan.");
    if(!changes.length)return deck;
    const byKey=new Map(), owners=new Map(), additions={};
    for(const change of changes){
      const original=deck.entries.find(entry=>entry.key===change.key),card=change.card;
      if(!original||byKey.has(change.key))throw Error("That printing entry is missing or repeated in the plan.");
      if(!uuid.test(card?.id||"")||!data.sameOracleCard(deck.cards[original.printingId],card))throw Error("Choose a printing of the same Oracle card with equivalent gameplay data.");
      if(!card.availableFinishes?.includes(change.finish))throw Error("That finish is not listed for this printing.");
      choicesFor(change.choice||"manual",original.quantity);
      byKey.set(change.key,change);additions[card.id]=card;
      if(original.zone==="commander"){
        if(owners.has(original.printingId)&&owners.get(original.printingId)!==card.id)throw Error("Ambiguous commander printing assignment.");
        owners.set(original.printingId,card.id);
      }
    }
    const grouped=new Map();let selection=deck.selection;
    for(const entry of deck.entries){
      const change=byKey.get(entry.key);
      let next=change?{...entry,printingId:change.card.id,finish:change.finish,printingChoices:choicesFor(change.choice||"manual",entry.quantity), ...(entry.identityChoices?{identityChoices:{version:1,unspecified:0,finishOnly:0,printingOnly:0,exact:entry.quantity}}:{})}:entry;
      if(next.zone==="signature"&&owners.has(next.assignedTo))next={...next,assignedTo:owners.get(next.assignedTo)};
      const newKey=entryKey(next.printingId,next.finish,next.zone,next.assignedTo);next={...next,key:newKey};
      if(change&&selection===deck.selection&&deck.selection?.printingId===entry.printingId&&deck.selection.finish===entry.finish)selection={printingId:change.card.id,finish:change.finish};
      const previous=grouped.get(newKey);
      if(previous)next={...next,...((previous.identityChoices||next.identityChoices)?{identityChoices:{version:1,...Object.fromEntries(identityKinds.map(k=>[k,identityChoices(previous)[k]+identityChoices(next)[k]]))}}:{}),quantity:previous.quantity+next.quantity,printingChoices:mergeChoices(printingChoices(previous),printingChoices(next))};
      if(next.quantity>10000)throw Error("One entry cannot exceed 10,000 copies.");
      grouped.set(newKey,next);
    }
    const entries=[...grouped.values()],used=new Set([...entries.map(entry=>entry.printingId),selection?.printingId].filter(Boolean));
    const cards=Object.fromEntries(Object.entries({...deck.cards,...additions}).filter(([id])=>used.has(id)));
    return changed(deck,{entries,cards,selection});
  }
  function replacePrinting(deck,key,card,finish) { return replacePrintings(deck,[{key,card,finish,choice:"manual"}]); }
  const count = (deck, zone) => deck.entries.filter(e => !zone || e.zone === zone).reduce((sum, e) => sum + e.quantity, 0);
  const api = Object.freeze({ createDeck, edit, add, setQuantity, moveOne, replaceRecords, replacePrinting, replacePrintings, printingChoices, identityChoices, select, count, entryKey, newId });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManaScoutDeckModel = api;
})(typeof window === "undefined" ? globalThis : window);
