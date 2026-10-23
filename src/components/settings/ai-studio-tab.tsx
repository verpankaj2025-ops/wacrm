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
  const [settings, setSettings] = useState<Settings>({
    provider: "gemini", model: "gemini-2.5-flash",
    customInstructions: "", businessKnowledge: "", hasApiKey: false, apiKeyLast4: null,
  });
  const [apiKey, setApiKey] = useState("");
  const [testMessage, setTestMessage] = useState("Hi, I want to know about your spa services.");
  const [testReply, setTestReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/ai/settings")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load AI settings");
        if (active) setSettings(data.settings);
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : "Could not load AI settings");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveSettings() {
    setSaving(true);
    try {
      const response = await fetch("/api/ai/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, apiKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save AI settings");
      setSettings(data.settings);
      setApiKey("");
      toast.success("AI settings saved securely");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save AI settings");
    } finally { setSaving(false); }
  }

  async function testAI() {
    setTesting(true); setTestReply("");
    try {
      const response = await fetch("/api/ai/settings/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI test failed");
      setTestReply(data.result?.reply ?? "The provider returned no reply.");
      toast.success("Test reply generated; no WhatsApp message was sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI test failed");
    } finally { setTesting(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white">AI Studio</h2>
        <p className="mt-1 text-sm text-slate-400">Configure OpenAI or Google Gemini and add approved business knowledge. Settings apply to CRM chat and WhatsApp replies. Admin access required.</p>
      </div>
      <Card className="space-y-4 border-slate-700 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium text-white">AI provider</h3>
          <Badge>{settings.hasApiKey ? "Key configured" : "API key required"}</Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-300"><span>Provider</span>
            <select className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white" value={settings.provider}
              onChange={(e) => {
                const provider = e.target.value as Settings["provider"];
                setSettings({
                  ...settings,
                  provider,
                  model: provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash",
                  hasApiKey: provider === settings.provider ? settings.hasApiKey : false,
                  apiKeyLast4: provider === settings.provider ? settings.apiKeyLast4 : null,
                });
                if (provider !== settings.provider) setApiKey("");
              }} disabled={loading || saving}>
              <option value="gemini">Google Gemini</option><option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="space-y-1 text-sm text-slate-300"><span>Model ID</span>
            <input className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white" value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })} maxLength={120} disabled={loading || saving} />
          </label>
        </div>
        <label className="block space-y-1 text-sm text-slate-300">
          <span>API key {settings.hasApiKey && settings.apiKeyLast4 ? "(saved key ends in " + settings.apiKeyLast4 + ")" : ""}</span>
          <input type="password" autoComplete="new-password" className="w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-white"
            value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={settings.hasApiKey ? "Leave blank to keep saved key" : "Paste provider API key"} maxLength={500} disabled={loading || saving} />
          <span className="block text-xs text-slate-500">Encrypted server-side. The key is never returned to the browser. Leave blank to keep the existing key.</span>
        </label>
        <Button onClick={saveSettings} disabled={loading || saving}>{saving ? "Saving…" : "Save AI settings"}</Button>
      </Card>
      <Card className="space-y-4 border-slate-700 bg-slate-900 p-5">
        <div><h3 className="font-medium text-white">AI Training</h3><p className="mt-1 text-sm text-slate-400">Core privacy, booking and human-handoff safeguards remain in effect.</p></div>
        <label className="block space-y-1 text-sm text-slate-300"><span>Custom instructions</span>
          <textarea className="min-h-36 w-full rounded-md border border-slate-700 bg-slate-800 p-3 text-white" value={settings.customInstructions}
            onChange={(e) => setSettings({ ...settings, customInstructions: e.target.value })} maxLength={10000} disabled={loading || saving}
            placeholder="Tone, reply style, FAQs, qualification rules…" />
          <span className="text-xs text-slate-500">{settings.customInstructions.length}/10000 characters</span>
        </label>
        <label className="block space-y-1 text-sm text-slate-300"><span>Verified business knowledge</span>
          <textarea className="min-h-36 w-full rounded-md border border-slate-700 bg-slate-800 p-3 text-white" value={settings.businessKnowledge}
            onChange={(e) => setSettings({ ...settings, businessKnowledge: e.target.value })} maxLength={10000} disabled={loading || saving}
            placeholder="Verified services, prices, hours, location, membership, FAQs…" />
          <span className="text-xs text-slate-500">{settings.businessKnowledge.length}/10000 characters</span>
        </label>
        <Button onClick={saveSettings} disabled={loading || saving}>{saving ? "Saving…" : "Save training instructions"}</Button>
      </Card>
      <Card className="space-y-4 border-slate-700 bg-slate-900 p-5">
        <div><h3 className="font-medium text-white">Test playground</h3><p className="mt-1 text-sm text-slate-400">Previews a reply without sending WhatsApp messages or creating bookings.</p></div>
        <textarea className="min-h-24 w-full rounded-md border border-slate-700 bg-slate-800 p-3 text-white" value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)} maxLength={2000} disabled={testing} placeholder="Sample customer message…" />
        <Button onClick={testAI} disabled={loading || testing || !testMessage.trim()}>{testing ? "Testing…" : "Generate test reply"}</Button>
        {testReply ? <div className="rounded-md border border-slate-700 bg-slate-800 p-4"><p className="mb-1 text-xs font-semibold uppercase text-slate-400">AI preview</p><p className="whitespace-pre-wrap text-sm text-white">{testReply}</p></div> : null}
      </Card>
    </div>
  );
}
