/* Read-only inspection of the existing model. Targets and classifications belong to
 * deck-identity.js; validation still belongs to deck-rules.js. No fetches or edits. */
((root) => {
  "use strict";
  const common=typeof module==="object"&&module.exports;
  const identity=common?require("./deck-identity.js"):root.ManaScoutDeckIdentity;
  const rules=common?require("./deck-rules.js"):root.ManaScoutDeckRules;
  const essentials=["land","creature","artifact","enchantment","instant","sorcery","planeswalker","ramp","draw","interaction","protection"];
  const priorityKey={ramp:"ramp",draw:"draw",interaction:"removal",wipe:"wipes",protection:"protection",tutor:"tutors",comboEngine:"combo"};
  const titles={removal:"Removal",ramp:"Ramp",draw:"Card Draw",wipes:"Board Wipes",protection:"Protection",tutors:"Tutors",combo:"Combo Engines"};
  const title=value=>value[0].toUpperCase()+value.slice(1);
  function intent(deck){
    const saved=deck.format==="commander"&&deck.generation?.version===1?deck.generation:null;
    const commanders=deck.entries.filter(e=>e.zone==="commander").map(e=>deck.cards[e.printingId]).filter(Boolean);
    let priorities=identity.priorities(),styles=[],configured=false,problem="";
    if(saved){
      try{
        priorities=identity.priorities(saved.priorities);
        styles=[saved.primaryStyle,saved.secondaryStyle,saved.tertiaryStyle].filter(Boolean);
        configured=!!styles.length&&styles.every(key=>identity.definition(key))&&new Set(styles).size===styles.length;
      }catch{problem="Saved priorities need review before these targets can be assessed.";}
    }
    if(!configured){styles=deck.format==="commander"&&commanders.length?identity.analyse(commanders).styles.slice(0,1).map(s=>s.key):[];}
    const relevant=new Set(identity.analyse(commanders).styles.map(s=>s.key));
    const ids=commanders.map(c=>c.oracleId).sort();
    const mismatch=configured&&(!commanders.length||styles.some(key=>!relevant.has(key))||(saved.commanderOracles?.length&&JSON.stringify([...saved.commanderOracles].sort())!==JSON.stringify(ids)));
    return {saved,commanders,styles,priorities,configured,problem,mismatch};
  }
  function metricState(count,target,intentional){
    if(!target)return {state:"no-minimum",healthLabel:"No minimum selected"};
    if(count>=target)return {state:intentional?"intentional":"meets",healthLabel:intentional?"High / intentional":"Meets target"};
    return target-count<=Math.max(1,Math.ceil(target*.2))?{state:"slightly-low",healthLabel:"Slightly low"}:{state:"too-low",healthLabel:"Too low"};
  }
  function warning(metric,context){
    const {key,label,count,target}=metric,p=priorityKey[key],choice=p?context.priorities[p]:"";
    if(key.startsWith("tribal:"))return `${label}: ${count} / target ${target}+. ${title(context.priorities.adherence)} ${identity.definition(key).label} density is below its generated target.`;
    if(key==="land")return `Land count is ${count} / target ${target} for the generated mana-base plan${context.saved.curve?" ("+context.saved.curve+" curve)":""}.`;
    if(p&&["heavy","high"].includes(choice))return `${title(choice)} ${titles[p]} was selected: ${count} ${label.toLowerCase()} / target ${target}+.`;
    if(key==="tokenPayoff")return `Token production needs more payoffs: ${count} / target ${target}+ token payoffs.`;
    if(key==="outlet")return `Sacrifice payoffs need reliable outlets: ${count} / target ${target}+ sacrifice outlets.`;
    return `${label}: ${count} / target ${target}+. Below the saved style/priority target.`;
  }
  function analyse(deck){
    const context=intent(deck),{styles,priorities,saved,configured}=context;
    const cards=Object.values(deck.cards).filter(c=>deck.entries.some(e=>e.printingId===c.id));
    const comboIds=new Set();
    for(const pack of identity.packages){
      const members=pack.cards.map((name,i)=>cards.find(c=>c.name===name&&pack.checks[i].test(c.rulesText||c.frontText||"")));
      if(members.every(Boolean))members.forEach(c=>comboIds.add(c.id));
    }
    const cardRoles=Object.fromEntries(cards.map(card=>[card.id,identity.inspect(card,{styles,comboIds})]));
    const counts={},componentCounts={},commanderCounts={},entries=[];
    for(const entry of deck.entries){
      const classification=cardRoles[entry.printingId]||{roles:[],components:[],styles:[],evidence:{}};
      entries.push({key:entry.key,printingId:entry.printingId,finish:entry.finish,zone:entry.zone,quantity:entry.quantity,roles:classification.roles,styles:classification.styles});
      const counter=entry.zone==="main"?counts:entry.zone==="commander"?commanderCounts:null;
      if(counter)for(const role of classification.roles)counter[role]=(counter[role]||0)+entry.quantity;
      if(entry.zone==="main")for(const role of classification.components)componentCounts[role]=(componentCounts[role]||0)+entry.quantity;
    }
    const main=entries.filter(e=>e.zone==="main"),all=main.reduce((n,e)=>n+e.quantity,0);
    const category=(id,group)=>({id,label:id==="all"?"All":identity.label(id),group,count:id==="all"?all:counts[id]||0,entryKeys:main.filter(e=>id==="all"||e.roles.includes(id)).map(e=>e.key)});
    const categories=[category("all","essential"),...essentials.filter(key=>counts[key]).map(key=>category(key,"essential"))];
    const dynamic=[...new Set(styles.flatMap(key=>identity.definition(key)?.filters||[]))];
    for(const key of dynamic)if(counts[key]&&!categories.some(c=>c.id===key))categories.push(category(key,"strategy"));
    // Evidence-based universal roles remain reachable from collapsed health details;
    // only a selected extra role becomes another chip in the compact bar.
    const extras=["removal","countermagic","wipe","tutor","recursion","graveEnabler","outlet","tokenMaker","tokenPayoff","anthem","finisher","comboPiece","stax","lifegain","drain","reanimation","selfMill","discard","blink","proliferate","equipment","aura","evasion","utility"];
    for(const key of extras)if(counts[key]&&!categories.some(c=>c.id===key))categories.push(category(key,"additional"));
    const roleCounts=Object.entries(counts).filter(([key,n])=>n>0&&identity.label(key)!==key).map(([key,count])=>({key,label:identity.label(key),count}));
    let targetIncomplete=false;
    const metrics=[],observations=[],warnings=[];
    if(context.problem)warnings.push(context.problem);
    if(saved&&!configured)warnings.push("Saved deck identity cannot be assessed. Generate again to establish supported styles and targets.");
    if(configured){
      const themeKeys=new Set(styles.flatMap(key=>Object.keys(identity.definition(key).components)));
      const expected=identity.plan(context.commanders,styles,priorities,saved.curve||"balanced").minima;
      if(saved.curve&&saved.bracket)expected.land=identity.landTarget(context.commanders,{curve:saved.curve,bracket:saved.bracket,primaryStyle:styles[0]});
      const allowed=new Set([...Object.keys(expected),"land"]);
      const minimumLand=identity.landTarget(context.commanders,{curve:"low",bracket:5,primaryStyle:styles[0]});
      targetIncomplete=[...allowed].some(key=>!Number.isInteger(saved.targets?.[key])||saved.targets[key]<0||saved.targets[key]>100||(expected[key]>0&&saved.targets[key]===0)||(key==="land"&&saved.targets[key]<minimumLand));
      if(targetIncomplete)warnings.push("Saved composition targets are incomplete. Generate again to establish a complete health plan.");
      for(const [key,storedTarget]of Object.entries(saved.targets||{})){
        const target=Math.max(storedTarget,(!saved.curve&&key.startsWith("tribal:"))?storedTarget:expected[key]||0);
        if(!allowed.has(key)||!Number.isInteger(target)||target<0||target>100)continue;
        const count=componentCounts[key]||0,priority=priorityKey[key],intentional=target>0&&(["heavy","high"].includes(priorities[priority])||(themeKeys.has(key)&&priorities.adherence==="strict"));
        const metric={key,label:identity.label(key),count,target,section:themeKeys.has(key)?"theme":"infrastructure",priority:priority?priorities[priority]:"",...metricState(count,target,intentional)};
        metrics.push(metric);if(count<target)warnings.push(warning(metric,context));
      }
      if(!metrics.length)warnings.push("This draft has no supported composition targets. Generate again to establish a plan.");
      for(const key of dynamic)if(!metrics.some(m=>m.key===key))observations.push({key,label:identity.label(key),count:counts[key]||0,commanderCount:commanderCounts[key]||0,target:null});
      if(context.mismatch)warnings.unshift("The assigned commander no longer matches the saved generation identity. Review the commander/styles or generate a new deck; cards have been preserved.");
    }
    const lows=metrics.filter(m=>m.count<m.target),tooLow=lows.filter(m=>m.state==="too-low");
    const theme=metrics.filter(m=>m.section==="theme"&&m.target>0);
    const structuralState=!configured||!metrics.length||targetIncomplete?"not-assessed":context.mismatch||tooLow.length>=2||theme.some(m=>m.count<m.target*.5)?"major-gaps":lows.length?"needs-attention":"healthy";
    const themeState=!configured||targetIncomplete?"Not assessed":theme.some(m=>m.count<m.target)?"Below target":"Meets target";
    const styleCoverage=styles.map((key,index)=>({key,label:identity.definition(key).label,rank:["Primary","Secondary","Tertiary"][index],count:main.filter(entry=>entry.styles.includes(key)).reduce((n,entry)=>n+entry.quantity,0),entryKeys:main.filter(entry=>entry.styles.includes(key)).map(e=>e.key)}));
    const labels=Object.fromEntries([...new Set(Object.values(cardRoles).flatMap(c=>c.roles))].map(key=>[key,identity.label(key)]));
    return {version:1,labels,styleCoverage,hasSavedPlan:!!saved,deckId:deck.id,format:deck.format,configured,styles,priorities,curve:saved?.curve||"",identityMismatch:!!context.mismatch,cardRoles,entries,counts,componentCounts,commanderCounts,roleCounts,categories,metrics,observations,warnings,structuralState,themeState,stats:rules.statistics(deck),problem:context.problem};
  }
  function evaluate(analysis,validation){
    let state=analysis.structuralState;
    if(analysis.configured&&state==="healthy"&&!validation.complete)state=validation.status==="unverified"?"needs-verification":"needs-attention";
    const labels={healthy:"Healthy", "needs-attention":"Needs attention", "major-gaps":"Major gaps", "needs-verification":"Needs verification", "not-assessed":"No generated plan"};
    return {...analysis,state,label:labels[state],validation};
  }
  function filterKeys(analysis,id="all"){
    const category=analysis.categories.find(c=>c.id===id)||analysis.categories[0];return new Set(category?.entryKeys||[]);
  }
  const api=Object.freeze({analyse,evaluate,filterKeys,metricState,classifyCard:identity.inspect,label:identity.label});
  if(common)module.exports=api;else root.ManaScoutDeckHealth=api;
})(typeof window==="undefined"?globalThis:window);
