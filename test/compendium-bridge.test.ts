import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchCompendium, type CompendiumSearchCommand } from '../src/tools/compendium.js';

describe('compendium bridge adapter', () => {
  it('uses the current bridge command for cross-pack searches', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const command: CompendiumSearchCommand = async (type, params) => {
      calls.push([type, params]);
      return [{ packId: 'pf2e.pathfinder-bestiary', id: 'goblin', name: 'Goblin' }];
    };

    await searchCompendium(command, { name: 'goblin', documentType: 'Actor', limit: 5 });

    assert.deepEqual(calls, [['search-compendiums', { query: 'goblin', type: 'Actor', limit: 5 }]]);
  });

  it('uses the current bridge command for pack-scoped searches', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const command: CompendiumSearchCommand = async (type, params) => {
      calls.push([type, params]);
      return { packId: 'pf2e.pathfinder-bestiary', results: [] };
    };

    await searchCompendium(command, {
      name: 'goblin',
      packId: 'pf2e.pathfinder-bestiary',
      limit: 10,
    });

    assert.deepEqual(calls, [
      ['search-compendium', { packId: 'pf2e.pathfinder-bestiary', query: 'goblin', limit: 10 }],
    ]);
  });

  it('falls back to the legacy command when the modern command is absent', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const command: CompendiumSearchCommand = async (type, params) => {
      calls.push([type, params]);
      if (type === 'search-compendiums') throw new Error('No handler registered for command: search-compendiums');
      return { matches: [] };
    };

    await searchCompendium(command, { name: 'goblin', limit: 5 });

    assert.deepEqual(calls, [
      ['search-compendiums', { query: 'goblin', limit: 5 }],
      ['find-in-compendium', { name: 'goblin', packId: undefined, documentType: undefined, limit: 5 }],
    ]);
  });
});
