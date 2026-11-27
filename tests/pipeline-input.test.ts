import { expect, test } from 'vitest';
import { dealInput, stageMoveInput } from '../lib/pipeline-input';

const deal = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const from = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const to = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('stage moves require valid deal and stage IDs and a different destination', () => {
  expect(stageMoveInput.safeParse({ deal, from, to }).success).toBe(true);
  expect(stageMoveInput.safeParse({ deal, from, to: from }).success).toBe(false);
  expect(stageMoveInput.safeParse({ deal, from, to: 'bogus' }).success).toBe(false);
});

test('deal amounts accept bounded rupee decimals without rounding', () => {
  const input = { title: ' Follow up ', contact: deal, stage: from };
  expect(dealInput.parse({ ...input, amount: '19.05' })).toEqual({ ...input, title: 'Follow up', amount: '19.05' });
  for (const amount of ['-1', '1.001', '1e3', '10000000000']) {
    expect(dealInput.safeParse({ ...input, amount }).success).toBe(false);
  }
});
