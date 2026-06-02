/**
 * rcp-09: Channel adapter registry — resolve provider/payload to a ChannelAdapter.
 */

import type { WebhookProvider } from '../../types/webhook';
import type { ChannelAdapter } from './types';

const adapters: ChannelAdapter[] = [];

export function registerChannelAdapter(adapter: ChannelAdapter): void {
  adapters.push(adapter);
}

/** First adapter whose matches(provider, payload) is true, or null. */
export function resolveChannelAdapter(
  provider: WebhookProvider,
  payload: unknown
): ChannelAdapter | null {
  for (const adapter of adapters) {
    if (adapter.matches(provider, payload)) {
      return adapter;
    }
  }
  return null;
}

/** Test-only: reset registry between unit tests. */
export function clearChannelAdaptersForTests(): void {
  adapters.length = 0;
}
