const {test}=require('node:test'),assert=require('node:assert/strict');
const identity=require('../assets/js/deck-identity.js');
const inspect=(name,text,type='Enchantment')=>identity.inspect({name,frontType:type,rulesText:text,manaValue:2});

test('Underworld Breach retains escape/recursion without inventing land roles',()=>{
 const c=inspect('Underworld Breach',"Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\nAt the beginning of the end step, sacrifice this enchantment.");
 for(const role of ['recursion','gravePayoff'])assert.ok(c.roles.includes(role),role);
 for(const role of ['landPayoff','landRamp','landRecursion','additionalLand'])assert.ok(!c.roles.includes(role),role);
});
for(const [name,text,roles]of [
 ['Crucible of Worlds','You may play lands from your graveyard.',['landPayoff','landRecursion','recursion']],
 ['Life from the Loam','Return up to three target land cards from your graveyard to your hand.',['landPayoff','landRecursion','recursion']],
 ['Lotus Cobra','Landfall — Whenever a land you control enters, add one mana of any color.',['landPayoff','ramp']],
 ['Exploration','You may play an additional land on each of your turns.',['additionalLand','ramp']]
])test(`${name}: genuine land mechanics retain their evidenced roles`,()=>{
 const c=inspect(name,text);for(const role of roles)assert.ok(c.roles.includes(role),role);
});
test('Eternal Witness is graveyard recursion without land-specific claims',()=>{
 const c=inspect('Eternal Witness','When this creature enters, you may return target card from your graveyard to your hand.','Creature — Human Shaman');
 assert.ok(c.roles.includes('recursion'));assert.ok(c.roles.includes('gravePayoff'));
 for(const role of ['landPayoff','landRamp','landRecursion'])assert.ok(!c.roles.includes(role),role);
});
test('synthetic nonland boundaries cannot become land search, landfall or land recursion',()=>{
 for(const text of ['Search your library for a nonland card, reveal it, put it into your hand, then shuffle.','Whenever a nonland permanent enters, draw a card.','You may play nonland cards from your graveyard.','Return target nonland card from your graveyard to your hand.']){
  const c=inspect('Synthetic boundary case',text);
  for(const role of ['landPayoff','landRamp','landRecursion','additionalLand'])assert.ok(!c.roles.includes(role),text+' / '+role);
 }
 const search=inspect('Synthetic search','Search your library for a nonland card, put it into your hand, then shuffle.');
 assert.ok(search.roles.includes('tutor'));assert.ok(!search.roles.includes('ramp'));
});
