/* Bulk appearance planning. No live deck mutation and no parallel card/printing API. */
((root) => {
  "use strict";
  const dep=name=>typeof module==="object"&&module.exports?require(`./deck-${name}.js`):root[`ManaScoutDeck${name[0].toUpperCase()+name.slice(1)}`];
  const model=dep("model"),data=dep("data"),rules=dep("rules"),formats=dep("formats"),printings=dep("printings");
  const premium=[['serialized',1000],['textured',900],['confettifoil',800],['halofoil',700],['surgefoil',600],['galaxyfoil',500]];
  const retro=c=>["1993","1997"].includes(c.frame);
  const borderless=c=>c.borderColor==="borderless"||c.fullArt===true;
  const rank=(c,finish)=>{
    for(const [tag,value]of premium)if(c.promoTypes?.includes(tag)&&(tag==='serialized'||finish!=="nonfoil"))return value;
    if(c.frameEffects?.includes("showcase")&&finish==="foil")return 400;
    return finish==="etched"?300:finish==="foil"?200:c.frameEffects?.includes("showcase")?120:borderless(c)?100:0;
  };
  // Extensible metadata profiles: no card-name or inferred artwork-theme rules.
  const profiles=Object.freeze([
    {id:"current",label:"Keep Current",description:"No automatic changes. Leaves every printing and finish as it is."},
    {id:"original",label:"Original / Earliest",description:"Earliest eligible physical printing, after checking its complete catalogue."},
    {id:"retro",label:"Retro / Old Border",description:"Prefers source-identified classic/retro frames. Keeps matching current editions."},
    {id:"borderless",label:"Borderless / Full Art",description:"Prefers legitimate borderless or full-art editions; this does not imply foil."},
    {id:"foil",label:"Foil",description:"Prefers a traditional foil finish, keeping the current edition when it supports foil."},
    {id:"bling",label:"Maximum Bling",description:"Prefers recognised premium treatments. A visual preference, not a price/value ranking."}
  ]);
  const profile=id=>profiles.find(p=>p.id===id);
  function choice(card,preset,currentFinish) {
    let finishes=card.availableFinishes||[];
    if(preset==="foil")finishes=finishes.filter(f=>f==="foil");
    if(preset==="retro"&&!retro(card)||preset==="borderless"&&!borderless(card))return null;
    if(!finishes.length)return null;
    const finish=preset==="bling"?[...finishes].sort((a,b)=>rank(card,b)-rank(card,a)||["foil","etched","nonfoil"].indexOf(a)-["foil","etched","nonfoil"].indexOf(b))[0]:finishes.includes(currentFinish)?currentFinish:finishes.includes("nonfoil")?"nonfoil":finishes[0];
    if(preset==="bling"&&!rank(card,finish))return null;
    return {card,finish};
  }
  function compare(a,b,preset) {
    if(preset==="bling"){const n=rank(b.card,b.finish)-rank(a.card,a.finish);if(n)return n;}
    const date=String(a.card.released).localeCompare(String(b.card.released));if(date)return preset==="original"?date:-date;
    const english=(a.card.language==="EN"?0:1)-(b.card.language==="EN"?0:1);if(english)return english;
    return a.card.setCode.localeCompare(b.card.setCode,"en")||a.card.collectorNumber.localeCompare(b.card.collectorNumber,"en",{numeric:true})||a.card.id.localeCompare(b.card.id,"en")||a.finish.localeCompare(b.finish,"en");
  }
  function progress(deck) {
    const result={total:0,manual:0,bulk:0,automatic:0,unknown:0};
    for(const entry of deck.entries){result.total+=entry.quantity;for(const [key,n]of Object.entries(model.printingChoices(entry)))result[key]+=n;}
    return {...result,customised:result.manual+result.bulk};
  }
  function fingerprint(deck) { return JSON.stringify(deck.entries.map(e=>[e.key,e.quantity,model.printingChoices(e)])); }
  function gameplay(deck) {
    const groups=new Map();
    for(const entry of deck.entries){const card=deck.cards[entry.printingId],owner=entry.assignedTo?deck.cards[entry.assignedTo]?.oracleId||entry.assignedTo:"";const key=JSON.stringify([card.oracleId,entry.zone,owner]);groups.set(key,(groups.get(key)||0)+entry.quantity);}
    return JSON.stringify([...groups].sort(([a],[b])=>a.localeCompare(b)));
  }
  const interrupted=()=>Object.assign(Error("Appearance work cancelled. Your deck is unchanged."),{name:"AbortError"});
  async function bounded(work,signal,timeout=300000) {
    const controller=new AbortController();let timer;
    const cancel=()=>controller.abort();if(signal?.aborted)throw interrupted();signal?.addEventListener("abort",cancel,{once:true});
    let stop;const boundary=new Promise((_,reject)=>{stop=()=>reject(signal?.aborted?interrupted():Error("Appearance work exceeded its time limit. Your deck is unchanged; retry or curate individual cards."));controller.signal.addEventListener("abort",stop,{once:true});timer=setTimeout(()=>controller.abort(),timeout);});
    try{return await Promise.race([work(controller.signal),boundary]);}finally{clearTimeout(timer);signal?.removeEventListener("abort",cancel);controller.signal.removeEventListener("abort",stop);}
  }
  const check=signal=>{if(signal?.aborted)throw interrupted();};
  async function validateCandidate(source,candidate,client,signal) {
    check(signal);
    const used=[...new Set(candidate.entries.map(e=>e.printingId))],cards=used.map(id=>candidate.cards[id]);
    const accepted=await (client.ensure||client.refresh)(cards,{signal});check(signal);
    candidate=model.replaceRecords(candidate,accepted);
    for(const e of candidate.entries){const card=candidate.cards[e.printingId],old=Object.values(source.cards).find(c=>c.oracleId===card.oracleId);if(!old||!data.sameOracleCard(old,card))throw Error("Oracle facts changed during preparation. Recheck current card data before styling.");}
    for(const e of candidate.entries.filter(e=>e.zone==="commander"))if(formats.get(candidate.format).eligibility==="commander"&&!rules.background(candidate.cards[e.printingId])){await client.commanderEligibility(candidate.cards[e.printingId],{signal});check(signal);}
    const validation=rules.validate(candidate,client),problem=validation.issues.find(i=>!["warning","incomplete"].includes(i.severity));
    if(problem)throw Error(`Appearance validation: ${problem.message} No printing changes applied.`);
    if(gameplay(source)!==gameplay(candidate))throw Error("Appearance preparation changed the gameplay composition; no changes applied.");
    return {deck:candidate,validation};
  }
  async function preview(deck,preset,{client,signal,includeManual=false,includeUnknown=false,onProgress=()=>{},timeout=300000}={}) {
    if(!profile(preset))throw Error("Choose a supported appearance preset.");
    if(formats.get(deck.format)?.platform!=="paper")throw Error("Physical appearance presets require a Paper format. Individual printing selection remains available.");
    if(deck.entries.length>250)throw Error("Bulk appearance supports up to 250 distinct entries per preview. Use individual printing selection for larger workspaces.");
    return bounded(async signal=>{
      const changes=[],kept=[],bestByOracle=new Map(),total=deck.entries.length;
      let done=0;
      async function bestFor(entry) {
        const original=deck.cards[entry.printingId],cacheKey=original.oracleId;
        if(bestByOracle.has(cacheKey)){const cached=bestByOracle.get(cacheKey);return {...cached,choice:cached.choice?choice(cached.choice.card,preset,entry.finish):null};}
        let best=null,page="",undated=false;const visited=new Set();
        do {
          check(signal);if(visited.has(page)||visited.size>=512)throw Error("The printing catalogue repeated or exceeded the bounded page limit. Nothing was applied.");visited.add(page);
          onProgress(`Checking printings ${done+1} / ${total} entries · ${original.name} · catalogue page ${visited.size}`);
          const response=await client.printings(original.oracleId,{format:deck.format,order:preset==="original"?"oldest":"newest",page,signal});check(signal);
          if(!Array.isArray(response.cards))throw Error("The printing catalogue is incomplete; retry without changing the deck.");
          for(const card of response.cards){
            if(!data.sameOracleCard(original,card))throw Error("The catalogue has different or incomplete Oracle facts. Recheck current card data before styling.");
            const possible=choice(card,preset,"nonfoil");if(!possible)continue;
            const problems=rules.printingIssues(card,formats.get(deck.format),possible.finish,deck.format);
            if(problems.some(p=>p.severity==="pending"))throw Error("A catalogue record lacks required printing/legality data; no partial appearance was applied.");
            if(problems.length)continue;
            if(!/^\d{4}-\d{2}-\d{2}$/.test(card.released||"")){if(preset==="original")undated=true;continue;}
            if(!best||compare(possible,best,preset)<0)best=possible;
          }
          page=response.nextPage||"";
        } while(page);
        const result=undated?{choice:null,reason:"release dates incomplete"}:{choice:best,reason:best?"matched":"no eligible treatment"};bestByOracle.set(cacheKey,result);return {...result,choice:result.choice?choice(result.choice.card,preset,entry.finish):null};
      }
      for(const entry of deck.entries){
        check(signal);const before=deck.cards[entry.printingId],counts=model.printingChoices(entry);let selected=null,reason="";
        if(preset==="current")reason="Keep Current";
        else if(counts.manual&&!includeManual)reason="manual choice protected";
        else if(counts.unknown&&!includeUnknown)reason="older history protected";
        else if((preset==="retro"&&retro(before))||(preset==="borderless"&&borderless(before))||(preset==="foil"&&entry.finish==="foil"))reason="already matches";
        else if(preset==="foil"&&before.availableFinishes.includes("foil"))selected={card:before,finish:"foil"};
        else {const result=await bestFor(entry);selected=result.choice;reason=result.reason;}
        if(selected&&(selected.card.id!==entry.printingId||selected.finish!==entry.finish)){
          onProgress(`Checking exact printings ${done+1} / ${total} entries · ${before.name}`);
          const prepared=await printings.prepare(deck,entry.key,selected.card.id,selected.finish,{client,signal});check(signal);
          changes.push({key:entry.key,card:prepared.deck.cards[selected.card.id],finish:selected.finish,choice:"bulk"});
        }else kept.push({key:entry.key,copies:entry.quantity,zone:entry.zone,reason:selected?"already matches":reason});
        done++;onProgress(`Checked ${done} / ${total} entries`);
      }
      if(!changes.length)return {source:deck,sourceRevision:deck.revision,preset,deck,changes,kept,keyMap:{},changedCopies:0,unchangedCopies:model.count(deck),validation:rules.validate(deck,client)};
      onProgress("Validating complete appearance candidate…");
      const ready=await validateCandidate(deck,model.replacePrintings(deck,changes),client,signal);check(signal);
      const owners=new Map(changes.filter(c=>deck.entries.find(e=>e.key===c.key).zone==="commander").map(c=>[deck.entries.find(e=>e.key===c.key).printingId,c.card.id]));
      const keyMap=Object.fromEntries(deck.entries.map(e=>{const c=changes.find(c=>c.key===e.key);return[e.key,model.entryKey(c?.card.id||e.printingId,c?.finish||e.finish,e.zone,owners.get(e.assignedTo)||e.assignedTo)];}));
      const changedCopies=changes.reduce((n,c)=>n+deck.entries.find(e=>e.key===c.key).quantity,0);
      return {...ready,source:deck,sourceRevision:deck.revision,preset,changes,kept,keyMap,changedCopies,unchangedCopies:model.count(deck)-changedCopies};
    },signal,timeout);
  }
  async function apply(plan,current,{client,signal,timeout=300000}={}) {
    if(plan.source!==current||plan.sourceRevision!==current.revision)throw Error("The deck changed after this preview. Prepare a new preview.");
    if(!plan.changes.length)return {...plan,deck:current};
    return bounded(async signal=>{
      const ready=await validateCandidate(current,plan.deck,client,signal);check(signal);
      return {...plan,...ready};
    },signal,timeout);
  }
  async function undo(current,before,afterFingerprint,{client,signal,timeout=300000}={}) {
    if(current.id!==before.id||current.format!==before.format||fingerprint(current)!==afterFingerprint)throw Error("Deck entries changed since the appearance update. Use recovery versions instead of overwriting newer edits.");
    return bounded(async signal=>{
      const used=new Set([...before.entries.map(e=>e.printingId),before.selection?.printingId].filter(Boolean));
      const records=Object.fromEntries(Object.entries({...current.cards,...before.cards}).filter(([id])=>used.has(id)));
      const candidate=model.edit(current,{entries:before.entries,cards:records,selection:before.selection});
      const ready=await validateCandidate(current,candidate,client,signal);
      const keyMap=Object.fromEntries(current.entries.map(entry=>{const oracle=current.cards[entry.printingId].oracleId;const owner=entry.assignedTo?current.cards[entry.assignedTo]?.oracleId:"";const target=before.entries.find(e=>before.cards[e.printingId].oracleId===oracle&&e.zone===entry.zone&&(e.assignedTo?before.cards[e.assignedTo]?.oracleId:"")===owner);return [entry.key,target?.key||entry.key];}));
      return {...ready,keyMap};
    },signal,timeout);
  }
  const api=Object.freeze({profiles,profile,progress,fingerprint,gameplay,preview,apply,undo});
  if(typeof module==="object"&&module.exports)module.exports=api;else root.ManaScoutDeckAppearance=api;
})(typeof window==="undefined"?globalThis:window);
