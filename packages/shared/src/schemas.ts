import { z } from 'zod';
import { ASSETS, VALID_INTERVALS } from './constants';

export const AssetParam = z.enum(ASSETS as unknown as [string, ...string[]]);

export const HistoryQuery = z.object({
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional(),
  interval: z.enum(VALID_INTERVALS).default('1m'),
});

export const WsSubscribeSchema = z.object({
  action: z.literal('subscribe'),
  assets: z.array(AssetParam),
});
