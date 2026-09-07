import "server-only";

import postgres from "postgres";

let dbClient: ReturnType<typeof postgres> | undefined;
function database() { const url=process.env.DATABASE_URL; if(!url) throw new Error("DATABASE_URL is required"); dbClient ??= postgres(url,{max:5}); return dbClient; }

export type InventoryItem={id:string;name:string;quantity:string|null;details:string|null;sourceLabel:string|null;sourcePage:number|null;locations:string[]};
export type InventoryLocation={id:string;code:string;label:string|null;notes:string|null;itemCount:number};

export async function getInventoryItems(assetId:string,ownerId:string):Promise<InventoryItem[]>{
 const rows=await database()<Array<{id:string;name:string;quantity:string|null;details:string|null;source_label:string|null;source_page:number|null;locations:string[]|null}>>`
 SELECT i.id,i.name,i.quantity::text,i.details,i.source_label,i.source_page,COALESCE(array_agg(l.code ORDER BY l.code) FILTER (WHERE l.code IS NOT NULL),ARRAY[]::text[]) AS locations
 FROM inventory_items i LEFT JOIN inventory_item_locations il ON il.item_id=i.id LEFT JOIN inventory_locations l ON l.id=il.location_id
 WHERE i.asset_id=${assetId} AND i.owner_id=${ownerId} GROUP BY i.id ORDER BY lower(i.name),i.name;`;
 return rows.map(r=>({id:r.id,name:r.name,quantity:r.quantity,details:r.details,sourceLabel:r.source_label,sourcePage:r.source_page,locations:r.locations??[]}));
}

export async function getInventoryLocations(assetId:string,ownerId:string):Promise<InventoryLocation[]>{
 const rows=await database()<Array<{id:string;code:string;label:string|null;notes:string|null;item_count:number}>>`
 SELECT l.id,l.code,l.label,l.notes,count(il.item_id)::int AS item_count FROM inventory_locations l LEFT JOIN inventory_item_locations il ON il.location_id=l.id
 WHERE l.asset_id=${assetId} AND l.owner_id=${ownerId} GROUP BY l.id ORDER BY lower(l.code),l.code;`;
 return rows.map(r=>({id:r.id,code:r.code,label:r.label,notes:r.notes,itemCount:r.item_count}));
}

export async function createInventoryItem(assetId:string,ownerId:string,input:{name:string;quantity?:string|null;details?:string|null;locationCode?:string|null}){
 const sql=database();
 return sql.begin(async tx=>{
   let locationId:string|null=null;
   if(input.locationCode){
     const loc=await tx<Array<{id:string}>>`SELECT id FROM inventory_locations WHERE asset_id=${assetId} AND owner_id=${ownerId} AND lower(code)=lower(${input.locationCode}) LIMIT 1`;
     if(!loc[0]) return null;
     locationId=loc[0].id;
   }
   const quantity=input.quantity?.trim() && /^\d+(?:\.\d+)?$/.test(input.quantity.trim()) ? Number(input.quantity.trim()) : null;
   const rows=await tx<Array<{id:string}>>`INSERT INTO inventory_items(asset_id,owner_id,name,quantity,details,source_label) VALUES(${assetId},${ownerId},${input.name.trim()},${quantity},${input.details?.trim()||null},'Owner provided') RETURNING id`;
   if(locationId) await tx`INSERT INTO inventory_item_locations(item_id,location_id) VALUES(${rows[0].id},${locationId}) ON CONFLICT DO NOTHING`;
   return rows[0]?.id??null;
 });
}

export async function updateInventoryItem(assetId:string,ownerId:string,itemId:string,input:{name?:string;quantity?:string|null;details?:string|null;locationCode?:string|null}){
 const sql=database();
 return sql.begin(async tx=>{
   const existing=await tx<Array<{id:string;name:string;quantity:string|null;details:string|null}>>`SELECT id,name,quantity::text,details FROM inventory_items WHERE id=${itemId} AND asset_id=${assetId} AND owner_id=${ownerId} LIMIT 1`;
   if(!existing[0]) return false;
   let locationId:string|null=null;
   if(input.locationCode){ const loc=await tx<Array<{id:string}>>`SELECT id FROM inventory_locations WHERE asset_id=${assetId} AND owner_id=${ownerId} AND lower(code)=lower(${input.locationCode}) LIMIT 1`; if(!loc[0]) return false; locationId=loc[0].id; }
   const name=input.name?.trim()||existing[0].name;
   const details=input.details===undefined?existing[0].details:(input.details?.trim()||null);
   const q=input.quantity===undefined?existing[0].quantity:(input.quantity?.trim()||null);
   const quantity=q && /^\d+(?:\.\d+)?$/.test(q)?Number(q):null;
   await tx`UPDATE inventory_items SET name=${name},quantity=${quantity},details=${details},source_label='Owner provided',updated_at=now() WHERE id=${itemId} AND asset_id=${assetId} AND owner_id=${ownerId}`;
   if(locationId){ await tx`DELETE FROM inventory_item_locations WHERE item_id=${itemId};`; await tx`INSERT INTO inventory_item_locations(item_id,location_id) VALUES(${itemId},${locationId})`; }
   return true;
 });
}
