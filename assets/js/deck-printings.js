/* Same-Oracle exact-printing edits. Uses the existing model, client and construction rules. */
((root) => {
  "use strict";
  const dep = name => typeof module === "object" && module.exports ? require(`./deck-${name}.js`) : root[`ManaScoutDeck${name[0].toUpperCase()+name.slice(1)}`];
  const model=dep("model"), data=dep("data"), rules=dep("rules"), formats=dep("formats");
  const abort = () => { throw Object.assign(Error("Printing change cancelled."),{name:"AbortError"}); };
  const finishLabel = finish => ({nonfoil:"Nonfoil",foil:"Foil",etched:"Etched foil"})[finish] || "Unknown finish";
  function treatments(card) {
    const tags=[];
    if(card.borderColor==="borderless")tags.push(["borderless","Borderless"]);
    if(card.frameEffects?.includes("showcase"))tags.push(["showcase","Showcase"]);
    if(card.frameEffects?.includes("extendedart"))tags.push(["extendedart","Extended art"]);
    if(["1993","1997"].includes(card.frame))tags.push(["retro","Classic / retro frame"]);
    if(card.fullArt)tags.push(["fullart","Full art"]);
    const premium={surgefoil:"Surge foil",galaxyfoil:"Galaxy foil",halofoil:"Halo foil",textured:"Textured foil",serialized:"Serialized",confettifoil:"Confetti foil"};
    for(const token of card.promoTypes||[])if(premium[token])tags.push([token,premium[token]]);
    return tags;
  }
  function filter(cards,{finish="",set="",treatment=""}={}) {
    const query=set.trim().toLowerCase();
    return cards.filter(card=>(!finish||card.availableFinishes.includes(finish))&&(!query||`${card.setCode} ${card.setName}`.toLowerCase().includes(query))&&(!treatment||treatments(card).some(([key])=>key===treatment)));
  }
  function replace(deck,key,card,finish,client) {
    const next=model.replacePrinting(deck,key,card,finish);
    const original=deck.entries.find(entry=>entry.key===key),newKey=model.entryKey(card.id,finish,original.zone,original.assignedTo);
    const prohibited=new Set(["stale","missing-data","printing-data","legality","legality-unknown","printing","special-deck","meld","rebalanced","finish"]);
    const validation=rules.validate(next,client);
    const problem=validation.issues.find(issue=>issue.key===newKey&&prohibited.has(issue.code));
    if(problem)throw Error(problem.message);
    if(original.zone==="commander") {
      const profile=formats.get(deck.format);
      const eligible=rules.background(card)&&profile.eligibility==="commander" ? true : rules.leaderEligibility(card,profile,client.proof);
      if(eligible!==true)throw Error("This commander's eligibility needs current verification before changing its printing.");
    }
    return {deck:next,key:newKey,validation};
  }
  async function prepare(deck,key,id,finish,{client,signal}={}) {
    if(signal?.aborted)abort();
    const entry=deck.entries.find(entry=>entry.key===key);if(!entry)throw Error("That deck entry is no longer available.");
    const before=deck.cards[entry.printingId];
    const card=await client.printing({id,requestedFinish:finish,guide:before.guide},{signal,sameOracleAs:before});
    if(signal?.aborted)abort();
    if(!data.sameOracleCard(before,card))throw Error("The printing's Oracle identity or gameplay facts differ. Your deck has not changed; recheck current card data.");
    if(!client.isVerified(card))throw Error("This exact printing needs current verification. Your saved edition is preserved.");
    if(entry.zone==="commander"&&formats.get(deck.format).eligibility==="commander"&&!rules.background(card))await client.commanderEligibility(card,{signal});
    if(signal?.aborted)abort();
    return replace(deck,key,card,finish,client);
  }
  const api=Object.freeze({prepare,replace,filter,treatments,finishLabel});
  if(typeof module==="object"&&module.exports)module.exports=api;else root.ManaScoutDeckPrintings=api;
})(typeof window==="undefined"?globalThis:window);
