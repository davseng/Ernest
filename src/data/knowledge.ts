import "server-only";
import postgres from "postgres";
import { createKnowledgeStore } from "@/data/knowledge-store";
import { parseKnowledgeInput } from "@/domain/knowledge";
let client: ReturnType<typeof postgres> | undefined;
function store(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
  client??=postgres(process.env.DATABASE_URL,{max:5});
  return createKnowledgeStore(client);
}
export async function getOwnerKnowledge(assetId:string,ownerId:string){return store().list(assetId,ownerId);}
export async function recordOwnerKnowledge(assetId:string,ownerId:string,input:unknown){
  const parsed=parseKnowledgeInput(input);
  return parsed?store().record(assetId,ownerId,parsed):false;
}
