import test from 'node:test';
import assert from 'node:assert/strict';
import {newRequestId} from '../frontend/src/api.ts';
test('request ID uses randomUUID when available',()=>{assert.equal(newRequestId({randomUUID:()=> 'native'}),'native');});
test('insecure contexts use random bytes to form unique UUIDs',()=>{let n=0;const crypto={getRandomValues(a){a.fill(++n);return a;}};const a=newRequestId(crypto),b=newRequestId(crypto);assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.notEqual(a,b);});
test('without crypto request_id is omitted so the server can generate it',()=>{const payload=JSON.parse(JSON.stringify({request_id:newRequestId(null)}));assert(!('request_id' in payload));});
