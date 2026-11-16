/* Version 1 bounded product events. Default is a no-op: no provider, network,
 * storage, identifiers, timestamps, event queue or automatic merchant hooks. */
((root)=>{
  'use strict';
  const GUIDES=Object.freeze(["ancient-tomb", "arcane-signet", "birds-of-paradise", "black-lotus", "brainstorm", "captain-jean-luc-picard", "cavern-of-souls", "chrome-mox", "command-tower", "counterspell", "cyclonic-rift", "dark-ritual", "deflecting-swat", "demonic-consultation", "demonic-tutor", "dockside-extortionist", "doubling-season", "edgar-markov", "enlightened-tutor", "esper-sentinel", "fierce-guardianship", "force-of-will", "gaeas-cradle", "grim-monolith", "jace-the-mind-sculptor", "jeskas-will", "jeweled-lotus", "lightning-bolt", "lightning-greaves", "living-death", "lotus-petal", "mana-crypt", "mana-drain", "mana-vault", "mox-diamond", "mox-opal", "mr-spock-science-officer", "mystic-remora", "mystic-sanctuary", "mystical-tutor", "necropotence", "orcish-bowmasters", "path-to-exile", "rhystic-study", "senseis-divining-top", "skullclamp", "smaug-wicked-worm", "smothering-tithe", "sol-ring", "swan-song", "swords-to-plowshares", "teferis-protection", "the-great-henge", "the-one-ring", "the-theorist-jace-beleren", "thoughtseize", "urzas-saga", "vampiric-tutor", "worldly-tutor"]);
  const FORMATS=Object.freeze(["commander", "standard", "pioneer", "modern", "legacy", "vintage", "pauper", "oathbreaker", "standard_arena", "pioneer_arena", "alchemy", "historic", "timeless", "standardbrawl", "brawl", "gladiator"]);

  const FINISHES=['nonfoil','foil','etched','unknown'];
  const count=n=>Number.isSafeInteger(n)&&n>=1&&n<=4;
  const oneOf=values=>v=>typeof v==='string'&&values.includes(v);
  const guide=oneOf(['none',...GUIDES]);
  const schemas=Object.freeze({
    search_success:{surface:oneOf(['home','guide']),exact_printing:v=>typeof v==='boolean'},
    guide_compare_start:{guide,selection_count:count},
    comparison_save:{selection_count:count,storage:oneOf(['browser','memory'])},
    comparison_share:{selection_count:count,method:oneOf(['clipboard','manual'])},
    deck_import_complete:{import_format:oneOf(['text','csv','json']),deck_format:oneOf(FORMATS)},
    deck_export:{export_format:oneOf(['txt','csv','json']),deck_format:oneOf(FORMATS),method:oneOf(['download','clipboard','manual'])},
    merchant_exit:{merchant:()=>false,guide,exact_printing:v=>typeof v==='boolean',finish:oneOf(FINISHES)}
  });
  for(const schema of Object.values(schemas))Object.freeze(schema);
  function createTracker({adapter=null,merchants=[]}={}){
    // No approved production merchants. Future adapter/allowlist changes require review.
    const approved=new Set(Array.isArray(merchants)?merchants.filter(v=>typeof v==='string'&&/^[a-z][a-z0-9_\-]{0,31}$/.test(v)):[]);
    function validate(event,properties){
      try{
        if(!Object.hasOwn(schemas,event)||!properties||typeof properties!=='object'||Array.isArray(properties))return null;
        const proto=Object.getPrototypeOf(properties);if(proto!==null&&proto!==Object.prototype)return null;
        const schema=schemas[event],keys=Reflect.ownKeys(properties);
        if(keys.length!==Object.keys(schema).length||keys.some(k=>!Object.hasOwn(schema,k)))return null;
        const safe={};for(const k of Object.keys(schema)){
          const desc=Object.getOwnPropertyDescriptor(properties,k);if(!desc||!Object.hasOwn(desc,'value'))return null;
          const value=desc.value;if(k==='merchant'&&event==='merchant_exit'?!approved.has(value):!schema[k](value))return null;
          safe[k]=value;
        }
        return Object.freeze({version:1,event,properties:Object.freeze(safe)});
      }catch{return null;}
    }
    function track(event,properties){
      const payload=validate(event,properties);if(!payload||typeof adapter!=='function')return false;
      try{const result=adapter(payload);if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});return true;}catch{return false;}
    }
    function guideSlug(){try{const match=root.location?.pathname?.match(/^\/card\/([a-z0-9-]+)\/$/);return match&&GUIDES.includes(match[1])?match[1]:'none';}catch{return 'none';}}
    function trackMerchantExit(input){
      try{
        if(!input||typeof input!=='object')return false;
        const {merchant,guide:slug='none',printingId='',finish='unknown'}=input;
        if(printingId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(printingId))return false;
        return track('merchant_exit',{merchant,guide:slug,exact_printing:!!printingId,finish});
      }catch{return false;}
    }
    return Object.freeze({track,guide:guideSlug,trackMerchantExit});
  }
  if(typeof module==='object'&&module.exports)module.exports=Object.freeze({createTracker,GUIDES,FORMATS,schemas});
  else root.ManaScoutAnalytics=createTracker();
})(typeof window==='undefined'?globalThis:window);
