import { z } from 'zod';
import { uuid } from './validation';

export const stageInput = z.object({
  name: z.string().trim().min(1).max(60),
  position: z.string().regex(/^(?:[1-9]\d{0,3}|10000)$/).transform(Number),
});
export const dealInput = z.object({
  title: z.string().trim().min(1).max(120),
  contact: uuid,
  stage: uuid,
  amount: z.string().trim().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/),
});
export const stageMoveInput = z.object({ deal: uuid, from: uuid, to: uuid })
  .refine(input => input.from !== input.to);
