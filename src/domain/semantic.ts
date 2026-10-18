export function cosineSimilarity(a:number[],b:number[]){
 if(!a.length||a.length!==b.length||![...a,...b].every(Number.isFinite))return 0;
 let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]**2;bb+=b[i]**2;}
 return aa&&bb?dot/Math.sqrt(aa*bb):0;
}
