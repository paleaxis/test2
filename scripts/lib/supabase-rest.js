#!/usr/bin/env node
'use strict';

/**
 * SUPABASE REST CLIENT (build-time)  —  scripts/lib/supabase-rest.js
 * ===================================================================
 * Tiny zero-dependency client used by build.js, import-content.js and
 * the export script to read content out of Supabase at BUILD time.
 *
 * SECURITY: this module may use the SECRET key (or the legacy service
 * role key) because it ONLY ever runs in Node during a build — never
 * import it from anything that ships to the browser, and never put the
 * secret key in any file that ends up in public/. The browser/admin app
 * uses the PUBLISHABLE (or legacy anon) key via @supabase/supabase-js
 * and RLS does the gating there.
 *
 * KEY MODEL — Supabase's new publishable/secret key system
 * ==========================================================
 * Supabase deprecated the JWT-based `anon`/`service_role` keys (end of
 * 2026) in favour of opaque publishable (`sb_publishable_...`) and
 * secret (`sb_secret_...`) keys. This adapter supports BOTH so projects
 * can migrate at their own pace:
 *
 *   server-side (here)   SUPABASE_SECRET_KEY   → secret key (sb_secret_…)
 *                        SUPABASE_SERVICE_ROLE_KEY → legacy JWT fallback
 *   client-side (admin)  SUPABASE_PUBLISHABLE_KEY → publishable key
 *                        SUPABASE_ANON_KEY        → legacy JWT fallback
 *
 * CRITICAL HEADER RULE — the new opaque keys are NOT JWTs, so they must
 * be sent on the `apikey` header ONLY. Sending them on
 * `Authorization: Bearer` makes the platform try to parse them as a JWT
 * and reject the request ("Invalid JWT"). Legacy JWT keys need BOTH
 * `apikey` and `Authorization: Bearer`. `authHeaders()` below handles
 * the distinction automatically.
 */

const fs = require('fs');
const path = require('path');

// Load .env from the project root if present (no dotenv dependency).
// Real env vars always win over .env values.
function loadEnv() {
  if (process.env.SUPABASE_URL) return;
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

// A new opaque publishable/secret key starts with `sb_`. Legacy keys
// are JWT strings (base64url segments). This is how we tell whether to
// send the key on Authorization (legacy JWT) or apikey only (opaque).
function isOpaqueKey(k) {
  return /^sb_(publishable|secret)_/i.test(String(k || ''));
}

/**
 * Resolve the server-side key: prefer the NEW secret key, fall back to
 * the legacy service_role key. Returns the chosen value ('' when none).
 */
function serverKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  );
}

/**
 * Resolve the client-side key: prefer the NEW publishable key, fall
 * back to the legacy anon key.
 */
function publishableKey() {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  );
}

/**
 * @param {object} opts
 * @param {string} [opts.url]     defaults to env SUPABASE_URL
 * @param {string} [opts.key]     defaults to the server-side key
 * @param {boolean} [opts.publishable] resolve the publishable key instead
 * @returns {{url: string, key: string, legacy: boolean, enabled: boolean}}
 *   legacy = the key is an old JWT and must also go on Authorization.
 */
function client(opts = {}) {
  loadEnv();
  const url = opts.url || process.env.SUPABASE_URL || '';
  const key = opts.key || (opts.publishable ? publishableKey() : serverKey());
  return {
    url: url.replace(/\/+$/, ''),
    key,
    legacy: !(key && isOpaqueKey(key)),
    enabled: Boolean(url && key),
  };
}

/**
 * Auth headers for a given client. New opaque `sb_` keys go on `apikey`
 * only (they are not JWTs — Authorization would fail with "Invalid JWT").
 * Legacy JWT keys go on both `apikey` and `Authorization: Bearer`.
 * @param {object} c client() result
 */
function authHeaders(c) {
  const h = { apikey: c.key };
  if (c.legacy && c.key) h.Authorization = `Bearer ${c.key}`;
  return h;
}

/**
 * GET rows from a table via PostgREST.
 * @param {object} c          client() result
 * @param {string} table      e.g. "posts"
 * @param {string} [query]    raw querystring, e.g. "select=*&draft=is.false"
 * @returns {Promise<Array>}  rows (throws on transport/REST error)
 */
async function fetchAll(c, table, query = 'select=*') {
  if (!c.enabled) throw new Error('supabase-rest: client not configured');
  const res = await fetch(`${c.url}/rest/v1/${table}?${query}`, {
    headers: { ...authHeaders(c), Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`supabase-rest: ${table} ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json();
}

/** Download one storage object as a Buffer (bucket/key). */
async function downloadObject(c, bucket, objectPath) {
  if (!c.enabled) throw new Error('supabase-rest: client not configured');
  const res = await fetch(
    `${c.url}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
    { headers: authHeaders(c) },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`supabase-rest: storage ${bucket}/${objectPath} ${res.status}: ${body.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** List storage objects under a prefix. Returns [{name, id, ...}] */
async function listObjects(c, bucket, prefix) {
  if (!c.enabled) throw new Error('supabase-rest: client not configured');
  const res = await fetch(
    `${c.url}/storage/v1/object/list/${encodeURIComponent(bucket)}`,
    {
      method: 'POST',
      headers: { ...authHeaders(c), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 10000 }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`supabase-rest: storage list ${bucket}/${prefix} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Remove one row by a column value (used by export/remove flows in admin scripts). */
async function deleteRow(c, table, column, value) {
  if (!c.enabled) throw new Error('supabase-rest: client not configured');
  const res = await fetch(
    `${c.url}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`,
    {
      method: 'DELETE',
      headers: { ...authHeaders(c), Prefer: 'return=representation' },
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`supabase-rest: delete ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

module.exports = {
  client,
  fetchAll,
  downloadObject,
  listObjects,
  deleteRow,
  loadEnv,
  authHeaders,
  isOpaqueKey,
  serverKey,
  publishableKey,
};
