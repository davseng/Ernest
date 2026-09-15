export function createBoatUploadClient({endpoint,authorization=null,fetchImpl=fetch}){
  if(!endpoint)throw new Error('Cloud sync endpoint is required.');
  const base=String(endpoint).replace(/\/$/,'');
  async function upload(batch){
    const headers={Accept:'application/json','Content-Type':'application/json'};
    if(authorization)headers.Authorization=authorization;
    let response;try{response=await fetchImpl(base,{method:'POST',headers,body:JSON.stringify(batch),redirect:'manual'})}catch(error){return{status:'offline',error:error.message}}
    let body=null;try{body=await response.json()}catch{}
    if(response.status===401||response.status===403)return{status:'authentication-required',httpStatus:response.status,error:body?.error||'Boat sync authorization failed.'};
    if(response.status===503&&body?.uploadEnabled===false)return{status:'disabled',httpStatus:503,error:body?.error||'Boat-to-Cloud upload is disabled.'};
    if(!response.ok)return{status:'error',httpStatus:response.status,error:body?.error||`Boat-to-Cloud upload failed with HTTP ${response.status}.`};
    if(body?.kind!=='operating-log-batch-result')return{status:'error',error:'Cloud upload returned an unsupported response.'};
    return{status:'uploaded',result:body};
  }
  return{upload};
}
