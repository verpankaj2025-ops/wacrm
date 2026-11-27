import { afterEach, expect, test, vi } from 'vitest';
import { connectChannel, sendMessage } from '../app/inbox/actions';
import { organizationAccess } from '../lib/organization-access';
import { approvedTemplate, deliverMessage, tokenKey, verifyChannel, whatsappAdmin } from '../lib/whatsapp/server';
import { openToken, sealToken } from '../lib/whatsapp/core';

vi.mock('next/cache', () => ({revalidatePath:vi.fn()}));
vi.mock('../lib/organization-access', () => ({organizationAccess:vi.fn()}));
vi.mock('../lib/whatsapp/server', () => ({
  tokenKey:vi.fn(),whatsappAdmin:vi.fn(),approvedTemplate:vi.fn(),deliverMessage:vi.fn(),verifyChannel:vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const thread = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const phone = '12345';
const token = 'private-meta-token-fixture';
const key = Buffer.alloc(32,3);

test('registration persists encrypted tokens and returns no credentials or database errors', async () => {
  const upsert = vi.fn().mockResolvedValue({error:null});
  vi.mocked(verifyChannel).mockResolvedValue(true);
  vi.mocked(tokenKey).mockReturnValue(key);
  vi.mocked(whatsappAdmin).mockReturnValue({from:() => ({upsert})} as unknown as ReturnType<typeof whatsappAdmin>);
  vi.mocked(organizationAccess).mockResolvedValue({org:{org_id:org},writable:true,role:'admin'} as unknown as Awaited<ReturnType<typeof organizationAccess>>);
  const fields = new FormData();
  for (const [name,value] of Object.entries({workspace:org,number:phone,waba:'54321',token})) fields.set(name,value);
  expect(await connectChannel({},fields)).toEqual({status:'WhatsApp number saved.'});
  const stored = upsert.mock.calls[0][0];
  expect(stored).toMatchObject({org_id:org,phone_number_id:phone,key_version:1});
  expect(JSON.stringify(stored)).not.toContain(token);
  expect(openToken(stored.encrypted_token,key,org,phone,1)).toBe(token);
  upsert.mockResolvedValue({error:{details:token}});
  expect(await connectChannel({},fields)).toEqual({error:'The change could not be saved.'});
});

test('send action blocks STOP, verifies the template with Meta, and keeps tokens out of results', async () => {
  const contact = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  let consent = false;
  const connection = {
    whatsapp_conversations:{id:thread,phone_number_id:phone,contact_id:contact,last_inbound_at:null},
    contacts:{phone_e164:'+919876543210'},
    whatsapp_channels:{waba_id:'54321',key_version:1,encrypted_token:sealToken(token,key,org,phone,1)},
  };
  function from(table:keyof typeof connection | 'whatsapp_consent') {
    const result = () => ({data:table === 'whatsapp_consent' ? {opted_in:consent} : connection[table],error:null});
    const query = {select:() => query,eq:() => query,maybeSingle:result,single:result};
    return query;
  }
  vi.mocked(organizationAccess).mockResolvedValue({client:{from},org:{org_id:org},writable:true,role:'agent'} as unknown as Awaited<ReturnType<typeof organizationAccess>>);
  vi.mocked(whatsappAdmin).mockReturnValue({from,rpc:vi.fn().mockResolvedValue({error:null})} as unknown as ReturnType<typeof whatsappAdmin>);
  vi.mocked(tokenKey).mockReturnValue(key);
  const fields = new FormData();
  for (const [name,value] of Object.entries({workspace:org,thread,text:'Do not send this as free text',template:'hello_world',language:'en_US'})) fields.set(name,value);

  expect(await sendMessage({},fields)).toEqual({error:'This contact has not opted in to WhatsApp messages.'});
  expect(deliverMessage).not.toHaveBeenCalled();
  consent = true;
  vi.mocked(approvedTemplate).mockResolvedValue(false);
  expect(await sendMessage({},fields)).toHaveProperty('error');
  expect(deliverMessage).not.toHaveBeenCalled();
  vi.mocked(approvedTemplate).mockResolvedValue(true);
  vi.mocked(deliverMessage).mockResolvedValue('wamid.sent');
  expect(await sendMessage({},fields)).toEqual({status:'Message sent.'});
  expect(approvedTemplate).toHaveBeenCalledWith('54321',token,{name:'hello_world',language:'en_US'});
  expect(deliverMessage).toHaveBeenCalledWith(phone,token,'+919876543210',
    {type:'template',template:{name:'hello_world',language:{code:'en_US'}}});
  vi.mocked(deliverMessage).mockRejectedValue(new Error(token));
  expect(await sendMessage({},fields)).toEqual({error:'Delivery could not be confirmed. Check before sending again.'});
});
