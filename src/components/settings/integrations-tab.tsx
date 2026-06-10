'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const integrations = [
  {
    name: 'WhatsApp Cloud API',
    provider: 'whatsapp',
    status: 'connected',
  },
  {
    name: 'Meta Lead Ads',
    provider: 'meta_lead_ads',
    status: 'disconnected',
  },
  {
    name: 'Instagram',
    provider: 'instagram',
    status: 'disconnected',
  },
  {
    name: 'Messenger',
    provider: 'messenger',
    status: 'disconnected',
  },
  {
    name: 'Google Business Profile',
    provider: 'google_business',
    status: 'disconnected',
  },
  {
    name: 'Website Forms',
    provider: 'website_form',
    status: 'disconnected',
  },
  {
    name: 'Custom Webhook',
    provider: 'custom_webhook',
    status: 'disconnected',
  },
];

export function IntegrationsTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">
          Integrations
        </h2>

        <p className="text-sm text-slate-400">
          Manage external integrations connected to your CRM.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => (
          <Card
            key={integration.provider}
            className="border-slate-700 bg-slate-900 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">
                  {integration.name}
                </h3>

                <p className="text-xs text-slate-400 mt-1">
                  Provider: {integration.provider}
                </p>
              </div>

              <Badge>
                {integration.status}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}