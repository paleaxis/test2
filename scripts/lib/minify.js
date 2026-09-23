'use strict';

/* ==================================================================
 * MINIFY  —  scripts/lib/minify.js
 * ==================================================================
 * Zero-dependency, CONSERVATIVE minifiers applied to build OUTPUT
 * (never to source). Priorities: big byte savings removing comments
 * + indentation, with ZERO semantic risk. They never rename tokens,
 * never reflow code, and never strip spaces that separate tokens.
 *
 *   minifyCss(src)  — comments + structural-whitespace removal only.
 *                     calc()/min()/clamp() operator spaces are NEVER
 *                     touched (we only drop space adjacent to
 *                     `{ } ; : , > ( )`), string contents preserved.
 *   minifyJs(src)   — dedicated tokenizer (strings, template
 *                     literals incl. ${} nesting, regex-vs-division)
 *                     strips comments + indentation + blank lines.
 *                     Statements keep their newlines → ASI safe.
 *   minifyHtml(src) — strips `<!-- -->` comments and collapses
 *                     formatting whitespace inside text nodes (a run
 *                     becomes a single space — never zero), while
 *                     pre/script/style/textarea blocks pass VERBATIM.
 */

/* ------------------------------------------------------------------ */
/* minifyCss                                                           */
/* ------------------------------------------------------------------ */
// Walk the source once. Strings ('…' / "…") and comments (/* … */)
// are tracked; whitespace runs become zero or one space depending on
// what they touch. calc()/min()/clamp() safety: whitespace adjacent to
// a `+ - * /` operator is ALWAYS preserved — Math operators (unlike
// `{ } ; : , > ( )`) do not tolerate removal of an existing space, and
// a broken `calc(var(--a)+ 1)` silently DROPS the whole declaration
// (z-index: calc(var(--z-nav) + 1) -> z-index:auto was a real bug).
function minifyCss(src) {
  const out = [];
  let i = 0;
  let inStr = null;

  const REMOVABLE = new Set(['{', '}', ';', ':', ',', '>', '(', ')']);
  const OP = new Set(['+', '-', '*', '/']);

  while (i < src.length) {
    const c = src[i];

    if (inStr) {
      out.push(c);
      if (c === '\\' && i + 1 < src.length) {
        out.push(src[i + 1]);
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }

    if (c === "'" || c === '"') {
      inStr = c;
      out.push(c);
      i++;
      continue;
    }

    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue; // comment dropped; neighbouring whitespace was kept above
    }

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      while (i < src.length && /[ \t\n\r]/.test(src[i])) i++;
      const prev = out[out.length - 1];
      const next = src[i];
      if (!prev || !next || !next.trim()) continue; // leading/trailing/mid-run: skip
      // Keep a single space unless a removable neighbour allows it —
      // BUT never when EITHER side is a math operator (+ - * /):
      // calc(var(--a)+ 1) is invalid CSS and browsers drop the rule.
      if (OP.has(prev) || OP.has(next)) out.push(' ');
      else if (!REMOVABLE.has(prev) && !REMOVABLE.has(next)) out.push(' ');
      continue;
    }

    out.push(c);
    i++;
  }
  return out.join('');
}

/* ------------------------------------------------------------------ */
/* minifyJs                                                             */
/* ------------------------------------------------------------------ */
// Single-pass tokenizer. Handles:
//   - '…'/"…" strings with escapes
//   - `…` template literals incl. nested ${ … } (content verbatim,
//     so template whitespace/comments are preserved exactly)
//   - /regex/ literals vs. division via last-significant-token rule
//   - // line and /* block */ comments (removed; the newline that a
//     line comment ends at is left for the whitespace handler, and a
//     block comment between two tokens yields a separating space)
// Whitespace: indentation + trailing spaces dropped; runs of spaces
// between tokens become one space; run-of-newlines becomes one
// newline. Statement line breaks are preserved → ASI stays intact.
const JS_REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'yield', 'await', 'case', 'do', 'else',
]);
const JS_REGEX_PREC = new Set('([{;,:=!&|?+-*%^~<>}'.split(''));

function minifyJs(src) {
  let out = '';
  let i = 0;
  let word = ''; // last identifier/keyword token (for / vs division)
  let lastWasNewline = true; // line start → pending space is indentation

  function push(c) {
    out += c;
    if (/[A-Za-z0-9_$]/.test(c)) word += c;
    else word = '';
    lastWasNewline = c === '\n';
  }

  while (i < src.length) {
    const c = src[i];

    // strings -----------------------------------------------------
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      push(q);
      while (i < src.length) {
        const s = src[i];
        if (s === '\\' && i + 1 < src.length) {
          push(s);
          push(src[i + 1]);
          i += 2;
          continue;
        }
        if (s === q) {
          push(s);
          i++;
          break;
        }
        push(s);
        i++;
      }
      continue;
    }

    // template literals (verbatim; track ${ … } depth) --------------
    if (c === '`') {
      i++;
      push('`');
      let stack = 0;
      let closed = false;
      while (i < src.length) {
        const s = src[i];
        if (s === '\\' && i + 1 < src.length) {
          push(s);
          push(src[i + 1]);
          i += 2;
          continue;
        }
        if (stack === 0 && s === '`') {
          push(s);
          i++;
          closed = true;
          break;
        }
        if (s === '$' && src[i + 1] === '{') {
          push('$');
          push('{');
          i += 2;
          stack++;
          continue;
        }
        if (s === '}' && stack > 0) {
          push(s);
          i++;
          stack--;
          continue;
        }
        push(s);
        i++;
      }
      if (!closed) break;
      continue;
    }

    // comments -----------------------------------------------------
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue; // newline handled below
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      // A block comment between two tokens is whitespace in the grammar;
      // guarantee separation so identifiers never merge.
      if (
        out.length &&
        !/\s$/.test(out) &&
        i < src.length &&
        !/[ \t\n\r]/.test(src[i]) &&
        !/[ \t\n\r]/.test(out[out.length - 1])
      ) {
        push(' ');
      }
      continue;
    }

    // regex literal vs division -------------------------------------
    if (c === '/') {
      const lastSig = out.length ? out[out.length - 1] : '';
      const isRegex =
        !lastSig ||
        lastWasNewline ||
        JS_REGEX_PREC.has(lastSig) ||
        JS_REGEX_KEYWORDS.has(word);
      if (isRegex) {
        i++;
        push('/');
        let closed = false;
        let inClass = false;
        while (i < src.length) {
          const s = src[i];
          if (s === '\\' && i + 1 < src.length) {
            push(s);
            push(src[i + 1]);
            i += 2;
            continue;
          }
          if (s === '[') inClass = true;
          else if (s === ']') inClass = false;
          else if (s === '/' && !inClass) {
            push(s);
            i++;
            // regex flags
            while (i < src.length && /[A-Za-z]/.test(src[i])) {
              push(src[i]);
              i++;
            }
            closed = true;
            break;
          }
          push(s);
          i++;
        }
        if (!closed) break;
        continue;
      }
      push('/');
      i++;
      continue;
    }

    // whitespace ----------------------------------------------------
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      let hasNl = false;
      let hasSp = false;
      while (i < src.length && /[ \t\n\r]/.test(src[i])) {
        if (src[i] === '\n') hasNl = true;
        else hasSp = true;
        i++;
      }
      if (hasNl) {
        // trim trailing spaces already-emitted on this line
        if (/\s$/.test(out)) out = out.replace(/[ \t]+$/, '');
        if (!/\n$/.test(out) && out.length) out += '\n';
        lastWasNewline = true;
      } else if (!hasNl && !lastWasNewline) {
        // single separating space between in-line tokens
        if (out.length && out[out.length - 1] !== ' ') out += ' ';
        lastWasNewline = false;
      }
      word = '';
      continue;
    }

    // ordinary token ------------------------------------------------
    push(c);
    i++;
  }

  return out.trimEnd() + '\n';
}

/* ------------------------------------------------------------------ */
/* minifyHtml                                                          */
/* ------------------------------------------------------------------ */
// Keep tags verbatim. Inside text nodes, ONLY whitespace runs that
// contain a newline are collapsed (to one space) — single/multi-space
// on one line is left alone, so inline/pre-ish spacing is untouched.
// pre/script/style/textarea bodies are copied verbatim. HTML comments
// are removed (build output comments are decorative banners only).
function minifyHtml(src) {
  const PRESERVE = { pre: true, script: true, style: true, textarea: true };

  function collapseText(text) {
    if (!text || !/\n/.test(text)) return text;
    return text.replace(/[ \t]*\r?\n[ \t]*/g, ' ');
  }

  let out = '';
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      out += collapseText(src.slice(i));
      break;
    }
    out += collapseText(src.slice(i, lt));

    // comment
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }

    // closing tag or end-of-fragment guard
    const gt = src.indexOf('>', lt);
    if (gt === -1) {
      out += src.slice(lt);
      break;
    }
    const tag = src.slice(lt, gt + 1);

    // preserve-tag block: find its end tag and copy verbatim
    const m = /^<(\/?)\s*([a-zA-Z]+)/.exec(tag);
    const name = m && m[2] ? m[2].toLowerCase() : null;
    if (name && PRESERVE[name] && m[1] !== '/') {
      const close = new RegExp('</' + name + '\\s*>', 'i');
      const cm = close.exec(src.slice(gt + 1));
      const endPos = cm ? gt + 1 + cm.index + cm[0].length : src.length;
      out += src.slice(lt, endPos);
      i = endPos;
      continue;
    }

    out += tag;
    i = gt + 1;
  }
  return out;
}

module.exports = { minifyCss, minifyJs, minifyHtml };