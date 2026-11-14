import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('D1 schema is repeatable and preserves existing license rows',()=>{
  const db=new DatabaseSync(':memory:');
  const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
  db.exec(schema);
  db.prepare('INSERT INTO devices(device_hash,public_key,created_ms) VALUES(?,?,?)').run('a'.repeat(64),'public-key',1);
  db.prepare('INSERT INTO license_cards(id,code_hash,last_four,issued_ms) VALUES(?,?,?,?)').run('card-1','hash-1','ABCD',2);
  db.exec(schema);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM devices').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM license_cards').get().n,1);
  for(const table of ['license_applications','products','orders','payment_events','delivery_outbox','public_content','public_content_history']){
    const found=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    assert.ok(found,table+' table exists');
  }
  db.close();
});
