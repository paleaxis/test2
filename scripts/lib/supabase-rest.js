#!/usr/bin/env node
'use strict';

/**
 * SUPABASE REST CLIENT (build-time)  —  scripts/lib/supabase-rest.js
 * ===================================================================
 * Tiny zero-dependency client used by build.js, import-content.js and
 * the export script to read content out of Supabase at BUILD time.
 *
 * SECURITY: this module may use SUPABASE_SERVICE_ROLE_KEY because it
 * ONLY ever runs in Node during a build — never import it from anything
 * that ships to the browser, and never put the service key in any file
 * that ends up in public/. The browser/admin app uses the anon key via
 * @supabase/supabase-js and RLS does the gating there.
 *
 * Uses the plain PostgREST surface (GET /rest/v1/<table>) — enough for
 * reads; writes go through the admin UI (supabase-js) instead.
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

/**
 * @param {object} opts
 * @param {string} [opts.url]     defaults to env SUPABASE_URL
 * @param {string} [opts.serviceKey] defaults to env SUPABASE_SERVICE_ROLE_KEY
 * @returns {{url: string, key: string, enabled: boolean}}
 */
function client(opts = {}) {
  loadEnv();
  const url = opts.url || process.env.SUPABASE_URL || '';
  const key = opts.serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url: url.replace(/\/+$/, ''), key, enabled: Boolean(url && key) };
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
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      Accept: 'application/json',
    },
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
    {
      headers: { apikey: c.key, Authorization: `Bearer ${c.key}` },
    },
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
      headers: {
        apikey: c.key,
        Authorization: `Bearer ${c.key}`,
        'Content-Type': 'application/json',
      },
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
      headers: {
        apikey: c.key,
        Authorization: `Bearer ${c.key}`,
        Prefer: 'return=representation',
      },
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`supabase-rest: delete ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

module.exports = { client, fetchAll, downloadObject, listObjects, deleteRow, loadEnv };
