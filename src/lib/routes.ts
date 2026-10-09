import type { PaneRef } from '@devhub/shared/hub';

export const panePath = (ref: PaneRef) =>
  `/m/${encodeURIComponent(ref.machineId)}/p/${encodeURIComponent(ref.paneId)}`;
