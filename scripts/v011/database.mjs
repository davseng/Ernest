import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const migrationName='025_competence_memory_action.sql';
export const prerequisites={assets:{id:'text',owner_id:'uuid'},users:{id:'uuid'},documents:{id:'uuid',asset_id:'text',owner_id:'uuid',title:'text',original_filename:'text'},document_pages:{document_id:'uuid',page_number:'integer',text_content:'text'},procedures:{id:'uuid',asset_id:'text',owner_id:'uuid'},procedure_steps:{procedure_id:'uuid'},document_findings:{id:'uuid'},external_connections:{id:'uuid'}};
const additions={owner_knowledge:{id:'uuid',asset_id:'text',owner_id:'uuid',subject:'text',predicate:'text',value:'text',kind:'text',effective_on:'date',provenance:'text',verification:'text',confidence:'numeric(4,3)',supersedes_id:'uuid',superseded_by:'uuid',created_at:'timestamp with time zone'},procedure_revisions:{id:'uuid',procedure_id:'uuid',asset_id:'text',owner_id:'uuid',revision:'integer',snapshot:'jsonb',created_at:'timestamp with time zone'},document_processing_status:{document_id:'uuid',stage:'text',visual_status:'text',error:'text',updated_at:'timestamp with time zone',semantic_status:'text'},document_visual_pages:{document_id:'uuid',page_number:'integer',interpretation:'text',model:'text',verification:'text',created_at:'timestamp with time zone'},document_page_embeddings:{document_id:'uuid',page_number:'integer',model:'text',embedding:'jsonb'}};
const indexes=['owner_knowledge_asset_idx','owner_knowledge_current_idx','document_pages_search_idx','documents_title_search_idx'];
export function targetConfig(env){
 if(env.V011_NEON_BRANCH!=='ernest-v011-test')throw new Error('V011_NEON_BRANCH must identify ernest-v011-test');
 if(!env.V011_DATABASE_URL||!env.V011_EXPECTED_DB_HOST)throw new Error('Set V011_DATABASE_URL securely and V011_EXPECTED_DB_HOST from the isolated Neon branch console');
 const url=new URL(env.V011_DATABASE_URL),expected=env.V011_EXPECTED_DB_HOST.toLowerCase();
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname.toLowerCase()!==expected||!/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(expected))throw new Error('Database endpoint does not match the pinned Neon endpoint');
 if(expected.split('.')[0].endsWith('-pooler'))throw new Error('Use the isolated branch direct endpoint for DDL');
 // Enforce certificate verification explicitly, even if a copied URL requests sslmode=require.
 url.searchParams.delete('sslmode');url.searchParams.delete('ssl');
 return{url:url.toString(),host:expected};
}
export async function inspect(sql){
 const columns=await sql`SELECT c.relname AS table_name,a.attname AS column_name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p') ORDER BY c.relname,a.attnum`;
 const tables=new Map();for(const r of columns){if(!tables.has(r.table_name))tables.set(r.table_name,new Map());tables.get(r.table_name).set(r.column_name,r.data_type);}
 const missing=[];for(const [table,required] of Object.entries(prerequisites))for(const [column,type] of Object.entries(required))if(tables.get(table)?.get(column)!==type)missing.push(`${table}.${column}: expected ${type}`);
 const drift=[];for(const [table,required] of Object.entries(additions))if(tables.has(table))for(const [column,type] of Object.entries(required)){
  if(table==='document_processing_status'&&column==='semantic_status'&&!tables.get(table).has(column))continue;
  if(tables.get(table).get(column)!==type)drift.push(`${table}.${column}: expected ${type}`);
 }
 if(tables.get('procedures')?.has('revision')&&tables.get('procedures').get('revision')!=='integer')drift.push('procedures.revision: expected integer');
 const fks=await sql`SELECT c.conname,c.conrelid::regclass::text AS table_name,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='f' AND c.conrelid=to_regclass('public.boat_devices')`;
 const boatType=tables.get('boat_devices')?.get('asset_id')??null,assetType=tables.get('assets')?.get('id')??null;
 const boat=boatType===null?'absent (not a prerequisite for 025)':boatType===assetType&&fks.some(f=>/FOREIGN KEY \(asset_id\) REFERENCES assets\(id\)/.test(f.definition))?'compatible existing asset FK':'present: asset type/FK needs separate review; do not replay 022';
 const ledger=tables.has('schema_migrations')?await sql`SELECT name FROM public.schema_migrations WHERE name IN ('022_boat_devices.sql','025_competence_memory_action.sql') ORDER BY name`:[];
 const existingIndexes=await sql`SELECT indexname FROM pg_indexes WHERE schemaname='public'`;
 const ready=Object.entries(additions).every(([t,cols])=>Object.entries(cols).every(([c,type])=>tables.get(t)?.get(c)===type))&&tables.get('procedures')?.get('revision')==='integer'&&indexes.every(n=>existingIndexes.some(i=>i.indexname===n));
 return{prerequisiteIssues:missing,existing025Drift:drift,boatDevices:{assetType,boatAssetType:boatType,assessment:boat,foreignKeys:fks},recordedMigrations:ledger.map(r=>r.name),migration025ObjectsPresent:ready};
}
export async function apply025(sql,source){
 return sql.begin(async tx=>{
  await tx`SET LOCAL lock_timeout='5s'`;await tx`SET LOCAL statement_timeout='120s'`;await tx`SET LOCAL search_path=public,pg_catalog`;
  await tx`SELECT pg_advisory_xact_lock(hashtext('ernest-v011-025'))`;
  const before=await inspect(tx);
  if(before.prerequisiteIssues.length||before.existing025Drift.length)throw new Error('Schema preflight failed; inspect metadata and resolve only in the isolated branch');
  if(before.recordedMigrations.includes(migrationName)){
   if(!before.migration025ObjectsPresent)throw new Error('025 ledger/schema drift: stop for review');
   return{status:'already_applied',schema:before};
  }
  await tx.unsafe(source);
  const after=await inspect(tx);if(!after.migration025ObjectsPresent||after.existing025Drift.length)throw new Error('025 postflight failed; transaction will roll back');
  await tx`CREATE TABLE IF NOT EXISTS public.schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`;
  await tx`INSERT INTO public.schema_migrations(name) VALUES(${migrationName})`;
  return{status:'applied_025_only',schema:after};
 });
}
async function main(){
 const mode=process.argv[2];if(!['inspect','apply-025'].includes(mode))throw new Error('Usage: node scripts/v011/database.mjs inspect|apply-025');
 const target=targetConfig(process.env),sql=postgres(target.url,{max:1,connect_timeout:10,ssl:{rejectUnauthorized:true}});
 try{
  const result=mode==='inspect'?await sql.begin('read only',tx=>inspect(tx)):await apply025(sql,await readFile(new URL('../../migrations/'+migrationName,import.meta.url),'utf8'));
  console.log(JSON.stringify({targetBranch:'ernest-v011-test',endpoint:target.host,...result},null,2));
 }finally{await sql.end({timeout:5});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(`v0.11 database operation stopped: ${error.code??'PREFLIGHT_ERROR'}. ${error.code?'Database error; no credential details logged.':error.message}`);process.exitCode=1;});
