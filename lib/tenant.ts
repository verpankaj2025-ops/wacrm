import type { SupabaseClient } from '@supabase/supabase-js';
import { uuid } from './validation';

export const organizationFilesBucket = 'organization-files';

export function organizationFilePath(org: string, firstSegment: string, ...segments: string[]) {
  const namespace = uuid.parse(org).toLowerCase();
  const path = [firstSegment, ...segments];
  for (const segment of path) {
    if (!segment || segment === '.' || segment === '..' || /[/\\%]/.test(segment)) {
      throw new Error('Invalid organization file path segment');
    }
  }
  return [namespace, ...path].join('/');
}

export function organizationTopic(org: string) {
  return 'org:' + uuid.parse(org).toLowerCase();
}

export function organizationBroadcastChannel(client: Pick<SupabaseClient, 'channel'>, org: string) {
  return client.channel(organizationTopic(org), { config: { private: true } });
}
