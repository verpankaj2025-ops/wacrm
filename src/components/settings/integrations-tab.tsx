'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

type Integration = {
id: string;
provider: string;
status: string;
};

const DEFAULT_PROVIDERS = [
'whatsapp',
'meta_lead_ads',
'instagram',
'messenger',
'google_business',
'website_form',
'custom_webhook',
];

export function IntegrationsTab() {
const supabase = createClient();
const { accountId } = useAuth();

const [loading, setLoading] = useState(true);
const [integrations, setIntegrations] = useState<Integration[]>([]);

const [pageId, setPageId] = useState('');
const [formId, setFormId] = useState('');
const [accessToken, setAccessToken] = useState('');

useEffect(() => {
loadIntegrations();
}, []);

async function loadIntegrations() {
setLoading(true);

const { data } = await supabase
  .from('integrations')
  .select('*')
  .order('provider');

if (data) {
  setIntegrations(data);
}

setLoading(false);

}

async function connectMetaLeadAds() {
if (!accountId) {
toast.error('Account not found');
return;
}

const { error } = await supabase
  .from('integrations')
  .upsert({
    account_id: accountId,
    provider: 'meta_lead_ads',
    status: 'connected',
    config_json: {},
  });

if (error) {
  toast.error(error.message);
  return;
}

toast.success('Meta Lead Ads integration created');

await loadIntegrations();

}

async function saveMetaLeadAdsConfig() {
if (!accountId) {
toast.error('Account not found');
return;
}

const { error } = await supabase
  .from('integrations')
  .upsert({
    account_id: accountId,
    provider: 'meta_lead_ads',
    status: 'connected',
    config_json: {
      page_id: pageId,
      form_id: formId,
      access_token: accessToken,
    },
  });

if (error) {
  toast.error(error.message);
  return;
}

toast.success('Meta Lead Ads configuration saved');

await loadIntegrations();

}

function getStatus(provider: string) {
const integration = integrations.find(
(i) => i.provider === provider
);

return integration?.status ?? 'disconnected';

}

return ( <div className="space-y-4"> <div> <h2 className="text-xl font-semibold text-white">
Integrations </h2>

    <p className="text-sm text-slate-400">
      Manage external integrations connected to your CRM.
    </p>
  </div>

  {loading ? (
    <div className="flex items-center gap-2 text-slate-400">
      <Loader2 className="size-4 animate-spin" />
      Loading integrations...
    </div>
  ) : (
    <div className="grid gap-4 md:grid-cols-2">
      {DEFAULT_PROVIDERS.map((provider) => (
        <Card
          key={provider}
          className="border-slate-700 bg-slate-900 p-5"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">
                  {provider}
                </h3>

                <p className="text-xs text-slate-400 mt-1">
                  Provider: {provider}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge>
                  {getStatus(provider)}
                </Badge>

                {provider === 'meta_lead_ads' &&
                  getStatus(provider) !== 'connected' && (
                    <Button
                      size="sm"
                      onClick={connectMetaLeadAds}
                    >
                      Connect
                    </Button>
                  )}
              </div>
            </div>

            {provider === 'meta_lead_ads' &&
              getStatus(provider) === 'connected' && (
                <div className="space-y-2">
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm"
                    placeholder="Meta Page ID"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                  />

                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm"
                    placeholder="Lead Form ID"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                  />

                  <input
                    className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm"
                    placeholder="Access Token"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />

                  <Button
                    size="sm"
                    onClick={saveMetaLeadAdsConfig}
                  >
                    Save Config
                  </Button>
                </div>
              )}
          </div>
        </Card>
      ))}
    </div>
  )}
</div>

);
}
