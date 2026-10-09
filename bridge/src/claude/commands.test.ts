import { describe, expect, it } from 'bun:test';
import { parseBuiltins, slashCommands } from './commands.ts';

const bundle = [
  'var a={type:"local",name:"voice",description:"Toggle voice mode",argumentHint:"[hold|tap|off]"}',
  'var b={type:"local-jsx",name:"cd",description:"Move this session to a new working directory"}',
  'R({name:"read",description:"Read a UTF-8 text file relative to the workdir."})',
  'var c={name:"sleep",description:"Delay for a specified amount of time"}',
  'var d={type:"local-jsx",name:"agents",description:"(removed) Ask Claude to create subagents"}',
  'var e={type:"local",name:"extra-usage",description:"Renamed to /usage-credits"}',
  'var f={type:"prompt",name:"review",description:"Review a \\"pull\\" request"}',
].join(';');

describe('parseBuiltins', () => {
  it('keeps typed command definitions and drops tools, flags and retired ones', () => {
    expect(parseBuiltins(bundle)).toEqual([
      {
        name: '/cd',
        description: 'Move this session to a new working directory',
        source: 'builtin',
      },
      {
        name: '/review',
        description: 'Review a "pull" request',
        source: 'builtin',
      },
      {
        name: '/voice',
        description: 'Toggle voice mode',
        source: 'builtin',
      },
    ]);
  });
});

describe('slashCommands (installed Claude Code)', () => {
  it('finds real built-ins like /voice when Claude Code is installed', async () => {
    const commands = await slashCommands(null);
    const names = commands.map((c) => c.name);
    expect(names).toContain('/clear');
    if (names.length > 20) expect(names).toContain('/voice');
  });
});
