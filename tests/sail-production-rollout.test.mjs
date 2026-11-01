import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const path='scripts/sail/production-sql-editor/';
const files=['027_sail_far_better.sql','028_sail_photos.sql','029_sail_position.sql'];
test('production rollout preserves migration bytes and existing rows, applies atomically, and refuses replay or partial targets',async()=>{
 const source=await readFile(path+'02-apply-027-through-029.sql','utf8');
 for(const f of files)assert.equal(source.split(`-- BEGIN UNCHANGED MIGRATION ${f.slice(0,3)}\n`)[1].split(`-- END UNCHANGED MIGRATION ${f.slice(0,3)}`)[0],await readFile('migrations/'+f,'utf8'));
 const db=new PGlite();try{
 await db.exec("CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE assets(id text PRIMARY KEY,owner_id uuid REFERENCES users(id),name text NOT NULL); CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now()); INSERT INTO users VALUES('11111111-1111-4111-8111-111111111111'); INSERT INTO assets VALUES('existing','11111111-1111-4111-8111-111111111111','Existing vessel');");
 for(const name of ['owner_knowledge','procedure_revisions','document_processing_status','document_visual_pages','document_page_embeddings','update_reviews','maintenance_events','survey_items','update_audit'])await db.exec(`CREATE TABLE ${name}(id text PRIMARY KEY); INSERT INTO ${name} VALUES('preserve-me');`);
 await assert.rejects(()=>db.exec(source.replace("current_database()<>'neondb'",'true')),/Unexpected database/);await db.exec('ROLLBACK');
 const script=source.replace("current_database()<>'neondb'",'current_database()<>current_database()');
 await db.exec('CREATE TABLE sail_media(id text)');await assert.rejects(()=>db.exec(script),/already exists or is partial/);await db.exec('ROLLBACK');assert.equal((await db.query("SELECT to_regclass('public.sail_voyages') AS t")).rows[0].t,null);await db.exec('DROP TABLE sail_media');
 await db.exec(script);assert.equal((await db.query('SELECT name FROM assets')).rows[0].name,'Existing vessel');assert.equal((await db.query('SELECT id FROM maintenance_events')).rows[0].id,'preserve-me');assert.equal((await db.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,3);assert.equal((await db.query('SELECT count(*)::int AS n FROM sail_media')).rows[0].n,0);
 await db.exec(await readFile(path+'03-verify.sql','utf8'));await assert.rejects(()=>db.exec(script),/already exists or is partial/);await db.exec('ROLLBACK');
 }finally{await db.close();}
});
