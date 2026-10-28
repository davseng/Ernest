import type { Sql } from "postgres";
import type { KnowledgeInput, KnowledgeFact } from "../domain/knowledge";

type Row = {id:string;subject:string;predicate:string;value:string;kind:KnowledgeInput["kind"];effective_on:string;provenance:string;supersedes_id:string|null;superseded_by:string|null;created_at:Date|string};
export function createKnowledgeStore(sql: Sql, options: {inTransaction?: boolean} = {}) {
  return {
    async list(assetId:string, ownerId:string):Promise<KnowledgeFact[]> {
      const rows=await sql<Row[]>`SELECT k.id,k.subject,k.predicate,k.value,k.kind,k.effective_on::text,k.provenance,k.supersedes_id,k.superseded_by,k.created_at
        FROM owner_knowledge k INNER JOIN assets a ON a.id=k.asset_id
        WHERE k.asset_id=${assetId} AND k.owner_id=${ownerId} AND a.owner_id=${ownerId}
        ORDER BY (k.superseded_by IS NULL) DESC,k.effective_on DESC,k.created_at DESC LIMIT 300`;
      return rows.map(r=>({id:r.id,subject:r.subject,predicate:r.predicate,value:r.value,kind:r.kind,effectiveOn:r.effective_on,provenance:r.provenance,supersedesId:r.supersedes_id,supersededBy:r.superseded_by,verification:"owner_confirmed",confidence:1,createdAt:new Date(r.created_at).toISOString()}));
    },
    async record(assetId:string,ownerId:string,input:KnowledgeInput):Promise<boolean> {
      const write = async (tx: Sql) => {
        // Serialize confirmation for this owner's asset; a stale proposal must not replace a newer correction.
        const owned=await tx`SELECT id FROM assets WHERE id=${assetId} AND owner_id=${ownerId} FOR UPDATE`;
        if(owned.length!==1)return false;
        const existing=await tx<Row[]>`SELECT id,subject,predicate,value,kind,effective_on::text FROM owner_knowledge
          WHERE asset_id=${assetId} AND owner_id=${ownerId} AND lower(subject)=lower(${input.subject})
            AND lower(predicate)=lower(${input.predicate}) AND superseded_by IS NULL AND kind<>'observation' FOR UPDATE`;
        const previous=existing[0];
        if(input.kind!=="observation" && (previous?.id??null)!==input.supersedesId)return false;
        if(input.kind==="observation" && input.supersedesId)return false;
        if(previous && input.kind!=="observation" && input.effectiveOn<previous.effective_on)return false;
        // Insert the replacement as linked history first, then swap current status in this transaction.
        const inserted=await tx<{id:string}[]>`INSERT INTO owner_knowledge(asset_id,owner_id,subject,predicate,value,kind,effective_on,provenance,supersedes_id,superseded_by)
          VALUES(${assetId},${ownerId},${input.subject},${input.predicate},${input.value},${input.kind},${input.effectiveOn},${input.provenance},${input.supersedesId},${input.kind!=="observation"?previous?.id??null:null}) RETURNING id`;
        if(inserted.length!==1)throw new Error("Knowledge insert did not return its record");
        if(previous && input.kind!=="observation") {
          await tx`UPDATE owner_knowledge SET superseded_by=${inserted[0].id} WHERE id=${previous.id} AND owner_id=${ownerId} AND asset_id=${assetId}`;
          await tx`UPDATE owner_knowledge SET superseded_by=NULL WHERE id=${inserted[0].id} AND owner_id=${ownerId} AND asset_id=${assetId}`;
        }
        return true;
      };
      return options.inTransaction ? write(sql) : sql.begin(tx=>write(tx as unknown as Sql)) as Promise<boolean>;
    }
  };
}
