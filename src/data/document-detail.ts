import "server-only";
import {getMaintenanceCandidates,getMaintenanceGuidance} from "@/data/maintenance-candidates";
import {getDocumentFindings} from "@/data/document-findings";
import {getProcessingStatus} from "@/data/document-processing";

/** Optional enrichment must not hide the owned original or extracted pages. */
export async function getDocumentEnrichment(documentId:string,assetId:string,ownerId:string) {
  const warnings:string[]=[];
  async function section<T>(label:string,load:()=>Promise<T>,fallback:T):Promise<T>{
    try{return await load();}catch(error){
      const code=error&&typeof error==="object"&&"code" in error?String(error.code):"UNAVAILABLE";
      console.warn(`Document ${label} unavailable (${/^[A-Z0-9_]+$/.test(code)?code:"UNAVAILABLE"})`);
      warnings.push(`${label} could not be loaded. The preserved original and extracted text remain available; this is not a completed processing result.`);
      return fallback;
    }
  }
  const[candidates,guidance,findings,processing]=await Promise.all([
    section("Maintenance suggestions",()=>getMaintenanceCandidates(documentId,assetId,ownerId),[]),
    section("Maintenance guidance",()=>getMaintenanceGuidance(documentId,assetId,ownerId),""),
    section("Historical findings",()=>getDocumentFindings(documentId,assetId,ownerId),[]),
    section("Processing status",()=>getProcessingStatus(documentId,assetId,ownerId),undefined),
  ]);
  return{candidates,guidance,findings,processing,warnings};
}
