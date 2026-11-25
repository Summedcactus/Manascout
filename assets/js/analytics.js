/* Bounded aggregate product events. Disabled unless explicit public configuration
 * enables a provider on the canonical production host. No queues, storage or IDs. */
((root)=>{
  'use strict';
  const catalogue=typeof module==='object'&&module.exports ? require('./guide-catalogue.js') : root.ManaScoutGuideCatalogue;
  const GUIDES=catalogue?.slugs || Object.freeze([]);
  const FORMATS=Object.freeze(["commander", "standard", "pioneer", "modern", "legacy", "vintage", "pauper", "oathbreaker", "standard_arena", "pioneer_arena", "alchemy", "historic", "timeless", "standardbrawl", "brawl", "gladiator"]);
  const STYLES=Object.freeze(["auto", "tribal", "other", "artifacts", "tokens", "aristocrats", "sacrifice", "spellslinger", "graveyard", "lands", "landfall", "voltron", "counters", "lifegain", "blink", "enchantments", "vehicles", "treasure", "clues", "food", "poison", "discard", "aggro", "control", "ramp", "combo", "value"]);
  const SOURCES=Object.freeze(['nav','guide','cotw','home','direct','import','unknown']);
  const FINISHES=['nonfoil','foil','etched','unknown'];
  const oneOf=values=>v=>typeof v==='string'&&values.includes(v);
  const bool=v=>typeof v==='boolean';
  const integer=(min,max)=>v=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  const guide=oneOf(['none',...GUIDES]),count=integer(1,4),week=integer(1,5200);
  const schemas=Object.freeze({
    search_success:{surface:oneOf(['home','guide']),exact_printing:bool,
      search_type:oneOf(['name','exact_printing','set','collector_number','rarity','artist','type','colour','combined']),
      result_band:oneOf(['one','few','many'])},
    exact_printing_select:{source:oneOf(['search','guide','comparison','cotw','unknown']),
      language_group:oneOf(['english','other']),finish:oneOf(FINISHES)},
    guide_compare_start:{guide,selection_count:count},
    printing_table_select:{table:oneOf(['search','archive']),surface:oneOf(['home','guide'])},
    finish_switch:{surface:oneOf(['home','guide','deck'])},
    printing_difference_expand:{surface:oneOf(['guide'])},
    comparison_save:{selection_count:count,storage:oneOf(['browser','memory'])},
    comparison_share:{selection_count:count,method:oneOf(['clipboard','manual'])},
    deck_import_complete:{import_format:oneOf(['text','csv','json']),deck_format:oneOf(FORMATS)},
    deck_export:{export_format:oneOf(['txt','csv','json']),deck_format:oneOf(FORMATS),method:oneOf(['download','clipboard','manual'])},
    cotw_inspect:{week,guide_available:bool,exact_printing:bool},
    cotw_deck_start:{week,exact_printing:bool,commander_seeded:bool},
    deck_studio_open:{source:oneOf(SOURCES)},
    guide_deck_start:{guide:oneOf(GUIDES),commander_seeded:bool},
    deck_generation_start:{deck_format:oneOf(FORMATS),primary_style:oneOf(STYLES),commander_seeded:bool,bracket_selected:integer(1,5)},
    deck_generation_complete:{deck_format:oneOf(FORMATS),primary_style:oneOf(STYLES),commander_seeded:bool,result:oneOf(['success','failure','cancelled'])},
    merchant_exit:{merchant:()=>false,guide,exact_printing:bool,finish:oneOf(FINISHES)}
  });
  for(const schema of Object.values(schemas))Object.freeze(schema);
  const MAPPING=Object.freeze({search_success:'Search Success',exact_printing_select:'Exact Printing Select',guide_compare_start:'Compare Started',printing_table_select:'Printing Table Select',finish_switch:'Finish Switch',printing_difference_expand:'Printing Difference Expand',comparison_save:'Comparison Save',comparison_share:'Comparison Share',deck_import_complete:'Deck Import Complete',deck_export:'Deck Export',cotw_inspect:'COTW Inspect',cotw_deck_start:'COTW Deck Start',deck_studio_open:'Deck Studio Open',guide_deck_start:'Guide Deck Start',deck_generation_start:'Deck Generation Start',deck_generation_complete:'Deck Generation Complete',merchant_exit:'Merchant Exit'});
  function validate(event,properties,approved=new Set()){
    try{
      if(typeof event!=='string'||!Object.hasOwn(schemas,event)||!properties||typeof properties!=='object'||Array.isArray(properties))return null;
      const proto=Object.getPrototypeOf(properties);if(proto!==null&&proto!==Object.prototype)return null;
      const schema=schemas[event],keys=Reflect.ownKeys(properties);
      const legacySearch=event==='search_success'&&!keys.includes('search_type')&&!keys.includes('result_band');
      const required=legacySearch?['surface','exact_printing']:Object.keys(schema);
      if(keys.length!==required.length||keys.some(k=>!required.includes(k)))return null;
      const safe={};for(const k of required){
        const desc=Object.getOwnPropertyDescriptor(properties,k);if(!desc||!Object.hasOwn(desc,'value'))return null;
        const value=desc.value;if(k==='merchant'&&event==='merchant_exit'?!approved.has(value):!schema[k](value))return null;
        safe[k]=value;
      }
      return Object.freeze({version:1,event,properties:Object.freeze(safe)});
    }catch{return null;}
  }
  function createTracker({adapter=null,merchants=[]}={}){
    // Production never supplies approved merchants in this release.
    const approved=new Set(Array.isArray(merchants)?merchants.filter(v=>typeof v==='string'&&/^[a-z][a-z0-9_\-]{0,31}$/.test(v)):[]);
    function track(event,properties){
      const payload=validate(event,properties,approved);if(!payload||typeof adapter!=='function')return false;
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
  function canonicalPath(path){
    if(typeof path!=='string')return null;
    if(['/', '/card/', '/deck/', '/contact/', '/privacy/', '/terms/'].includes(path))return path;
    const m=path.match(/^\/card\/([a-z0-9-]+)\/$/);return m&&GUIDES.includes(m[1])?path:null;
  }
  function createPlausibleAdapter(config={},environment=root){
    try{
      const location=environment.location;
      if(config.enabled!==true||config.provider!=='plausible'||config.domain!=='manascout.co.uk'||location?.protocol!=='https:'||!['manascout.co.uk','www.manascout.co.uk'].includes(location.hostname)||typeof environment.fetch!=='function')return null;
      if(!canonicalPath(location.pathname)||environment.navigator?.globalPrivacyControl===true||environment.navigator?.doNotTrack==='1')return null;
      // Construct page identity from the explicit route allowlist. Never read href,
      // search/hash, local storage, cookies or arbitrary DOM state into a request.
      const url='https://manascout.co.uk'+canonicalPath(location.pathname);
      function send(name,props){
        const body={name,domain:config.domain,url};if(props)body.props=props;
        // External source origin only: no referrer path, credentials, query or hash.
        try{const r=new URL(environment.document?.referrer||'');if(['http:','https:'].includes(r.protocol)&&/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(r.hostname)&&!['manascout.co.uk','www.manascout.co.uk'].includes(r.hostname))body.referrer=r.origin+'/';}catch{}
        try{const result=environment.fetch('https://plausible.io/api/event',{method:'POST',headers:{'Content-Type':'text/plain'},credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,body:JSON.stringify(body)});Promise.resolve(result).catch(()=>{});return true;}catch{return false;}
      }
      const adapter=payload=>{try{const safe=payload?.version===1&&validate(payload.event,payload.properties);if(!safe||safe.event==='merchant_exit')return false;return send(MAPPING[safe.event],safe.properties);}catch{return false;}};
      adapter.pageview=()=>send('pageview');return Object.freeze(adapter);
    }catch{return null;}
  }
  function createDebugAdapter(config={},environment=root){
    try {
    if(config.enabled!==true||config.provider!=='debug'||config.debug!==true||!['localhost','127.0.0.1','[::1]'].includes(environment.location?.hostname))return null;
    return payload=>{try{const safe=payload?.version===1&&validate(payload.event,payload.properties);if(!safe)return false;environment.console?.info('[ManaScout event]',safe.event,safe.properties);return true;}catch{return false;}};
    }catch{return null;}
  }
  if(typeof module==='object'&&module.exports)module.exports=Object.freeze({createTracker,createPlausibleAdapter,createDebugAdapter,canonicalPath,GUIDES,FORMATS,STYLES,SOURCES,schemas,MAPPING});
  else {
    const config=root.ManaScoutAnalyticsConfig||{};
    const adapter=createPlausibleAdapter(config)||createDebugAdapter(config);
    root.ManaScoutAnalytics=createTracker({adapter});
    // One canonical pageview per document load, no automatic SPA/history observers.
    if(adapter?.pageview)adapter.pageview();
  }
})(typeof window==='undefined'?globalThis:window);
