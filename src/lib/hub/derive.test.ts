import { describe, expect, it } from 'vitest';
import {
  attention,
  defaultPane,
  findPane,
  statusCounts,
} from './derive.ts';
import { createMockConnection } from './mock-connection.ts';

const snapshot = createMockConnection().snapshot();

describe('hub derivations', () => {
  it('counts working, waiting and failing panes', () => {
    expect(statusCounts(snapshot)).toEqual({
      working: 2,
      needsYou: 2,
      failing: 1,
    });
  });

  it('orders attention oldest ask first', () => {
    const titles = attention(snapshot).map((a) => a.pane.title);
    expect(titles).toEqual(['AG-UI translator', 'Skill parity sync']);
  });

  it('opens the longest-waiting agent by default', () => {
    expect(defaultPane(snapshot)?.paneId).toBe('w5:p2');
  });

  it('finds panes by machine and pane id', () => {
    const hit = findPane(snapshot, {
      machineId: 'demo',
      paneId: 'w2:p2',
    });
    expect(hit?.workspace.name).toBe('deadrop.vault-sync');
    expect(
      findPane(snapshot, { machineId: 'other', paneId: 'w2:p2' }),
    ).toBeUndefined();
  });
});
