/* Evaluate responsive CSS policy and space budgets. This is not a browser layout engine. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('assets/css/deck-studio.css','utf8').replace(/\/\*[^]*?\*\//g,'');
function parse(source,conditions=[]){const out=[];let pos=0;while(source.slice(pos).trim()){const open=source.indexOf('{',pos);let depth=1,end=open+1;while(depth&&end<source.length){depth+=(source[end]==='{')-(source[end]==='}');end++;}assert.equal(depth,0);const head=source.slice(pos,open).trim(),body=source.slice(open+1,end-1);if(head.startsWith('@media')||head.startsWith('@container'))out.push(...parse(body,[...conditions,head]));else if(!head.startsWith('@'))out.push({head,conditions,props:Object.fromEntries(body.split(';').filter(v=>v.trim()).map(v=>{const at=v.indexOf(':');return[v.slice(0,at).trim(),v.slice(at+1).trim()];}))});pos=end;}return out;}
const rules=parse(css);
function styles(selector,viewport,container=viewport){return Object.assign({},...rules.filter(r=>r.head===selector&&r.conditions.every(c=>{const width=c.startsWith('@container')?container:viewport;if(/prefers-reduced-motion/.test(c))return false;return [...c.matchAll(/(min|max)-width:\s*(\d+)px/g)].every(([,op,n])=>op==='min'?width>=Number(n):width<=Number(n));})).map(r=>r.props));}
function padding(props){return Number((props['padding-inline']||props.padding?.split(' ')[1]||props.padding?.split(' ')[0]||'0').replace('px',''));}
function clamp(value,vw){const [,a,b,c]=value.match(/clamp\((\d+)px,\s*(\d+)vw,\s*(\d+)px\)/);return Math.max(+a,Math.min(vw*(+b)/100,+c));}
function layout(viewport){
 const workspace=styles('.deck-studio .ds-workspace',viewport),mobile=viewport<=820;
 const outer=Math.min(viewport,1920)-2*padding(workspace);
 const center=mobile?outer:viewport<=1100?outer-260-12:outer-clamp(workspace['--ds-discover-width'],viewport)-clamp(workspace['--ds-stats-width'],viewport)-32;
 const canvas=styles('.deck-studio .ds-canvas',viewport);let innerPadding=padding(canvas);
 // Existing grouped tablet padding declaration applies to the canvas too.
 if(viewport>820&&viewport<=1100)innerPadding=18;
 const width=center-2-2*innerPadding;
 const base=styles('.deck-studio .ds-card-grid',viewport,width),art=styles('.deck-studio .ds-card-grid[data-view="artwork"]',viewport,width);
 const columns=Number((art['grid-template-columns']||base['grid-template-columns']).match(/repeat\((\d+)/)?.[1]||1),gap=Number(base.gap.replace('px',''));
 const card=(width-gap*(columns-1))/columns,entry=styles('.deck-studio .ds-deck-entry',viewport,width);
 return {width,columns,card,image:card-2*padding(entry)-2};
}
for(const [width,columns,minImage] of [[320,1,260],[360,2,140],[390,2,155],[430,2,175],[768,3,210],[820,4,175],[900,3,160],[1024,3,200],[1280,3,190],[1440,3,220],[1920,5,175]])test(`${width}px responsive space budget: ${columns} readable artwork columns, controls fit`,()=>{
 const result=layout(width);assert.equal(result.columns,columns,JSON.stringify(result));assert.ok(result.image>=minImage,JSON.stringify(result));assert.ok(result.card>=44+24+44+8+10,'Quantity row must fit without shrinking touch targets');
 const p=styles('.deck-studio .ds-card-grid[data-view="list"]',width,result.width);assert.equal(p['grid-template-columns'],'minmax(0,1fr)');
});
test('grid responds to available panel width, including expanded/collapsed desktop side panels',()=>{
 for(const [available,count]of [[280,1],[320,2],[550,2],[600,3],[800,4],[1000,5]]){const p=styles('.deck-studio .ds-card-grid[data-view="artwork"]',1440,available);assert.equal(Number(p['grid-template-columns']?.match(/repeat\((\d+)/)?.[1]||1),count);}
});
test('sticky filters share one horizontal track, while Health and cards have no vertical scrollport',()=>{
 const filter=styles('.deck-studio .ds-deck-filters',390),track=styles('.deck-studio .ds-filter-track',390),row=styles('.deck-studio .ds-filter-row',390);
 assert.equal(filter.position,'sticky');assert.equal(filter.top,'0');assert.equal(track['overflow-x'],'auto');assert.equal(row['overflow-x'],undefined);assert.equal(styles('.deck-studio .ds-health',390).position,undefined);
 for(const selector of ['.deck-studio .ds-canvas','.deck-studio .ds-card-grid','.deck-studio .ds-deck-entry']){const p=styles(selector,390);assert.ok(!['auto','scroll'].includes(p.overflow));assert.equal(p['max-height'],undefined);assert.equal(p.height,undefined);}
 assert.equal(styles('.deck-studio .ds-panel',390).height,'100%');assert.equal(styles('.deck-studio .ds-canvas',390)['min-height'],'0');
 const html=fs.readFileSync('deck/index.html','utf8');assert.ok(html.indexOf('id="deck-health"')<html.indexOf('id="deck-filters"'));assert.match(html,/class="ds-filter-track"[^]*?id="deck-filter-essential"[^]*?id="deck-filter-strategy"[^]*?<\/div>\s*<\/div>/);
});
test('card images preserve proportions and are not cropped; touch controls remain 44px at all widths',()=>{
 const art=styles('.deck-studio .ds-entry-preview img',390);assert.equal(art.height,'auto');assert.equal(art['object-fit'],'contain');assert.equal(art['aspect-ratio'],'5 / 7');
 for(const width of [320,360,390,430,768,1280])for(const selector of ['.deck-studio .ds-filter-chip','.deck-studio .ds-entry-controls button','.deck-studio .ds-entry-move','.deck-studio .ds-entry-preview'])assert.ok(parseFloat(styles(selector,width)['min-height'])>=44,selector+' '+width);
});
test('compact filters keep an unobscured keyboard target and the selected state; no sticky Health expansion',()=>{
 const p=styles('.deck-studio .ds-deck-entry',390);assert.ok(parseFloat(p['scroll-margin-block-start'])>=80);assert.ok(parseFloat(styles('.deck-studio .ds-deck',390)['scroll-padding-block-start'])>=80);assert.ok(styles('.deck-studio .ds-filter-chip[aria-pressed="true"]',390).background);assert.equal(styles('.deck-studio .ds-health',390).position,undefined);
});

test('Appearance remains collapsed, non-sticky and within mobile control space budgets',()=>{
 const html=fs.readFileSync('deck/index.html','utf8');assert.match(html,/<details class="ds-appearance" id="deck-appearance" hidden>/);assert.doesNotMatch(html,/<details[^>]+id="deck-appearance"[^>]*\bopen\b/);
 for(const width of [320,360,390,430,768,1280]){const panel=styles('.deck-studio .ds-appearance',width),actions=styles('.deck-studio .ds-appearance-actions',width);assert.equal(panel.position,undefined);assert.equal(panel['min-width'],'0');assert.equal(actions['flex-wrap'],'wrap');assert.ok(parseFloat(styles('.deck-studio .ds-appearance .ds-button',width)['min-height'])>=44);assert.ok(parseFloat(styles('.deck-studio .ds-appearance-check',width)['min-height'])>=44);assert.equal(styles('.deck-studio #appearance-preset',width).width,'100%');}
 assert.ok(html.indexOf('id="deck-appearance"')<html.indexOf('id="deck-filters"'));
});
