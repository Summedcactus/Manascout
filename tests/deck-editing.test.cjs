const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../assets/js/deck-model.js');
const data = require('../assets/js/deck-data.js');
const { createClient } = require('../assets/js/deck-client.js');
const { mount } = require('./helpers/studio-dom.cjs');
const { id, raw, card } = require('./helpers/cards.cjs');
const reply = (value,status=200) => ({ok:status===200,status,json:async()=>value});
const drain = () => new Promise(resolve=>setTimeout(resolve,15));
function fakeClient(cards=[card()]) {
  return { search:async()=>({cards,nextPage:'',total:cards.length}), autocomplete:async()=>cards.map(c=>c.name), printing:async()=>cards[0], isVerified:()=>true, proof:()=>null, commanderEligibility:async()=>false, refresh:async cs=>cs, clearProofs(){} };
}

test('add aggregates exact printing/finish/zone keys and stores one record',()=>{
  const c=card();let d=model.add(model.createDeck(),c); d=model.add(d,c); d=model.add(d,c,{finish:'foil'}); d=model.add(d,c,{zone:'sideboard'});
  assert.equal(model.count(d),4);assert.equal(d.entries.length,3);assert.equal(Object.keys(d.cards).length,1);assert.equal(d.cards[c.id],c);
  assert.equal(d.entries[0].quantity,2);assert.equal(d.entries[1].finish,'foil');
});
test('different printing IDs survive quantities, moves, view and format changes',()=>{
  let d=model.add(model.add(model.createDeck(),card()),card(2));
  d=model.setQuantity(d,d.entries[0].key,3);d=model.moveOne(d,d.entries[0].key,'sideboard');
  d=model.edit(d,{view:'list',format:'pauper',name:'A named deck'});
  assert.equal(model.count(d,'main'),3);assert.equal(model.count(d,'sideboard'),1);assert.equal(d.entries.length,3);assert.equal(d.name,'A named deck');
  assert.deepEqual(Object.keys(d.cards).sort(),[id(1),id(2)]);
});
test('invalid quantities and finishes reject without changing the input; removal prunes only unused records',()=>{
  const d=model.add(model.createDeck(),card());const original=JSON.stringify(d);
  for(const n of [-1,1.5,NaN,10001])assert.throws(()=>model.setQuantity(d,d.entries[0].key,n));
  assert.throws(()=>model.add(d,card(),{finish:'etched'}));assert.equal(JSON.stringify(d),original);
  const removed=model.setQuantity(d,d.entries[0].key,0);assert.equal(removed.entries.length,0);assert.deepEqual(removed.cards,{});
});
test('search/autocomplete cache, exact request and empty results use paced client',async()=>{
  const calls=[];const client=createClient({interval:0,fetchImpl:async url=>{calls.push(url);return reply(url.includes('autocomplete')?{data:['Fixture']}:{data:[raw()],has_more:false,total_cards:1});}});
  const a=await client.search('Fixture');const b=await client.search('Fixture');assert.equal(a,b);assert.equal(calls.length,1);assert.equal(client.isVerified(a.cards[0]),true);
  assert.deepEqual(await client.autocomplete('Fi'),['Fixture']);assert.deepEqual(await client.autocomplete('Fi'),['Fixture']);assert.equal(calls.length,2);
  const empty=createClient({interval:0,fetchImpl:async()=>reply(null,404)});assert.deepEqual((await empty.search('none')).cards,[]);
  await assert.rejects(client.search('x',{page:'https://evil.example/cards/search'}),/Invalid search page/);
});
test('queued cancellation avoids request and 429 does not retry',async()=>{
  let calls=0;const client=createClient({interval:2,fetchImpl:async()=>{calls++;return reply({data:[raw()]});}});
  const abort=new AbortController();abort.abort();await assert.rejects(client.search('cancel',{signal:abort.signal}),e=>e.name==='AbortError');assert.equal(calls,0);
  const busy=createClient({interval:0,fetchImpl:async()=>{calls++;return reply(null,429);}});await assert.rejects(busy.search('busy'),/busy/);assert.equal(calls,1);
});
test('malformed searches and network failure are actionable; identity mismatch never substitutes a printing',async()=>{
  const c=createClient({interval:0,fetchImpl:async()=>reply({wrong:'shape'})});await assert.rejects(c.search('fixture'),/incomplete/);
  const off=createClient({interval:0,fetchImpl:async()=>{throw Error('offline');}});await assert.rejects(off.search('fixture'),/unavailable/);
  const wrong=createClient({interval:0,fetchImpl:async()=>reply(raw(2))});await assert.rejects(wrong.printing({id:id(1)}),/requested printing/);
});
test('refresh uses collection batches of at most 75 and preserves exact requested IDs',async()=>{
  const calls=[];const c=createClient({interval:0,fetchImpl:async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return reply({data:body.identifiers.map(({id:cid})=>raw(parseInt(cid.slice(0,8),16)))});}});
  const updated=await c.refresh(Array.from({length:76},(_,i)=>card(i+1)));assert.equal(calls.length,2);assert.equal(calls[0].identifiers.length,75);assert.equal(updated.length,76);assert.equal(updated[75].id,id(76));
});
test('Quick Add preserves search DOM/position; artwork and list render real deck entries',async t=>{
  const s=mount({client:fakeClient([card(),card(2)]),narrow:true});t.after(s.cleanup);
  s.el('studio-search').value='Fixture';await s.el('studio-search-form').emit('submit');await drain();
  const quick=s.el('search-results').querySelector('[data-action="quick-add"]');const firstRow=quick.parentElement;s.el('studio-discover').scrollTop=123;
  await quick.emit('click');assert.equal(s.el('deck-count').textContent,'1 / 100 · Commander');assert.equal(s.el('card-preview').open,false);
  assert.equal(s.el('search-results').children[0],firstRow);assert.equal(s.el('studio-discover').scrollTop,123);
  await quick.emit('click');assert.match(s.el('deck-entries').textContent,/2/);
  await s.el('view-list').emit('click');assert.equal(s.el('deck-entries').querySelector('.ds-card-grid').dataset.view,'list');
  await s.el('deck-entries').querySelector('[data-action="decrease"]').emit('click');assert.equal(s.el('deck-count').textContent,'1 / 100 · Commander');
  await s.el('deck-entries').querySelector('[data-action="remove"]').emit('click');assert.equal(s.el('empty-deck').hidden,false);
});
test('preview Add/Remove and format/zone editing retain the selected printing',async t=>{
  const c=card();const s=mount({client:fakeClient([c]),search:`?printing=${c.id}`});t.after(s.cleanup);await drain();
  assert.equal(s.el('card-preview').open,true);assert.equal(s.el('preview-id').textContent,c.id);
  s.el('preview-quantity').value='2';await s.el('preview-add').emit('click');assert.equal(s.el('deck-count').textContent,'2 / 100 · Commander');
  await s.el('preview-remove').emit('click');assert.equal(s.el('deck-count').textContent,'1 / 100 · Commander');
  s.el('deck-format').value='pauper';await s.el('deck-format').emit('change');assert.equal(s.el('search-zone').querySelector('option[value="sideboard"]').disabled,false);
  await s.el('deck-entries').querySelector('[data-action="move-sideboard"]').emit('click');assert.match(s.el('deck-entries').textContent,/Sideboard/);assert.match(s.el('deck-entries').textContent,/TST #1/);
});
test('mobile navigation preserves deck name, scroll and selected card; desktop collapse still works',async t=>{
  const s=mount({client:fakeClient(),narrow:true});t.after(s.cleanup);
  s.el('deck-name').value='Temporary name';await s.el('deck-name').emit('input');s.el('studio-deck').scrollTop=99;
  const buttons=s.document.querySelectorAll('[data-panel]');await buttons[1].emit('click');s.el('studio-discover').scrollTop=70;await buttons[0].emit('click');
  assert.equal(s.el('deck-name').value,'Temporary name');assert.equal(s.el('studio-deck').scrollTop,99);
  await buttons[0].emit('keydown',{key:'End'});assert.equal(s.document.body.dataset.activePanel,'stats');
  s.resize(false);const collapse=s.document.querySelector('[data-collapse="discover-body"]');await collapse.emit('click');assert.equal(s.document.body.dataset.discoverCollapsed,'true');
  s.resize(true);assert.equal(s.el('discover-body').hidden,false);
});
test('failed search and invalid handoff leave manual editing usable',async t=>{
  const c=fakeClient();c.search=async()=>{throw Error('Search unavailable');};const s=mount({client:c,search:'?printing=invalid'});t.after(s.cleanup);
  assert.equal(s.el('selection-error').hidden,false);s.el('studio-search').value='something';await s.el('studio-search-form').emit('submit');await drain();
  assert.equal(s.el('search-status').textContent,'Search unavailable');assert.equal(s.el('deck-format').disabled,false);
});
test('late obsolete responses cannot replace a newer search or change Quick Add identity',async t=>{
  const pending=[];const c=fakeClient();c.search=(query,{signal})=>new Promise(resolve=>pending.push({query,signal,resolve}));
  const s=mount({client:c});t.after(s.cleanup);s.el('studio-search').value='First';await s.el('studio-search-form').emit('submit');s.el('studio-search').value='Second';await s.el('studio-search-form').emit('submit');
  assert.equal(pending[0].signal.aborted,true);pending[1].resolve({cards:[card(2)],nextPage:''});await drain();pending[0].resolve({cards:[card(1)],nextPage:''});await drain();
  const results=s.el('search-results');assert.match(results.textContent,/Fixture 2/);assert.doesNotMatch(results.textContent,/Fixture 1/);await results.querySelector('[data-action="quick-add"]').emit('click');assert.match(s.el('deck-entries').textContent,/TST #2/);
});
test('closing a preview after a quantity edit returns focus to the retained deck entry control',async t=>{
  const s=mount({client:fakeClient()});t.after(s.cleanup);s.el('studio-search').value='Fixture';await s.el('studio-search-form').emit('submit');await drain();await s.el('search-results').querySelector('[data-action="quick-add"]').emit('click');
  const original=s.el('deck-entries').querySelector('[data-action="inspect-entry"]');await original.emit('click');assert.equal(original.isConnected,true);await s.el('preview-add').emit('click');assert.equal(original.isConnected,true);
  await s.el('close-preview').emit('click');const replacement=s.el('deck-entries').querySelector('[data-action="inspect-entry"]');assert.equal(replacement,original);assert.ok(s.document.activeElement===original,'Focus must return to the retained deck entry control.');
});
