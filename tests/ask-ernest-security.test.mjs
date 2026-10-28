import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from './helpers/load-typescript.mjs';
import {readFile} from 'node:fs/promises';
const OWNER='11111111-1111-4111-8111-111111111111';
function stubs({session={user:{id:OWNER}},ready=true,context={},plan=async()=>({answer:'Advice only',evidence:[]}),create=async()=>{throw Error('No draft expected')}}={}){
 return{'@/auth':{auth:async()=>session},'@/data/reviews':{reviews:()=>({available:async()=>ready,create})},'@/data/review-context':{reviewContext:async(id,owner)=>{assert.equal(owner,OWNER);return{documents:[],...context}}},'@/data/review-planner':{planReview:plan}};
}
test('unauthenticated requests never read records, invoke models or create pending updates',async()=>{
 const{askErnest}=await loadTypeScript('src/app/assets/[id]/ask-actions.ts',stubs({session:null,plan:async()=>{throw Error('must not call model')}}));
 const fd=new FormData();fd.set('question','Update records');assert.match((await askErnest('vessel',{},fd)).error,/sign in/);
});
test('one evidence-aware planner receives the authenticated owner and complete record context; updates create pending forms only',async()=>{
 let called=0;const context={documents:[],logs:[{title:'Earlier repair'}],inventory:[{name:'Impeller'}],survey:[{identifier:'A1'}]};const draft={title:'Review',summary:'Pending',rows:[]};
 const{askErnest}=await loadTypeScript('src/app/assets/[id]/ask-actions.ts',stubs({context,plan:async(id,owner,q,conversation,c)=>{assert.equal(owner,OWNER);assert.match(q,/impeller/);assert.equal(c.logs[0].title,'Earlier repair');return{answer:'Review before saving',draft,evidence:[]}},create:async(id,owner,q,input,snapshot)=>{called++;assert.equal(owner,OWNER);assert.equal(input,draft);assert.equal(snapshot.inventory[0].name,'Impeller');return'pending-review';}}));
 const fd=new FormData();fd.set('question','I replaced the impeller on October 22, 2026. Please update our records.');fd.set('owner_id','not-the-session-owner');
 const result=await askErnest('vessel',{},fd);assert.equal(result.reviewId,'pending-review');assert.equal(called,1);assert.equal(result.proposal,undefined);
});
test('ordinary advice and typed confirmation use the same read/prepare planner, never a chat write action',async()=>{
 let asked=[];const{askErnest}=await loadTypeScript('src/app/assets/[id]/ask-actions.ts',stubs({plan:async(id,owner,q)=>{asked.push(q);return{answer:'No confirmed write result',evidence:[]}}}));
 for(const q of ['What was repaired?','confirmed']){const fd=new FormData();fd.set('question',q);assert.equal((await askErnest('vessel',{},fd)).reviewId,undefined);}
 assert.deepEqual(asked,['What was repaired?','confirmed']);
 const source=await readFile('src/components/ernest-chat.tsx','utf8');assert.doesNotMatch(source,/confirmErnestWrite|latestAssistant.*proposal/);
});
test('missing review setup and provider errors fail clearly without exposing credentials or an inventory-specific refusal',async()=>{
 const{askErnest}=await loadTypeScript('src/app/assets/[id]/ask-actions.ts',stubs({ready:false}));const fd=new FormData();fd.set('question','Reconcile the survey');
 assert.match((await askErnest('vessel',{},fd)).error,/awaiting its database setup/);
 const broken=await loadTypeScript('src/app/assets/[id]/ask-actions.ts',stubs({plan:async()=>{throw Error('postgres://private-credential')}}));const result=await broken.askErnest('vessel',{},fd);assert.doesNotMatch(result.error,/postgres|inventory item|private-credential/);
});
test('document extraction no longer automatically resolves or supersedes findings',async()=>{
 const source=await readFile('src/data/document-extraction.ts','utf8');assert.doesNotMatch(source,/reconcileAssetFindings/);assert.match(source,/replaceDocumentFindings/);
});
