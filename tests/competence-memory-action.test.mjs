import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from './helpers/load-typescript.mjs';
import {testDatabase,owners,OWNER,OTHER} from './helpers/database.mjs';
const {parseKnowledgeInput,formatKnowledge}=await loadTypeScript('src/domain/knowledge.ts');
const {selectEvidence,retrievalTerms,expandedTerms}=await loadTypeScript('src/domain/retrieval.ts');
const {parseVisualPages,visualPageNumbers}=await loadTypeScript('src/domain/visual-evidence.ts');
const {createKnowledgeStore}=await loadTypeScript('src/data/knowledge-store.ts');
const fact=(more={})=>({subject:'Test AIS',predicate:'operational status',value:'operational',kind:'equipment_status',effectiveOn:'2026-10-16',provenance:'Sanitized owner confirmation',supersedesId:null,...more});
test('knowledge validates dates, verification inputs and explicit provenance',()=>{
 assert.ok(parseKnowledgeInput(fact()));
 for(const p of [fact({effectiveOn:'2026-02-30'}),fact({effectiveOn:'bad'}),fact({provenance:''}),fact({supersedesId:'another owner'}),fact({kind:'verified-by-AI'}),null])assert.equal(parseKnowledgeInput(p),null);
});
test('real database writes preserve corrections, reject stale/cross-owner supersession, and retain history',async()=>{
 const {db,sql}=await testDatabase();try{
 await owners(db);const store=createKnowledgeStore(sql);
 assert.equal(await store.record('test-vessel',OTHER,fact()),false);
 assert.equal(await store.record('test-vessel',OWNER,fact({value:'not operational'})),true);
 const original=(await store.list('test-vessel',OWNER))[0];
 assert.equal(await store.record('test-vessel',OWNER,fact()),false,'must explicitly supersede existing current fact');
 assert.equal(await store.record('test-vessel',OWNER,fact({supersedesId:original.id})),true);
 assert.equal(await store.record('test-vessel',OWNER,fact({supersedesId:original.id,value:'stale overwrite'})),false);
 const rows=await store.list('test-vessel',OWNER);assert.equal(rows.length,2);assert.equal(rows.filter(r=>!r.supersededBy).length,1);
 assert.equal(rows.find(r=>r.id===original.id).supersededBy,rows.find(r=>!r.supersededBy).id);
 assert.deepEqual(await store.list('test-vessel',OTHER),[]);
 const formatted=formatKnowledge(rows,'2026-10-16');assert.match(formatted.split('HISTORICAL')[0],/operational/);assert.doesNotMatch(formatted.split('HISTORICAL')[0],/not operational/);assert.match(formatted.split('HISTORICAL')[1],/not operational/);
 await db.exec('DROP TABLE owner_knowledge CASCADE');await assert.rejects(()=>store.record('test-vessel',OWNER,fact()));
 }finally{await db.close();}
});
test('historical observations do not replace current facts and cross-subject links fail closed',async()=>{
 const {db,sql}=await testDatabase();try{await owners(db);const store=createKnowledgeStore(sql);await store.record('test-vessel',OWNER,fact());
 const [current]=await store.list('test-vessel',OWNER);
 assert.equal(await store.record('test-vessel',OWNER,fact({kind:'observation',value:'Earlier survey fault',effectiveOn:'2025-01-01'})),true);
 assert.equal(await store.record('test-vessel',OWNER,fact({subject:'Different equipment',supersedesId:current.id})),false);
 const text=formatKnowledge(await store.list('test-vessel',OWNER));assert.doesNotMatch(text.split('HISTORICAL')[0],/Earlier survey fault/);
 }finally{await db.close();}
});
test('retrieval recognizes short labels and preserves relevance within a hard context budget',()=>{
 assert.ok(retrievalTerms('Where is compartment D8?').includes('d8'));assert.ok(expandedTerms('compartment D8').includes('stowage'));
 const relevant={documentId:'plan',documentTitle:'Stowage plan',pageNumber:4,text:'D8 is labeled in the diagram',relevance:10};
 const noise=Array.from({length:40},(_,i)=>({documentId:'noise'+i,documentTitle:'Survey',pageNumber:1,text:'irrelevant text '.repeat(4000),relevance:0}));
 const found=selectEvidence('compartment D8',[...noise,relevant],1000);assert.equal(found[0].documentId,'plan');assert.ok(found.reduce((n,p)=>n+p.text.length,0)<=1000);
 assert.equal(selectEvidence('D8',[relevant,relevant]).length,1);
});
test('visual evidence preserves relationships and page identities without promoting OCR to verified state',()=>{
 const [page]=parseVisualPages({pages:[{pageNumber:7,text:'D8',relationships:['D8 adjacent to D9; orientation unclear']}]},[7]);
 assert.match(page.text,/D8 adjacent to D9/);assert.match(page.text,/unverified/);
 assert.throws(()=>parseVisualPages({pages:[{pageNumber:8,text:'wrong'}]},[7]),/identity/);
 assert.throws(()=>parseVisualPages({pages:[]},[7]),/omitted/);
 assert.throws(()=>parseVisualPages({pages:[{pageNumber:7,text:'x'},{pageNumber:7,text:'y'}]},[7]),/identity/);
 assert.match(parseVisualPages({pages:[{pageNumber:1,text:'Anchor-light labels'}]},[1])[0].text,/No diagram relationships established/);
 assert.deepEqual(visualPageNumbers('Wiring schematic',[{pageNumber:1,text:'enough text '.repeat(30)}]),[1]);
});
test('database retrieval finds NoteMarc by title, exact labels and semantic aliases without chunk rows or cross-owner leakage',async()=>{
 const {db,sql}=await testDatabase();try{await owners(db);
 const docs=[['33333333-3333-4333-8333-333333333333','test-vessel',OWNER,'NoteMarc','NoteMarc.pdf','Integral tanks with gross capacities in the note.'],['44444444-4444-4444-8444-444444444444','test-vessel',OWNER,'Stowage drawing','plan.pdf','D8 is a marked storage locker.'],['55555555-5555-4555-8555-555555555555','other-vessel',OTHER,'Private NoteMarc','private.pdf','Private test secret.']];
 for(const [id,asset,owner,title,file,text] of docs){await db.query('INSERT INTO documents VALUES($1,$2,$3,$4,$5)',[id,asset,owner,title,file]);await db.query('INSERT INTO document_pages VALUES($1,1,$2)',[id,text]);}
 process.env.DATABASE_URL='postgres://isolated-test-only';
 const {getErnestDocumentContext}=await loadTypeScript('src/data/document-context.ts',{postgres:{default:()=>sql}});
 for(const q of ['What does NoteMarc say?','Where is D8?','Where is the compartment?']){
 const result=await getErnestDocumentContext('test-vessel',OWNER,q);assert.ok(result.length,q);assert.ok(result.every(r=>r.documentId!=='55555555-5555-4555-8555-555555555555'));
 }
 assert.deepEqual(await getErnestDocumentContext('test-vessel',OTHER,'NoteMarc'),[]);
 const wrong='99999999-9999-4999-8999-999999999999';await db.query('INSERT INTO documents VALUES($1,$2,$3,$4,$5)',[wrong,'test-vessel',OWNER,'D80 locker','test.pdf']);await db.query('INSERT INTO document_pages VALUES($1,1,$2)',[wrong,'D80 contains the test item.']);assert.ok((await getErnestDocumentContext('test-vessel',OWNER,'D8')).every(p=>p.documentId!==wrong));
 const docsApi=await loadTypeScript('src/data/documents.ts',{postgres:{default:()=>sql}});
 assert.ok((await docsApi.searchDocumentChunks('test-vessel',OWNER,'NoteMarc')).length);
 assert.deepEqual(await docsApi.searchDocumentChunks('test-vessel',OTHER,'NoteMarc'),[]);
 }finally{delete process.env.DATABASE_URL;await db.close();}
});
test('procedure edits write a real revision, preserve source provenance, and reject stale or unauthorized changes',async()=>{
 const {db,sql}=await testDatabase();try{await owners(db);process.env.DATABASE_URL='postgres://isolated-test-only';
 const procedures=await loadTypeScript('src/data/procedures.ts',{postgres:{default:()=>sql},openai:{default:class{}}});
 const details={title:'Engine start',procedureType:'checklist',notes:'Sanitized test procedure',steps:[{instruction:'Open engine raw-water seacock',note:null},{instruction:'Start engine',note:null},{instruction:'Check raw-water discharge immediately',note:null}]};
 assert.equal(await procedures.createProcedure('test-vessel',OWNER,details),true);
 let [p]=await procedures.getProcedures('test-vessel',OWNER);assert.equal(p.revision,1);
 assert.equal(await procedures.updateProcedure(p.id,'test-vessel',OTHER,details,1),false);
 assert.equal(await procedures.updateProcedure(p.id,'test-vessel',OWNER,{...details,steps:[...details.steps,{instruction:'Check AIS operation',note:'Keep the check; do not assert a fault'}]},1),true);
 assert.equal(await procedures.updateProcedure(p.id,'test-vessel',OWNER,details,1),false);
 [p]=await procedures.getProcedures('test-vessel',OWNER);assert.equal(p.revision,2);assert.equal(p.steps.length,4);
 const history=await db.query('SELECT snapshot FROM procedure_revisions');assert.equal(history.rows.length,1);assert.equal(history.rows[0].snapshot.steps.length,3);
 }finally{delete process.env.DATABASE_URL;await db.close();}
});
test('confirmation never reports a failed knowledge write as successful and derives identity from session',async()=>{
 let written=0,identity;const stubs={
  'next/cache':{revalidatePath(){}},'@/auth':{auth:async()=>({user:{id:OWNER}})},
  '@/data/assets':{getAsset:async(_id,owner)=>{identity=owner;return{systems:[]}},createComponent(){},updateAsset(){},updateComponent(){}},
  '@/data/equipment-knowledge':{updateComponentLifecycle(){}},'@/data/inventory':{addInventoryItem(){},updateInventoryItem(){}},'@/data/log-entries':{createLogEntry(){}},
  '@/data/procedures':{createProcedure(){},getProcedure(){},updateProcedure(){}},
  '@/data/knowledge':{recordOwnerKnowledge:async()=>{written++;return false}}
 };
 const {confirmErnestWrite}=await loadTypeScript('src/app/assets/[id]/ernest-write-actions.ts',stubs);
 const result=await confirmErnestWrite('test-vessel',{kind:'knowledge_fact',summary:'test',knowledge:fact()});
 assert.equal(identity,OWNER);assert.equal(written,1);assert.equal(result.ok,false);assert.match(result.message,/not saved/);
 const throwing=await loadTypeScript('src/app/assets/[id]/ernest-write-actions.ts',{...stubs,'@/data/knowledge':{recordOwnerKnowledge:async()=>{throw new Error('database unavailable')}}});
 await assert.rejects(()=>throwing.confirmErnestWrite('test-vessel',{kind:'knowledge_fact',knowledge:fact()}),/database unavailable/);
});
test('semantic ranking rejects invalid vectors and recognizes paraphrased evidence with provider embeddings',async()=>{
 const {cosineSimilarity}=await loadTypeScript('src/domain/semantic.ts');assert.equal(cosineSimilarity([1,0],[1,0]),1);assert.equal(cosineSimilarity([1],[1,2]),0);assert.equal(cosineSimilarity([NaN],[1]),0);
 const {db,sql}=await testDatabase();try{await owners(db);process.env.DATABASE_URL='postgres://isolated-test-only';process.env.ERNEST_SEMANTIC_RETRIEVAL_ENABLED='true';process.env.OPENAI_API_KEY='test-stub-only';
 const id='66666666-6666-4666-8666-666666666666';await db.query('INSERT INTO documents VALUES($1,$2,$3,$4,$5)',[id,'test-vessel',OWNER,'Sanitized potable supply note','test.pdf']);await db.query('INSERT INTO document_pages VALUES($1,1,$2)',[id,'Potable supply reservoir is integral.']);
 class AI{embeddings={create:async({input})=>({data:(Array.isArray(input)?input:[input]).map((_,index)=>({index,embedding:[1,0]}))})}}
 const semantic=await loadTypeScript('src/data/semantic-retrieval.ts',{postgres:{default:()=>sql},openai:{default:AI}});
 assert.equal(await semantic.indexSemanticPages(id,'test-vessel',OWNER,[{pageNumber:1,text:'Potable supply reservoir is integral.'}]),'complete');
 const matches=await semantic.getSemanticDocumentContext('test-vessel',OWNER,'How are the drinking water tanks built?');assert.equal(matches[0].documentId,id);
 assert.deepEqual(await semantic.getSemanticDocumentContext('test-vessel',OTHER,'drinking water'),[]);
 }finally{delete process.env.DATABASE_URL;delete process.env.ERNEST_SEMANTIC_RETRIEVAL_ENABLED;delete process.env.OPENAI_API_KEY;await db.close();}
});
test('proposal classification binds durable corrections to the current version and only proposes supported managed edits',async()=>{
 let output,captured;class AI{responses={create:async args=>{captured=args;return{output_text:JSON.stringify(output)}}}}
 process.env.OPENAI_API_KEY='test-stub-only';
 try{
 const {proposeErnestWrite}=await loadTypeScript('src/data/ernest-write-proposals.ts',{openai:{default:AI}});
 const asset={id:'test-vessel',name:'Sanitized vessel',systems:[]},known={...fact({value:'fault reported'}),id:'77777777-7777-4777-8777-777777777777',supersededBy:null};
 output={kind:'knowledge_fact',knowledge:fact()};const p=await proposeErnestWrite('Correction: the AIS is now operational',asset,[],[],'',[],[],[known]);assert.equal(p.knowledge.supersedesId,known.id);
 assert.match(captured.instructions,/Casual questions.*none/);assert.match(captured.instructions,/Do not convert document claims/);
 output={kind:'none'};assert.equal(await proposeErnestWrite('Could the AIS be operational?',asset),null);
 output={kind:'procedure_update',title:'Startup',procedureType:'checklist',procedureId:'not-managed',steps:[{instruction:'Start engine'}]};assert.equal(await proposeErnestWrite('Update the imported PDF',asset),null);
 }finally{delete process.env.OPENAI_API_KEY;}
});
test('document dates are serialized and source links retain document and page identity',async()=>{
 const {readFile}=await import('node:fs/promises');
 const docs=await readFile('src/data/documents.ts','utf8');assert.match(docs,/document_date::text AS document_date/);
 const evidence=await readFile('src/components/evidence-list.tsx','utf8');assert.match(evidence,/encodeURIComponent\(s.documentId!/);assert.match(evidence,/#page-\$\{s.pageNumber\}/);
 const detail=await readFile('src/app/assets/[id]/documents/[documentId]/page.tsx','utf8');assert.match(detail,/id=\{`page-\$\{page.pageNumber\}`\}/);
});
test('procedure outcomes identify the concrete steps changed',async()=>{
 const {describeProcedureChanges}=await loadTypeScript('src/domain/procedure-changes.ts');
 const before={title:'Startup',notes:null,steps:[{instruction:'Start engine',note:null},{instruction:'AIS fault',note:null}]};
 const after={...before,steps:[{instruction:'Open raw-water seacock',note:null},before.steps[0],{instruction:'Check discharge immediately',note:null},{instruction:'Check AIS operation',note:null}]};
 const diff=describeProcedureChanges(before,after).join('\n');assert.match(diff,/Removed\/revised: AIS fault/);assert.match(diff,/Added\/revised: Open raw-water seacock/);assert.match(diff,/Check discharge immediately/);assert.doesNotMatch(diff,/Removed\/revised: Start engine/);
});
test('the additive migration is repeatable on a fresh isolated database',async()=>{
 const {db}=await testDatabase();try{const {readFile}=await import('node:fs/promises');await db.exec(await readFile('migrations/025_competence_memory_action.sql','utf8'));const result=await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='procedures' AND column_name='revision'");assert.equal(result.rows.length,1);}finally{await db.close();}
});
test('v0.11 composes with existing schema, while diagnosing the baseline boat-device migration type mismatch',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const {readFile,readdir}=await import('node:fs/promises');const db=new PGlite();
 try{
  for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
    const migration=await readFile('migrations/'+file,'utf8');
    if(file==='022_boat_devices.sql'){await assert.rejects(()=>db.exec(migration),error=>error.code==='42804' && /incompatible types/.test(error.message+" "+error.detail));continue;}
    await db.exec(migration);
  }
  await db.query('INSERT INTO users(id) VALUES($1)',[OWNER]);
  await db.query("INSERT INTO assets(id,name,type,make,model,year,summary,owner_id) VALUES('test-vessel','Sanitized test vessel','Boat','','',2020,'Test fixture',$1)",[OWNER]);
  const id='88888888-8888-4888-8888-888888888888';
  await db.query("INSERT INTO documents(id,asset_id,owner_id,title,original_filename,content_type,size_bytes,storage_key,document_date) VALUES($1,'test-vessel',$2,'Dated note','test.pdf','application/pdf',10,'test-only','2026-01-02')",[id,OWNER]);
  const sql=async(strings,...params)=>(await db.query(strings.reduce((q,s,i)=>q+(i?`$${i}`:'')+s,''),params)).rows;
  process.env.DATABASE_URL='postgres://isolated-test-only';const documents=await loadTypeScript('src/data/documents.ts',{postgres:{default:()=>sql}});
  const record=await documents.getDocumentForAsset(id,'test-vessel',OWNER);assert.equal(record.documentDate,'2026-01-02');assert.equal(typeof record.documentDate,'string');
  assert.equal(await documents.getDocumentForAsset(id,'test-vessel',OTHER),undefined);
 }finally{delete process.env.DATABASE_URL;await db.close();}
});
test('processing redirects to the same owned document after extraction and passes the visual request explicitly',async()=>{
 let called;const {POST}=await loadTypeScript('src/app/assets/[id]/documents/[documentId]/extract/route.ts',{
  '@/auth':{auth:async()=>({user:{id:OWNER}})},
  '@/data/document-extraction':{processDocument:async(...args)=>{called=args;return{ok:true,pageCount:1}}}
 });
 const response=await POST(new Request('http://example.test/assets/test-vessel/documents/test-document/extract',{method:'POST',body:new URLSearchParams({visual:'true'})}),{params:Promise.resolve({id:'test-vessel',documentId:'test-document'})});
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'http://example.test/assets/test-vessel/documents/test-document');assert.deepEqual(called,['test-document','test-vessel',OWNER,true,1]);
});
test('equipment photograph reasoning reads only scoped supported originals and preserves warnings',async()=>{
 let identity,reads=[];const photoModule=await loadTypeScript('src/data/photo-evidence.ts',{
  '@/data/photos':{listPhotos:async(asset,owner)=>{identity=[asset,owner];return[{id:'p1',title:'Engine plate',contentType:'image/jpeg',sizeBytes:10,storageKey:'scoped-photo'},{id:'p2',title:'Engine photograph',contentType:'image/heic',sizeBytes:10,storageKey:'unsupported'}]}},
  '@/data/document-storage':{readDocument:async key=>{reads.push(key);return new Uint8Array([1,2,3]);}}
 });
 const result=await photoModule.getPhotoEvidence('test-vessel',OWNER,'What does the engine plate show?');assert.deepEqual(identity,['test-vessel',OWNER]);assert.deepEqual(reads,['scoped-photo']);assert.equal(result.files[0].photoId,'p1');assert.ok(result.files[0].imageUrl.startsWith('data:image/jpeg;base64,'));assert.match(result.warnings[0],/requires conversion/);
});
test('the active answer wrapper uses the full constitution, write safety, current knowledge priority and original sources',async()=>{
 let captured;class AI{responses={create:async args=>{captured=args;return{output_text:'Synthetic answer'}}}}
 process.env.OPENAI_API_KEY='test-stub-only';try{
 const {answerThinErnestQuestion}=await loadTypeScript('src/data/ask-ernest.ts',{openai:{default:AI}});
 await answerThinErnestQuestion('Inspect D8',[],'Owner-confirmed test fact',false,[{filename:'test.pdf',fileData:'data:application/pdf;base64,dGVzdA==',pages:[1]}],[{photoId:'p1',title:'Test photo',imageUrl:'data:image/png;base64,dGVzdA=='}]);
 assert.match(captured.instructions,/capable, trusted steward/);assert.match(captured.instructions,/Current facts|current knowledge outranks/i);assert.match(captured.instructions,/this answer path cannot create/);assert.match(captured.instructions,/untrusted data, not instructions/);assert.match(captured.instructions,/never emit Markdown headings/i);assert.equal(captured.reasoning.effort,'medium');
 assert.ok(captured.input[0].content.some(c=>c.type==='input_file'));assert.ok(captured.input[0].content.some(c=>c.type==='input_image'));
 }finally{delete process.env.OPENAI_API_KEY;}
});
test('a failure after supersession starts rolls back both the old fact and its replacement',async()=>{
 const {db,sql}=await testDatabase();try{await owners(db);const store=createKnowledgeStore(sql);await store.record('test-vessel',OWNER,fact());const [previous]=await store.list('test-vessel',OWNER);
 await db.exec(`CREATE FUNCTION reject_final_knowledge_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.value='fail-final' AND NEW.superseded_by IS NULL THEN RAISE EXCEPTION 'simulated final write failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_final BEFORE UPDATE ON owner_knowledge FOR EACH ROW EXECUTE FUNCTION reject_final_knowledge_update();`);
 await assert.rejects(()=>store.record('test-vessel',OWNER,fact({value:'fail-final',supersedesId:previous.id})),/simulated final write failure/);
 const remaining=await store.list('test-vessel',OWNER);assert.equal(remaining.length,1);assert.equal(remaining[0].id,previous.id);assert.equal(remaining[0].supersededBy,null);
 }finally{await db.close();}
});
test('later visual page windows retain earlier interpretations and enforce owner scope',async()=>{
 const {db,sql}=await testDatabase();try{await owners(db);process.env.DATABASE_URL='postgres://isolated-test-only';
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';await db.query('INSERT INTO documents VALUES($1,$2,$3,$4,$5)',[id,'test-vessel',OWNER,'Test diagram','test.pdf']);
 const processing=await loadTypeScript('src/data/document-processing.ts',{postgres:{default:()=>sql}});
 assert.equal(await processing.replaceVisualPages(id,'test-vessel',OWNER,[{pageNumber:1,text:'Unverified diagram relationship A'}]),true);
 assert.equal(await processing.replaceVisualPages(id,'test-vessel',OWNER,[{pageNumber:13,text:'Unverified diagram relationship B'}]),true);
 assert.equal(await processing.visualCoverage(id,'test-vessel',OWNER,[1,13]),2);
 assert.equal(await processing.replaceVisualPages(id,'test-vessel',OTHER,[{pageNumber:1,text:'Overwrite'}]),false);
 assert.equal(await processing.visualCoverage(id,'test-vessel',OTHER,[1,13]),0);
 }finally{delete process.env.DATABASE_URL;await db.close();}
});
