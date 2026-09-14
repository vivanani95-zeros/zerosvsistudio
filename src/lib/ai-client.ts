import type { ZeroMode } from "./zeros";

export type Msg = { role: "user" | "assistant"; content: string };

export async function streamChat(messages: Msg[], mode: ZeroMode, memories: string[], onDelta: (full: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, mode, memories }), signal: signal ?? null });
  if (!res.ok || !res.body) throw new Error((await res.text().catch(() => "")) || `Error ${res.status}`);
  const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let full = "";
  for (;;) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const parts = buffer.split("\n"); buffer = parts.pop() ?? ""; for (const line of parts) { const t=line.trim(); if(!t.startsWith("data:")) continue; const payload=t.slice(5).trim(); if(!payload||payload==="[DONE]") continue; try{const json=JSON.parse(payload);const delta=json?.choices?.[0]?.delta?.content;if(typeof delta==="string"&&delta){full+=delta;onDelta(full);}}catch{} } }
  buffer += decoder.decode(); const trailing=buffer.trim(); if(trailing.startsWith("data:")){const payload=trailing.slice(5).trim();if(payload&&payload!=="[DONE]"){try{const json=JSON.parse(payload);const delta=json?.choices?.[0]?.delta?.content;if(typeof delta==="string"&&delta){full+=delta;onDelta(full);}}catch{}}} if(!full.trim()) throw new Error("Zeros received an empty generation. Please try again."); return full;
}

function findB64(obj: unknown): string | null { if(!obj||typeof obj!=="object") return null; for(const[k,v]of Object.entries(obj as Record<string,unknown>)){if(typeof v==="string"){if(k==="b64_json"&&v.length>100)return`data:image/png;base64,${v}`;if(v.startsWith("data:image/"))return v;}else if(v&&typeof v==="object"){const found=findB64(v);if(found)return found;}}return null; }

async function withTimeout<T>(work:(signal:AbortSignal)=>Promise<T>,ms:number,label:string):Promise<T>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);
  try{return await work(controller.signal)}catch(error){if(controller.signal.aborted)throw new Error(`${label} took too long. Please retry.`);throw error}finally{clearTimeout(timer)}
}

export async function generateImage(prompt:string):Promise<string>{
  return withTimeout(async(signal)=>{
    const res=await fetch("/api/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt}),signal});
    if(!res.ok)throw new Error((await res.text().catch(()=>""))||`Error ${res.status}`);
    const img=findB64(await res.json());if(!img)throw new Error("The image studio returned no image. Try again.");return img;
  },120000,"Image generation");
}

type ModelStatus={status?:string;progress?:number;url?:string|null;previewUrl?:string|null;error?:string};
type ModelReview={score?:number;passed?:boolean;issues?:string[];improvedPrompt?:string};
type CreatedModel={url:string;previewUrl?:string};

async function createModel(prompt:string):Promise<CreatedModel>{
  return withTimeout(async(signal)=>{
    const res=await fetch("/api/model",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"create",prompt}),signal});
    const json=(await res.json().catch(()=>({}))) as ModelStatus;if(!res.ok||!json.url)throw new Error(json.error||"3D generation could not start.");return{url:json.url,...(json.previewUrl?{previewUrl:json.previewUrl}:{})};
  },90000,"3D generation");
}

async function reviewModel(originalPrompt:string,previewUrl:string):Promise<ModelReview|null>{
  try{return await withTimeout(async(signal)=>{const res=await fetch("/api/model",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"review",prompt:originalPrompt,previewUrl}),signal});if(!res.ok)return null;const json=(await res.json().catch(()=>({}))) as {review?:ModelReview|null};return json.review??null;},25000,"3D quality review")}catch{return null}
}

/** Bounded native studio loop: build -> inspect -> one repair pass. Always returns the best renderable model. */
export async function generateModel(prompt:string,onProgress?:(pct:number)=>void):Promise<string>{
  const originalPrompt=prompt.trim();if(!originalPrompt)throw new Error("Describe the 3D model you want.");
  let workingPrompt=originalPrompt;let best:{url:string;score:number}|null=null;
  for(let pass=0;pass<2;pass++){
    onProgress?.(pass===0?12:58);
    const result=await createModel(workingPrompt);
    onProgress?.(pass===0?42:84);
    if(!best)best={url:result.url,score:0};
    if(!result.previewUrl){onProgress?.(100);return result.url}
    const review=await reviewModel(originalPrompt,result.previewUrl);
    if(!review){onProgress?.(100);return best.url}
    const score=typeof review.score==="number"?review.score:0;if(score>=best.score)best={url:result.url,score};
    if(review.passed||score>=9||pass===1){onProgress?.(100);return best.url}
    const issues=(review.issues??[]).filter(Boolean).join("; ");
    workingPrompt=`${review.improvedPrompt?.trim()||originalPrompt}. Preserve the user's request exactly. Repair these visual defects: ${issues||"proportions, silhouette, joins, materials and fine detail"}. Return a complete production-ready asset.`.slice(0,1400);
  }
  if(best){onProgress?.(100);return best.url}
  throw new Error("Zeros Native 3D could not produce a renderable model.");
}
