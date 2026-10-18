import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
// Load real TypeScript modules with narrow dependency injection. No production test bypasses.
export async function loadTypeScript(path, stubs={}) {
  const filename=resolve(path), source=await readFile(filename,'utf8');
  let code=ts.transpileModule(source,{fileName:filename,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const imports=[...code.matchAll(/(?:from\s*|import\s*)(["'])([^"']+)\1/g)];
  for(const m of imports){
    const spec=m[2];let url;
    if(spec==='server-only'){code=code.replace(m[0],'import "data:text/javascript,export{}"');continue;}
    if(Object.hasOwn(stubs,spec)){
      const key=crypto.randomUUID();globalThis.__ernestTestModules??={};globalThis.__ernestTestModules[key]=stubs[spec];
      const values=stubs[spec];
      url='data:text/javascript;base64,'+Buffer.from(Object.keys(values).map(k=>k==='default'?`export default globalThis.__ernestTestModules[${JSON.stringify(key)}].default;`:`export const ${k}=globalThis.__ernestTestModules[${JSON.stringify(key)}][${JSON.stringify(k)}];`).join('\n')).toString('base64');
    }else if(spec.startsWith('@/')||spec.startsWith('.')){
      const p=spec.startsWith('@/')?resolve('src',spec.slice(2)):resolve(dirname(filename),spec);
      const loaded=await moduleUrl(/\.tsx?$/.test(p)?p:p+'.ts',stubs);url=loaded;
    }else url=spec.startsWith('node:')?spec:pathToFileURL(require.resolve(spec)).href;
    code=code.replace(m[0],m[0].replace(m[1]+spec+m[1],JSON.stringify(url)));
  }
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
async function moduleUrl(path,stubs){
  // Export the imported namespace through a stable in-memory binding for this test load.
  const mod=await loadTypeScript(path,stubs),key=crypto.randomUUID();globalThis.__ernestTestModules??={};globalThis.__ernestTestModules[key]=mod;
  return 'data:text/javascript;base64,'+Buffer.from(Object.keys(mod).map(k=>k==='default'?`export default globalThis.__ernestTestModules[${JSON.stringify(key)}].default;`:`export const ${k}=globalThis.__ernestTestModules[${JSON.stringify(key)}][${JSON.stringify(k)}];`).join('\n')).toString('base64');
}
