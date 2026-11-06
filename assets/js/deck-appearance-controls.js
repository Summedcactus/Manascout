/* Compact, progressively disclosed bulk-appearance UI. Holds one preview and one undo. */
((root)=>{
  "use strict";
  function create({client,getDeck,onApply,onError,beforeStart,capture,restore}) {
    const api=root.ManaScoutDeckAppearance,view=root.ManaScoutDeckView,$=id=>document.getElementById(id),panel=$("deck-appearance");
    let job=null,plan=null,lastUndo=null;
    const live=j=>job===j&&!j.controller.signal.aborted&&getDeck()===j.source;
    const status=text=>{$("appearance-status").textContent=text;};
    $("appearance-preset").replaceChildren(...api.profiles.map(p=>{const o=view.node("option","",p.label);o.value=p.id;return o;}));
    function tip(){ $("appearance-explanation").textContent=api.profile($("appearance-preset").value)?.description||"Choose a printing style."; }
    function sync() {
      const deck=getDeck(),progress=api.progress(deck),paper=root.ManaScoutDeckFormats.get(deck.format)?.platform==="paper";
      panel.hidden=!deck.entries.length;
      $("appearance-progress").textContent=`Printings customised: ${progress.customised} / ${progress.total} copies`;
      $("appearance-history").textContent=`All zones, counted by copies. ${progress.manual} manual · ${progress.bulk} bulk · ${progress.unknown} with unknown earlier history. Default/generated editions do not count as customised.`;
      if(lastUndo&&(lastUndo.before.id!==deck.id||lastUndo.before.format!==deck.format||lastUndo.after!==api.fingerprint(deck)))lastUndo=null;
      $("appearance-platform").hidden=paper;$("appearance-preview").disabled=!paper||!!job;
      $("appearance-apply").disabled=!paper||!!job||!plan?.changes.length;
      $("appearance-cancel").hidden=!job&&!plan;
      $("appearance-undo").hidden=!lastUndo;$("appearance-undo").disabled=!!job||!paper;
      panel.setAttribute("aria-busy",String(!!job));
    }
    function cancel(reason="") {
      const had=!!job||!!plan;job?.controller.abort();job=null;plan=null;$("appearance-review").hidden=true;
      if(had&&reason)status(reason);sync();
    }
    function review(result) {
      $("appearance-review").hidden=false;
      const commanders=result.source.entries.filter(e=>e.zone==="commander"),changedCommanders=result.changes.filter(c=>commanders.some(e=>e.key===c.key)).length;
      $("appearance-summary").textContent=`${result.changedCopies} copies will change · ${result.unchangedCopies} kept current. Command zone: ${changedCommanders} / ${commanders.length} entries will change. Construction: ${result.validation.label}.`;
      const reasons=new Map();for(const e of result.kept)reasons.set(e.reason,(reasons.get(e.reason)||0)+e.copies);
      $("appearance-kept").replaceChildren(...[...reasons].map(([reason,n])=>view.node("li","",`${n} copies: ${reason}`)));
      $("appearance-examples").replaceChildren(...result.changes.slice(0,5).map(c=>{const entry=result.source.entries.find(e=>e.key===c.key),old=result.source.cards[entry.printingId];return view.node("li","",`${entry.quantity} × ${old.name}: ${old.setCode} #${old.collectorNumber} ${entry.finish} → ${c.card.setCode} #${c.card.collectorNumber} ${c.finish}`);}));
    }
    for(const id of ["appearance-preset","appearance-include-manual","appearance-include-unknown"])$(id).addEventListener("change",()=>{cancel("Settings changed. Prepare a new appearance preview.");tip();});
    $("appearance-cancel").addEventListener("click",()=>{cancel("Cancelled. Existing deck printings are unchanged.");$("appearance-preview").focus({preventScroll:true});});
    $("appearance-preview").addEventListener("click",async()=>{
      cancel();beforeStart();const source=getDeck(),j={source,controller:new AbortController(),position:capture()};job=j;sync();status("Preparing appearance preview…");
      try {
        const result=await api.preview(source,$("appearance-preset").value,{client,signal:j.controller.signal,includeManual:$("appearance-include-manual").checked===true,includeUnknown:$("appearance-include-unknown").checked===true,onProgress:text=>{if(live(j))status(text);}});
        if(!live(j))return;plan=result;plan.position=j.position;review(result);status(result.changedCopies?"Preview ready. Your deck is unchanged until Apply to deck.":"No eligible changes. Review the kept/protected choices below.");
      }catch(error){if(live(j)&&error.name!=="AbortError"){status(error.message);onError(error);}}
      finally{if(job===j){job=null;sync();}}
    });
    $("appearance-apply").addEventListener("click",async()=>{
      if(job||!plan?.changes.length)return;const pending=plan,source=getDeck();if(source!==pending.source){cancel("Deck changed. Prepare a new preview.");return;}
      const j={source,controller:new AbortController(),position:pending.position};job=j;sync();status("Rechecking the exact candidate before applying…");
      try {
        const ready=await api.apply(pending,source,{client,signal:j.controller.signal});if(!live(j))return;
        onApply(ready,{source,position:j.position});lastUndo={before:source,after:api.fingerprint(getDeck())};plan=null;$("appearance-review").hidden=true;
        job=null;panel.open=false;restore(j.position);status(`Appearance applied to ${ready.changedCopies} copies. ${ready.unchangedCopies} kept current. Undo restores the previous appearance.`);sync();
      }catch(error){if(live(j)&&error.name!=="AbortError"){status(error.message);onError(error);}}
      finally{if(job===j){job=null;sync();}}
    });
    $("appearance-undo").addEventListener("click",async()=>{
      if(job||!lastUndo)return;plan=null;$("appearance-review").hidden=true;beforeStart();const previous=lastUndo,source=getDeck(),j={source,controller:new AbortController(),position:capture()};job=j;sync();status("Verifying the previous exact printings…");
      try {
        const ready=await api.undo(source,previous.before,previous.after,{client,signal:j.controller.signal});if(!live(j))return;
        onApply(ready,{source,position:j.position});lastUndo=null;job=null;panel.open=false;restore(j.position);status("Previous printing/finish choices restored. Other deck settings are preserved.");sync();
      }catch(error){if(live(j)&&error.name!=="AbortError"){status(error.message);onError(error);}}
      finally{if(job===j){job=null;sync();}}
    });
    panel.addEventListener("toggle",()=>{if(!panel.open){if(job)cancel("Appearance preparation stopped when the panel closed. Deck unchanged.");if(panel.contains(document.activeElement)&&document.activeElement!==panel.querySelector("summary"))panel.querySelector("summary").focus({preventScroll:true});}});
    tip();sync();return Object.freeze({sync,cancel});
  }
  root.ManaScoutDeckAppearanceControls=Object.freeze({create});
})(typeof window==="undefined"?globalThis:window);
