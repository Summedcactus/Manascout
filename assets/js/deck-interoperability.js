/* Bounded player-facing deck formats. Parsing is local; resolution uses the shared client. */
((root) => {
  'use strict';
  const model = typeof module === 'object' && module.exports ? require('./deck-model.js') : root.ManaScoutDeckModel;
  const MAX_BYTES=250000, MAX_ROWS=1000, MAX_TOTAL=10000;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const finishes=['nonfoil','foil','etched'];
  const zones={commander:'commander',commanders:'commander',deck:'main',mainboard:'main','main deck':'main',sideboard:'sideboard',maybeboard:'maybeboard','signature spells':'signature'};
  function fail(message){throw Error(message);}
  function bounded(raw){if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_BYTES)fail('Use a UTF-8 decklist under 250 KB.');if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ufffd]/.test(raw))fail('The file contains binary/control data or invalid UTF-8.');return raw.replace(/^\ufeff/,'');}
  const normal=s=>String(s||'').normalize('NFC').trim().replace(/\s*\/\/\s*/g,' // ').replace(/[’]/g,"'").toLocaleLowerCase('en');
  const row=(line,raw,zone)=>({line,raw,zone,quantity:0,name:'',set:'',number:'',finish:'',language:'',id:'',oracleId:'',status:'INVALID LINE',message:'Expected quantity and card name.'});
  function finishValue(value){const f=String(value||'').trim().toLowerCase();if(f&&!finishes.includes(f))fail('Finish must be nonfoil, foil or etched.');return f;}
  function validateRow(r){
    if(r.zone==='signature')fail('Signature owner assignments require existing JSON recovery.');
    if(!Number.isSafeInteger(r.quantity)||r.quantity<1||r.quantity>10000||!r.name.trim()||r.name.length>200)fail('Use a name and quantity from 1 to 10,000.');
    if(r.set&&!/^[a-z0-9]{2,10}$/i.test(r.set))fail('Invalid set code.');
    if(r.number&&!/^[\p{L}\p{N}★*†._+-]{1,30}$/u.test(r.number))fail('Invalid collector number.');
    if(Boolean(r.set)!==Boolean(r.number))fail('Supply both set and collector number.');
    if(r.id&&!UUID.test(r.id)||r.oracleId&&!UUID.test(r.oracleId))fail('Invalid printing or gameplay UUID.');
    if(r.language&&!/^[a-z]{2,8}$/.test(r.language))fail('Invalid language code.');
    if(r.language&&!r.set&&!r.id)fail('Language verification needs an exact set/number or printing UUID.');
    finishValue(r.finish);r.status='PENDING';r.message='Not resolved yet.';return r;
  }
  function limits(rows){if(rows.length>MAX_ROWS)fail('Use at most 1,000 card rows.');if(rows.reduce((n,r)=>n+r.quantity,0)>MAX_TOTAL)fail('Use at most 10,000 total copies.');return rows;}
  function parseText(raw){
    const lines=bounded(raw).split(/\r\n?|\n/);if(lines.length>MAX_ROWS+200)fail('Too many input lines.');
    const rows=[];let zone='main';
    lines.forEach((input,i)=>{
      let s=input.trim();if(!s||/^(#|\/\/|;)/.test(s))return;
      const heading=s.replace(/:$/,'').toLowerCase();if(zones[heading]){zone=zones[heading];return;}
      const r=row(i+1,input,zone);rows.push(r);
      try{
        // Common explicit commander markers. Never infer from legendary type.
        if(/\s+(?:\[commander\]|!commander)$/i.test(s)){r.zone='commander';s=s.replace(/\s+(?:\[commander\]|!commander)$/i,'');}
        if(/^SB:\s*/i.test(s)){r.zone='sideboard';s=s.replace(/^SB:\s*/i,'');}
        const q=s.match(/^(\d+)\s*x?\s+(.+)$/i)||s.match(/^(\d+)x\s*(.+)$/i);if(!q)fail('Expected quantity and card name.');
        r.quantity=Number(q[1]);s=q[2].trim();
        const lang=s.match(/\s+\[lang:([a-z]{2,8})\]$/i);if(lang){r.language=lang[1].toLowerCase();s=s.slice(0,lang.index).trim();}
        const f=s.match(/\s+(?:\[(nonfoil|foil|etched)\]|\*(F|E)\*|\|\s*(\S+))$/i);
        if(f){r.finish=finishValue(f[1]||({f:'foil',e:'etched'}[f[2]?.toLowerCase()])||f[3]);s=s.slice(0,f.index).trim();}
        if(/\s+\[(?:foil|etched|nonfoil)\]\s*$/i.test(s)||/\s+\|/.test(s)||/\s+\*(?:[^*]+)\*$/.test(s))fail('Unsupported finish annotation.');
        const exact=s.match(/\s+(?:\(([a-z0-9]{2,10})\)|\[([a-z0-9]{2,10})\])\s+([^\s]+)$/i);
        if(exact){r.set=(exact[1]||exact[2]).toLowerCase();r.number=exact[3];s=s.slice(0,exact.index).trim();}
        else if(/\s+[([][a-z0-9]{2,10}[)\]]\s*$/i.test(s))fail('A set annotation also needs its collector number.');
        r.name=s;validateRow(r);
      }catch(e){r.status='INVALID LINE';r.message=e.message;}
    });
    return {kind:'text',mapping:[],rows:limits(rows)};
  }
  const aliases={quantity:['quantity','qty','count'],name:['name','card name','card'],set:['set','set code'],number:['collector number','collector_number','number','cn'],finish:['finish'],language:['language','lang'],id:['printing uuid','printing_uuid','printing id','scryfall id'],oracleId:['oracle/gameplay uuid','oracle uuid','oracle_id'],commander:['commander','commander flag'],zone:['section','zone'],status:['status','verification state']};
  function csvRows(raw){
    raw=bounded(raw);const rows=[];let values=[],value='',quoted=false,closed=false;
    const field=()=>{values.push(value);value='';closed=false;};
    const record=()=>{field();if(values.some(x=>x.trim()))rows.push(values);values=[];if(rows.length>MAX_ROWS+1)fail('Use at most 1,000 CSV card rows.');};
    for(let i=0;i<raw.length;i++){
      const c=raw[i];if(quoted){if(c==='"'){if(raw[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
      if(c==='"'){if(value||closed)fail('Malformed CSV quoting.');quoted=true;}
      else if(c===',')field();else if(c==='\r'||c==='\n'){if(c==='\r'&&raw[i+1]==='\n')i++;record();}
      else {if(closed)fail('Unexpected text after a quoted CSV field.');value+=c;}
    }
    if(quoted)fail('Unclosed quoted CSV field.');if(value||values.length||closed)record();return rows;
  }
  function parseCSV(raw){
    const records=csvRows(raw);if(!records.length)fail('CSV needs a header row.');
    const mapping=records.shift().map(h=>{const label=h.trim().toLowerCase();const found=Object.keys(aliases).find(k=>aliases[k].includes(label));if(!found)fail(`Unknown CSV column: ${h.slice(0,80)}. Remove it or use a documented header.`);return {header:h,field:found};});
    if(new Set(mapping.map(x=>x.field)).size!==mapping.length)fail('Duplicate CSV column mapping.');
    if(!mapping.some(x=>x.field==='name')||!mapping.some(x=>x.field==='quantity'))fail('CSV needs Quantity and Name columns.');
    const rows=records.map((values,i)=>{
      const r=row(i+2,values.join(' | '),'main');
      try{
        if(values.length!==mapping.length)fail('CSV column count differs from its header.');
        const fields=Object.fromEntries(mapping.map((x,j)=>[x.field,values[j].trim()]));
        // Undo only our exported spreadsheet-text prefix, never execute cell contents.
        for(const k of Object.keys(fields))if(/^'[\s]*[=+\-@\t\r\n]/.test(fields[k]||''))fields[k]=fields[k].slice(1);
        Object.assign(r,{quantity:/^\d+$/.test(fields.quantity)?Number(fields.quantity):0,name:fields.name,set:(fields.set||'').toLowerCase(),number:fields.number||'',finish:finishValue(fields.finish),language:(fields.language||'').toLowerCase(),id:(fields.id||'').toLowerCase(),oracleId:(fields.oracleId||'').toLowerCase()});
        if(fields.zone){r.zone=zones[fields.zone.toLowerCase()]||(['main','signature'].includes(fields.zone.toLowerCase())?fields.zone.toLowerCase():'');if(!r.zone)fail('Unsupported section.');if(r.zone==='signature')fail('Signature assignments need existing JSON recovery.');}
        if(fields.commander&&!/^(true|false|1|0|yes|no)$/i.test(fields.commander))fail('Commander must be true/false, yes/no or 1/0.');
        if(/^(true|yes|1)$/i.test(fields.commander||''))r.zone='commander';
        validateRow(r);
      }catch(e){r.status='INVALID LINE';r.message=e.message;}
      return r;
    });
    return {kind:'csv',mapping,rows:limits(rows)};
  }
  async function resolve(parsed,{client,signal,format='commander',onProgress=()=>{}}){
    const rows=[];const cache=new Map();
    for(const input of parsed.rows){
      if(signal?.aborted)throw Object.assign(Error('Import cancelled.'),{name:'AbortError'});
      const r={...input};rows.push(r);if(r.status==='INVALID LINE')continue;
      try{
        const token=JSON.stringify([r.name,r.set,r.number,r.language,r.id,r.oracleId,r.finish]);let result=cache.get(token);
        if(!result){result=await client.resolveDeckRow(r,{signal,format});cache.set(token,result);}
        Object.assign(r,result);
        if(r.card){r.status=r.set||r.id?'VERIFIED EXACT PRINTING':'CARD MATCHED — PRINTING UNSPECIFIED';r.message=(r.set||r.id?'Exact requested record checked.':'Representative catalogue record only; no printing was supplied.')+(r.finish?' Requested finish checked.':' Finish unspecified; workspace display is illustrative.');}
      }catch(e){if(e.name==='AbortError')throw e;r.status=e.code==='finish'?'FINISH UNAVAILABLE':e.code==='ambiguous'?'AMBIGUOUS':'UNRESOLVED';r.message=e.message;}
      onProgress(rows.length,parsed.rows.length);
    }
    return {...parsed,rows};
  }
  function build(preview,{name='Imported deck',format='commander'}={}){
    if(!preview.rows.length||preview.rows.some(r=>!r.card))fail('Resolve or remove every invalid, ambiguous or unresolved line before importing. Existing deck unchanged.');
    let deck=model.createDeck({name,format});
    for(const r of preview.rows){
      const identityChoice=(r.set||r.id)?(r.finish?'exact':'printingOnly'):(r.finish?'finishOnly':'unspecified');
      deck=model.add(deck,r.card,{quantity:r.quantity,zone:r.zone,finish:r.finish||r.card.finish,printingChoice:r.set||r.id?'manual':'automatic',identityChoice});
    }
    return deck;
  }
  function exportRows(deck){
    const rows=[];
    for(const e of deck.entries){const c=deck.cards[e.printingId];const kinds=model.identityChoices(e);
      for(const [kind,quantity]of Object.entries(kinds))if(quantity){const pinned=['exact','printingOnly'].includes(kind),finish=['exact','finishOnly'].includes(kind);const hasEdition=pinned&&/^[a-z0-9]{2,10}$/i.test(c.setCode)&&/^[\p{L}\p{N}★*†._+-]{1,30}$/u.test(c.collectorNumber);rows.push({quantity,name:c.name,set:hasEdition?c.setCode:'',number:hasEdition?c.collectorNumber:'',finish:finish?e.finish:'',language:pinned&&/^[a-z]{2,8}$/i.test(c.language)?c.language:'',id:pinned?c.id:'',oracleId:UUID.test(c.oracleId)?c.oracleId:'',zone:e.zone,status:pinned?'Recorded exact identity; current verification requires recheck':'Printing unspecified; workspace record is representative'});}
    }return rows;
  }
  function plain(deck,{detailed=false}={}){
    const rows=exportRows(deck),out=[];
    for(const zone of ['commander','signature','main','sideboard','maybeboard']){const list=rows.filter(r=>r.zone===zone);if(!list.length)continue;out.push({commander:'Commander',signature:'Signature spells',main:'Deck',sideboard:'Sideboard',maybeboard:'Maybeboard'}[zone]);for(const r of list)out.push(`${r.quantity} ${r.name}${r.set?` (${r.set}) ${r.number}`:''}${detailed&&r.finish?` [${r.finish}]`:''}${r.language&&r.language.toLowerCase()!=='en'?` [lang:${r.language.toLowerCase()}]`:''}`);out.push('');}
    return out.join('\n').trim()+'\n';
  }
  const csvCell=value=>'"'+(/^[\s]*[=+\-@\t\r\n]/.test(String(value))?"'":'')+String(value??'').replaceAll('"','""')+'"';
  function csv(deck){const headers=['Quantity','Card Name','Set','Collector Number','Finish','Language','Printing UUID','Oracle/gameplay UUID','Commander','Section','Status'];return '\ufeff'+[headers,...exportRows(deck).map(r=>[r.quantity,r.name,r.set,r.number,r.finish,r.language,r.id,r.oracleId,r.zone==='commander'?'true':'false',r.zone,r.status])].map(r=>r.map(csvCell).join(',')).join('\r\n');}
  const api=Object.freeze({MAX_BYTES,MAX_ROWS,MAX_TOTAL,parseText,parseCSV,csvRows,resolve,build,exportRows,plain,csv,normal});
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ManaScoutDeckInteroperability=api;
})(typeof window==='undefined'?globalThis:window);
