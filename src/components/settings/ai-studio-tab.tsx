'use client';

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type Settings = {
  provider: "gemini" | "openai";
  model: string;
  customInstructions: string;
  businessKnowledge: string;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
};

export function AIStudioTab() {
  const [settings,setSettings]=useState<Settings>({provider:"gemini",model:"gemini-2.5-flash",customInstructions:"",businessKnowledge:"",hasApiKey:false,apiKeyLast4:null});
  const [apiKey,setApiKey]=useState("");
  const [message,setMessage]=useState("Hi, I want to know about your spa services.");
  const [reply,setReply]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [testing,setTesting]=useState(false);

  useEffect(()=>{
    let active=true;
    fetch("/api/ai/training").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load settings");if(active)setSettings(d.settings);})
      .catch(e=>{if(active)toast.error(e instanceof Error?e.message:"Could not load settings");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);

  async function save(){
    setSaving(true);
    try{
      const r=await fetch("/api/ai/training",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...settings,apiKey})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||"Save failed");
      setSettings(d.settings);setApiKey("");toast.success("AI training saved");
    }catch(e){toast.error(e instanceof Error?e.message:"Save failed");}
    finally{setSaving(false);}
  }
  async function test(){
    setTesting(true);setReply("");
    try{
      const r=await fetch("/api/ai/training/test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||"Test failed");
      setReply(d.reply||"No response");toast.success("Preview generated; no WhatsApp message was sent");
    }catch(e){toast.error(e instanceof Error?e.message:"Test failed");}
    finally{setTesting(false);}
  }

  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold text-white">AI Studio</h2><p className="mt-1 text-sm text-slate-400">OpenAI/Gemini providers, custom instructions and verified spa knowledge. Admin access is required. Test mode never sends customer messages.</p></div>
    <Card className="space-y-4 border-slate-700 bg-slate-900 p-5">
      <div className="flex items-center justify-between gap-3"><h3 className="font-medium text-white">AI Provider</h3><Badge>{settings.hasApiKey?"Key configured":"API key required"}</Badge></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm text-slate-300"><span>Provider</span><select className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white" disabled={loading||saving} value={settings.provider} onChange={e=>{const provider=e.target.value as Settings["provider"];setSettings({...settings,provider,model:provider==="openai"?"gpt-4o-mini":"gemini-2.5-flash",hasApiKey:provider===settings.provider&&settings.hasApiKey,apiKeyLast4:provider===settings.provider?settings.apiKeyLast4:null});setApiKey("");}}><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option></select></label>
        <label className="space-y-1 text-sm text-slate-300"><span>Model ID</span><input className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white" value={settings.model} onChange={e=>setSettings({...settings,model:e.target.value})} maxLength={120} disabled={loading||saving}/></label>
      </div>
      <label className="block space-y-1 text-sm text-slate-300"><span>API Key {settings.hasApiKey&&settings.apiKeyLast4?"(ends in "+settings.apiKeyLast4+")":""}</span><input type="password" autoComplete="new-password" className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={settings.hasApiKey?"Leave blank to keep saved key":"Paste provider API key"} maxLength={500} disabled={loading||saving}/><span className="block text-xs text-slate-500">Encrypted server-side. Never returned to the browser. Leave blank to keep the saved key.</span></label>
      <Button onClick={save} disabled={loading||saving}>{saving?"Saving…":"Save Provider"}</Button>
    </Card>
    <Card className="space-y-4 border-slate-700 bg-slate-900 p-5"><div><h3 className="font-medium text-white">AI Training</h3><p className="mt-1 text-sm text-slate-400">Mandatory safety and booking safeguards remain in effect.</p></div>
      <label className="block space-y-1 text-sm text-slate-300"><span>Custom instructions</span><textarea className="min-h-36 w-full rounded-md border border-slate-700 bg-slate-800 p-3 text-white" value={settings.customInstructions} onChange={e=>setSettings({...settings,customInstructions:e.target.value})} maxLength={10000} disabled={loading||saving} placeholder="Tone, language, FAQs, qualification rules…"/><span className="text-xs text-slate-500">{settings.customInstructions.length}/10000 characters</span></label>
      <label className="block space-y-1 text-sm text-slate-300"><span>Verified business knowledge</span><textarea className="min-h-36 w-full rounded-md border border-slate-700 bg-slate-800 p-3 text-white" value={settings.businessKnowledge} onChange={e=>setSettings({...settings,businessKnowledge:e.target.value})} maxLength={10000} disabled={loading||saving} placeholder="Verified services, prices, hours, location and FAQs…"/><span className="text-xs text-slate-500">{settings.businessKnowledge.length}/10000 characters</span></label>
      <Button onClick={save} disabled={loading||saving}>{saving?"Saving…":"Save Training"}</Button>
    </Card>
    <Card className="space-y-4 border-slate-700 bg-slate-900 p-5"><div><h3 className="font-medium text-white">Test Playground</h3><p className="mt-1 text-sm text-slate-400">Preview only; it does not create appointments or send WhatsApp messages.</p></div>
      <textarea className="min-h-24 w-full rounded-md border border-slate-700 bg-slate-800 p-3 text-white" value={message} onChange={e=>setMessage(e.target.value)} maxLength={2000} disabled={testing} placeholder="Sample customer message…"/>
      <Button onClick={test} disabled={loading||testing||!message.trim()}>{testing?"Testing…":"Generate Preview"}</Button>
      {reply?<div className="rounded-md border border-slate-700 bg-slate-800 p-4"><p className="mb-1 text-xs font-semibold uppercase text-slate-400">Preview</p><p className="whitespace-pre-wrap text-sm text-white">{reply}</p></div>:null}
    </Card>
  </div>;
}
