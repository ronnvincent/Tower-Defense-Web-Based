import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The database, the client and the dev stand-in must agree.
 *
 * The SQL is the contract. If a function is renamed in the migration but the
 * client still calls the old name, every save silently fails with a 404 — the
 * exact class of bug that is invisible in a unit test and obvious in production.
 * These tests read the three files and compare them.
 */

// The contract spans both migrations: 0002 adds the daily board on top of the
// players table 0001 creates, and the client calls all of it.
const sql = ['0001_cloud_save.sql', '0002_daily_board.sql']
  .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
  .join('\n');
const cloudSave = readFileSync('src/systems/CloudSave.js', 'utf8');
const clientSource = readFileSync('src/net/supabaseClient.js', 'utf8');
const devServer = readFileSync('server/cloud-dev.mjs', 'utf8');

/** `create or replace function public.x(...) ... returns` → { name: [params] } */
function sqlFunctions(source) {
  const found = new Map();
  const regex = /create or replace function public\.([a-z_]+)\(([\s\S]*?)\)\s*(?:\n\s*)?returns/gi;
  for (const match of source.matchAll(regex)) {
    const params = [...match[2].matchAll(/\bp_[a-z_]+/g)].map((param) => param[0]);
    found.set(match[1], [...new Set(params)]);
  }
  return found;
}

/** Every `client.rpc('name', { p_a: ... })` in CloudSave → Map(name -> params). */
function clientCalls(source) {
  const found = new Map();
  const regex = /\.rpc\(\s*'([a-z_]+)'\s*,\s*\{/g;
  for (const match of source.matchAll(regex)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let index = start;
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      index += 1;
    }
    const body = source.slice(start, index);
    const params = [...body.matchAll(/\b(p_[a-z_]+)\s*:/g)].map((param) => param[1]);
    if (!found.has(match[1])) found.set(match[1], new Set());
    for (const param of params) found.get(match[1]).add(param);
  }
  return found;
}

const functions = sqlFunctions(sql);
const calls = clientCalls(cloudSave);

/**
 * The API surface. `clean_username` is a helper the functions share, not
 * something a browser may call, so it is defined in the SQL but is not part of
 * the contract the client and the stand-in have to implement.
 */
const LEDGER = [
  'check_username',
  'cloud_ping',
  'daily_board',
  'daily_submit',
  'my_daily_rank',
  'leaderboard_page',
  'my_rank',
  'pull_progress',
  'register_player',
  'sync_progress',
];

describe('SQL ↔ client contract', () => {
  it('defines every ledger function, and no stray public ones', () => {
    for (const name of LEDGER) expect(functions.has(name), name).toBe(true);
    // And nothing else public that is not a helper.
    const extra = [...functions.keys()].filter((name) => !LEDGER.includes(name));
    expect(extra).toEqual(['clean_username']);
  });

  it('every function the client calls exists in the migration', () => {
    for (const name of [...calls.keys(), 'cloud_ping']) {
      expect(functions.has(name), `${name} is called from src but missing from the SQL`).toBe(true);
    }
  });

  it('every p_ argument the client sends is a parameter of that function', () => {
    for (const [name, params] of calls) {
      const declared = new Set(functions.get(name) || []);
      for (const param of params) {
        expect(declared.has(param), `${name} does not take ${param}`).toBe(true);
      }
    }
  });

  it('the ping the client speaks matches the schema version the SQL returns', () => {
    expect(clientSource).toContain("payload?.schema === 1");
    const ping = sql.slice(sql.indexOf('function public.cloud_ping'), sql.indexOf('function public.check_username'));
    expect(ping).toContain("'schema', 1");
  });

  it('never grants table access to the anon role', () => {
    expect(sql).toContain('revoke all on table public.players from anon, authenticated');
    expect(sql).toContain('revoke all on table public.progress from anon, authenticated');
    expect(sql).toContain('revoke all on table public.player_achievements from anon, authenticated');
    expect(sql).toContain('revoke all on table public.daily_runs from anon, authenticated');
    for (const table of ['players', 'progress', 'player_achievements', 'daily_runs']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+table\s+public\./i);
  });

  it('grants execute on every function to the anon role', () => {
    for (const name of LEDGER) {
      const signature = new RegExp(`grant execute on function public\\.${name}\\(`);
      expect(signature.test(sql), `anon cannot execute ${name}`).toBe(true);
    }
  });

  it('marks every data function SECURITY DEFINER', () => {
    for (const name of [
      'check_username',
      'register_player',
      'sync_progress',
      'pull_progress',
      'leaderboard_page',
      'my_rank',
      'daily_submit',
      'daily_board',
      'my_daily_rank',
    ]) {
      const body = sql.slice(sql.indexOf(`function public.${name}(`), sql.indexOf(`function public.${name}(`) + 400);
      expect(body.toLowerCase(), name).toContain('security definer');
    }
  });

  it('has a unique case-insensitive name index and a unique device key', () => {
    expect(sql).toContain('create unique index if not exists players_username_key_uidx');
    expect(sql).toContain('create unique index if not exists players_device_key_uidx');
    expect(sql).toContain('username_key = lower(btrim(username))');
  });
});

describe('SQL ↔ dev stand-in contract', () => {
  it('implements every ledger function the SQL defines', () => {
    for (const name of LEDGER) {
      expect(devServer, `server/cloud-dev.mjs has no ${name} handler`).toMatch(
        new RegExp(`\\b${name}\\s*:`)
      );
    }
  });

  it('reads the same p_ arguments the SQL declares', () => {
    for (const name of LEDGER) {
      const params = functions.get(name) || [];
      if (!params.length) continue;
      const start = devServer.indexOf(`${name}:`);
      const body = devServer.slice(start, start + 700);
      for (const param of params) {
        // `leaderboard_page` and friends destructure their params.
        const used = body.includes(param) || body.includes(param.slice(2));
        expect(used, `${name} in server/cloud-dev.mjs ignores ${param}`).toBe(true);
      }
    }
  });

  it('is labelled as a stand-in, not Supabase', () => {
    expect(devServer.toLowerCase()).toContain('not supabase');
    expect(devServer).toContain('supabase/migrations/0001_cloud_save.sql');
  });
});
