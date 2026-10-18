import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export async function testDatabase(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE assets(id text PRIMARY KEY,owner_id uuid REFERENCES users(id));
 CREATE TABLE documents(id uuid PRIMARY KEY,asset_id text REFERENCES assets(id),owner_id uuid REFERENCES users(id),title text,original_filename text);
 CREATE TABLE document_pages(document_id uuid REFERENCES documents(id),page_number integer,text_content text,PRIMARY KEY(document_id,page_number));
 CREATE TABLE procedures(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),asset_id text REFERENCES assets(id),owner_id uuid REFERENCES users(id),title text,procedure_type text,notes text,source_document_id uuid,source_page int,updated_at timestamptz DEFAULT now());
 CREATE TABLE procedure_steps(id uuid PRIMARY KEY,procedure_id uuid REFERENCES procedures(id),position int,instruction text,note text);`);
 await db.exec(await readFile('migrations/025_competence_memory_action.sql','utf8'));
 const adapt=conn=>{
  const sql=async(strings,...params)=>{
   const query=strings.reduce((q,s,i)=>q+(i?`$${i}`:'')+s,'');
   return (await conn.query(query,params)).rows;
  };
  sql.begin=async fn=>conn.transaction(tx=>fn(adapt(tx)));
  return sql;
 };
 return{db,sql:adapt(db)};
}
export const OWNER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
export async function owners(db){await db.query('INSERT INTO users VALUES($1),($2)',[OWNER,OTHER]);await db.query("INSERT INTO assets VALUES('test-vessel',$1),('other-vessel',$2)",[OWNER,OTHER]);}
