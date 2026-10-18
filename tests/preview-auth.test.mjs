import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import PostgresAdapter from '@auth/pg-adapter';
import {Auth} from '@auth/core';
import Nodemailer from '@auth/core/providers/nodemailer';
import {loadTypeScript} from './helpers/load-typescript.mjs';
const {authCookies}=await loadTypeScript('src/auth-cookies.ts');

test('Preview cookies are host-only and distinct; production cookie configuration is preserved',()=>{
 const preview=authCookies({VERCEL_ENV:'preview',AUTH_COOKIE_DOMAIN:'.sailfarbetter.com'});
 for(const cookie of Object.values(preview)){
  assert.ok(cookie.name.startsWith('__Host-ernest-preview.'));
  assert.equal(cookie.options.domain,undefined);
  assert.equal(cookie.options.path,'/');
  assert.equal(cookie.options.secure,true);
  assert.equal(cookie.options.httpOnly,true);
  assert.equal(cookie.options.sameSite,'lax');
 }
 assert.deepEqual(authCookies({VERCEL_ENV:'production',AUTH_COOKIE_DOMAIN:'.sailfarbetter.com'}),{
  sessionToken:{name:'__Secure-authjs.session-token',options:{httpOnly:true,sameSite:'lax',path:'/',secure:true,domain:'.sailfarbetter.com'}}
 });
 assert.equal(authCookies({VERCEL_ENV:'production'}),undefined);
 assert.equal(authCookies({}),undefined);
});

test('real Auth.js email callback persists a session despite legacy cookies and rejects replay',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile('migrations/001_initial.sql','utf8'));
  for(const f of ['003_auth_and_asset_ownership.sql','004_auth_pg_adapter_schema_compatibility.sql'])await db.exec(await readFile('migrations/'+f,'utf8'));
  const pool={query:async(text,values)=>{const r=await db.query(text,values);return {...r,rowCount:r.rows.length};}};
  const adapter=PostgresAdapter(pool);
  const secret='synthetic-test-secret-with-at-least-32-characters';
  const email='preview-auth@example.invalid';
  const user=await adapter.createUser({name:'Synthetic',email,emailVerified:null,image:null});
  const token='synthetic-single-use-verification-token';
  await adapter.createVerificationToken({identifier:email,token:createHash('sha256').update(token+secret).digest('hex'),expires:new Date(Date.now()+600000)});
  const errors=[];
  const config={secret,trustHost:true,basePath:'/api/auth',adapter,session:{strategy:'database'},
   providers:[Nodemailer({server:'smtp://localhost:1025',from:'test@example.invalid',sendVerificationRequest:()=>{throw new Error('No mail delivery in callback test');}})],
   cookies:authCookies({VERCEL_ENV:'preview',AUTH_COOKIE_DOMAIN:'.sailfarbetter.com'}),
   callbacks:{session:({session,user})=>({...session,user:{...session.user,id:user.id}})},
   logger:{error:e=>errors.push({type:e.type,message:e.cause?.err?.message}),warn:()=>{},debug:()=>{}},
  };
  const origin='https://preview.ernest.sailfarbetter.com';
  const callback=new URL(origin+'/api/auth/callback/nodemailer');
  callback.searchParams.set('token',token);callback.searchParams.set('email',email);callback.searchParams.set('callbackUrl',origin+'/');
  const legacy='__Secure-authjs.session-token=stale-production; __Secure-authjs.callback-url=https%3A%2F%2Fernest.sailfarbetter.com';
  const response=await Auth(new Request(callback,{headers:{cookie:legacy}}),config);
  assert.deepEqual(errors,[]);
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),origin+'/');
  const sessionCookie=response.headers.getSetCookie().find(c=>c.startsWith('__Host-ernest-preview.session-token='));
  assert.ok(sessionCookie,'callback must set a Preview session');
  assert.ok(!/;\s*Domain=/i.test(sessionCookie));
  assert.match(sessionCookie,/; Secure/i);
  const cookie=sessionCookie.split(';')[0];
  // Browsers can send parent-domain and exact-host cookies with the same name.
  // Auth.js then reads the stale first value, reproducing the apparent login loop.
  const oldConfig={...config,cookies:authCookies({AUTH_COOKIE_DOMAIN:'preview.ernest.sailfarbetter.com'})};
  const oldPair=cookie.replace('__Host-ernest-preview.session-token=','__Secure-authjs.session-token=');
  const collision=await Auth(new Request(origin+'/api/auth/session',{headers:{cookie:legacy+'; '+oldPair}}),oldConfig);
  assert.equal(await collision.json(),null);
  const sessionResponse=await Auth(new Request(origin+'/api/auth/session',{headers:{cookie:legacy+'; '+cookie}}),config);
  assert.equal((await sessionResponse.json()).user.id,user.id);
  const stored=await db.query('SELECT "userId" FROM sessions');
  assert.equal(stored.rows[0].userId,user.id);
  const oldOnly=await Auth(new Request(origin+'/api/auth/session',{headers:{cookie:legacy}}),config);
  assert.equal(await oldOnly.json(),null);
  const replay=await Auth(new Request(callback),config);
  assert.match(replay.headers.get('location'),/error=Verification/);
 }finally{await db.close();}
});
