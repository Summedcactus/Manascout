/* Native modal UI; no draft mutation before acceptance. */
((root)=>{
  'use strict';
  function create({client,getDeck,onImport,onJSON,onRestore,beforeOpen=()=>{}}){
    const io=root.ManaScoutDeckInteroperability,dialog=document.getElementById('deck-portable');if(!io||!dialog)return;
    const $=id=>document.getElementById(id);let trigger=null,job=null,preview=null,sourceRevision='',mode='import';
    const say=message=>{$('portable-status').textContent=message;};
    const stamp=()=>`${getDeck().id}:${getDeck().revision}`;
    function reset(){job?.abort();job=null;preview=null;$('portable-review').replaceChildren();$('portable-accept').disabled=true;$('portable-review-summary').textContent='';}
    function show(which,button){beforeOpen();reset();mode=which;trigger=button;$('portable-output').hidden=true;$('portable-output').value='';$('portable-title').textContent=which==='import'?'Import a decklist':'Export this deck';$('portable-import').hidden=which!=='import';$('portable-export').hidden=which!=='export';say('');dialog.showModal();$(which==='import'?'portable-text':'portable-copy').focus();}
    $('deck-import').addEventListener('click',e=>show('import',e.currentTarget));$('deck-export').addEventListener('click',e=>show('export',e.currentTarget));
    $('portable-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{reset();trigger?.focus({preventScroll:true});});dialog.addEventListener('cancel',()=>reset());
    $('portable-text').addEventListener('input',reset);$('portable-kind').addEventListener('change',reset);
    $('portable-file').addEventListener('change',async e=>{
      reset();const file=e.target.files?.[0];if(!file)return;
      try{if(file.size>io.MAX_BYTES)throw Error('Use a UTF-8 decklist under 250 KB.');const bytes=await file.arrayBuffer();const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);$('portable-text').value=raw;$('portable-kind').value=/\.csv$/i.test(file.name)?'csv':'text';say('File loaded locally. Choose Preview import.');}catch(err){$('portable-text').value='';say(err.message);}finally{e.target.value='';}
    });
    $('portable-preview').addEventListener('click',async()=>{
      reset();const controller=new AbortController();job=controller;sourceRevision=stamp();$('portable-preview').disabled=true;$('portable-busy-cancel').hidden=false;
      try{
        const parsed=$('portable-kind').value==='csv'?io.parseCSV($('portable-text').value):io.parseText($('portable-text').value);
        if(!parsed.rows.length)throw Error('No card rows found. Paste a decklist first.');
        say('Checking card identities…');const result=await io.resolve(parsed,{client,signal:controller.signal,format:getDeck().format,onProgress:(n,total)=>{if(job===controller)say(`Checking ${n}/${total} rows…`);}});
        if(job!==controller||controller.signal.aborted)return;preview=result;
        const counts=result.rows.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a;},{});
        $('portable-review-summary').textContent=`${result.rows.length} card rows · ${result.rows.reduce((n,r)=>n+r.quantity,0)} total copies. Commander section: ${result.rows.filter(r=>r.zone==='commander').map(r=>`${r.quantity} ${r.name}`).join(', ')||'not supplied; none inferred'}. ${Object.entries(counts).map(([k,v])=>`${v} ${k}`).join(' · ')}.${result.mapping.length?' CSV mapping: '+result.mapping.map(x=>`${x.header} → ${x.field}`).join('; '):''}`;
        const container=$('portable-review');
        for(const r of result.rows){const article=document.createElement('article');const title=document.createElement('h3');title.textContent=`Line ${r.line}: ${r.quantity||'?'} ${r.name||r.raw}`;const status=document.createElement('p');status.textContent=`${r.status} — ${r.message}`;const spec=document.createElement('p');spec.textContent=`Section: ${r.zone}. Requested: ${r.id||''} ${r.set||'printing unspecified'} ${r.number} ${r.language} ${r.finish||'finish unspecified'}`;article.append(title,status,spec);if(r.card){const record=document.createElement('p');record.textContent=`${r.set||r.id?'Matched exact record':'Representative display record'}: ${r.card.setCode} #${r.card.collectorNumber} · ${r.card.language} · ${r.card.id}. ${r.language?'Language supplied.':'Language not supplied; returned catalogue language shown.'}`;article.append(record);}container.append(article);}
        const valid=result.rows.every(r=>r.card);$('portable-accept').disabled=!valid;say(valid?'Preview ready. Import opens a new draft; your current deck is not overwritten. Format construction rules are checked separately.':'Import blocked. Correct or remove unresolved, ambiguous or invalid lines in the input and preview again. Your current deck is unchanged.');
      }catch(err){if(err.name!=='AbortError')say(err.message);}
      finally{if(job===controller||!job){job=null;$('portable-preview').disabled=false;$('portable-busy-cancel').hidden=true;}}
    });
    $('portable-busy-cancel').addEventListener('click',()=>{reset();say('Lookup cancelled. Current deck unchanged.');});
    $('portable-accept').addEventListener('click',async()=>{
      if(!preview)return;
      $('portable-accept').disabled=true;
      try{if(stamp()!==sourceRevision)throw Error('Workspace changed during preview. Preview again before importing.');const next=io.build(preview,{name:$('portable-name').value.trim().slice(0,80)||'Imported deck',format:getDeck().format});const accepted=preview;const ok=await onImport(next,sourceRevision,()=>dialog.open&&preview===accepted);if(ok){dialog.close();$('deck-heading').focus();}else say('Import cancelled. Your working deck is retained.');}catch(err){say(err.message);}finally{if(preview)$('portable-accept').disabled=false;}
    });
    function output(){return io.plain(getDeck(),{detailed:$('portable-detailed').checked});}
    function download(raw,ext,type){const u=URL.createObjectURL(new Blob([raw],{type}));const a=document.createElement('a');a.href=u;a.download='manascout-deck.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);say(`${ext.toUpperCase()} export prepared.`);}
    $('portable-copy').addEventListener('click',async()=>{const raw=output();$('portable-output').value=raw;$('portable-output').hidden=false;try{await navigator.clipboard.writeText(raw);say('Decklist copied.');}catch{$('portable-output').focus();$('portable-output').select();say('Clipboard unavailable. Select and copy the decklist below.');}});
    $('portable-txt').addEventListener('click',()=>download(output(),'txt','text/plain;charset=utf-8'));
    $('portable-csv').addEventListener('click',()=>download(io.csv(getDeck()),'csv','text/csv;charset=utf-8'));
    $('portable-json').addEventListener('click',onJSON);$('portable-restore').addEventListener('click',()=>{dialog.close();onRestore();});
  }
  root.ManaScoutDeckInteroperabilityControls=Object.freeze({create});
})(window);
