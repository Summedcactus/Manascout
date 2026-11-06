/* Production client/controllers against deterministic HTTP, not live catalogue claims. */
const {harness,response,until}=require('./commander-lifecycle.cjs'),{mount}=require('./studio-dom.cjs'),{id}=require('./cards.cjs'),{MemoryStorage}=require('./memory-storage.cjs');
const store=require('../../assets/js/deck-store.js'),model=require('../../assets/js/deck-model.js');
async function start(t,{index=0,legacy=false,basic=false,hook=async()=>null}={}){
 const accepted=new Map(),h=harness({identityIndex:basic?null:index,hook:async(c,context)=>{
  const custom=await hook(c,context);if(custom)return custom;
  const u=new URL(c.url);if(u.searchParams.get('unique')==='prints'){const oracle=c.q.match(/oracleid:([\da-f-]+)/)?.[1];return response({data:context.raws.filter(r=>r.oracle_id===oracle),has_more:false});}
 }});
 for(const raw of h.raws){raw.released_at='2025-01-01';raw.frame='2015';}
 const printing=h.client.printing;h.client.printing=async(...args)=>{const card=await printing(...args);accepted.set(card.id,card);return card;};
 const storage=new MemoryStorage();let s;
 if(basic){let deck=model.createDeck({format:'pauper'});for(const c of [h.f.forest,h.f.wastes])deck=model.add(deck,await h.client.printing({id:c.id}),{quantity:30});store.createStore({storage}).save(deck);s=mount({client:h.client,storage,narrow:true});t.after(s.cleanup);await until(()=>!s.el('refresh-card-data').disabled);}
 else {s=mount({client:h.client,storage,narrow:true,search:`?printing=${h.f.commander.id}&finish=foil`});t.after(s.cleanup);await until(()=>!s.el('preview-commander').disabled);await s.el('preview-commander').emit('click');await s.el('generate-deck').emit('click');if(s.el('stat-count').textContent!=='100 / 100')throw Error(s.el('generation-status').textContent);}
 await s.el('save-deck').emit('click');const original=store.createStore({storage}).loadActive().deck,alternates=new Map();let serial=30000;
 for(const entry of original.entries){if(alternates.has(entry.printingId))continue;const source=h.raws.find(r=>r.id===entry.printingId),alt={...source,id:id(serial++),set:'cur',set_name:'Synthetic Curated Edition',collector_number:String(serial),released_at:'2000-01-01',frame:'1997',border_color:'borderless',full_art:true,promo_types:['surgefoil'],finishes:['nonfoil','foil','etched'],image_uris:{normal:'https://cards.scryfall.io/curated-'+serial+'.jpg'}};h.raws.push(alt);alternates.set(source.id,alt);}
 if(legacy){const deck=store.createStore({storage}).loadActive().deck;for(const e of deck.entries)delete e.printingChoices;const backup=store.encodeBackup(deck);s.el('backup-file').files=[{size:backup.length,text:async()=>backup}];await s.el('backup-file').emit('change');await until(()=>!s.el('refresh-card-data').disabled);await s.el('save-deck').emit('click');}
 const saved=async()=>{await s.el('save-deck').emit('click');return store.createStore({storage}).loadActive().deck;};
 const preview=async preset=>{s.el('deck-appearance').open=true;s.el('appearance-preset').value=preset;await s.el('appearance-preset').emit('change');await s.el('appearance-preview').emit('click');};
 const apply=async()=>{await s.el('appearance-apply').emit('click');};
 return {s,h,accepted,storage,original,alternates,saved,preview,apply};
}
module.exports={start,until,response};
