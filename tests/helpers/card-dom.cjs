/* Minimal DOM double for the production card renderer, not a layout engine. */
function dom(){
 let document;const observers=[],timers=new Map();let timerId=0;
 const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 const dataKey=k=>k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.parentElement=null;this.attributes={};this.dataset={};this.listeners={};this.disabled=false;this.hidden=false;this.complete=false;this.naturalWidth=0;this._text='';this.style={setProperty:(k,v)=>this.style[k]=v};}
  get isConnected(){return this===document.body||!!this.parentElement?.isConnected;}
  get className(){return this.attributes.class||'';} set className(v){this.attributes.class=v;}
  get src(){return this.attributes.src||'';} set src(v){this.attributes.src=v;}
  get value(){if(this._value!==undefined)return this._value;if(this.tagName==='select')return (this.querySelector('option[selected]')||this.querySelector('option'))?.value||'';return this.attributes.value||this.textContent;}
  set value(v){this._value=String(v);}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}set textContent(v){this.replaceChildren();this._text=String(v);}
  set innerHTML(v){this.replaceChildren();const stack=[this],voids=new Set(['img','input','br','hr','meta','link']);for(const match of String(v).matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)){const t=match[0];if(t.startsWith('</')){stack.pop();continue;}if(!t.startsWith('<')){stack.at(-1)._text+=decode(t);continue;}const tag=t.match(/^<([\w-]+)/)[1],e=new Element(tag);for(const a of t.slice(tag.length+1,-1).matchAll(/([\w:-]+)(?:="([^"]*)")?/g))e.setAttribute(a[1],decode(a[2]??''));stack.at(-1).append(e);if(!voids.has(tag))stack.push(e);}}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const c of this.children)c.parentElement=null;this.children=[];this._text='';this.append(...nodes);}
  setAttribute(k,v){this.attributes[k]=String(v);if(k.startsWith('data-'))this.dataset[dataKey(k)]=String(v);if(k==='disabled')this.disabled=true;}
  getAttribute(k){return k.startsWith('data-')?this.dataset[dataKey(k)]??null:this.attributes[k]??null;}
  matches(s){const attrs=[...s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)],base=s.replace(/\[[^\]]*\]/g,'');if(base.match(/^[a-z][\w-]*/)?.[0] && this.tagName!==base.match(/^[a-z][\w-]*/)[0])return false;for(const c of base.matchAll(/\.([\w-]+)/g))if(!this.className.split(/\s+/).includes(c[1]))return false;const id=base.match(/#([\w-]+)/)?.[1];if(id && this.getAttribute('id')!==id)return false;return attrs.every(([,k,v])=>this.getAttribute(k)!==null&&(v===undefined||this.getAttribute(k)===v));}
  querySelectorAll(selector){const out=[];for(const s of selector.split(',').map(s=>s.trim())){const parts=s.split(/\s+/),last=parts.pop();const visit=e=>{for(const c of e.children){if(c.matches(last)){let p=c.parentElement,valid=true;for(const part of [...parts].reverse()){while(p&&!p.matches(part))p=p.parentElement;if(!p){valid=false;break;}p=p.parentElement;}if(valid&&!out.includes(c))out.push(c);}visit(c);}};visit(this);}return out;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  closest(selector){for(let p=this;p;p=p.parentElement)if(selector.split(',').some(s=>p.matches(s.trim())))return p;return null;}
  contains(n){for(;n;n=n.parentElement)if(n===this)return true;return false;}
  addEventListener(t,fn){(this.listeners[t]||=new Set()).add(fn);}
  removeEventListener(t,fn){this.listeners[t]?.delete(fn);}
  async emit(t,extra={}){const event={target:this,preventDefault(){},...extra};for(let p=this;p;p=p.parentElement)for(const fn of [...p.listeners[t]||[]])await fn(event);for(const fn of [...document.listeners[t]||[]])await fn(event);}
  focus(){document.activeElement=this;}
  decode(){return this.failDecode?Promise.reject(Error('Decode failed')):Promise.resolve();}
  getBoundingClientRect(){return {left:0,top:0,width:300,height:420};}
 }
 document={listeners:{},hidden:false,createElement:t=>new Element(t),addEventListener(t,fn){(this.listeners[t]||=new Set()).add(fn);}};document.body=new Element('body');document.getElementById=id=>document.body.querySelector('#'+id);
 class Observer {constructor(callback){this.callback=callback;this.observed=new Set();observers.push(this);}observe(e){this.observed.add(e);}unobserve(e){this.observed.delete(e);}deliver(e,visible){this.callback([{target:e,isIntersecting:visible}]);}}
 return {document,Element,observers,IntersectionObserver:Observer,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},timeouts(){for(const [id,t] of [...timers]){timers.delete(id);t.fn();}},async loaded(image){image.complete=true;image.naturalWidth=488;await image.emit('load');},timers};
}
module.exports={dom};
