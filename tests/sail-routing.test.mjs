import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from './helpers/load-typescript.mjs';

test('public root routing is exact-host only and preserves Ernest and isolated Preview roots',async()=>{
 const {default:config}=await loadTypeScript('next.config.ts');
 const routing=await config.rewrites();
 const routes=routing.beforeFiles;
 assert.deepEqual(routing.afterFiles,[]);
 assert.deepEqual(routing.fallback,[]);
 const routeFor=(host,path)=>routes.find(r=>r.source===path&&r.has.every(h=>h.type==='host'&&new RegExp('^'+h.value+'$').test(host)));
 assert.equal(routeFor('sailfarbetter.com','/').destination,'/sail');
 for(const host of ['ernest.sailfarbetter.com','preview.ernest.sailfarbetter.com','localhost','sailfarbetter.com.attacker.invalid','sailfarbetterXcom'])assert.equal(routeFor(host,'/'),undefined);
 assert.equal(routeFor('sailfarbetter.com','/api/auth/callback/nodemailer'),undefined);
 const redirects=await config.redirects();
 assert.deepEqual(redirects.map(r=>[r.source,r.has[0].value,r.destination,r.permanent]),[
 ['/:path*','www\\.sailfarbetter\\.com','https://sailfarbetter.com/:path*',true],
 ['/sail/manage/:path*','sailfarbetter\\.com','https://ernest.sailfarbetter.com/sail/manage/:path*',false],
 ['/sail/sign-in','sailfarbetter\\.com','https://ernest.sailfarbetter.com/sail/sign-in',false],
 ]);
});
