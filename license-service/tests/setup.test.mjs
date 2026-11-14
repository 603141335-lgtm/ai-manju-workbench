import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDatabaseList,renderLocalConfig} from '../scripts/setup-cloudflare.mjs';
test('database list can find existing D1 without creating duplicates',()=>{
 const rows=parseDatabaseList('[{"name":"dudu-license","uuid":"123e4567-e89b-12d3-a456-426614174000"}]');
 assert.equal(rows[0].id,'123e4567-e89b-12d3-a456-426614174000');
 assert.throws(()=>parseDatabaseList('bad response'),/Wrangler/);
});
test('local D1 config never accepts injected IDs',()=>{
 const original='database_id = "REPLACE_WITH_YOUR_D1_ID"';
 assert.equal(renderLocalConfig(original,'123e4567-e89b-12d3-a456-426614174000'),'database_id = "123e4567-e89b-12d3-a456-426614174000"');
 assert.throws(()=>renderLocalConfig(original,'x"; DROP TABLE'),/UUID/);
});