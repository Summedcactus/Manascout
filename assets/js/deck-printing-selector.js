/* Dedicated printing drawer. Catalogue browsing is transient UI; edits use DeckPrintings. */
((root) => {
  "use strict";
  function create({client,getDeck,onApply,onError,capture,restore,fallbackFocus}) {
    const api=root.ManaScoutDeckPrintings,view=root.ManaScoutDeckView,$=id=>document.getElementById(id),dialog=$("printing-selector");
    let session=null;
    const live=s=>session===s&&dialog.open&&getDeck()===s.deck;
    function finish(s) {
      if(session!==s)return;
      session=null;s.request?.abort();s.applyRequest?.abort();
      restore(s.position);
      const target=[...$("deck-entries").querySelectorAll('button[data-action="change-printing"]')].find(button=>button.dataset.key===(s.returnKey||s.key)&&button.getClientRects().length);
      (target||fallbackFocus())?.focus({preventScroll:true});
    }
    function close() {const s=session;if(s)finish(s);if(dialog.open)dialog.close();}
    $("printing-close").addEventListener("click",close);
    dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
    dialog.addEventListener("close",()=>{if(!dialog.open&&session)finish(session);});
    dialog.addEventListener("click",event=>{
      if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();
      if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();
    });
    function filters(){return {finish:$("printing-filter-finish").value,set:$("printing-filter-set").value,treatment:$("printing-filter-treatment").value};}
    function choice(s,card,finish=s.finish) {
      s.chosen=card;s.face=0;
      s.finish=card.availableFinishes.includes(finish)?finish:card.availableFinishes.includes("nonfoil")?"nonfoil":card.availableFinishes[0]||"";
      $("printing-selected-name").textContent=card.name;
      $("printing-selected-meta").textContent=`${card.setName} · ${card.setCode} #${card.collectorNumber}`;
      $("printing-current-marker").textContent=`In deck: ${s.original.setCode} #${s.original.collectorNumber} · ${api.finishLabel(s.entry.finish)}. ${card.id===s.original.id&&s.finish===s.entry.finish?"Current selection.":"Preview only."}`;
      const finishSelect=$("printing-finish");finishSelect.replaceChildren(...card.availableFinishes.map(value=>{const o=view.node("option","",api.finishLabel(value));o.value=value;return o;}));finishSelect.value=s.finish;
      finishSelect.hidden=card.availableFinishes.length<2;$("printing-finish-label").hidden=finishSelect.hidden;
      $("printing-single-finish").hidden=!finishSelect.hidden;$("printing-single-finish").textContent=api.finishLabel(s.finish);
      $("printing-apply").disabled=!s.finish||s.loading||s.applying;
      paintFace(s);mark(s);
    }
    function paintFace(s) {
      const card=s.chosen,image=card.images[s.face],img=$("printing-selected-image");img.hidden=!image;
      if(image){img.src=image.url;img.alt=image.name||card.name;}else img.removeAttribute("src");
      $("printing-face").hidden=card.images.length<2;$("printing-face").textContent=`Face ${s.face+1} / ${card.images.length} · Next face`;
      $("printing-face").setAttribute("aria-label",`View next artwork face of ${card.name}`);
    }
    $("printing-selected-image").addEventListener("error",()=>{$("printing-selected-image").hidden=true;});
    $("printing-face").addEventListener("click",()=>{if(session?.chosen.images.length>1){session.face=(session.face+1)%session.chosen.images.length;paintFace(session);}});
    function mark(s) {for(const b of $("printing-results").querySelectorAll('button[data-printing]'))b.setAttribute("aria-pressed",String(b.dataset.printing===s.chosen.id));}
    function render(s) {
      if(!live(s))return;
      const records=[...s.cards.values()],matching=api.filter(records,filters()),visible=matching.slice(0,s.limit);
      const active=$("printing-results").contains(document.activeElement)?document.activeElement.dataset.printing:"";
      $("printing-results").replaceChildren(...visible.map(card=>{
        const b=view.node("button","ds-printing-option");b.type="button";b.dataset.printing=card.id;
        b.setAttribute("aria-label",`Preview ${card.name}, ${card.setName}, ${card.setCode} #${card.collectorNumber}`);
        if(card.images[0]){const image=view.node("img");image.src=card.images[0].url;image.alt="";image.loading="lazy";image.width=160;image.height=224;b.append(image);}
        b.append(view.node("strong","",`${card.setCode} #${card.collectorNumber}`),view.node("span","",card.setName));
        const treatment=api.treatments(card).map(([,label])=>label).join(" · ");
        b.append(view.node("small","",[card.released!=="Not supplied"?card.released:"",treatment,card.language!=="Not supplied"?card.language:""].filter(Boolean).join(" · ")));
        b.append(view.node("small","",card.availableFinishes.map(api.finishLabel).join(" · ")));
        if(card.id===s.original.id)b.append(view.node("span","ds-printing-current","Current edition"));
        return b;
      }));mark(s);
      if(active)[...$("printing-results").querySelectorAll("button")].find(b=>b.dataset.printing===active)?.focus({preventScroll:true});
      $("printing-more").hidden=visible.length>=matching.length&&!s.next;
      $("printing-more").disabled=s.loading||s.applying;
      if(!s.loading&&!s.error)$("printing-status").textContent=`${s.catalogue.size} catalogue printings loaded${s.next?" · more available":" · all catalogue pages loaded"}. Showing ${visible.length} / ${matching.length} matching loaded editions; includes your saved edition.`;
    }
    $("printing-results").addEventListener("click",event=>{
      const b=event.target.closest("button[data-printing]"),s=session;if(!b||!s||s.applying)return;
      const card=s.cards.get(b.dataset.printing);if(card){choice(s,card);$("printing-apply-status").textContent="Preview only. Your deck changes when you choose Use this printing.";}
    });
    $("printing-finish").addEventListener("change",()=>{if(session&&!session.applying)choice(session,session.chosen,$("printing-finish").value);});
    for(const [id,event] of [["printing-filter-finish","change"],["printing-filter-set","input"],["printing-filter-treatment","change"]])$(id).addEventListener(event,()=>{if(session){session.limit=24;render(session);}});
    async function load(s,reset=false) {
      if(!live(s)||s.applying)return;
      s.request?.abort();const controller=new AbortController();s.request=controller;s.loading=true;s.error=false;s.retryReset=reset;
      $("printing-status").textContent="Loading same-card printings…";$("printing-retry").hidden=true;
      $("printing-results").setAttribute("aria-busy","true");$("printing-more").disabled=true;$("printing-apply").disabled=true;
      const page=reset?"":s.next;
      try {
        if(!client.printings)throw Error("Printing lookup is unavailable. Your current deck edition is preserved.");
        const result=await client.printings(s.original.oracleId,{format:s.deck.format,order:$("printing-sort").value,page,signal:controller.signal});
        if(!live(s)||s.request!==controller||controller.signal.aborted)return;
        if(result.cards.some(card=>card.oracleId!==s.original.oracleId))throw Error("The catalogue returned a different Oracle card. No deck entries changed.");
        if(result.nextPage&&(result.nextPage===page||(!reset&&s.pages.has(result.nextPage))))throw Error("The catalogue repeated a page. Retry the printing lookup.");
        if(reset){s.cards=new Map([[s.original.id,s.original]]);s.catalogue=new Set();s.pages=new Set();s.limit=24;}
        for(const card of result.cards){s.cards.set(card.id,card);s.catalogue.add(card.id);}
        s.pages.add(page);s.next=result.nextPage;s.limit=reset?24:s.limit+24;
      } catch(error) {
        if(live(s)&&s.request===controller&&error.name!=="AbortError"){s.error=true;$("printing-status").textContent=`${error.message} Your deck is unchanged.`;$("printing-retry").hidden=false;}
      } finally {
        if(live(s)&&s.request===controller){s.loading=false;$("printing-results").removeAttribute("aria-busy");$("printing-apply").disabled=!s.finish;render(s);}
      }
    }
    $("printing-more").addEventListener("click",()=>{
      const s=session;if(!s||s.loading)return;
      if(api.filter([...s.cards.values()],filters()).length>s.limit){s.limit+=24;render(s);}else if(s.next)void load(s);
    });
    $("printing-retry").addEventListener("click",()=>{if(session)void load(session,session.retryReset);});
    $("printing-sort").addEventListener("change",()=>{if(session)void load(session,true);});
    function lock(s,value) {
      s.applying=value;
      for(const id of ["printing-finish","printing-sort","printing-filter-finish","printing-filter-set","printing-filter-treatment","printing-retry","printing-more"])$(id).disabled=value;
    }
    $("printing-apply").addEventListener("click",async()=>{
      const s=session;if(!s||!live(s)||s.loading||s.applying)return;
      const controller=new AbortController();s.applyRequest=controller;lock(s,true);
      $("printing-apply").disabled=true;$("printing-apply-status").textContent="Checking this exact printing and finish…";
      try {
        const result=await api.prepare(s.deck,s.key,s.chosen.id,s.finish,{client,signal:controller.signal});
        if(!live(s)||controller.signal.aborted)return;
        s.returnKey=result.key;onApply(result,s);close();
      } catch(error) {
        if(live(s)&&error.name!=="AbortError"){ $("printing-apply-status").textContent=`${error.message} The saved deck printing is unchanged.`; onError?.(error); }
      } finally {if(session===s){lock(s,false);$("printing-apply").disabled=!s.finish;}}
    });
    function open(key,origin) {
      close();const deck=getDeck(),entry=deck.entries.find(entry=>entry.key===key),card=entry&&deck.cards[entry.printingId];
      if(!card?.oracleId)return;
      if(typeof dialog.showModal!=="function")throw Error("A current browser with dialog support is needed to choose printings.");
      session={deck,entry,key,original:card,chosen:card,finish:entry.finish,position:capture(),cards:new Map([[card.id,card]]),catalogue:new Set(),pages:new Set(),next:"",limit:24,face:0,loading:false,applying:false,error:false,origin};
      $("printing-title").textContent=`Printings · ${card.name}`;
      $("printing-context").textContent=`Edit the edition and finish of ${entry.quantity} × ${card.name} (${entry.zone}). Confirm to update your deck; browsing changes nothing.`;
      for(const id of ["printing-filter-finish","printing-filter-set","printing-filter-treatment"])$(id).value="";
      $("printing-sort").value="newest";$("printing-options").open=false;$("printing-apply-status").textContent="Previewing does not change your deck.";
      dialog.showModal();lock(session,false);$("printing-scroll").scrollTop=0;choice(session,card,entry.finish);render(session);void load(session,true);
    }
    return Object.freeze({open,cancel:close});
  }
  root.ManaScoutDeckPrintingSelector=Object.freeze({create});
})(typeof window==="undefined"?globalThis:window);
