/* Complete production-module journeys with synthetic HTTP responses and a DOM double. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('../assets/js/deck-client.js');
const persistence=require('../assets/js/deck-store.js');
const {mount}=require('./helpers/studio-dom.cjs');
const {MemoryStorage}=require('./helpers/memory-storage.cjs');
const {raw}=require('./helpers/cards.cjs');
const drain=()=>new Promise(r=>setTimeout(r,40));
async function until(predicate) { for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.ok(predicate(),'The expected asynchronous state did not settle.'); }
const commander=raw(1,{name:'Fixture Commander',type_line:'Legendary Creature — Fixture',cmc:3,color_identity:['G']}),forest=raw(2,{name:'Fixture Forest',type_line:'Basic Land — Forest',color_identity:['G']});
function api(){
 const calls=[];const records=[commander,forest];
 const client=createClient({interval:0,fetchImpl:async(url,options)=>{
  calls.push({url,options});const u=new URL(url);let value,status=200;
  if(u.pathname==='/cards/collection') { const ids=JSON.parse(options.body).identifiers.map(c=>c.id);value={data:records.filter(c=>ids.includes(c.id))}; }
  else if(u.pathname==='/cards/search') {
   const q=u.searchParams.get('q');const eligible=q.includes('is:commander');const matches=eligible?records.filter(c=>q.includes(c.oracle_id)&&c.id===commander.id):records.filter(c=>c.name.toLowerCase().includes(q.toLowerCase()));
   if(!matches.length)status=404;value={data:matches,has_more:false,total_cards:matches.length};
  }else if(u.pathname.startsWith('/cards/'))value=records.find(c=>u.pathname==='/cards/'+c.id);
  if(!value)status=404;return {ok:status===200,status,json:async()=>value};
 }});return {client,calls};
}
async function find(s,name){s.el('studio-search').value=name;await s.el('studio-search-form').emit('submit');await until(()=>!!s.el('search-results').querySelector('[data-action="quick-add"]'));}
test('Commander journey: handoff, verified commander, Quick Add, 100 cards, views, save and current-data restoration',async t=>{
 const storage=new MemoryStorage(),first=api(),s=mount({storage,client:first.client,search:`?printing=${commander.id}&card=Fixture+Commander&finish=foil`});t.after(s.cleanup);await until(()=>s.el('preview-commander').textContent==='Use one as commander');
 assert.equal(s.el('preview-finish').textContent,'Foil');await s.el('preview-commander').emit('click');assert.equal(s.el('stat-commanders').textContent,'1');await s.el('close-preview').emit('click');
 await find(s,'Fixture Forest');await s.el('search-results').querySelector('[data-action="quick-add"]').emit('click');await s.el('search-results').querySelector('[data-action="inspect-search"]').emit('click');
 s.el('preview-quantity').value='98';await s.el('preview-add').emit('click');assert.equal(s.el('stat-count').textContent,'100 / 100');assert.equal(s.el('stat-lands').textContent,'99');assert.equal(s.el('stat-average').textContent,'3.00');assert.equal(s.el('deck-validity').textContent,'Construction checks passed');
 await s.el('view-list').emit('click');s.el('deck-name').value='Journey fixture';await s.el('deck-name').emit('input');await s.el('save-deck').emit('click');
 const saved=persistence.createStore({storage}).loadActive().deck;assert.equal(saved.entries.find(e=>e.zone==='commander').finish,'foil');assert.equal(saved.selection.printingId,forest.id);
 const second=api(),reopened=mount({storage,client:second.client,narrow:true});t.after(reopened.cleanup);assert.notEqual(reopened.el('deck-validity').textContent,'Construction checks passed');await until(()=>reopened.el('deck-validity').textContent==='Construction checks passed');
 assert.equal(reopened.el('deck-name').value,'Journey fixture');assert.equal(reopened.el('deck-entries').querySelector('.ds-card-grid').dataset.view,'list');assert.equal(reopened.el('stat-count').textContent,'100 / 100');assert.equal(reopened.el('deck-validity').textContent,'Construction checks passed');
 assert.ok(second.calls.some(c=>new URL(c.url).pathname==='/cards/collection'));assert.ok(second.calls.some(c=>c.url.includes('is%3Acommander')));
 const inspect=reopened.el('deck-entries').querySelector('[data-action="inspect-entry"]');await inspect.emit('click');assert.equal(reopened.el('preview-id').textContent,commander.id);assert.equal(reopened.el('preview-finish').textContent,'Foil');await reopened.el('close-preview').emit('click');assert.equal(reopened.document.activeElement,inspect);
});
test('Pauper journey: search, 60 main plus 15 side, overfull warning, correction and exact restore',async t=>{
 const storage=new MemoryStorage(),first=api(),s=mount({storage,client:first.client,narrow:true});t.after(s.cleanup);s.el('deck-format').value='pauper';await s.el('deck-format').emit('change');
 await find(s,'Fixture Forest');await s.el('search-results').querySelector('[data-action="quick-add"]').emit('click');await s.el('search-results').querySelector('[data-action="inspect-search"]').emit('click');
 s.el('preview-quantity').value='59';await s.el('preview-add').emit('click');s.el('preview-zone').value='sideboard';await s.el('preview-zone').emit('change');s.el('preview-quantity').value='15';await s.el('preview-add').emit('click');
 assert.equal(s.el('stat-count').textContent,'60 / 60+');assert.equal(s.el('stat-sideboard').textContent,'15 / 15');assert.equal(s.el('deck-validity').textContent,'Construction checks passed');
 s.el('preview-quantity').value='1';await s.el('preview-add').emit('click');assert.equal(s.el('deck-validity').textContent,'Needs correction');await s.el('preview-remove').emit('click');assert.equal(s.el('deck-validity').textContent,'Construction checks passed');
 await s.el('save-deck').emit('click');const reopened=mount({storage,client:api().client});t.after(reopened.cleanup);await until(()=>reopened.el('deck-validity').textContent==='Construction checks passed');assert.equal(reopened.el('deck-format').value,'pauper');assert.equal(reopened.el('stat-count').textContent,'60 / 60+');assert.equal(reopened.el('stat-sideboard').textContent,'15 / 15');assert.equal(reopened.el('deck-validity').textContent,'Construction checks passed');
});
