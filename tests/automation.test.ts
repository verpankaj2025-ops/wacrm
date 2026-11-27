import { expect, test, vi } from 'vitest';
import { stepSchema, executeStep } from '../lib/automations';

test('conditional steps take matching branches and skip nonmatching branches', async () => {
  const perform = vi.fn(async () => {});
  const job = {trigger_kind:'inbound',step_index:0,steps:[{kind:'webhook',when:'lead'}]};
  expect(await executeStep(job,'contact',perform)).toEqual({result:'advance',wait:0});
  expect(perform).not.toHaveBeenCalled();
  expect(await executeStep(job,'lead',perform)).toEqual({result:'advance',wait:0});
  expect(perform).toHaveBeenCalledOnce();
});

test('waits persist a resume delay and steps reject arbitrary webhook URLs', async () => {
  expect(await executeStep({trigger_kind:'schedule',step_index:0,steps:[{kind:'wait',when:'always',seconds:90}]},null,vi.fn()))
    .toEqual({result:'advance',wait:90});
  expect(stepSchema.safeParse({kind:'wait',when:'always',seconds:604801}).success).toBe(false);
  expect(stepSchema.safeParse({kind:'webhook',when:'always',url:'http://localhost'}).success).toBe(false);
});
