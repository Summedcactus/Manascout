/* Pure commander analysis and composition policy. No commander-name special cases.
 * Oracle-text heuristics are evidence, not a complete rules interpreter. */
((root) => {
  "use strict";
  const text = c => c.rulesText || c.frontText || "";
  const type = c => c.frontType || "";
  const defs = {
    artifacts: ["Artifacts", ' (t:artifact or o:artifact)', /artifact (?:spells?|cards?|tokens?)|artifacts? you control|for each artifact/i, {artifact:30, artifactPayoff:7, manaEngine:6}],
    tokens: ["Tokens / Go-Wide", 'o:token', /create[^\n.]*creature token|populate|tokens? you control|whenever[^\n.]*tokens?/i, {tokenMaker:12, creatureToken:10, tokenPayoff:6}],
    aristocrats: ["Aristocrats", '(o:sacrifice or o:dies or o:die)', /whenever[^\n.]*(?:dies|die|sacrifice)|sacrifice (?:another|a) creature/i, {outlet:7, fodder:10, deathPayoff:8, recursion:4}],
    sacrifice: ["Sacrifice", '(o:sacrifice or o:dies or o:token)', /sacrifice (?:another|a)|whenever[^\n.]*sacrifice/i, {outlet:9, fodder:12, deathPayoff:5}],
    spellslinger: ["Spellslinger", '(t:instant or t:sorcery or o:instant or o:sorcery or o:"noncreature spell")', /instant|sorcery|noncreature spell|magecraft|prowess/i, {spell:28, spellPayoff:6, velocity:8}],
    graveyard: ["Graveyard", '(o:graveyard or o:mill or o:discard)', /(?:from|in|into|leave|leaves|your) (?:your |a |the |their )?graveyard|\bmill\b|discard[^\n.]*card/i, {graveEnabler:8, recursion:9, gravePayoff:7}],
    lands: ["Lands", '(t:land or o:landfall or o:"land card" or o:"additional land")', /landfall|lands? (?:you control|enters?|cards?)|additional land/i, {landRamp:10, landPayoff:8}],
    landfall: ["Landfall", '(o:landfall or o:"land enters" or o:"land you control enters" or o:"additional land" or o:"search your library")', /landfall|whenever[^\n.]*land[^\n.]*enters/i, {landPayoff:10, landRamp:10}],
    voltron: ["Voltron", '(t:equipment or t:aura or o:equipped or o:enchanted)', /equipment|equipped|enchanted|auras? you control|attach|commander[^\n.]*damage/i, {attachment:14, protection:7, evasion:7}],
    counters: ["+1/+1 Counters", '(o:"+1/+1 counter" or o:proliferate)', /\+1\/\+1 counter|proliferate/i, {counterMaker:12, counterPayoff:6}],
    lifegain: ["Lifegain / Drain", '(o:"gain life" or o:"gain that much life" or o:"loses life" or o:lifelink)', /gain[^\n.]*life|loses?[^\n.]*life|lifelink/i, {life:18, lifePayoff:6}],
    blink: ["Blink", '(o:exile o:return or o:"enters")', /exile[^\n.]*return[^\n.]*battlefield/i, {blink:7, enters:18}],
    enchantments: ["Enchantments", '(t:enchantment or o:enchantment or o:constellation)', /enchantment (?:spells?|cards?)|enchantments? you control|constellation/i, {enchantment:25, enchantPayoff:6}],
    vehicles: ["Vehicles", '(t:vehicle or o:crew or o:pilot)', /vehicle|crew|pilot/i, {vehicle:14, crew:10}],
    treasure: ["Treasure", 'o:treasure', /treasure/i, {treasure:16}],
    clues: ["Clues / Investigate", '(o:clue or o:investigate)', /clue|investigate/i, {clue:15}],
    food: ["Food", 'o:food', /food/i, {food:15}],
    poison: ["Poison", '(o:poison or o:toxic or o:infect or o:proliferate)', /poison|toxic|infect/i, {poison:18}],
    discard: ["Discard", 'o:discard', /whenever[^\n.]*discard|discard[^\n.]*draw/i, {discard:15}],
    aggro: ["Aggro", '(t:creature or o:attack or o:combat)', /attack|combat|creatures you control get|haste/i, {creature:26, combat:10}],
    control: ["Control", '(o:"counter target" or o:destroy or o:exile or o:draw)', /counter[^\n.]*spell|opponents?[^\n.]*can[’']t|opponents?[^\n.]*cast[^\n.]*cost/i, {interaction:14, draw:12}],
    ramp: ["Mana Engine", '(o:"add" or o:"additional land" or o:"search your library")', /add \{|additional land|double[^\n.]*mana|mana[^\n.]*(?:double|twice)/i, {ramp:14, manaEngine:10}],
    combo: ["Combo Engines", '(o:untap or o:copy or o:"return")', /\buntap\b|copy[^\n.]*spell|return[^\n.]*graveyard/i, {comboEngine:10}],
    value: ["Value / Midrange", '(t:creature or o:draw or o:"enters")', /draw|enters|whenever/i, {creature:18, draw:12}]
  };
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function definition(key) {
    if (key?.startsWith("tribal:")) {
      const tribe = key.slice(7);
      if (!/^[a-z]{3,25}$/.test(tribe)) return null;
      return {key, label: tribe[0].toUpperCase()+tribe.slice(1)+" Tribal", query:`(t:${tribe} or o:changeling)`, components:{[key]:28}, tribe};
    }
    const d=defs[key]; return d ? {key,label:d[0],query:d[1],evidence:d[2],components:d[3]} : null;
  }
  // English creature-type morphology, not a list of commanders.
  const irregular={elves:"elf",wolves:"wolf",dwarves:"dwarf",mice:"mouse",oxen:"ox",allies:"ally",faeries:"faerie",zombies:"zombie",mercenaries:"mercenary"};
  const singular = word => irregular[word] || (word.endsWith("ies") ? word.slice(0,-3)+"y" : /(?:ches|shes|xes|sses)$/.test(word) ? word.slice(0,-2) : word.endsWith("s") && !/(?:ss|us|es)$/.test(word) ? word.slice(0,-1) : word);
  const forms = word => [...new Set([word,word+"s",word+"es",...Object.keys(irregular).filter(k=>irregular[k]===word)])];
  function tribes(cards) {
    const found = new Set();
    const excluded=new Set("creature artifact enchantment instant sorcery permanent land legendary basic token spell commander this these that those another other each all".split(" "));
    for (const c of cards) {
      const t=text(c), ownTypes=(type(c).split(/[—–]/)[1] || "").toLowerCase().split(/\s+/).filter(Boolean);
      const candidates=new Set(ownTypes);
      for(const m of t.matchAll(/\b([A-Z][a-z]{2,24}) (?:spells?|creatures?|tokens?|you (?:already )?control)/g)) {
        const word=m[1].toLowerCase();
        if(!excluded.has(word))candidates.add(ownTypes.find(x=>forms(x).includes(word)) || singular(word));
      }
      for(const word of candidates) {
        if(excluded.has(word)||!/^[a-z]{3,25}$/.test(word))continue;
        const noun="(?:"+forms(word).map(escape).join("|")+")";
        const reference=new RegExp(`\\b${noun} (?:spells?|creatures?(?! token)|you (?:already )?control)|(?:each|other|another) ${noun}\\b`,"i");
        if(reference.test(t))found.add(word);
      }
    }
    return [...found];
  }
  function analyse(cards) {
    cards=cards.filter(Boolean);
    const joined=cards.map(text).join("\n"), colors=[...new Set(cards.flatMap(c=>c.colorIdentity||[]))];
    const suggestions=tribes(cards).map(tribe=>({...definition("tribal:"+tribe),confidence:.98,evidence:["Oracle text references "+tribe]}));
    for (const key of Object.keys(defs)) {
      const d=definition(key), evidence=cards.filter(c=>d.evidence.test(c.frontText||text(c)));
      if(evidence.length) suggestions.push({...d,confidence: ["artifacts","spellslinger","graveyard","lands","landfall","voltron","counters"].includes(key)?.9:.76,evidence:["Oracle text: "+evidence.map(c=>c.name).join(" + ")]});
    }
    // Inferred extensions require a real engine plus compatible colours, not a universal menu.
    const extend=(key,why)=>{if(!suggestions.some(x=>x.key===key))suggestions.push({...definition(key),confidence:.58,evidence:[why]});};
    if(suggestions.some(x=>x.tribe) && /create[^\n.]*creature token|creatures you control get|attack/i.test(joined)) extend("aggro","Creature-type engine and combat/token support");
    if(/create[^\n.]*creature token/i.test(joined) && colors.includes("B")) {extend("aristocrats","Creature-token fodder with black death-payoff access");extend("sacrifice","Creature-token fodder with black sacrifice access");}
    if(suggestions.some(x=>x.key==="artifacts") && /tap an untapped artifact[^\n.]*add/i.test(joined))extend("combo","Repeatable artifact mana engine; possible package support");
    if(!suggestions.length) extend(cards.some(c=>/Creature/.test(type(c)))?"aggro":"value","Broad fallback: no confident narrow mechanic");
    return {version:1, colors, styles:suggestions.sort((a,b)=>b.confidence-a.confidence).slice(0,7)};
  }
  function priorities(input={}) {
    const p={ramp:"normal",draw:"normal",removal:"normal",wipes:"normal",protection:"normal",tutors:"none",combo:"none",adherence:"balanced",...input};
    for(const [k,v]of Object.entries(p)) {
      const allowed=k==="adherence"?["loose","balanced","strict"]:["tutors","combo"].includes(k)?["none","some","heavy"]:["wipes","protection"].includes(k)?["low","normal","high"]:["ramp","draw","removal"].includes(k)?["light","normal","heavy"]:[];
      if(!allowed.includes(v))throw Error("Choose valid deck priorities.");
    }
    return p;
  }
  function selection(analysis,input={}) {
    const available=new Set(analysis.styles.map(x=>x.key));
    const primary=input.primaryStyle|| (input.strategy && input.strategy!=="auto"?input.strategy:analysis.styles[0].key);
    const result=[primary,input.secondaryStyle||"",input.tertiaryStyle||""];
    if(result.filter(Boolean).some(x=>!available.has(x))||new Set(result.filter(Boolean)).size!==result.filter(Boolean).length)throw Error("Choose distinct commander-relevant deck styles.");
    return result;
  }
  function features(c, tribal="") {
    const t=text(c), ty=type(c), r=new Set(), add=(key,yes)=>{if(yes)r.add(key);};
    if(/\bLand\b/.test(ty)){r.add("land");if(/sacrifice[^\n.]*:|search your library[^\n.]*land/i.test(t))r.add("landUtility");return r;}
    add("creature",/Creature/.test(ty)); add("artifact",/Artifact/.test(ty));
    add("tribal",!!tribal && (/changeling/i.test(t)||new RegExp(`\\b${escape(tribal)}\\b`,"i").test(ty.split(/[—–]/)[1]||"")) && /Creature/.test(ty));
    add("artifactPayoff",/artifact (?:spells?|cards?|tokens?)|artifacts? you control|for each artifact|affinity|improvise|metalcraft/i.test(t));
    add("manaEngine",/add \{|cost[^\n.]*less|additional land|treasure token/i.test(t));
    add("tokenMaker",/create[^\n.]*token|populate/i.test(t));
    add("creatureToken",/create[^\n.]*creature tokens?|create[^\n.]*token[^\n.]*copy[^\n.]*creature|populate/i.test(t));
    add("tokenPayoff",/tokens? you control|whenever[^\n.]*token|creatures you control get|populate|convoke|twice[^\n.]*tokens|twice[^\n.]*tokens?/i.test(t));
    add("outlet",/(?:sacrifice (?:another|a|one or more) (?:artifact|creature|permanent)[^.:]*:|sacrifice (?:another|a) creature[,:])/i.test(t));
    add("fodder",/create[^\n.]*creature token|(?:when|whenever)[^\n.]*dies[^\n.]*return|undying|persist/i.test(t));
    add("deathPayoff",/whenever[^\n.]*(?:dies|die|sacrifice)[^\n.]*(?:lose|loses|damage|draw|counter|create|gain)/i.test(t));
    add("spell",/Instant|Sorcery/.test(ty)); add("spellPayoff",/whenever[^\n.]*(?:instant|sorcery|noncreature spell)|magecraft|prowess|copy[^\n.]*spell|storm/i.test(t));
    add("velocity",/draw (?:a|one|two) cards?|scry|surveil|look at[^\n.]*top/i.test(t)&&Number(c.manaValue)<=3);
    add("graveEnabler",/\bmill\b|discard|surveil|dredge/i.test(t));
    add("recursion",/return[^\n.]*graveyard|cast[^\n.]*graveyard|escape|flashback|unearth/i.test(t));
    add("gravePayoff",/graveyard|dredge|escape|flashback|unearth/i.test(t));
    add("landRamp",/search your library[^\n.]*land|additional land|play[^\n.]*land[^\n.]*graveyard/i.test(t));
    add("landPayoff",/landfall|whenever[^\n.]*land[^\n.]*enters|lands?[^\n.]*graveyard/i.test(t));
    add("attachment",/Equipment|Aura/.test(ty)); add("evasion",/flying|trample|menace|unblockable|can[’']t be blocked|double strike/i.test(t));
    add("counterMaker",/put[^\n.]*\+1\/\+1 counter|proliferate|enters[^\n.]*counter/i.test(t));
    add("counterPayoff",/whenever[^\n.]*counter|each[^\n.]*counter|with[^\n.]*counter|double[^\n.]*counter|proliferate/i.test(t));
    add("life",/gain[^\n.]*life|loses?[^\n.]*life|lifelink/i.test(t));add("lifePayoff",/whenever[^\n.]*(?:gain|lose|loses)[^\n.]*life/i.test(t));
    add("blink",/exile[^\n.]*return[^\n.]*battlefield/i.test(t)); add("enters",/when[^\n.]*enters/i.test(t));
    add("enchantment",/Enchantment/.test(ty));add("enchantPayoff",/enchantment (?:spells?|cards?)|constellation|enchantments? you control/i.test(t));
    add("vehicle",/Vehicle/.test(ty));add("crew",/crew|pilot|create[^\n.]*creature token/i.test(t));
    for(const [k,re]of Object.entries({treasure:/treasure/i,clue:/clue|investigate/i,food:/food/i,poison:/poison|infect|toxic|proliferate/i,discard:/discard/i,combat:/attack|combat|haste|trample|creatures you control get/i,comboEngine:/\buntap\b|copy[^\n.]*spell|:[^\n.]*return[^\n.]*graveyard/i}))add(k,re.test(t));
    // Land searches are ramp, not generic card tutors.
    add("tutor",/search your library[^\n.]*for[^\n.]*(?:card|artifact|creature|enchantment|instant|sorcery)/i.test(t)&&!/search your library[^\n.]*land/i.test(t));
    return r;
  }
  function plan(cards, styles, p, curve="balanced") {
    const minima={}, weights={}, add=(key,n,w)=>{minima[key]=Math.max(minima[key]||0,n);weights[key]=Math.max(weights[key]||0,w);};
    const scale={loose:.6,balanced:1,strict:1.3}[p.adherence];
    styles.filter(Boolean).forEach((key,i)=>{
      const d=definition(key), influence=[1,.55,.28][i];
      for(const [component,n]of Object.entries(d.components)) {
        let base=n;
        if(component.startsWith("tribal:"))base+=(curve==="low"?3:curve==="high"?-4:0);
        add(component,Math.max(1,Math.round(base*scale*influence)),[6,3,1.5][i]);
      }
    });
    if(styles.some(k=>["lands","landfall"].includes(k)))add("landUtility",styles[0]==="lands"||styles[0]==="landfall"?3:1,3);
    const high=cards.some(c=>Number(c.manaValue)>=6);
    for(const [role,n]of Object.entries({ramp:{light:5,normal:high?12:9,heavy:17}[p.ramp],draw:{light:5,normal:10,heavy:17}[p.draw],interaction:{light:4,normal:8,heavy:16}[p.removal],wipe:{low:0,normal:2,high:5}[p.wipes],protection:{low:1,normal:3,high:9}[p.protection],tutor:{none:0,some:2,heavy:7}[p.tutors]}))add(role,n,5);
    // Combo engines are useful building blocks, not a claimed deterministic/infinite package.
    if(p.combo!=="none" && styles.some(k=>["combo","artifacts","spellslinger","graveyard","aristocrats","sacrifice"].includes(k)))add("comboEngine",p.combo==="heavy"?12:5,4);
    return {minima,weights,styles,priorities:p};
  }
  function shortfall(plan, counts) {
    return Object.entries(plan.minima).reduce((n,[r,min])=>n+Math.max(0,min-(counts[r]||0))*(plan.weights[r]||4),0);
  }
  // Pure, monotonic swap planning. Callers exclude protected seeds/commanders and
  // provide budget/availability checks; neither these vectors nor the deck is mutated.
  function bestSwap(plan, counts, incoming, outgoing, allowed=()=>true) {
    let best=shortfall(plan,counts), result=null;
    for(const add of incoming) {
      if(!Object.keys(plan.minima).some(r=>(counts[r]||0)<plan.minima[r]&&add.roles.has(r)))continue;
      for(const remove of outgoing) {
        if(!allowed(add,remove))continue;
        const next={...counts};
        for(const r of remove.roles)next[r]=(next[r]||0)-1;
        for(const r of add.roles)next[r]=(next[r]||0)+1;
        const deficit=shortfall(plan,next);
        if(deficit<best){best=deficit;result={incoming:add.key,outgoing:remove.key};}
      }
    }
    return result;
  }
  // Small, explicit package catalogue. These are suggestions with prerequisites,
  // not an exhaustive combo detector or a certification of an executable win.
  const packages = [
    {id:"scepter-reversal",styles:["artifacts","combo","spellslinger"],cards:["Isochron Scepter","Dramatic Reversal"],checks:[/imprint|exile.*instant/i,/untap all nonland permanents/i],requires:"Scepter imprinted with Reversal; nonland mana sources producing more than the activation cost.",source:"https://commanderspellbook.com/search/?q=Isochron%20Scepter%20Dramatic%20Reversal"},
    {id:"dualcaster-twinflame",styles:["tokens","spellslinger","combo"],cards:["Dualcaster Mage","Twinflame"],checks:[/copy target instant or sorcery spell/i,/token.*copy.*creature/i],requires:"An initial creature, Twinflame on the stack and mana for Dualcaster; resolve the copied spell and retarget correctly.",source:"https://commanderspellbook.com/search/?q=Dualcaster%20Mage%20Twinflame"},
    {id:"kiki-conscripts",styles:["tokens","aggro","combo"],cards:["Kiki-Jiki, Mirror Breaker","Zealous Conscripts"],checks:[/token.*copy.*nonlegendary creature/i,/untap.*permanent/i],requires:"Both creatures on the battlefield; Kiki-Jiki able to activate and copy Conscripts, which untaps Kiki-Jiki.",source:"https://commanderspellbook.com/combo/618-1537/"}
  ];
  function packageConflict(card,existing) {
    return packages.some(p=>p.cards.includes(card.name)&&p.cards.every(name=>name===card.name||existing.some(c=>c.name===name)));
  }
  const api=Object.freeze({analyse,definition,features,selection,priorities,plan,shortfall,bestSwap,packages,packageConflict});
  if(typeof module==="object"&&module.exports)module.exports=api;else root.ManaScoutDeckIdentity=api;
})(typeof window==="undefined"?globalThis:window);
