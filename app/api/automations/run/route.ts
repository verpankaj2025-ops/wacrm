import { runAutomation } from '../../../../lib/automation-worker';
import { equalSecret } from '../../../../lib/whatsapp/core';

export const runtime = 'nodejs';

export async function POST(request:Request) {
  const secret = process.env.AUTOMATION_RUNNER_SECRET;
  if (!secret || secret.length < 32 || !equalSecret('Bearer ' + secret,request.headers.get('authorization') ?? '')) {
    return new Response(null,{status:401});
  }
  try {
    const deadline = Date.now()+8_000;
    let processed = 0;
    while (processed < 10 && Date.now() < deadline && await runAutomation()) processed++;
    return Response.json({processed},{headers:{'Cache-Control':'no-store'}});
  } catch {
    return new Response(null,{status:503});
  }
}
