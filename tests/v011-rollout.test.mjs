import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {targetConfig,inspect,apply025,migrationName} from '../scripts/v011/database.mjs';
const host='ep-isolated-example.us-east-2.aws.neon.tech';
test('rollout refuses ambient DATABASE_URL, mismatched endpoints and pooled DDL connections',()=>{
 assert.throws(()=>targetConfig({DATABASE_URL:'postgres://production'}));
 const env={V011_NEON_BRANCH:'ernest-v011-test',V011_DATABASE_URL:`postgres://test:password@${host}/test?sslmode=require`,V011_EXPECTED_DB_HOST:host};
 assert.equal(targetConfig(env).host,host);
 assert.throws(()=>targetConfig({...env,V011_EXPECTED_DB_HOST:'ep-different.us-east-2.aws.neon.tech'}));
 assert.throws(()=>targetConfig({...env,V011_NEON_BRANCH:'production'}));
 assert.throws(()=>targetConfig({...env,V011_EXPECTED_DB_HOST:host.replace('example.','example-pooler.'),V011_DATABASE_URL:env.V011_DATABASE_URL.replace('example.','example-pooler.')}));
});
function adapter(conn){const sql=async(strings,...params)=>(await conn.query(strings.reduce((q,s,i)=>q+(i?`$${i}`:'')+s,''),params)).rows;sql.unsafe=source=>conn.exec(source);sql.begin=fn=>conn.transaction(tx=>fn(adapter(tx)));return sql;}
async function fixture(){const db=new PGlite();for(const f of(await readdir('migrations')).filter(f=>f.endsWith('.sql')&&f<migrationName&&f!=='022_boat_devices.sql').sort())await db.exec(await readFile('migrations/'+f,'utf8'));return db;}
test('existing cloned schema needs only 025; boat-device absence is not a blocker and historical migrations are not recorded',async()=>{
 const db=await fixture();try{
 const sql=adapter(db),before=await inspect(sql);assert.deepEqual(before.prerequisiteIssues,[]);assert.match(before.boatDevices.assessment,/absent/);assert.equal(before.migration025ObjectsPresent,false);
 await db.exec("INSERT INTO users(id) VALUES('11111111-1111-4111-8111-111111111111'); INSERT INTO assets(id,name,type,make,model,year,summary,owner_id) VALUES('test','Synthetic','Boat','','',2020,'','11111111-1111-4111-8111-111111111111'); INSERT INTO procedures(asset_id,owner_id,title,procedure_type) VALUES('test','11111111-1111-4111-8111-111111111111','Synthetic checklist','checklist');");
 const userCountBefore=(await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
 const source=await readFile('migrations/'+migrationName,'utf8');assert.equal((await apply025(sql,source)).status,'applied_025_only');assert.equal((await apply025(sql,source)).status,'already_applied');
 assert.deepEqual((await db.query('SELECT name FROM schema_migrations')).rows,[{name:migrationName}]);
 assert.equal((await db.query('SELECT revision FROM procedures')).rows[0].revision,1);assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,userCountBefore);
 // An existing compatible boat table is inspected as-is, independent of migration history.
 await db.exec('CREATE TABLE boat_devices(id uuid PRIMARY KEY,asset_id text REFERENCES assets(id))');assert.match((await inspect(sql)).boatDevices.assessment,/compatible existing/);
 }finally{await db.close();}
});
test('025 errors roll back additive DDL and do not create a misleading migration ledger',async()=>{
 const db=await fixture();try{const sql=adapter(db);await assert.rejects(async()=>apply025(sql,(await readFile('migrations/'+migrationName,'utf8'))+'\nSELECT nonexistent_rollout_function();'));assert.equal((await inspect(sql)).migration025ObjectsPresent,false);assert.equal((await db.query("SELECT to_regclass('public.owner_knowledge') AS table_name")).rows[0].table_name,null);}finally{await db.close();}
});
