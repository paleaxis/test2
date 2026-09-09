#!/usr/bin/env node
'use strict';

/**
 * DCITC DEV WATCHER  —  scripts/dev.js
 * ====================================
 * WHAT THIS FILE CONTROLS:
 *   The `npm run dev` workflow. It chains the other two scripts:
 *
 *     build.js → serve.js → (watch src/ + static/ → rebuild on change)
 *
 *   - Runs one initial build so public/ is fresh.
 *   - Starts serve.js as a child process (inherits stdio, so its
 *     "listening" log shows up here).
 *   - Watches src/, static/, content/ and funkystuff/ recursively. Any
 *     change triggers a rebuild after a 120ms debounce (so editor
 *     save-storms collapse into one build). The server itself keeps
 *     running — it serves straight from public/, which each rebuild
 *     rewrites.
 *   - SIGINT/SIGTERM kill the child server and exit cleanly.
 *
 * NOTE: there is no live-reload/browser refresh — you reload manually.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// directories whose changes should trigger a rebuild — includes the
// file-driven content folders (content/blog, content/events,
// content/gallery) and the funkystuff library, so dropping a file in
// and saving is the whole edit loop.
const WATCH = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'static'),
  path.join(ROOT, 'content'),
  path.join(ROOT, 'funkystuff'),
];

// run build.js to completion; resolve when it exits
function build() {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'inherit' });
    p.on('close', resolve);
  });
}

// start serve.js and return the child (kept so shutdown can kill it)
function serve() {
  const p = spawn(process.execPath, [path.join(__dirname, 'serve.js')], { stdio: 'inherit' });
  return p;
}

(async () => {
  await build();
  const server = serve();
  console.log('watching src/, static/, content/ and funkystuff/ …');
  let timer = null;
  // debounced rebuild: reset the timer on every change event
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      console.log('\nrebuilding…');
      await build();
      console.log('watching…');
    }, 120);
  };
  for (const dir of WATCH) {
    fs.watch(dir, { recursive: true }, onChange);
  }
  const shutdown = () => {
    server.kill();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
