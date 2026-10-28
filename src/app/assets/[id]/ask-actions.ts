'use server';
import {auth} from '@/auth';
import {reviews} from '@/data/reviews';
import {reviewContext} from '@/data/review-context';
import {planReview} from '@/data/review-planner';
import {evidenceSources} from '@/domain/evidence';
import type {ErnestWriteProposal} from '@/data/ernest-write-proposals';
export type AskErnestState={question:string;answer:string;sources:{photoId?:string;documentId?:string;documentTitle:string;pageNumber:number}[];reviewId?:string;proposal?:ErnestWriteProposal;error?:string;comparison?:{current:string;thin:string;context:string}};
const empty=():AskErnestState=>({question:'',answer:'',sources:[]});
export async function askErnest(assetId:string,_previous:AskErnestState,formData:FormData):Promise<AskErnestState>{
 const session=await auth();if(!session?.user?.id)return{...empty(),error:'Please sign in again.'};
 const question=String(formData.get('question')??'').trim();
 if(question.length>6000)return{...empty(),error:'Keep a request under 6,000 characters, or upload the longer source as a document.'};
 if(!question)return{...empty(),error:'Enter a question or describe an update.'};
 const conversation=String(formData.get('conversation')??'').slice(-12000);
 try{
  if(!await reviews().available())return{...empty(),question,error:'The new review workflow is awaiting its database setup. No records were changed. The existing records remain available in Manage.'};
  const context=await reviewContext(assetId,session.user.id);
  const result=await planReview(assetId,session.user.id,question,conversation,context,String(formData.get('thinkHarder'))==='true');
  const reviewId=result.draft?await reviews().create(assetId,session.user.id,question,result.draft,context):undefined;
  const sources=evidenceSources([
   ...result.evidence.map(e=>({documentId:e.documentId,documentTitle:context.documents.find(d=>d.id===e.documentId)?.title??'Source document',pageNumber:e.pageNumber})),
   ...(result.photos??[]).map(p=>({photoId:p.photoId,documentTitle:p.title,pageNumber:0})),
  ]);
  return{question,answer:result.answer,reviewId,sources};
 }catch{
  return{...empty(),question,error:'Ernest could not complete this investigation or prepare its form. No definitive records changed. Please retry; pending forms remain available in Reviews.'};
 }
}
