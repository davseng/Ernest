import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from './helpers/load-typescript.mjs';
const {quantityProposal}=await loadTypeScript('src/domain/inventory-proposal.ts');
const {requestsWrite,readOnlyAnswer}=await loadTypeScript('src/domain/write-safety.ts');
const inventory=[{id:'engine',name:'Engine Fuel Filters',quantity:null,locations:[]},{id:'racor',name:'Racor Fuel Filters',quantity:null,locations:[]}];
test('exact owner feedback targets Engine Fuel Filters without inventing Yanmar or changing Racor',()=>{
 const p=quantityProposal('There are 4 engine filters. Can you please update?',inventory);
 assert.equal(p.kind,'inventory_update');assert.equal(p.inventory.itemId,'engine');assert.equal(p.inventory.quantity,'4');assert.equal(p.inventory.expectedQuantity,null);
 assert.equal(p.inventory.name,null);assert.equal(p.inventory.details,null);assert.equal(p.inventory.locationCode,null);
 assert.doesNotMatch(JSON.stringify(p),/Yanmar|secondary/);
 assert.equal(quantityProposal('There are 4 engine filters. Can you please update?',[...inventory,{...inventory[0],id:'duplicate'}]),null);
});
test('read-only answers cannot masquerade as completed updates',()=>{
 assert.equal(requestsWrite('There are 4 engine filters. Can you please update?'),true);
 assert.equal(requestsWrite('Please update the quantity'),true);
 assert.equal(requestsWrite('When was the inventory updated?'),false);
 const output='Updated for Far Better:\n- Engine fuel filters: 4 in inventory\nThe four engine filters are understood to be the Yanmar secondary fuel-filter elements.';
 assert.doesNotMatch(readOnlyAnswer(output),/Yanmar|Updated for/);
 assert.match(readOnlyAnswer(output),/No change was saved/);
 assert.match(readOnlyAnswer("I've updated your inventory."),/No change was saved/);
 assert.equal(readOnlyAnswer('Inventory records quantity 4. (Inventory record)'),'Inventory records quantity 4. (Inventory record)');
});
const OWNER='11111111-1111-4111-8111-111111111111';
test('the new planner receives both Engine and Racor records before producing a pending editable form',async()=>{
 let planned=0,created=0;
 const {askErnest}=await loadTypeScript('src/app/assets/[id]/ask-actions.ts',{
  '@/auth':{auth:async()=>({user:{id:OWNER}})},
  '@/data/reviews':{reviews:()=>({available:async()=>true,create:async()=>{created++;return 'editable-review';}})},
  '@/data/review-context':{reviewContext:async()=>({inventory,documents:[]})},
  '@/data/review-planner':{planReview:async(a,o,q,c,records)=>{planned++;assert.equal(records.inventory.length,2);return{answer:'Review the quantity before saving',draft:{rows:[{kind:'inventory',itemId:'engine',quantity:'4'}]},evidence:[]};}}
 });
 const fd=new FormData();fd.set('question','There are 4 engine filters. Can you please update?');
 const result=await askErnest('vessel',{},fd);assert.equal(planned,1);assert.equal(created,1);assert.equal(result.reviewId,'editable-review');assert.doesNotMatch(result.answer,/Updated for|Yanmar/);
});
test('a read question can return evidence without preparing a mutation',async()=>{
 const {askErnest}=await loadTypeScript('src/app/assets/[id]/ask-actions.ts',{
  '@/auth':{auth:async()=>({user:{id:OWNER}})},
  '@/data/reviews':{reviews:()=>({available:async()=>true,create:()=>{throw Error('must not create')}})},
  '@/data/review-context':{reviewContext:async()=>({documents:[]})},
  '@/data/review-planner':{planReview:async()=>({answer:'Two recorded filter types, quantities unknown.',evidence:[]})}
 });
 const fd=new FormData();fd.set('question','How many filters are recorded?');const result=await askErnest('vessel',{},fd);assert.equal(result.reviewId,undefined);assert.match(result.answer,/quantities unknown/);
});
test('optional document section failure does not discard successful sections or leak the underlying exception',async()=>{
 const seen=[];
 const {getDocumentEnrichment}=await loadTypeScript('src/data/document-detail.ts',{
  '@/data/maintenance-candidates':{getMaintenanceCandidates:async(...args)=>{seen.push(args);throw Object.assign(new Error('private exception details'),{code:'42P01'})},getMaintenanceGuidance:async()=>''},
  '@/data/document-findings':{getDocumentFindings:async()=>[{id:'finding',statement:'Source observation'}]},
  '@/data/document-processing':{getProcessingStatus:async()=>({stage:'complete'})}
 });
 const data=await getDocumentEnrichment('doc','vessel',OWNER);
 assert.deepEqual(data.candidates,[]);assert.equal(data.findings.length,1);assert.equal(data.processing.stage,'complete');
 assert.match(data.warnings[0],/Maintenance suggestions could not be loaded/);assert.doesNotMatch(data.warnings.join(' '),/private/);
 assert.deepEqual(seen,[['doc','vessel',OWNER]]);
});

test('the real document page renders its original/text when a cloned schema lacks the optional maintenance table',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {readFile,readdir}=await import('node:fs/promises');
 const {createElement}=await import('react');const{renderToStaticMarkup}=await import('react-dom/server');
 const db=new PGlite();const old=process.env.DATABASE_URL;process.env.DATABASE_URL='postgres://synthetic-only';
 try{
  for(const f of(await readdir('migrations')).filter(f=>f.endsWith('.sql')&&f!=='022_boat_devices.sql').sort())await db.exec(await readFile('migrations/'+f,'utf8'));
  await db.query('INSERT INTO users(id) VALUES($1)',[OWNER]);
  await db.query("INSERT INTO assets(id,owner_id,name,type,make,model,year,summary) VALUES('vessel',$1,'Synthetic','Boat','','',2020,'')",[OWNER]);
  const id='55555555-5555-4555-8555-555555555555';
  await db.query("INSERT INTO documents(id,asset_id,owner_id,title,original_filename,content_type,size_bytes,storage_key) VALUES($1,'vessel',$2,'Diagram','diagram.pdf','application/pdf',20,'synthetic-only')",[id,OWNER]);
  await db.query('INSERT INTO document_pages(document_id,page_number,text_content) VALUES($1,1,$2)',[id,'Diagram label AH']);
  await db.exec('DROP TABLE document_maintenance_candidates');
  const sql=async(strings,...values)=>(await db.query(strings.reduce((s,t,i)=>s+(i?`$${i}`:'')+t,''),values)).rows;
  const pg={postgres:{default:()=>sql}};
  const maintenance=await loadTypeScript('src/data/maintenance-candidates.ts',pg);
  // Reproduce the failing optional query against this synthetic clone shape.
  await assert.rejects(()=>maintenance.getMaintenanceCandidates(id,'vessel',OWNER),e=>e.code==='42P01');
  const findings=await loadTypeScript('src/data/document-findings.ts',pg);
  const processing=await loadTypeScript('src/data/document-processing.ts',pg);
  const enrichment=await loadTypeScript('src/data/document-detail.ts',{'@/data/maintenance-candidates':maintenance,'@/data/document-findings':findings,'@/data/document-processing':processing});
  const documents=await loadTypeScript('src/data/documents.ts',pg);
  const {default:Page}=await loadTypeScript('src/app/assets/[id]/documents/[documentId]/page.tsx',{
   'next/navigation':{notFound:()=>{throw Error('not found')},redirect:()=>{throw Error('sign in')}},
   '@/auth':{auth:async()=>({user:{id:OWNER}})},'@/components/asset-app-header':{AssetAppHeader:()=>createElement('header',{},'Synthetic vessel')},
   '@/data/assets':{getAsset:async()=>({id:'vessel',name:'Synthetic'})},'@/data/documents':documents,'@/data/document-detail':enrichment,
   '../../document-actions':{removeDocument(){},renameDocument(){}},
   './maintenance-actions':{approveMaintenanceCandidate(){},editAndApproveMaintenanceCandidate(){},generateMaintenanceCandidates(){},rejectMaintenanceCandidate(){}}
  });
  const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'vessel',documentId:id}),searchParams:Promise.resolve({})}));
  assert.match(html,/Open preserved original PDF/);assert.match(html,/Diagram label AH/);assert.match(html,/Maintenance suggestions could not be loaded/);
  assert.match(html,/Extracted text/);
 }finally{await db.close();if(old===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=old;}
});
