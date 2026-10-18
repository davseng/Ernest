import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTypeScript} from './helpers/load-typescript.mjs';
import {testDatabase,owners,OWNER,OTHER} from './helpers/database.mjs';
const item={id:'55555555-5555-4555-8555-555555555555',name:'Racor Fuel Filters',quantity:'2',details:null,sourceLabel:null,sourcePage:null,locations:['LZ1']};
const locations=[{code:'LZ1',label:'Port Settee',notes:null,itemCount:1},{code:'AH',label:null,notes:null,itemCount:0}];
const asset={id:'test-vessel',name:'Synthetic',systems:[]};
const {inventoryContext}=await loadTypeScript('src/domain/inventory-context.ts');
const {quantityProposal,inventoryKnowledgeProposal}=await loadTypeScript('src/domain/inventory-proposal.ts');

test('inventory is available without trigger words; saved location names resolve and absence is not inferred',()=>{
 const context=inventoryContext('fuel filters',[item],locations);
 assert.match(context,/Racor Fuel Filters/);assert.match(context,/quantity 2/);
 const located=inventoryContext('What is under the Port Settee?',[item],locations);
 assert.match(located,/Resolved location codes for this question: LZ1/);
 assert.match(located,/LZ1: Port Settee/);assert.match(located,/NOT confirmed absent/);
 assert.match(inventoryContext('Describe AH',[],locations),/AH: name not recorded/);
 assert.doesNotMatch(inventoryContext('What is under the Port Settee?',[item],[{...locations[0],label:'Port Cockpit'}]),/Resolved location codes/);
});
test('explicit location definitions use only current confirmed knowledge',()=>{
 const f={id:'k',subject:'AH',predicate:'location name',value:'Aft Head',kind:'current_fact',effectiveOn:'2020-01-01',supersededBy:null};
 assert.match(inventoryContext('Aft Head',[],locations,[f]),/Resolved location codes for this question: AH/);
 assert.doesNotMatch(inventoryContext('Aft Head',[],locations,[{...f,supersededBy:'new'}]),/Resolved location codes/);
 assert.doesNotMatch(inventoryContext('Aft Head',[],locations,[{...f,kind:'observation'}]),/Resolved location codes/);
});
test('the owner fuel-filter example produces a real proposal, never guesses between items or infers quantities',()=>{
 const p=quantityProposal('I have 4 fuel filters. Can you update the quantity?',[item]);
 assert.equal(p.kind,'inventory_update');assert.equal(p.inventory.quantity,'4');assert.equal(p.inventory.expectedQuantity,'2');
 assert.deepEqual(p.inventory.currentLocations,['LZ1']);
 assert.equal(quantityProposal('I have 4 fuel filters',[item,{...item,id:'other'}]),null);
 assert.equal(quantityProposal('Do I have 4 fuel filters?',[item]),null);
 assert.equal(quantityProposal('If I have 4 fuel filters',[item]),null);
 assert.equal(quantityProposal('I have 4 fuel filters but do not update anything',[item]),null);
 assert.equal(quantityProposal('Set quantity of Racor Fuel Filters to 0',[item]).inventory.quantity,'0');
});
test('explicit absence and code definitions create confirmation proposals without guessing names',()=>{
 const p=inventoryKnowledgeProposal('There is no sextant on board',locations,[]);
 assert.equal(p.kind,'knowledge_fact');assert.equal(p.knowledge.subject,'sextant');assert.equal(p.knowledge.value,'not aboard');
 assert.equal(inventoryKnowledgeProposal('AH is the aft head',locations,[]).knowledge.value,'aft head');
 assert.equal(inventoryKnowledgeProposal('Does AH mean aft head?',locations,[]),null);
 assert.equal(inventoryKnowledgeProposal('ZZ99 is the aft head',locations,[]),null);
 assert.equal(inventoryKnowledgeProposal('Maybe there is no sextant on board',locations,[]),null);
 assert.equal(inventoryKnowledgeProposal('There is not a one on board',locations,[]),null);
 assert.equal(inventoryKnowledgeProposal('AH is not the aft head',locations,[]),null);
});
test('provider numeric/nested inventory output and explicit card requests produce executable proposals',async()=>{
 let output,calls=0;class AI{responses={create:async()=>{calls++;return{output_text:JSON.stringify(output)}}}}
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-only';
 try{
 const {proposeErnestWrite}=await loadTypeScript('src/data/ernest-write-proposals.ts',{openai:{default:AI}});
 output={kind:'inventory_update',inventory:{itemId:item.id,quantity:4}};
 const p=await proposeErnestWrite('Please correct the filter count',asset,[item],locations);
 assert.equal(p.inventory.quantity,'4');assert.equal(p.inventory.currentName,item.name);
 output={kind:'inventory_update',itemId:item.id,quantity:0};
 assert.equal((await proposeErnestWrite('Please correct the filter count',asset,[item],locations)).inventory.quantity,'0');
 output={kind:'inventory_update',itemId:'not-owned',quantity:4};
 assert.equal(await proposeErnestWrite('Please correct the filter count',asset,[item],locations),null);
 output={kind:'inventory_update',itemId:item.id,quantity:-1};
 assert.equal(await proposeErnestWrite('Please correct the filter count',asset,[item],locations),null);
 const before=calls;
 const wrapped='LEARNING FOLLOW-UP: The owner answers a clarification.\nERNEST CLARIFICATION: How many filters?\nOWNER ANSWER: I have 4 fuel filters';
 assert.equal((await proposeErnestWrite(wrapped,asset,[item],locations)).inventory.quantity,'4');
 assert.equal(calls,before);
 assert.equal((await proposeErnestWrite('present the confirmation card',asset,[item],locations,'Owner: I have 4 fuel filters\nErnest: Not saved yet')).inventory.quantity,'4');
 assert.equal(calls,before);
 assert.equal(await proposeErnestWrite('present the confirmation card',asset,[item],locations,'Ernest: I have 4 fuel filters'),null);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

export async function inventoryFixture(){
 const {db,sql}=await testDatabase();await owners(db);
 await db.exec(await readFile('migrations/013_inventory.sql','utf8'));
 await db.query('INSERT INTO inventory_locations(asset_id,owner_id,code,label) VALUES($1,$2,$3,$4)',['test-vessel',OWNER,'LZ1','Port Settee']);
 await db.query('INSERT INTO inventory_items(id,asset_id,owner_id,name,quantity) VALUES($1,$2,$3,$4,2)',[item.id,'test-vessel',OWNER,item.name]);
 await db.exec('INSERT INTO inventory_item_locations SELECT i.id,l.id FROM inventory_items i CROSS JOIN inventory_locations l');
 return{db,sql};
}
test('confirmation persists quantity and preserves other fields; stale/cross-owner/invalid writes fail without partial mutation',async()=>{
 const {db,sql}=await inventoryFixture();const previous=process.env.DATABASE_URL;process.env.DATABASE_URL='postgres://synthetic-only';
 try{
 const inventory=await loadTypeScript('src/data/inventory.ts',{postgres:{default:()=>sql}});
 const proposal=quantityProposal('I have 4 fuel filters',[item]);
 const {confirmErnestWrite}=await loadTypeScript('src/app/assets/[id]/ernest-write-actions.ts',{
  'next/cache':{revalidatePath(){}},'@/auth':{auth:async()=>({user:{id:OWNER}})},
  '@/data/assets':{getAsset:async()=>asset,createComponent(){},updateAsset(){},updateComponent(){}},
  '@/data/inventory':inventory,'@/data/equipment-knowledge':{updateComponentLifecycle(){}},'@/data/log-entries':{createLogEntry(){}},
  '@/data/knowledge':{recordOwnerKnowledge(){}},'@/data/procedures':{createProcedure(){},getProcedure(){},updateProcedure(){}}
 });
 assert.equal((await inventory.getInventoryItems('test-vessel',OWNER))[0].quantity,'2');
 const saved=await confirmErnestWrite('test-vessel',proposal);assert.equal(saved.ok,true);assert.match(saved.message,/quantity 4/);
 let current=(await inventory.getInventoryItems('test-vessel',OWNER))[0];assert.equal(current.quantity,'4');assert.equal(current.name,item.name);assert.deepEqual(current.locations,['LZ1']);
 assert.equal((await confirmErnestWrite('test-vessel',proposal)).ok,false);
 assert.equal(await inventory.updateInventoryItem('test-vessel',OTHER,item.id,{quantity:'999'}),false);
 assert.equal(await inventory.updateInventoryItem('test-vessel',OWNER,item.id,{name:'must not change',quantity:'bad'}),false);
 assert.equal(await inventory.updateInventoryItem('test-vessel',OWNER,item.id,{quantity:'-1'}),false);
 await assert.rejects(()=>inventory.updateInventoryItem('test-vessel',OWNER,item.id,{quantity:'8',locationCode:'missing'}));
 current=(await inventory.getInventoryItems('test-vessel',OWNER))[0];assert.equal(current.quantity,'4');assert.equal(current.name,item.name);
 assert.equal(await inventory.updateInventoryItem('test-vessel',OWNER,item.id,{quantity:'0',expectedQuantity:'4'}),true);
 assert.equal((await inventory.getInventoryItems('test-vessel',OWNER))[0].quantity,'0');
 }finally{await db.close();if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;}
});
test('original diagram lookup includes owner-scoped PDFs even when diagram pages have no extracted text',async()=>{
 const read=[];
 const visual=await loadTypeScript('src/data/visual-sources.ts',{
  '@/data/documents':{getDocumentsForAsset:async(a,o)=>{assert.equal(o,OWNER);return[{id:'diagram',title:'Boat storage diagram',originalFilename:'layout.pdf'}]},getDocumentForAsset:async(id,a,o)=>{assert.equal(o,OWNER);return{title:'Boat storage diagram',originalFilename:'layout.pdf',contentType:'application/pdf',sizeBytes:20,storageKey:id}}},
  '@/data/document-storage':{readDocument:async key=>{read.push(key);return Buffer.from('%PDF-synthetic')}}
 });
 const result=await visual.getVisualSourceFiles('test-vessel',OWNER,'Describe the boat diagram sections',[]);
 assert.equal(result.files.length,1);assert.equal(result.files[0].documentId,'diagram');assert.deepEqual(read,['diagram']);
 const missing=await loadTypeScript('src/data/visual-sources.ts',{'@/data/documents':{getDocumentsForAsset:async()=>[{id:'missing',title:'Inventory map',originalFilename:'map.pdf'}],getDocumentForAsset:async()=>({title:'Map',contentType:'application/pdf',sizeBytes:20})},'@/data/document-storage':{readDocument:async()=>{throw new Error('missing')}}});
 assert.match((await missing.getVisualSourceFiles('test-vessel',OWNER,'boat diagram',[])).warnings.join(' '),/could not be loaded/);
});
test('evidence normalization removes empty entries and keeps readable original/source labels',async()=>{
 const {evidenceSources}=await loadTypeScript('src/domain/evidence.ts');
 assert.deepEqual(evidenceSources([null,{}, {documentTitle:'blank'}]),[]);
 const entries=evidenceSources([{documentId:'id',documentTitle:'',pageNumber:1},{documentId:'id',pageNumber:1},{documentId:'pdf',documentTitle:'Diagram',pageNumber:0}]);
 assert.equal(entries.length,2);assert.equal(entries[0].documentTitle,'Document');assert.equal(entries[1].pageNumber,0);
});
