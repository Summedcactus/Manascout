/* Explainable, bounded composition checks; no commander-name rules, network, or rules-engine claims. */
((root)=>{
  'use strict';
  const cache=new WeakMap();
  const text=c=>c.rulesText||c.frontText||'',type=c=>c.frontType||'',mv=c=>Number(c.manaValue)||0;
  const selfText=c=>c.name?text(c).replaceAll(c.name,'this object'):text(c);
  const thresholds=Object.freeze({instant:18,noncreature:22,artifact:18,attachment:8,token:6,board:22,graveFill:6,graveUse:4,landEntry:8,outlet:3,fodder:6,creature:14,tribe:14});
  function infrastructure(c){
    const t=selfText(c),ty=type(c),r=new Set();if(/\bLand\b/.test(ty))return new Set(['land']);
    const land=/search your library[^\n.]*\blands?\b[^\n.]*battlefield|additional lands?\b|play[^\n.]*\blands?\b[^\n.]*graveyard/i.test(t);
    const mana=/\badd (?:\{|one mana|two mana|three mana|an amount of|mana)/i.test(t);
    const reduction=/(?:spells?(?: you cast)?|spells? have)[^\n.]*cost[^\n.]*less/i.test(t);
    const oneShot=/sacrifice this(?: (?:object|artifact|creature|permanent))?[^:]*:[^\n.]*add/i.test(t);
    if(land||mana&&!oneShot&&!/\bInstant\b|\bSorcery\b/.test(ty)||reduction||/create[^\n.]*treasure tokens?/i.test(t)&&!/\bInstant\b|\bSorcery\b/.test(ty))r.add('ramp');
    const draw=t.replace(/(?:target|each|an?|that|the)?\s*opponent draws?[^,.\n]*/gi,'');
    if(/\bdraw (?:a|an|one|two|three|four|five|six|seven|\d+|X|that many) cards?\b|\bdraw cards\b/i.test(draw)||/exile[^\n]*top[^\n]*library[\s\S]{0,180}(?:you may|you can) (?:play|cast)|look at[^\n]*top[^\n]*library[\s\S]{0,100}(?:into your hand|you may cast)/i.test(draw))r.add('draw');
    if(r.has('draw')&&/Instant|Sorcery/.test(ty)&&mv(c)>3&&/draw (?:a|one) card\b/i.test(draw)&&!/whenever|at the beginning|draw (?:two|three|four|X|\d+) cards/i.test(draw))r.delete('draw');
    if(/destroy all|exile all|each creature gets -|damage to each creature/i.test(t))r.add('wipe');
    else if(/destroy target|counter target (?:spell|activated|triggered|ability|noncreature|creature|instant|sorcery)|exile target (?:creature|artifact|enchantment|nonland|permanent|planeswalker)|return target[^\n.]*to (?:its|their) owner|damage to (?:any target|target (?:creature|permanent))/i.test(t)&&!/exile target[^\n.]*you control[\s\S]{0,100}return/i.test(t))r.add('interaction');
    if(/(?:gains?|have|has|with)[^\n.]*(?:hexproof|indestructible|protection from)|phase out|counter target (?:spell|ability)/i.test(t))r.add('protection');
    if(/return[^\n.]*from[^\n.]*graveyard|cast[^\n.]*from[^\n.]*graveyard|play[^\n.]*\blands?\b[^\n.]*graveyard|escape|flashback|unearth/i.test(t))r.add('recursion');
    return r;
  }
  function profile(c){
    if(cache.has(c))return cache.get(c);
    const t=text(c),ty=type(c),land=/\bLand\b/.test(ty),creature=/\bCreature\b/.test(ty),instant=/\bInstant\b|\bSorcery\b/.test(ty);
    const f={land,creature,instant,noncreature:!creature&&!land,artifact:/\bArtifact\b/.test(ty),attachment:/\bEquipment\b|\bAura\b/.test(ty),deps:[],roles:infrastructure(c),mv:mv(c)};
    f.token=/create[^\n.]*creature tokens?|create[^\n.]*token[^\n.]*copy[^\n.]*creature|populate/i.test(t);
    f.repeatToken=f.token&&/(?:\{T\}|:|whenever|at the beginning)/i.test(t);
    f.artifactToken=/create[^\n.]*(?:artifact|Treasure|Clue|Food)[^\n.]*tokens?|investigate/i.test(t);
    f.outlet=/sacrifice (?:another|a|one or more) (?:artifact or creature|creature|permanent)[^.:]*:/i.test(t);
    f.fodder=f.token||creature&&/undying|persist|return[^\n.]*from[^\n.]*graveyard[^\n.]*battlefield/i.test(t);
    f.graveFill=/(?:^|[.:\n]|then)\s*(?:mill|discard)\b|you (?:mill|discard)|surveil|dredge/i.test(t);
    f.graveUse=f.roles.has('recursion');
    f.landEntry=/search your library[^\n.]*\blands?\b[^\n.]*battlefield|additional lands?\b|play[^\n.]*\blands?\b[^\n.]*graveyard/i.test(t);
    f.additional=/additional lands?\b/i.test(t);f.fetch=land&&/sacrifice[^\n.]*search your library[^\n.]*land|search your library[^\n.]*land/i.test(t);
    f.death=/creature dying causes|whenever[^\n.,]*(?:another|a|one or more) creatures?[^\n.,]*\b(?:dies|die)\b|whenever (?:another|a|one or more|a[n]?) (?:creatures?|creatures? you control)[^\n.]*\b(?:dies|die)\b|whenever you sacrifice/i.test(t);
    f.anthem=/(?:other )?creatures you control get \+|creatures you control[^\n.]*get \+/i.test(t);
    f.reanimation=/return[^\n.]*creature[^\n.]*graveyard[^\n.]*battlefield|put[^\n.]*creature[^\n.]*graveyard[^\n.]*battlefield/i.test(t);
    f.tutor=/search your library[^\n.]*for[^\n.]*(?:card|artifact|creature|equipment|enchantment|instant|sorcery)/i.test(t)&&!/search your library[^\n.]*\blands?\b/i.test(t);
    f.blocksGraveyard=/if[^.]*cards?(?: or tokens?)? would be put into a graveyard[^.]*exile|players can[’']t cast spells from graveyards/i.test(t);
    f.tutorKind=!f.tutor?'':/for (?:a|any) card\b/i.test(t)?'unrestricted':/equipment/i.test(t)?'equipment':/creature/i.test(t)?'creature':'restricted';
    f.manaKind=/sacrifice this(?: (?:object|artifact|creature|permanent))?[^:]*:[^\n.]*add/i.test(selfText(c))?'one-shot mana':!f.roles.has('ramp')?(instant&&/\badd \{/i.test(t)?'ritual':''):f.landEntry?'land':/treasure/i.test(t)?'treasure':/cost[^\n.]*less/i.test(t)?'conditional reducer':creature?'dork':'rock/engine';
    f.drawKind=!f.roles.has('draw')?'':/whenever|at the beginning|:\s*draw/i.test(t)?'engine':/draw (?:a|one) card\b/i.test(t)&&instant&&f.mv<=3?'cantrip':'card advantage';
    const dep=(key,yes)=>{if(yes&&!f.deps.includes(key))f.deps.push(key);};
    const own=t.replace(/whenever (?:an?|one or more) opponents?[^\n.]*/gi,'');
    dep('instant',/whenever[^\n.,]*(?:cast|copy)[^\n.,]*(?:instant|sorcery)|(?:instant|sorcery) spells?[^\n.]*cost[^\n.]*less|\bmagecraft\b/i.test(own));
    dep('noncreature',/whenever[^\n.,]*cast[^\n.,]*noncreature spell|\bnoncreature spells?[^\n.]*cost[^\n.]*less|\bprowess\b/i.test(own));
    dep('artifact',/whenever[^\n.,]*artifact[^\n.,]*(?:enters|cast|sacrifice)|whenever[^\n.,]*cast[^\n.,]*artifact|affinity for artifacts|for each artifact|artifacts? you control|artifact (?:or enchantment )?spells?[^\n.]*cost/i.test(own));
    dep('artifact',/sacrifice (?:an?|another) artifacts?[^:]*:[^\n.]*add/i.test(own));
    dep('attachment',/whenever[^\n.,]*(?:equipment|aura|equipped|enchanted)|for each (?:equipment|aura)|(?:equipment|aura) spells?[^\n.]*cost/i.test(own));
    dep('fodder',/whenever equipped creature dies/i.test(own));
    dep('death',f.death);dep('fodder',f.outlet&&f.roles.has('draw'));
    dep('creature',/whenever[^\n.,]*cast[^\n.,]*\bcreature spell|\bcreature spells?[^\n.]*cost[^\n.]*less/i.test(own));
    dep('token',/whenever you create[^\n.,]*token|tokens you control[^\n.]*(?:get|have)|twice[^\n.]*tokens/i.test(own)&&!f.token);
    dep('board',f.anthem||/whenever (?:another |a )?creature you control enters|for each creature you control/i.test(own));
    dep('landEntry',/\blandfall\b|whenever[^\n.,]*\blands?\b[^\n.,]*enters/i.test(own));
    dep('graveFill',f.reanimation||/creature cards? in your graveyard|cards? in your graveyard|cast[^\n.]*from your graveyard/i.test(own));
    dep('graveUse',/whenever[^\n.,]*(?:leaves?|leave)[^\n.,]*your graveyard/i.test(own));
    const excluded=new Set(['creature','artifact','enchantment','land','token','spell','permanent','commander','equipment','aura','vehicle','instant','sorcery','planeswalker','saga','class','treasure','food','clue','powerstone','other','another','each','all','target','enchanted','equipped','this','those','that','these']);
    const singular=w=>({elves:'elf',wolves:'wolf',dwarves:'dwarf',mice:'mouse',mercenaries:'mercenary',allies:'ally'}[w]||(w.endsWith('s')&&!/ss$/.test(w)?w.slice(0,-1):w));
    for(const m of t.matchAll(/\b([A-Z][a-z]{2,24}) (?:spells? you cast|creatures? you control|you control)/g)){const tribe=singular(m[1].toLowerCase());if(!excluded.has(tribe))dep('tribe:'+tribe,true);}
    f.types=creature?(ty.split(/[—–]/)[1]||'').toLowerCase().split(/\s+/).filter(Boolean):[];f.allTypes=creature&&/changeling|every creature type/i.test(t);
    if(f.roles.has('draw')&&f.deps.length)f.drawKind='conditional engine';
    cache.set(c,f);return f;
  }
  function entries(deck){return deck.entries.filter(e=>['main','commander'].includes(e.zone)).map(e=>({card:deck.cards[e.printingId],quantity:e.quantity,commander:e.zone==='commander'})).filter(x=>x.card);}
  function composition(deck){
    const counts={instant:0,noncreature:0,artifact:0,artifactToken:0,attachment:0,token:0,outlet:0,fodder:0,creature:0,graveFill:0,graveUse:0,landEntry:0,land:0};
    for(const {card,quantity,commander}of entries(deck)){const f=profile(card);for(const k of Object.keys(counts))if(f[k])counts[k]+=quantity*(commander&&['token','fodder','graveFill','graveUse'].includes(k)&&f.repeatToken?2:1);if(f.fetch)counts.landEntry+=quantity;if(f.additional)counts.landEntry+=quantity;for(const subtype of f.types)counts['tribe:'+subtype]=(counts['tribe:'+subtype]||0)+quantity;for(const d of f.deps.filter(d=>d.startsWith('tribe:')))counts[d]||=0;}
    for(const {card,quantity}of entries(deck))if(profile(card).allTypes)for(const k of Object.keys(counts).filter(k=>k.startsWith('tribe:')&&!profile(card).types.includes(k.slice(6))))counts[k]+=quantity;
    return counts;
  }
  function supported(f,n){
    const problems=[];for(const d of f.deps){
      const good=d.startsWith('tribe:')?(n[d]||0)>=thresholds.tribe:d==='death'?n.outlet>=thresholds.outlet&&n.fodder>=thresholds.fodder&&(n.creature>=thresholds.creature||n.token>=8):d==='board'?n.creature>=thresholds.board||n.token>=8:d==='fodder'?n.fodder>=thresholds.fodder:d==='artifact'?n.artifact>=thresholds.artifact||n.artifactToken>=8&&n.artifact>=12:d==='token'?n.token>=thresholds.token:d==='graveFill'?n.graveFill>=thresholds.graveFill:d==='graveUse'?n.graveUse>=thresholds.graveUse:(n[d]||0)>=(thresholds[d]||0);
      if(!good)problems.push(d);
    }return problems;
  }
  function distance(d,n){const gap=(k,min=thresholds[k])=>Math.max(0,min-(n[k]||0))/min;return d==='graveConflict'?1:d.startsWith('tribe:')?gap(d,thresholds.tribe):d==='death'?gap('outlet')+gap('fodder')+Math.min(gap('creature'),gap('token',8)):d==='board'?Math.min(gap('creature',22),gap('token',8)):d==='artifact'?Math.min(gap('artifact'),gap('artifact',12)+gap('artifactToken',8)):d==='fodder'?gap('fodder'):gap(d);}
  function dependencyDebt(q){return q.unsupported.reduce((sum,x)=>sum+x.quantity*(1+x.missing.reduce((n,d)=>n+distance(d,q.counts),0)),0);}
  function effectiveRoles(c,roles,n){const result=new Set(roles);if(supported(profile(c),n).length)for(const k of ['ramp','draw','interaction','protection','payoff','spellPayoff','deathPayoff','tokenPayoff','artifactPayoff','gravePayoff','landPayoff'])result.delete(k);return result;}
  function analyse(deck,{styles=[],priorities={},curve='balanced'}={}){
    const n=composition(deck),unsupported=[];let expensive=0,nonlands=0,sum=0;const infrastructure={ramp:0,draw:0,interaction:0,wipe:0,protection:0};
    for(const {card,quantity,commander}of entries(deck)){
      const f=profile(card),missing=supported(f,n);if(f.blocksGraveyard&&n.graveUse>=4)missing.push('graveConflict');
      if(missing.length)unsupported.push({id:card.id,name:card.name,missing,quantity,commander});
      if(!commander&&!f.land){nonlands+=quantity;sum+=f.mv*quantity;if(f.mv>=6)expensive+=quantity;}
      if(!commander)for(const k of Object.keys(infrastructure))if(f.roles.has(k)&&!missing.length)infrastructure[k]+=quantity;
    }
    const groups={};for(const x of unsupported)for(const d of x.missing)(groups[d]||=[]).push(x.name);
    const warnings=Object.entries(groups).map(([d,names])=>d==='graveConflict'?`Graveyard-exile replacement effects conflict with this recursion package: ${names.slice(0,2).join(' / ')}.`:`Insufficient ${d} support for ${names.slice(0,2).join(' / ')}${names.length>2?` and ${names.length-2} more`:''}. ${d==='board'?`${n.creature}/22 creatures or ${n.token}/8 creature-token sources`:d==='artifact'?`${n.artifact}/18 artifact cards, or 12 artifacts with ${n.artifactToken}/8 artifact-token sources`:d==='death'?`${n.outlet}/${thresholds.outlet} outlets, ${n.fodder}/${thresholds.fodder} fodder, ${n.creature}/${thresholds.creature} creatures`:`${n[d]||0}/${thresholds[d]||(d.startsWith('tribe:')?thresholds.tribe:thresholds.board)} support target`}.`);
    const commanders=entries(deck).filter(x=>x.commander).map(x=>x.card);
    if(nonlands&&sum/nonlands>4&&infrastructure.ramp<12)warnings.push('High average mana value has fewer than 12 supported acceleration sources.');
    if(commanders.some(c=>mv(c)>=6)&&infrastructure.ramp<12)warnings.push('An expensive commander has fewer than 12 supported acceleration sources.');
    if(commanders.some(c=>mv(c)>=6)&&infrastructure.protection<3)warnings.push('An expensive commander has fewer than three protection sources.');
    if(nonlands>=40&&infrastructure.draw<7)warnings.push('Fewer than seven supported card-advantage sources.');
    if(nonlands>=40&&infrastructure.interaction<6)warnings.push('Fewer than six targeted interaction sources.');
    for(const key of styles.filter(k=>k?.startsWith('tribal:'))){const tribe=key.slice(7),re=new RegExp('\\b'+tribe+'\\b','i');const count=entries(deck).filter(x=>!x.commander&&profile(x.card).creature&&(re.test(type(x.card).split(/[—–]/)[1]||'')||/changeling|every creature type/i.test(text(x.card)))).reduce((a,x)=>a+x.quantity,0);n[key]=count;const min={loose:18,balanced:28,strict:34}[priorities.adherence||'balanced'];if(count<min)warnings.push(`${tribe} creature density: ${count}/${min} target; support cards alone do not count.`);}
    const payoffCount=entries(deck).filter(x=>!x.commander&&profile(x.card).deps.length).reduce((a,x)=>a+x.quantity,0);
    if(payoffCount>18)warnings.push('Many dependent engines/payoffs compete for support; review redundancy.');
    return {styles:[...styles],version:1,counts:n,infrastructure,unsupported,warnings:[...new Set(warnings)].slice(0,5),average:nonlands?sum/nonlands:null,expensive,payoffCount,curve};
  }
  function prepareScore(deck){const n=composition(deck),rows=entries(deck);const missing={},dependencies={};let anthems=0;const bands=[0,0,0];for(const x of rows){const f=profile(x.card);if(!x.commander&&!f.land)bands[f.mv<=2?0:f.mv<=4?1:2]+=x.quantity;for(const d of supported(f,n))missing[d]=(missing[d]||0)+x.quantity;for(const d of f.deps)dependencies[d]=(dependencies[d]||0)+x.quantity;if(f.anthem)anthems+=x.quantity;}return {counts:n,missing,dependencies,anthems,bands};}
  function score(c,context){
    const f=profile(c),next={...context.counts};for(const k of Object.keys(next))if(f[k])next[k]++;for(const t of f.types)next['tribe:'+t]=(next['tribe:'+t]||0)+1;if(f.allTypes)for(const k of Object.keys(next).filter(k=>k.startsWith('tribe:')&&!f.types.includes(k.slice(6))))next[k]++;
    let contribution=0;for(const [d,n]of Object.entries(context.missing))contribution+=Math.max(0,distance(d,context.counts)-distance(d,next))*n*6;
    let score=-supported(f,context.counts).length*5+contribution;
    const same=Math.max(0,...f.deps.map(d=>context.dependencies[d]||0));if(f.deps.length&&!contribution)score-=Math.max(0,same-6)*1.5;if(f.anthem)score-=Math.max(0,context.anthems-4)*2;
    return Math.max(-25,Math.min(15,score));
  }
  function curveScore(c,context,curve){const desired={low:[.55,.35,.10],balanced:[.35,.45,.20],high:[.25,.45,.30]}[curve];const f=profile(c);if(f.land)return 0;const bucket=f.mv<=2?0:f.mv<=4?1:2;const total=context.bands.reduce((a,b)=>a+b,0)||1;return Math.max(-2,Math.min(2,(desired[bucket]-context.bands[bucket]/total)*3));}
  function overlap(c,styles){const f=profile(c);const matches=styles.filter(Boolean).filter(s=>s.startsWith('tribal:')?f.creature&&(new RegExp('\\b'+s.slice(7)+'\\b','i').test(type(c))||/changeling/i.test(text(c))):s==='tokens'?f.token:s==='aristocrats'||s==='sacrifice'?f.outlet||f.fodder||f.death:s==='artifacts'?f.artifactToken||f.artifact:s==='spellslinger'?f.instant:s==='graveyard'?f.graveFill||f.graveUse:s==='lands'||s==='landfall'?f.landEntry||f.fetch:s==='voltron'?f.attachment:false).length;return Math.max(0,matches-1)*1.5;}
  function summary(q){
    const c=q.counts,i=q.infrastructure,packages=[];
    for(const s of q.styles||[]){if(s.startsWith('tribal:'))packages.push(`${c[s]||0} ${s.slice(7)} creatures`);else if(s==='artifacts')packages.push(`${c.artifact} artifact cards / ${c.artifactToken} artifact-token sources`);else if(s==='spellslinger')packages.push(`${c.instant} instants/sorceries / ${c.noncreature} noncreature cards`);else if(['aristocrats','sacrifice','tokens'].includes(s))packages.push(`${c.token} creature-token sources / ${c.outlet} outlets / ${c.fodder} fodder sources`);else if(s==='graveyard')packages.push(`${c.graveFill} graveyard-filling sources / ${c.graveUse} recursion sources`);else if(['lands','landfall'].includes(s))packages.push(`${c.landEntry} weighted land-entry support`);else if(s==='voltron')packages.push(`${c.attachment} Equipment/Auras`);}
    return `${c.land} lands · ${i.ramp} supported ramp · ${i.draw} draw · ${i.interaction} interaction. ${[...new Set(packages)].join('; ')}. ${q.warnings.length?q.warnings.slice(0,2).join(' '):'Dependency checks met; review sequencing, resilience and win conditions.'}`;
  }

  const api=Object.freeze({thresholds,profile,infrastructure,composition,supported,dependencyDebt,effectiveRoles,analyse,prepareScore,score,curveScore,overlap,summary});if(typeof module==='object'&&module.exports)module.exports=api;else root.ManaScoutDeckQuality=api;
})(typeof window==='undefined'?globalThis:window);
