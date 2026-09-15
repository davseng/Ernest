import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname),data=path.join(root,'runtime-data'),base=process.env.OLLAMA_BASE_URL||'http://127.0.0.1:11434';
const checks=[];function add(name,ok,detail){checks.push({name,ok,detail});console.log(`${ok?'✓':'✗'} ${name}${detail?` — ${detail}`:''}`)}
add('Node runtime',Number(process.versions.node.split('.')[0])>=20,`v${process.versions.node}`);
try{await access(data);add('Runtime data directory',true,data)}catch{add('Runtime data directory',false,'created automatically when Ernest starts')}
for(const file of ['offline-package.json','local-state.json','outbox.json']){try{const parsed=JSON.parse(await readFile(path.join(data,file),'utf8'));add(file,true,file==='offline-package.json'?(parsed.snapshot?.asset?.name||'package loaded'):'valid JSON')}catch(error){add(file,false,error?.code==='ENOENT'?'not created yet':error.message)}}
try{const r=await fetch(`${base}/api/tags`,{signal:AbortSignal.timeout(3000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const body=await r.json();add('Ollama',true,`${body.models?.length||0} model(s) at ${base}`)}catch(error){add('Ollama',false,`${base}: ${error.message}`)}
const failed=checks.filter(c=>!c.ok).length;console.log(`\nErnest onboard readiness: ${failed===0?'READY':`${failed} check(s) need attention`}`);process.exitCode=failed?1:0;
