// Synthetic loopback-only acceptance harness. Real UI, actions, proposal parsing,
// inventory queries and transactions; injected session/model/storage boundaries.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {chromium} from 'playwright';
import {PGlite} from '@electric-sql/pglite';
import {loadTypeScript} from '../helpers/load-typescript.mjs';
const OWNER='11111111-1111-4111-8111-111111111111',assetId='synthetic-vessel';
const itemId='55555555-5555-4555-8555-555555555555';
const db=new PGlite();
const originalUrl=process.env.DATABASE_URL,originalKey=process.env.OPENAI_API_KEY;
process.env.DATABASE_URL='postgres://synthetic-browser-only';
process.env.OPENAI_API_KEY='synthetic-provider-only';
const adapt=conn=>{const sql=async(strings,...values)=>(await conn.query(strings.reduce((s,t,i)=>s+(i?`$${i}`:'')+t,''),values)).rows;sql.begin=fn=>conn.transaction(tx=>fn(adapt(tx)));return sql;};
let server,browser;
try{
 await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE assets(id text PRIMARY KEY,owner_id uuid REFERENCES users(id));`);
 await db.query('INSERT INTO users VALUES($1)',[OWNER]);await db.query('INSERT INTO assets VALUES($1,$2)',[assetId,OWNER]);
 await db.exec(await readFile('migrations/013_inventory.sql','utf8'));
 await db.query('INSERT INTO inventory_items(id,asset_id,owner_id,name,quantity) VALUES($1,$2,$3,$4,NULL)',[itemId,assetId,OWNER,'Engine Fuel Filters']);
 await db.query('INSERT INTO inventory_items(asset_id,owner_id,name) VALUES($1,$2,$3)',[assetId,OWNER,'Racor Fuel Filters']);
 await db.query('INSERT INTO inventory_locations(asset_id,owner_id,code,label) VALUES($1,$2,$3,$4)',[assetId,OWNER,'LZ1','Port Settee']);
 await db.exec('INSERT INTO inventory_item_locations SELECT i.id,l.id FROM inventory_items i CROSS JOIN inventory_locations l');
 const inventory=await loadTypeScript('src/data/inventory.ts',{postgres:{default:()=>adapt(db)}});
 const asset={id:assetId,name:'Synthetic vessel',systems:[]};
 const assets={getAsset:async(id,owner)=>id===assetId&&owner===OWNER?asset:null,createComponent(){},updateAsset(){},updateComponent(){}};
 const auth={auth:async()=>({user:{id:OWNER}})};
 let asks=0,writes=0,failWrite=false;
 class AI{responses={create:async()=>({output_text:'{"kind":"none"}'})}}
 const proposal=await loadTypeScript('src/data/ernest-write-proposals.ts',{openai:{default:AI}});
 const {askErnest}=await loadTypeScript('src/app/assets/[id]/ask-actions.ts',{
  '@/auth':auth,'@/data/assets':assets,'@/data/inventory':inventory,'@/data/ernest-write-proposals':proposal,
  '@/data/ask-ernest':{answerThinErnestQuestion:async(q,context,structured)=>{assert.match(structured,/Engine Fuel Filters/);assert.match(structured,/Port Settee/);return{answer:'Inventory checked: Engine Fuel Filters are stored in LZ1, Port Settee. Quantity 4. (Inventory record)'}}},
  '@/data/document-context':{getErnestDocumentContext:async()=>[]},'@/data/document-findings':{getAssetFindings:async()=>[]},
  '@/data/equipment-knowledge':{getComponentLifecycles:async()=>[]},'@/data/log-entries':{getLogEntries:async()=>[]},
  '@/data/photo-evidence':{getPhotoEvidence:async()=>({files:[],warnings:[]})},'@/data/visual-sources':{getVisualSourceFiles:async()=>({files:[],warnings:[]})},
  '@/data/knowledge':{getOwnerKnowledge:async()=>[]},'@/data/procedures':{getProcedures:async()=>[]},
 });
 const {confirmErnestWrite}=await loadTypeScript('src/app/assets/[id]/ernest-write-actions.ts',{
  '@/auth':auth,'next/cache':{revalidatePath(){}},'@/data/assets':assets,'@/data/inventory':inventory,
  '@/data/equipment-knowledge':{updateComponentLifecycle(){}},'@/data/log-entries':{createLogEntry(){}},
  '@/data/knowledge':{recordOwnerKnowledge(){}},'@/data/procedures':{createProcedure(){},getProcedure(){},updateProcedure(){}}
 });
 const messages=[];
 const modules=new Map();
 const stubs={
  '@/app/assets/[id]/ask-actions':`exports.askErnest=(id,previous,fd)=>window.rpc('ask',{id,form:Object.fromEntries(fd)});`,
  '@/app/assets/[id]/ernest-write-actions':`exports.confirmErnestWrite=(id,proposal)=>window.rpc('confirm',{id,proposal});`,
  '@/app/assets/[id]/conversation-actions':`exports.startConversation=()=>window.rpc('start',{});exports.saveConversationMessage=(id,cid,message)=>window.rpc('message',{message});exports.saveConversationMessageState=(id,cid,messageId,state)=>window.rpc('messageState',{messageId,state});`,
 };
 async function bundle(spec,from=resolve('package.json')){
  const file=Object.hasOwn(stubs,spec)?spec:spec.startsWith('@/')?resolve('src',spec.slice(2))+(spec.includes('components/')?'.tsx':'.ts'):createRequire(from).resolve(spec);
  if(modules.has(file))return file;
  modules.set(file,'');
  let code=Object.hasOwn(stubs,spec)?stubs[spec]:await readFile(file,'utf8');
  if(/\.tsx?$/.test(file))code=ts.transpileModule(code,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const dependencies=[...code.matchAll(/require\(["']([^"']+)["']\)/g)];
  for(const match of dependencies){const dep=await bundle(match[1],file.startsWith('/')?file:resolve('package.json'));code=code.replace(match[0],`__require(${JSON.stringify(dep)})`);}
  modules.set(file,code);return file;
 }
 const chat=await bundle('@/components/ernest-chat'),ask=await bundle('@/components/ask-ernest');
 const react=await bundle('react'),dom=await bundle('react-dom/client');
 const script=`const process={env:{NODE_ENV:'development'}};const modules={${[...modules].map(([id,code])=>`${JSON.stringify(id)}:(module,exports,__require)=>{${code}\n}`).join(',')}};const cache={};function __require(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};modules[id](m,m.exports,__require);return m.exports;}window.rpc=async(action,args)=>{const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args})});if(!r.ok)throw Error('Test boundary rejected request');return r.json();};(async()=>{const state=await window.rpc('state',{});const React=__require(${JSON.stringify(react)});const component=location.pathname==='/ask'?__require(${JSON.stringify(ask)}).AskErnest:__require(${JSON.stringify(chat)}).ErnestChat;__require(${JSON.stringify(dom)}).createRoot(document.getElementById('root')).render(React.createElement(component,{assetId:${JSON.stringify(assetId)},assetName:'Synthetic vessel',initialConversationId:'synthetic-chat',initialMessages:state.messages,recentConversations:[]}));})();`;
 server=createServer(async(req,res)=>{
  try{
   if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(script);return;}
   if(req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>');return;}
   let body='';for await(const c of req){body+=c;if(body.length>100000)throw Error('Too large');}
   const{action,args}=JSON.parse(body);let result;
   if(action==='state')result={quantity:(await inventory.getInventoryItems(assetId,OWNER))[0].quantity,racorQuantity:(await inventory.getInventoryItems(assetId,OWNER)).find(i=>i.name==='Racor Fuel Filters').quantity,messages,asks,writes};
   else if(action==='ask'){asks++;const fd=new FormData();for(const[k,v]of Object.entries(args.form))fd.set(k,v);result=await askErnest(args.id,{},fd);}
   else if(action==='confirm'){writes++;if(failWrite){failWrite=false;throw Error('Synthetic failure');}result=await confirmErnestWrite(args.id,args.proposal);}
   else if(action==='message'){const id=randomUUID();messages.push({...args.message,id});result={ok:true,messageId:id};}
   else if(action==='messageState'){const message=messages.find(m=>m.id===args.messageId);Object.assign(message,args.state);if(!args.state.proposal)delete message.proposal;result={ok:true};}
   else if(action==='start')result={ok:true,conversation:{id:'synthetic-chat',title:'Test'}};
   else if(action==='failNext'){failWrite=true;result={ok:true};}
   else throw Error('Unknown action');
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
  }catch{res.statusCode=500;res.end('{}');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:process.env.ERNEST_CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 const say=async text=>{await page.getByPlaceholder('Ask or tell Ernest anything…').fill(text);await page.getByRole('button',{name:'↑',exact:true}).click();};
 await say('There are 4 engine filters. Can you please update?');
 await page.getByRole('button',{name:'Confirm & save'}).waitFor();
 assert.match(await page.locator('.write-proposal').innerText(),/Current quantity\s+Not recorded/);
 assert.match(await page.locator('.write-proposal').innerText(),/New quantity\s+4/);
 assert.match(await page.locator('.write-proposal').innerText(),/LZ1/);
 assert.equal((await page.evaluate(()=>window.rpc('state',{}))).quantity,null);
 await page.getByRole('button',{name:'Confirm & save'}).click();
 await page.getByText('Saved Engine Fuel Filters: quantity 4 in onboard inventory.',{exact:true}).waitFor();
 await page.reload();await page.getByText('Saved Engine Fuel Filters: quantity 4 in onboard inventory.',{exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.rpc('state',{}))).quantity,'4');
 await say('What is under the Port Settee?');await page.getByText('Inventory checked:',{exact:false}).waitFor();
 assert.equal(await page.locator('.chat-evidence li').count(),0);
 await say('I have 5 engine filters');await page.getByRole('button',{name:'Confirm & save'}).waitFor();
 await page.evaluate(()=>window.rpc('failNext',{}));await page.getByRole('button',{name:'Confirm & save'}).click();
 try{await page.getByText('I couldn’t save that. Please try again.',{exact:true}).waitFor({timeout:5000});}catch(e){console.log('Synthetic browser diagnostic:',await page.locator('body').innerText(),errors);throw e;}
 assert.equal((await page.evaluate(()=>window.rpc('state',{}))).quantity,'4');
 // Typed confirmation acts only on the actual pending card; no model-generated prose save.
 const before=(await page.evaluate(()=>window.rpc('state',{}))).asks;
 await say('confirmed');await page.getByText('Saved Engine Fuel Filters: quantity 5 in onboard inventory.',{exact:true}).waitFor();
 const state=await page.evaluate(()=>window.rpc('state',{}));assert.equal(state.quantity,'5');assert.equal(state.racorQuantity,null);assert.equal(state.asks,before);
 await page.goto(origin+'/ask');await page.getByRole('textbox',{name:'Ask about this asset'}).fill('I have 6 engine filters');await page.getByRole('button',{name:'Ask',exact:true}).click();
 await page.getByRole('button',{name:'Confirm & save'}).waitFor();await page.getByRole('button',{name:'Confirm & save'}).click();
 await page.getByRole('status').filter({hasText:'Saved Engine Fuel Filters: quantity 6'}).waitFor();
 assert.equal((await page.evaluate(()=>window.rpc('state',{}))).quantity,'6');assert.deepEqual(errors,[]);
 console.log('PASS: actual chat and Ask panel render executable quantity cards; no pre-confirmation write; click save and refresh persist; typed confirmation executes pending card; failed save stays unsaved; inventory context resolves Port Settee; empty evidence is omitted. Synthetic database/provider/session only.');
}finally{
 await browser?.close();if(server)await new Promise(r=>server.close(r));await db.close();
 if(originalUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=originalUrl;
 if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;
}
