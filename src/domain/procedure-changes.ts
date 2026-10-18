type Details={title:string;notes:string|null;steps:Array<{instruction:string;note:string|null}>};
export function describeProcedureChanges(before:Details,after:Details){
 const changes:string[]=[];
 if(before.title!==after.title)changes.push(`Renamed to ${after.title}`);
 if((before.notes??"")!==(after.notes??""))changes.push("Updated procedure notes");
 const key=(s:Details["steps"][number])=>`${s.instruction}\n${s.note??""}`;
 for(const step of before.steps)if(!after.steps.some(s=>key(s)===key(step)))changes.push(`Removed/revised: ${step.instruction}`);
 for(const step of after.steps)if(!before.steps.some(s=>key(s)===key(step)))changes.push(`Added/revised: ${step.instruction}${step.note?` (${step.note})`:""}`);
 if(before.steps.length===after.steps.length && changes.length===0 && before.steps.some((s,i)=>key(s)!==key(after.steps[i])))changes.push("Reordered existing steps");
 return changes.length?changes:["No content changes"];
}
