import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOnboardConfig } from './offline-runtime/onboard-config.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=path.join(root,'runtime-data'),config=readOnboardConfig(),base=config.ollamaBase;
const checks=[];function add(name,ok,detail){checks.push({name,ok,detail});console.log(`${ok?'✓':'✗'} ${name}${detail?` — ${detail}`:''}`)}
add('Node runtime',Number(process.versions.node.split('.')[0])>=20,`v${process.versions.node}`);add('LAN binding',config.host==='0.0.0.0'||config.host==='::',`${config.host}:${config.port}`);add('Boat to Cloud safety',config.cloud.logUploadEnabled===false,'cloud writes disabled');add('Model routing safety',config.model.cloudFallbackEnabled===false,'cloud fallback disabled');add('Cloud snapshot sync',true,config.cloud.snapshotEnabled?'configured':'not configured yet');
try{await access(data);add('Runtime data directory',true,data)}catch{add('Runtime data directory',false,'created automatically when Ernest starts')}
for(const file of ['offline-package.json','local-state.json','outbox.json']){try{const parsed=JSON.parse(await readFile(path.join(data,file),'utf8'));add(file,true,file==='offline-package.json'?(parsed.snapshot?.asset?.name||'package loaded'):'valid JSON')}catch(error){add(file,false,error?.code==='ENOENT'?'not created yet':error.message)}}
try{const r=await fetch(`${base}/api/tags`,{signal:AbortSignal.timeout(3000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const body=await r.json();add('Ollama',true,`${body.models?.length||0} model(s) at ${base}`)}catch(error){add('Ollama',false,`${base}: ${error.message}`)}
const failed=checks.filter(c=>!c.ok).length;console.log(`\nErnest onboard readiness: ${failed===0?'READY':`${failed} check(s) need attention`}`);process.exitCode=failed?1:0;
