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
export async function generateImage(prompt:string):Promise<string>{const res=await fetch("/api/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,stream:false})});if(!res.ok)throw new Error((await res.text().catch(()=>""))||`Error ${res.status}`);const img=findB64(await res.json());if(!img)throw new Error("The image studio returned no image. Try again.");return img;}

type ModelStatus={status?:string;progress?:number;url?:string|null;previewUrl?:string|null;error?:string};
type ModelReview={score?:number;passed?:boolean;issues?:string[];improvedPrompt?:string};
type CreatedModel={url:string;previewUrl?:string};

async function createModel(prompt:string):Promise<CreatedModel>{const res=await fetch("/api/model",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"create",prompt})});const json=(await res.json().catch(()=>({}))) as ModelStatus;if(!res.ok||!json.url)throw new Error(json.error||"3D generation could not start.");return{url:json.url,...(json.previewUrl?{previewUrl:json.previewUrl}:{})};}
async function reviewModel(originalPrompt:string,previewUrl:string):Promise<ModelReview|null>{const res=await fetch("/api/model",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"review",prompt:originalPrompt,previewUrl})});if(!res.ok)return null;const json=(await res.json().catch(()=>({}))) as {review?:ModelReview|null};return json.review??null;}

/** Native Zeros loop: generate from scratch -> inspect -> repair blueprint/prompt -> regenerate. */
export async function generateModel(prompt:string,onProgress?:(pct:number)=>void):Promise<string>{
  const MAX_PASSES=12;const originalPrompt=prompt.trim();let workingPrompt=originalPrompt;let best:{url:string;score:number}|null=null;
  for(let pass=0;pass<MAX_PASSES;pass++){
    onProgress?.((pass/MAX_PASSES)*100);
    const result=await createModel(workingPrompt);if(!result.previewUrl)throw new Error("Zeros could not inspect the native model preview.");
    onProgress?.(Math.min(95,((pass+.65)/MAX_PASSES)*100));
    const review=await reviewModel(originalPrompt,result.previewUrl);if(!review)throw new Error("Zeros could not complete the model quality inspection. Please try again.");
    const score=typeof review.score==="number"?review.score:0;if(!best||score>best.score)best={url:result.url,score};
    if(review.passed&&score===10){onProgress?.(100);return result.url;}
    const repair=review.improvedPrompt?.trim()||workingPrompt;const issues=(review.issues??[]).filter(Boolean).join("; ");
    workingPrompt=`${repair}. Preserve the original request exactly. Repair every detected defect before regenerating. ${issues?`Detected failures: ${issues}.`:"Increase geometry, proportions, symmetry, materials and fine detail until the zero-tolerance production gate passes."}`.slice(0,1400);
  }
  throw new Error(best?"Zeros generated multiple native model revisions but none passed the 10/10 production gate. Please retry for another native build.":"Zeros Native 3D could not produce a reviewable model.");
}
