import test from 'node:test';
import assert from 'node:assert/strict';
import {generatedProfileDrawing} from '../frontend/src/generatedProfile.ts';

test('reference-card drawing projects actual closed profile loops onto its plane',()=>{
 const profile={origin:[10,20,30],normal:[0,1,0],u:[1,0,0],loops:[[[10,20,30],[12,20,30],[10,20,28],[10,20,30]]]};
 const drawing=generatedProfileDrawing(profile);assert(drawing.startsWith('M'));assert(drawing.endsWith(' Z'));assert.equal((drawing.match(/L/g)||[]).length,3);
 const shift=[100,-50,80],translated={...profile,origin:profile.origin.map((v,i)=>v+shift[i]),loops:profile.loops.map(loop=>loop.map(p=>p.map((v,i)=>v+shift[i])))};
 assert.equal(generatedProfileDrawing(translated),drawing);
 const hole={...profile,loops:[...profile.loops,[[10.1,20,29.9],[10.2,20,29.9],[10.1,20,29.8],[10.1,20,29.9]]]};assert.equal((generatedProfileDrawing(hole).match(/ Z/g)||[]).length,2);
});
test('missing or invalid profiles never fabricate an illustrative corner',()=>{
 assert.equal(generatedProfileDrawing(null),null);assert.equal(generatedProfileDrawing({loops:[]}),null);
 assert.equal(generatedProfileDrawing({origin:[0,0,0],u:[1,0,0],normal:[0,0,1],loops:[[[0,0,0],[0,0,0]]]}),null);
});
