import type { Trade, DepthSnapshot, FundingUpdate } from '@bull-bear/shared';

export type ExchangeEvent =
  | { type: 'trade'; data: Trade }
  | { type: 'depth'; data: DepthSnapshot }
  | { type: 'funding'; data: FundingUpdate };

export type ExchangeEventHandler = (event: ExchangeEvent) => void;

export interface ExchangeAdapter {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
}
