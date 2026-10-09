import type { SyncClient, SyncStatus } from '@kp/core';
import type { SyncProps } from './types';

/** Stan klienta synchronizacji → właściwości bloku „Synchronizacja” w ustawieniach. */
export function syncPanelProps(
  client: SyncClient,
  status: SyncStatus,
  shareUrl?: (code: string) => string,
): SyncProps {
  return {
    ...status,
    ...(status.code && shareUrl && { shareUrl: shareUrl(status.code) }),
    onCreate: () => void client.create(),
    onConnect: (code) => void client.connect(code),
    onDisconnect: () => void client.disconnect(),
    onForget: () => void client.forgetRemote(),
    onSyncNow: () => void client.syncNow(),
  };
}
