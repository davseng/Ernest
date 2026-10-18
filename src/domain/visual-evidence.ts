export type VisualPage = {pageNumber:number;text:string};
/** Reject missing/duplicate/wrong pages instead of silently reporting visual processing complete. */
export function parseVisualPages(value:unknown,requested:number[]):VisualPage[]{
  if(!value || typeof value!=="object" || !Array.isArray((value as {pages?:unknown}).pages))throw new Error("Vision response has no pages");
  const seen=new Set<number>(),allowed=new Set(requested),out:VisualPage[]=[];
  for(const item of (value as {pages:unknown[]}).pages){
    if(!item||typeof item!=="object")throw new Error("Invalid vision page");
    const row=item as Record<string,unknown>,n=row.pageNumber;
    if(typeof n!=="number"||!allowed.has(n)||seen.has(n)||typeof row.text!=="string")throw new Error("Vision page identity mismatch");
    seen.add(n);
    const relationships=Array.isArray(row.relationships)?row.relationships.filter((x):x is string=>typeof x==="string").slice(0,100):[];
    if(!row.text.trim() && !relationships.length)throw new Error("Vision page contained no readable evidence");
    const text=[row.text.replace(/\u0000/g,"").trim(),"Visual relationships (unverified):",...(relationships.length?relationships:["No diagram relationships established; inspect the original page."])].join("\n");
    out.push({pageNumber:n,text});
  }
  if(seen.size!==allowed.size)throw new Error("Vision response omitted requested pages");
  return out.sort((a,b)=>a.pageNumber-b.pageNumber);
}
export function visualPageNumbers(title:string,pages:VisualPage[]){
  return pages.filter(p=>(p.text.match(/[A-Za-z0-9]/g)?.length??0)<80 || /schematic|stowage|wiring|diagram|compartment|circuit/i.test(title+" "+p.text)).map(p=>p.pageNumber);
}
