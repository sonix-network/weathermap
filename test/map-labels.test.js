import test from 'node:test';
import assert from 'node:assert/strict';
import {LABEL_POSITIONS,cardRect,overlaps,connector} from '../dist/map-labels.js';
test('all thirteen traffic cards, including capacity captions, have reserved non-overlapping space',()=>{
 assert.equal(LABEL_POSITIONS.length,13);const cards=LABEL_POSITIONS.map(cardRect);
 for(let i=0;i<cards.length;i++){assert.ok(cards[i].x>=20&&cards[i].x+cards[i].width<=980);assert.ok(cards[i].y>=30&&cards[i].y+cards[i].height<=620);for(let j=0;j<i;j++)assert.equal(overlaps(cards[i],cards[j],6),false,`Cards ${i+1} and ${j+1} overlap`);}
});
test('detached labels have leaders; cards on their own routes need no extra line',()=>{
 assert.equal(connector([100,100],[[0,100],[200,100]]),null);
 assert.deepEqual(connector([100,100],[[0,200],[200,200]]),[[100,125],[100,200]]);
});
