/* Synthetic fixtures only; no printing facts, prices or real legality claims. */
const data = require('../../assets/js/deck-data.js');
const id = n => `${n.toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`;
const raw = (n=1,extra={}) => ({ object:'card', id:id(n), oracle_id:id(n+1000), name:`Fixture ${n}`, type_line:'Artifact', cmc:0, colors:[], color_identity:[], finishes:['nonfoil','foil'], games:['paper'], oversized:false,layout:'normal',border_color:'black',legalities:{ commander:'legal',pauper:'legal' }, set:'tst',set_name:'Synthetic Test Set',collector_number:String(n),lang:'en',oracle_text:'Synthetic fixture text.',image_uris:{ normal:`https://cards.scryfall.io/${n}.jpg` }, ...extra });
const card = (n=1,extra={}) => data.normaliseCard(raw(n,extra),{id:id(n)});
module.exports = { id, raw, card };
