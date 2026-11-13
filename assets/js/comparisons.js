/* Exact-printing comparisons. No deck storage access; snapshots never confer trust. */
((root) => {
  'use strict';
  const KEY = 'manascout.comparisons.v1';
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  const FINISHES = ['nonfoil', 'foil', 'etched'];
  const key = x => `${x.id}:${x.finish}`;
  const text = (x, max = 200) => typeof x === 'string' ? x.slice(0,max) : '';
  const fail = message => { throw new Error(message); };
  function snapshot(c) {
    const out = {};
    for (const k of ['id','oracle_id','name','set','set_name','collector_number','lang','artist','frame','released_at','illustration_id','scryfall_uri','border_color']) out[k] = text(c[k]);
    for (const k of ['finishes','frame_effects','promo_types']) out[k] = Array.isArray(c[k]) ? c[k].slice(0,30).map(x=>text(x)) : [];
    for (const k of ['full_art','textless','promo']) out[k] = c[k] === true;
    out.image_uris = {normal:text(c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,2000)};
    out.prices = {};
    for(const k of ['eur','eur_foil','usd','usd_foil','usd_etched']) out.prices[k] = /^\d+(\.\d+)?$/.test(c.prices?.[k]) ? c.prices[k] : null;
    return out;
  }
  function validate(source) {
    if (!source || source.format !== 'manascout-comparison' || source.version !== 1) fail('Unsupported comparison format or version.');
    if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 100) fail('A comparison needs a name of 1–100 characters.');
    if (!Array.isArray(source.items) || source.items.length < 1 || source.items.length > 4) fail('A comparison must contain 1–4 exact versions.');
    const seen = new Set(); let oracle;
    const items = source.items.map(x => {
      if (!x || !UUID.test(x.id) || !(UUID.test(x.oracleId) || x.oracleId === '' && x.unresolved === true) || !FINISHES.includes(x.finish)) fail('Invalid exact printing, gameplay identity or finish.');
      if (seen.has(key(x))) fail('Duplicate printing and finish.');
      seen.add(key(x));
      if (oracle && x.oracleId && oracle !== x.oracleId) fail('Compare versions of the same gameplay card.');
      oracle = x.oracleId || oracle;
      const card = snapshot(x.card || {});
      // Imported metadata is display-only. Exact records are independently checked on open.
      return {id:x.id, oracleId:x.oracleId, ...(x.oracleId?{}:{unresolved:true}), finish:x.finish, card, status:'Cached snapshot; exact record not checked', live:false};
    });
    return {format:source.format, version:1, name:source.name.trim(), items};
  }
  function add(items, card, finish) {
    if (!UUID.test(card?.id) || !UUID.test(card?.oracle_id) || !FINISHES.includes(finish) || !card.finishes?.includes(finish) || !card.games?.includes('paper')) fail('A verified physical printing and available finish are required.');
    const x = {id:card.id,oracleId:card.oracle_id,finish,card:snapshot(card),live:true,status:'Catalogue loaded this session; source price timestamp unknown'};
    if(items.some(i=>key(i)===key(x))) fail('This exact printing and finish is already selected.');
    if(items.length && items[0].oracleId !== x.oracleId) fail('Choose versions of the same gameplay card, or clear this comparison first. Your selections are retained.');
    if(items.length >= 4) fail('Four versions are selected. Remove one before adding another.');
    return [...items,x];
  }
  function encode(name, items) { return JSON.stringify(validate({format:'manascout-comparison',version:1,name,items}),null,2); }
  function decode(raw) {
    if(typeof raw !== 'string' || raw.length > 150000) fail('Comparison file is too large.');
    try { return validate(JSON.parse(raw)); } catch(e) { if(e instanceof SyntaxError) fail('Malformed JSON comparison.'); throw e; }
  }
  function read(storage) {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if(parsed.version !== 1 || !Array.isArray(parsed.saved) || parsed.saved.length > 100) fail('Damaged saved comparison library. Export current work before repairing browser storage.');
    return parsed.saved.map(validate);
  }
  function write(storage, saved) {
    if(saved.length > 100) fail('The browser library limit is 100 comparisons. Export or delete an old comparison first.');
    storage.setItem(KEY,JSON.stringify({version:1,saved:saved.map(validate)}));
  }
  async function refresh(item, exact) {
    try {
      const card = await exact(item.id);
      if(card.id !== item.id || !UUID.test(card.oracle_id) || (item.oracleId && card.oracle_id !== item.oracleId) || !card.finishes?.includes(item.finish) || !card.games?.includes('paper')) fail('Exact identity or finish could not be confirmed');
      return {...item,oracleId:card.oracle_id,unresolved:false,card:snapshot(card),live:true,status:'Exact record refreshed this session; source price timestamp unknown'};
    } catch { return {...item,live:false,status:'Exact record unavailable or incompatible; cached snapshot only. No substitute selected.'}; }
  }
  const SHARE_MAX = 240;
  function parseShared(raw) {
    if(typeof raw !== 'string' || raw.length>SHARE_MAX || !raw.startsWith('v1:'))fail('Invalid or unsupported shared comparison. Use a link with 1–4 exact versions.');
    const entries=raw.slice(3).split(',');if(entries.length<1||entries.length>4)fail('Shared comparisons support 1–4 versions.');
    const seen=new Set();
    return entries.map(value=>{const parts=value.split('~');const [id,finish]=parts;if(parts.length!==2||!UUID.test(id)||!FINISHES.includes(finish))fail('Invalid shared printing UUID or finish.');const item={id,finish};if(seen.has(key(item)))fail('Duplicate shared printing and finish.');seen.add(key(item));return item;});
  }
  function shareState(items) {const raw='v1:'+items.map(x=>`${x.id}~${x.finish}`).join(',');parseShared(raw);return raw;}
  async function reconstructShared(raw,exact) {
    const requested=parseShared(raw),items=[];let oracle='';
    for(const x of requested){
      let item={...x,oracleId:'',unresolved:true,card:snapshot({}),live:false,status:'Exact record unavailable. Requested UUID and finish retained; no substitute selected.'};
      try {
        const card=await exact(x.id);
        if(card.id!==x.id||!UUID.test(card.oracle_id))throw Error('Invalid exact identity');
        if(oracle && oracle!==card.oracle_id)fail('mixed-gameplay-identities');
        oracle=card.oracle_id;
        item={...item,oracleId:card.oracle_id,unresolved:false,card:snapshot(card)};
        if(!card.games?.includes('paper')||!card.finishes?.includes(x.finish))item.status='Requested physical finish unavailable; no substitute selected.';
        else item={...item,live:true,status:'Exact shared record loaded this session; source price timestamp unknown'};
      } catch(err) {if(err.message==='mixed-gameplay-identities')fail('Shared versions refer to different gameplay cards. Comparison rejected; existing choices retained.');}
      items.push(item);
    }
    return items;
  }
  const link = x => `https://manascout.co.uk/?q=${encodeURIComponent(x.card.name || '')}&printing=${x.id}&finish=${x.finish}`;
  const cell = value => '"' + (/^[\s]*[=+\-@\t\r\n]/.test(String(value)) ? "'" : '') + String(value ?? '').replaceAll('"','""') + '"';
  function csv(items) {
    const rows = [['Name','Printing UUID','Gameplay UUID','Finish','Set','Collector number','Language','Artist','Frame','Released','EUR reference','USD reference','Status','Source','Exact inspect link','Qualification']];
    for(const x of items) { const c=x.card,p=c.prices||{}; rows.push([c.name,x.id,x.oracleId,x.finish,c.set,c.collector_number,c.lang,c.artist,c.frame,c.released_at,x.finish==='etched'?'':p[x.finish==='foil'?'eur_foil':'eur']||'',p[x.finish==='foil'?'usd_foil':x.finish==='etched'?'usd_etched':'usd']||'',x.status,source(c.scryfall_uri),link(x),'Scryfall reference; not a delivered shop quote; source price timestamp unknown']); }
    return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
  }
  function source(raw) { try {const u=new URL(raw);return u.protocol==='https:' && u.hostname==='scryfall.com'?u.href:'';}catch{return '';} }
  const api={KEY,key,snapshot,validate,add,encode,decode,read,write,refresh,csv,link,source,SHARE_MAX,parseShared,shareState,reconstructShared};
  if(typeof module==='object' && module.exports) {module.exports=api;return;}
  root.ManaScoutComparisons=Object.freeze(api);
  document.addEventListener('DOMContentLoaded',mount);
  function mount() {
    const anchor=document.getElementById('card-details'), bridge=root.ManaScout?.comparison;
    if(!anchor || !bridge) return;
    let items=[],saved=[],preview=null,busy=false,storageOkay=true,storedRevision=null;
    const host=document.createElement('section');host.className='ms-comparisons';host.setAttribute('aria-label','Exact printing comparisons');
    const homeResults=document.getElementById('card-details-section');
    if(homeResults)homeResults.after(host);else anchor.after(host);
    host.innerHTML=`<p role="status" aria-live="polite" class="cmp-status"></p><section class="cmp-current" id="ms-comparison-current" hidden><h2 tabindex="-1">Compare exact versions</h2><p class="cmp-summary"></p><div class="cmp-grid"></div><button type="button" data-cmp="clear">Clear comparison</button><details><summary>Save and export</summary><label>Comparison name <input class="cmp-name" maxlength="100" value="My comparison"></label><button type="button" data-cmp="save">Save in this browser</button><button type="button" data-cmp="json">Export JSON</button><button type="button" data-cmp="csv">Export CSV</button><button type="button" data-cmp="links">Copy exact links</button><button type="button" data-cmp="share">Copy comparison link</button><textarea class="cmp-links" aria-label="Exact links to copy" hidden readonly></textarea></details></section><details class="cmp-library"><summary>Saved comparisons and import</summary><p>Saved in this browser only. Export a backup to keep or move your work. Decks are separate.</p><div class="cmp-saved"></div><label>Import comparison JSON <input type="file" accept=".json,application/json" class="cmp-file"></label><div class="cmp-preview" hidden></div></details>`;
    const $=s=>host.querySelector(s), say=m=>{$('.cmp-status').textContent=m;};
    try{saved=read(root.localStorage);storedRevision=root.localStorage.getItem(KEY);}catch{storageOkay=false;say('Saved library unavailable or damaged. Current comparisons and exports still work; existing storage is left untouched.');}
    const esc=s=>String(s??'Unknown').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function persist(next) {
      if(!storageOkay) {saved=next;say('Library kept in memory only. Export JSON: browser storage is unavailable or damaged.');return;}
      try{if(root.localStorage.getItem(KEY)!==storedRevision)fail('Library changed in another tab.');write(root.localStorage,next);storedRevision=root.localStorage.getItem(KEY);saved=next;say('Saved in this browser. Export a backup for portability.');}catch{saved=next;say('Storage write failed or library changed in another tab. Existing disk data is retained. Work remains in memory; export JSON before reloading.');}
    }
    function renderLibrary() {
      $('.cmp-saved').innerHTML=saved.map((s,i)=>`<div><label>Saved comparison name <input data-saved-name="${i}" maxlength="100" value="${esc(s.name)}"></label><button data-open="${i}">Open</button><button data-rename="${i}">Rename</button><button data-delete="${i}">Delete</button></div>`).join('') || '<p>No saved comparisons.</p>';
    }
    function draw() {
      $('.cmp-current').hidden=!items.length;
      const art=items.map(x=>x.card.illustration_id).filter(Boolean);
      $('.cmp-summary').textContent=`${items.length}/4 versions. ${items.length<2?'Add another printing or choose another available finish on the selected printing. ':''}${art.length===items.length ? (new Set(art).size>1?'Supplied illustration IDs differ.':'Same supplied illustration identity.') : 'Artwork differences unknown where illustration identity is missing.'} Different catalogue IDs alone do not prove different artwork. Compare finish, language and frame below. Prices are Scryfall references, not delivered shop quotes. Shimmer elsewhere is illustrative; these images are static.`;
      $('.cmp-grid').innerHTML=items.map(x=>{
        const c=x.card,p=bridge.present(c,x.finish),src=source(c.scryfall_uri);
        let image='';try{const u=new URL(p.image);if(u.protocol==='https:'&&u.hostname==='cards.scryfall.io')image=u.href;}catch{}
        return `<article><h3>${esc(c.name||'Unavailable card')} · ${esc(x.finish)}</h3>${image?`<img src="${esc(image)}" alt="${esc(c.name)} catalogue scan" loading="lazy" width="244" height="340">`:''}<p class="cmp-image-fallback" ${image?'hidden':''}>Artwork unavailable; exact identity remains below.</p><dl>${[['Set',`${c.set_name||'Unknown'} (${c.set||'?'}) #${c.collector_number||'?'}`],['Language',p.language],['Artist',c.artist||'Unknown'],['Frame / treatment',`${c.frame||'Unknown'} · ${p.treatment}`],['Selected finish',x.finish],['Available finishes',c.finishes.join(', ')||'Unknown'],['Release',c.released_at||'Unknown'],['Catalogue UUID',x.id],['Illustration UUID',c.illustration_id||'Unknown']].map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p>${esc(x.status)}</p><p>${x.live?'Loaded reference':'Cached, unverified reference'}: ${p.priceHtml.replace('€','EUR €').replace('$','USD $')}${p.estimate!==null?` · GBP estimate £${Number(p.estimate).toFixed(2)}`:''}</p>${src?`<a href="${esc(src)}" target="_blank" rel="noopener noreferrer">Exact Scryfall source</a> · `:''}<a href="${esc(link(x))}">Inspect exact printing</a><p><button type="button" data-remove="${esc(key(x))}">Remove ${esc(c.set||x.id)} #${esc(c.collector_number||'?')} ${esc(c.lang||'?')} ${esc(x.finish)}</button></p></article>`;
      }).join('');
      host.querySelectorAll('.cmp-grid img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;img.nextElementSibling.hidden=false;}));
      sync();
    }
    function sync() {
      document.querySelectorAll('[data-compare-id]').forEach(b=>{const c=bridge.card(b.dataset.compareId);if(!c)return;const f=bridge.finish(c),selected=items.some(x=>key(x)===`${c.id}:${f}`);const label=`${selected?'Comparing':'Compare'} ${f}`;if(b.textContent!==label)b.textContent=label;if(b.nextElementSibling?.hasAttribute('data-compare-jump'))b.nextElementSibling.hidden=!selected;b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-label',`${selected?'Already comparing':'Compare'} ${c.name}, ${c.set_name}, number ${c.collector_number}, ${c.lang}, ${f}`);});
    }
    new MutationObserver(sync).observe(anchor.parentElement,{childList:true,subtree:true});
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-compare-id]');if(!b)return;
      if(busy){say('Please wait for exact record checks to finish.');return;}
      try{const c=bridge.card(b.dataset.compareId);items=add(items,c,bridge.finish(c));draw();say(`Added ${c.name}, ${c.set}, ${c.lang}, ${bridge.finish(c)}. ${items.length} selected.`);}catch(err){say(err.message);}
    });
    function download(raw,ext,type) {const u=URL.createObjectURL(new Blob([raw],{type}));const a=document.createElement('a');a.href=u;a.download='manascout-comparison.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
    async function open(s) {
      busy=true;say('Checking exact records…');items=validate(s).items;$('.cmp-name').value=s.name;draw();
      // At most four requests, sequentially using the shared exact-record client.
      for(let i=0;i<items.length;i++){items[i]=await refresh(items[i],bridge.exact);draw();}
      if(new Set(items.filter(x=>x.oracleId).map(x=>x.oracleId)).size>1){items=[];draw();say('Saved comparison has mixed gameplay identities after refresh. Rejected without edition substitution.');busy=false;return;}
      busy=false;say('Comparison opened. Unavailable records are retained as cached snapshots.');$('.cmp-current h2').focus();
    }
    host.addEventListener('click',async e=>{
      const b=e.target.closest('button');if(!b)return;
      if(busy){say('Please wait for exact record checks to finish.');return;}
      try {
        if(b.dataset.remove){const buttons=[...host.querySelectorAll('[data-remove]')],i=buttons.indexOf(b);items=items.filter(x=>key(x)!==b.dataset.remove);draw();(host.querySelectorAll('[data-remove]')[Math.min(i,items.length-1)]||$('.cmp-library summary')).focus();say('Version removed.');}
        if(b.dataset.cmp==='clear'){items=[];draw();$('.cmp-library summary').focus();say('Comparison cleared. Decks are unchanged.');}
        if(b.dataset.cmp==='save'){const s=decode(encode($('.cmp-name').value,items));persist([...saved,s]);renderLibrary();}
        if(b.dataset.cmp==='json')download(encode($('.cmp-name').value,items),'json','application/json');
        if(b.dataset.cmp==='csv')download(csv(items),'csv','text/csv;charset=utf-8');
        if(b.dataset.cmp==='links'||b.dataset.cmp==='share'){const t=$('.cmp-links');t.hidden=false;const shared=new URL('/',location.origin);shared.hash='compare='+shareState(items);t.value=b.dataset.cmp==='share'?shared.href:items.map(link).join('\n');t.focus();t.select();try{await navigator.clipboard.writeText(t.value);say(b.dataset.cmp==='share'?'Whole comparison link copied. Opening it does not save it automatically.':'Exact links copied.');}catch{say('Select and copy the exact links below.');}}
        if(b.dataset.open!==undefined)await open(saved[Number(b.dataset.open)]);
        if(b.dataset.rename!==undefined){const i=Number(b.dataset.rename),next=[...saved];next[i]=validate({...next[i],name:host.querySelector(`[data-saved-name="${i}"]`).value});persist(next);renderLibrary();}
        if(b.dataset.delete!==undefined){const next=saved.filter((_,i)=>i!==Number(b.dataset.delete));persist(next);renderLibrary();$('.cmp-library summary').focus();}
        if(b.dataset.cmp==='cancel'){preview=null;$('.cmp-preview').hidden=true;$('.cmp-file').value='';$('.cmp-file').focus();say('Import cancelled. Existing work retained.');}
        if(b.dataset.cmp==='import' && preview){persist([...saved,preview]);renderLibrary();const s=preview;preview=null;$('.cmp-preview').hidden=true;$('.cmp-file').value='';await open(s);}
      } catch(err){say(err.message);}
    });
    $('.cmp-file').addEventListener('change',async e=>{
      preview=null;$('.cmp-preview').hidden=true;
      try{const file=e.target.files[0];if(!file)return;if(file.size>150000)fail('Comparison file is too large.');preview=decode(await file.text());const box=$('.cmp-preview');box.hidden=false;box.innerHTML=`<h3>Import preview: ${esc(preview.name)}</h3><p>${preview.items.map(x=>`${esc(x.card.name||x.id)} · ${esc(x.card.set)} #${esc(x.card.collector_number)} · ${esc(x.card.lang)} · ${esc(x.finish)}`).join('<br>')}</p><p>${preview.items.length} exact versions. Imported snapshots are unverified until checked. Import adds a new saved entry; existing saved work is retained. The current working comparison will be replaced.</p><button data-cmp="import">Import and open</button><button data-cmp="cancel">Cancel</button>`;box.querySelector('button').focus();}catch(err){say(err.message);}
    });
    renderLibrary();
    async function fromSharedLink(){
      if(!location.hash.startsWith('#compare='))return;
      if(busy){say('Wait for the current exact lookup before opening another comparison link.');return;}
      busy=true;
      try{
        if(location.hash.length>SHARE_MAX+20)fail('Shared comparison URL state is too long.');
        const raw=decodeURIComponent(location.hash.slice('#compare='.length));
        say('Loading shared exact versions…');
        const result=await reconstructShared(raw,bridge.exact);
        items=result;$('.cmp-name').value='Shared comparison';draw();say('Shared comparison opened in memory only. Choose Save to keep it in this browser.');$('.cmp-current h2').focus();
      }catch(err){say(err.message);}
      finally{busy=false;}
    }
    window.addEventListener('hashchange',fromSharedLink);fromSharedLink();
  }
})(typeof window==='undefined'?globalThis:window);
