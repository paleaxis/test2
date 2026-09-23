(function () {
'use strict';
var KEY = 'dcitc-theme';
var root = document.documentElement;
var sys = window.matchMedia('(prefers-color-scheme: light)');
function current() {
return root.getAttribute('data-theme') || 'dark';
}
function apply(theme) {
root.setAttribute('data-theme', theme);
root.style.colorScheme = theme;
}
function toggle() {
var next = current() === 'dark' ? 'light' : 'dark';
try {
localStorage.setItem(KEY, next);
} catch (e) {
}
apply(next);
}
function onBtnClick(e) {
if (e.target.closest('[data-theme-toggle]')) toggle();
}
function onChange(ev) {
try {
if (!localStorage.getItem(KEY)) apply(ev.matches ? 'light' : 'dark');
} catch (e) {
apply(ev.matches ? 'light' : 'dark');
}
}
function init() {
if (window.DCITC.bindScope) window.DCITC.bindScope(document, 'theme-toggle', 'click', onBtnClick);
if (window.DCITC.bindOnce) window.DCITC.bindOnce(sys, 'change', onChange);
else if (sys.addEventListener) sys.addEventListener('change', onChange);
}
window.DCITC = window.DCITC || {};
window.DCITC.theme = { init: init };
})();
(function () {
'use strict';
var HX = (window.DCITC.horizontal = {});
var main = null;
var elProgress;
var enabled = false;
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var mq = window.matchMedia('(min-width: 900px)');
var mqBound = false;
var vertical = null;
var vScroll, vResize;
var goal = null;
var mode = null;
var raf = null;
var lastMax = 0;
function getMax() {
var m = main.scrollWidth - main.clientWidth;
return m > 0 ? m : 0;
}
function clamp(v, lo, hi) {
return Math.max(lo, Math.min(hi, v));
}
function measure() {
lastMax = getMax();
}
function setGoal(g, m) {
goal = clamp(g, 0, getMax());
mode = m;
if (!raf && enabled) raf = requestAnimationFrame(loop);
}
function updateUI(x) {
var max = lastMax;
var pct = max > 0 ? clamp(x / max, 0, 1) : 0;
if (elProgress) elProgress.style.width = (pct * 100).toFixed(2) + '%';
}
function loop() {
raf = null;
var cur = main.scrollLeft;
var max = getMax();
if (mode) {
var delta = goal - cur;
var eased = delta * 0.16;
if (reduced) {
eased = delta;
}
var next = Math.abs(eased) < 0.6 ? goal : cur + eased;
main.scrollLeft = clamp(next, 0, max);
if (Math.abs(goal - main.scrollLeft) < 0.6) {
mode = null;
goal = null;
}
raf = requestAnimationFrame(loop);
}
updateUI(main.scrollLeft);
parallax(main.scrollLeft);
}
function onWheel(e) {
if (!enabled) return;
if (e.ctrlKey || e.metaKey) return;
if (e.target.closest('[data-vzone]')) return;
e.preventDefault();
var d = e.deltaY + e.deltaX;
d = clamp(d, -140, 140);
var base = mode === null ? main.scrollLeft : goal;
setGoal(base + d, 'drive');
}
function onKey(e) {
if (!enabled) return;
var t = e.target;
if (
t &&
(t.tagName === 'INPUT' ||
t.tagName === 'TEXTAREA' ||
t.tagName === 'SELECT' ||
t.isContentEditable)
)
return;
var k = e.key;
if (k === ' ') {
e.preventDefault();
k = 'ArrowRight';
}
var map = {
ArrowRight: 1,
ArrowLeft: -1,
ArrowDown: 1,
ArrowUp: -1,
PageDown: 1,
PageUp: -1,
Home: 'home',
End: 'end',
};
if (k in map) {
e.preventDefault();
if (map[k] === 'home') setGoal(0, 'drive');
else if (map[k] === 'end') setGoal(getMax(), 'drive');
else
setGoal(
main.scrollLeft + Math.sign(map[k]) * Math.min(main.clientWidth * 0.85, 1000),
'drive',
);
}
}
function onScroll() {
updateUI(main.scrollLeft);
parallax(main.scrollLeft);
}
var drag = null;
function onPointerDown(e) {
if (!enabled || e.button !== 0 || e.pointerType !== 'mouse') return;
if (
e.target.closest(
'a, button, input, select, textarea, details, [data-more], .nav-links, [data-hx-nodrag]',
)
)
return;
drag = { x: e.clientX, start: main.scrollLeft, moved: false };
mode = null;
goal = null;
main.classList.add('is-drag-ready');
try {
main.setPointerCapture(e.pointerId);
} catch (err) {}
}
function onPointerMove(e) {
if (!drag) return;
var dx = e.clientX - drag.x;
if (Math.abs(dx) > 4) {
drag.moved = true;
main.classList.add('is-dragging');
}
if (drag.moved) {
main.scrollLeft = clamp(drag.start - dx, 0, getMax());
}
}
function onPointerUp(e) {
if (!drag) return;
main.classList.remove('is-dragging', 'is-drag-ready');
drag = null;
}
function onResize() {
measure();
if (enabled && mode === null) {
updateUI(main.scrollLeft);
}
}
function parallax(x) {
var grid = document.querySelector('.bg-grid');
if (grid && !reduced) grid.style.transform = 'translateX(' + (-x * 0.02).toFixed(1) + 'px)';
}
function enable() {
if (enabled) return;
enabled = true;
measure();
main.addEventListener('wheel', onWheel, { passive: false });
main.addEventListener('scroll', onScroll, { passive: true });
document.addEventListener('keydown', onKey);
main.addEventListener('pointerdown', onPointerDown);
main.addEventListener('pointermove', onPointerMove);
main.addEventListener('pointerup', onPointerUp);
main.addEventListener('pointercancel', onPointerUp);
window.addEventListener('resize', onResize);
if (!raf) raf = requestAnimationFrame(loop);
updateUI(main.scrollLeft);
}
function disable() {
enabled = false;
main.removeEventListener('wheel', onWheel);
main.removeEventListener('scroll', onScroll);
document.removeEventListener('keydown', onKey);
main.removeEventListener('pointerdown', onPointerDown);
main.removeEventListener('pointermove', onPointerMove);
main.removeEventListener('pointerup', onPointerUp);
main.removeEventListener('pointercancel', onPointerUp);
window.removeEventListener('resize', onResize);
if (raf) {
cancelAnimationFrame(raf);
raf = null;
}
mode = null;
goal = null;
if (elProgress) elProgress.style.width = '0%';
parallax(0);
}
function setVertical(on) {
if (on === vertical) return;
vertical = on;
if (on) {
vScroll = function () {
var doc = document.documentElement;
var max = doc.scrollHeight - window.innerHeight;
var pct = max > 0 ? window.scrollY / max : 0;
if (elProgress) elProgress.style.width = (pct * 100).toFixed(2) + '%';
};
vResize = vScroll;
window.addEventListener('scroll', vScroll, { passive: true });
window.addEventListener('resize', vResize);
vScroll();
} else {
window.removeEventListener('scroll', vScroll);
window.removeEventListener('resize', vResize);
vScroll = vResize = null;
if (elProgress) elProgress.style.width = '0%';
}
}
function apply(e) {
e.matches ? enable() : disable();
}
HX.init = function () {
if (main) disable();
if (vertical) setVertical(false);
main = document.querySelector('main[data-horizontal]');
elProgress = document.querySelector('.progress-fill');
if (!main) {
setVertical(true);
return;
}
if (!mqBound) {
mqBound = true;
if (mq.addEventListener) mq.addEventListener('change', apply);
else if (mq.addListener) mq.addListener(apply);
}
apply(mq);
};
})();
(function () {
'use strict';
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var DURATION = 180;
function isExternal(href) {
var a = document.createElement('a');
a.href = href;
return a.origin !== window.location.origin;
}
function go(href) {
if (window.DCITC.navigate) {
window.DCITC.navigate.go(href);
return;
}
if (reduced) {
window.location.href = href;
return;
}
document.body.classList.add('page-exit');
setTimeout(function () {
window.location.href = href;
}, DURATION);
}
function init() {
document.addEventListener('click', function (e) {
var a = e.target.closest('a');
if (!a) return;
var href = a.getAttribute('href') || '';
if (!href) return;
if (href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0)
return;
if (a.hasAttribute('download')) return;
if (a.target && a.target !== '_self') return;
if (isExternal(href)) return;
var a2 = document.createElement('a');
a2.href = href;
if (a2.pathname === window.location.pathname) return;
e.preventDefault();
go(a2.href);
});
}
window.DCITC = window.DCITC || {};
window.DCITC.transitions = { init: init };
})();
(function () {
'use strict';
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var elZ = [];
var io = null;
var booted = false;
function heroReveal() {
var lines = document.querySelectorAll('.hero-line .hl');
if (!lines.length) return;
if (reduced || !window.anime) {
lines.forEach(function (l) {
l.classList.add('is-in');
});
return;
}
window.anime({
targets: lines,
translateY: ['112%', '0%'],
easing: 'cubicBezier(0.16, 1, 0.3, 1)',
duration: 950,
delay: window.anime.stagger(130, { start: 200 }),
});
}
var ticking = false;
function revealVisible() {
ticking = false;
elZ.forEach(function (el) {
if (el.classList.contains('is-in')) return;
var r = el.getBoundingClientRect();
if (!(r.top >= window.innerHeight || r.left >= window.innerWidth)) {
el.classList.add('is-in');
if (io) io.unobserve(el);
}
});
}
function init() {
elZ = Array.prototype.slice.call(document.querySelectorAll('[data-reveal], [data-stagger]'));
io = null;
if (reduced || !('IntersectionObserver' in window)) {
elZ.forEach(function (el) {
el.classList.add('is-in');
});
} else {
io = new IntersectionObserver(
function (entries) {
entries.forEach(function (en) {
if (en.isIntersecting) {
en.target.classList.add('is-in');
io.unobserve(en.target);
}
});
},
{ threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
);
elZ.forEach(function (el) {
io.observe(el);
});
}
if (!booted && !reduced && 'IntersectionObserver' in window) {
booted = true;
window.addEventListener(
'scroll',
function () {
if (!ticking) {
ticking = true;
requestAnimationFrame(revealVisible);
}
},
{ passive: true },
);
window.addEventListener('resize', revealVisible);
}
revealVisible();
heroReveal();
}
window.DCITC = window.DCITC || {};
window.DCITC.reveal = { init: init };
})();
(function () {
'use strict';
function initMobileMenu() {
var btn = document.querySelector('[data-menu-toggle]');
var menu = document.querySelector('[data-mobile-menu]');
if (!btn || !menu) return;
var scrim = document.querySelector('.menu-scrim') || document.createElement('div');
if (!scrim.parentNode) {
scrim.className = 'menu-scrim';
document.body.appendChild(scrim);
}
function open() {
menu.classList.add('is-open');
scrim.classList.add('is-open');
btn.classList.add('is-open');
btn.setAttribute('aria-expanded', 'true');
btn.setAttribute('aria-label', 'Close menu');
}
function close() {
menu.classList.remove('is-open');
scrim.classList.remove('is-open');
btn.classList.remove('is-open');
btn.setAttribute('aria-expanded', 'false');
btn.setAttribute('aria-label', 'Open menu');
}
btn.addEventListener('click', function () {
menu.classList.contains('is-open') ? close() : open();
});
scrim.addEventListener('click', close);
menu.querySelectorAll('a').forEach(function (a) {
a.addEventListener('click', close);
});
window.DCITC.bindScope(document, 'menu-escape', 'keydown', function (e) {
if (e.key === 'Escape') close();
});
}
function initMore() {
var more = document.querySelector('[data-more]');
if (!more) return;
var btn = more.querySelector('[data-more-btn]');
btn.addEventListener('click', function (e) {
e.stopPropagation();
var open = more.classList.toggle('is-open');
btn.setAttribute('aria-expanded', open ? 'true' : 'false');
});
window.DCITC.bindScope(document, 'more-close', 'click', function (e) {
if (!more.contains(e.target)) {
more.classList.remove('is-open');
btn.setAttribute('aria-expanded', 'false');
}
});
}
function initFilters() {
document.querySelectorAll('[data-filter-group]').forEach(function (group) {
var selector = group.getAttribute('data-filter-group');
var items = document.querySelectorAll(selector + ' [data-filter]');
var buttons = group.querySelectorAll('[data-filter]');
buttons.forEach(function (b) {
b.addEventListener('click', function () {
buttons.forEach(function (x) {
x.classList.remove('is-on');
});
b.classList.add('is-on');
var f = b.getAttribute('data-filter');
items.forEach(function (it) {
var show = f === '*' || it.getAttribute('data-filter') === f;
it.style.display = show ? '' : 'none';
});
});
});
});
}
function initSearch() {
var input = document.querySelector('[data-search]');
if (!input) return;
input.addEventListener('input', function () {
var q = input.value.trim().toLowerCase();
document.querySelectorAll('[data-searchable]').forEach(function (el) {
var hay = (el.getAttribute('data-searchable') || '').toLowerCase();
el.style.display = hay.indexOf(q) !== -1 ? '' : 'none';
});
});
}
function initEventDeck() {
var deck = document.querySelector('[data-evx]');
if (!deck) return;
var items = Array.prototype.slice.call(deck.querySelectorAll('.evx-item'));
if (!items.length) return;
var current = -1;
function activate(idx) {
if (idx === current) return;
current = idx;
var cols = [];
for (var i = 0; i < items.length; i++) {
if (i === idx) {
items[i].setAttribute('data-active', 'true');
cols.push('10fr');
} else {
items[i].removeAttribute('data-active');
cols.push('1fr');
}
}
deck.style.gridTemplateColumns = cols.join(' ');
}
items.forEach(function (item, i) {
item.addEventListener('pointerenter', function () {
activate(i);
});
item.addEventListener('click', function () {
activate(i);
});
item.addEventListener('focusin', function () {
activate(i);
});
});
var start = items.findIndex(function (it) {
return it.hasAttribute('data-active');
});
activate(start === -1 ? 0 : start);
}
function initDeptModal() {
var modal = document.querySelector('[data-dept-modal]');
if (!modal) return;
var rows = document.querySelectorAll('.do-dept');
if (!rows.length) return;
var dialog = modal.querySelector('.dept-modal-dialog');
var bodyEl = modal.querySelector('.dept-modal-body');
var titleEl = modal.querySelector('.dept-modal-title');
var lastFocus = null;
function populate(deptKey) {
var tpl = document.querySelector('[data-dept-body="' + deptKey + '"]');
if (!tpl) return;
bodyEl.innerHTML = '';
bodyEl.appendChild(tpl.content.cloneNode(true));
}
function open(row) {
lastFocus = row;
var deptKey = row.getAttribute('data-dept');
var title = row.getAttribute('data-dept-title');
titleEl.textContent = title;
populate(deptKey);
modal.classList.add('is-open');
modal.setAttribute('aria-hidden', 'false');
var closeBtn = modal.querySelector('[data-dept-close]');
try {
closeBtn.focus();
} catch (err) {}
}
function close() {
modal.classList.remove('is-open');
modal.setAttribute('aria-hidden', 'true');
if (lastFocus) {
try {
lastFocus.focus();
} catch (err) {}
}
lastFocus = null;
}
rows.forEach(function (row) {
row.addEventListener('click', function () {
open(row);
});
});
modal.querySelectorAll('[data-dept-close]').forEach(function (el) {
el.addEventListener('click', close);
});
window.DCITC.bindScope(document, 'dept-escape', 'keydown', function (e) {
if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
});
}
function initAchTabs() {
var container = document.querySelector('.stack--lg[data-stagger]');
if (!container) return;
var folds = Array.prototype.slice.call(container.querySelectorAll('details.fold'));
if (folds.length < 2) return;
var mql = window.matchMedia('(min-width: 900px)');
var tabsEl = null;
var panelsEl = null;
var panels = [];
var btns = [];
var active = 0;
var built = false;
function build() {
if (built) return;
built = true;
tabsEl = document.createElement('div');
tabsEl.className = 'ach-tabs';
tabsEl.setAttribute('role', 'tablist');
panelsEl = document.createElement('div');
folds.forEach(function (fold, i) {
var summary = fold.querySelector('summary');
var body = fold.querySelector('.fold-body');
if (!summary || !body) return;
var btn = document.createElement('button');
btn.className = 'ach-tab-btn';
btn.setAttribute('role', 'tab');
btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
btn.textContent = summary.querySelector('.mono')
? summary.querySelector('.mono').textContent
: summary.textContent;
btn.addEventListener('click', function () { activate(i); });
btns.push(btn);
tabsEl.appendChild(btn);
var panel = document.createElement('div');
panel.className = 'ach-tab-panel';
panel.setAttribute('role', 'tabpanel');
panel.innerHTML = body.innerHTML;
panels.push(panel);
panelsEl.appendChild(panel);
fold.style.display = 'none';
});
container.insertBefore(tabsEl, container.firstChild);
container.appendChild(panelsEl);
activate(0);
}
function destroy() {
if (!built) return;
tabsEl.remove();
panelsEl.remove();
folds.forEach(function (fold) { fold.style.display = ''; });
built = false;
btns = [];
panels = [];
}
function activate(i) {
active = i;
btns.forEach(function (b, j) {
b.classList.toggle('is-active', j === i);
b.setAttribute('aria-selected', j === i ? 'true' : 'false');
});
panels.forEach(function (p, j) {
p.classList.toggle('is-active', j === i);
});
}
function onBreakpoint() {
if (mql.matches) { build(); } else { destroy(); }
}
window.DCITC.bindScope(mql, 'ach-tabs', 'change', onBreakpoint);
onBreakpoint();
}
function initBatchSwitch() {
var wrap = document.querySelector('[data-batch-switch]');
if (!wrap) return;
var btn = wrap.querySelector('[data-batch-toggle]');
var menu = wrap.querySelector('[data-batch-menu]');
if (!btn || !menu) return;
function open() {
menu.classList.add('is-open');
btn.setAttribute('aria-expanded', 'true');
}
function close() {
menu.classList.remove('is-open');
btn.setAttribute('aria-expanded', 'false');
}
btn.addEventListener('click', function (e) {
e.stopPropagation();
menu.classList.contains('is-open') ? close() : open();
});
window.DCITC.bindScope(document, 'batch-outside', 'click', function (e) {
if (!wrap.contains(e.target)) close();
});
window.DCITC.bindScope(document, 'batch-escape', 'keydown', function (e) {
if (e.key === 'Escape') close();
});
}
window.DCITC = window.DCITC || {};
window.DCITC.pages = {
init: function () {
initMobileMenu();
initMore();
initFilters();
initSearch();
initEventDeck();
initDeptModal();
initAchTabs();
initBatchSwitch();
},
};
})();
(function () {
'use strict';
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var FADE = 180;
var seq = 0;
var PAGE_BODY_WIDGETS = ['.batch-switch', '.menu-scrim'];
function bindOnce(target, type, fn, opts) {
var store = target.__dcitcOnce || (target.__dcitcOnce = {});
var set = store[type] || (store[type] = []);
if (set.indexOf(fn) !== -1) return;
set.push(fn);
target.addEventListener(type, fn, opts);
}
function bindScope(target, key, type, fn) {
var scopes = target.__dcitcScope || (target.__dcitcScope = {});
var prev = scopes[key];
if (prev) target.removeEventListener(prev.type, prev.fn);
scopes[key] = { type: type, fn: fn };
target.addEventListener(type, fn);
}
function adopt(node) {
return document.importNode(node, true);
}
function applySwap(doc) {
var nextHeader = doc.querySelector('header');
var nextMain = doc.querySelector('main');
var curHeader = document.querySelector('header');
var curMain = document.querySelector('main');
if (!nextHeader || !nextMain || !curHeader || !curMain) {
throw new Error('target has no header/main');
}
curHeader.replaceWith(adopt(nextHeader));
curMain.replaceWith(adopt(nextMain));
document.title = doc.title || document.title;
var bodyClass = doc.body ? doc.body.className || '' : '';
document.body.classList.toggle('hx-body', /(^|\s)hx-body(\s|$)/.test(bodyClass));
var dp = doc.body ? doc.body.getAttribute('data-page') || '' : '';
if (dp) document.body.setAttribute('data-page', dp);
else document.body.removeAttribute('data-page');
document.body.classList.remove('page-exit');
PAGE_BODY_WIDGETS.forEach(function (sel) {
var next = doc.querySelector(sel);
var cur = document.querySelector(sel);
if (next) {
if (cur) cur.replaceWith(adopt(next));
else document.body.insertBefore(adopt(next), document.body.firstChild);
} else if (cur) {
cur.remove();
}
});
}
function present(url, replace) {
var id = ++seq;
var wasExiting = document.body.classList.contains('page-exit');
fetch(url, { method: 'GET', credentials: 'same-origin' })
.then(function (r) {
if (!r.ok) throw new Error('HTTP ' + r.status);
return r.text();
})
.then(function (html) {
if (id !== seq) return;
var doc = new DOMParser().parseFromString(html, 'text/html');
if (doc.querySelector('parsererror')) throw new Error('malformed HTML');
applySwap(doc);
if (wasExiting) {
var b = document.body;
b.style.animation = 'none';
void b.offsetWidth;
b.style.animation = '';
}
if (replace) history.replaceState(null, '', url);
else history.pushState(null, '', url);
var m = document.querySelector('main');
if (m && m.matches('[data-horizontal]')) {
window.scrollTo(0, 0);
m.scrollLeft = 0;
} else {
window.scrollTo(0, 0);
}
if (m && m.focus) {
m.setAttribute('tabindex', '-1');
m.focus({ preventScroll: true });
}
if (window.DCITC && window.DCITC.page) window.DCITC.page();
})
.catch(function () {
window.location.href = url;
});
}
function go(url) {
if (reduced) {
present(url);
return;
}
document.body.classList.add('page-exit');
setTimeout(function () {
present(url);
}, FADE);
}
function onPop() {
present(location.href, true);
}
function init() {
bindOnce(window, 'popstate', onPop);
}
window.DCITC = window.DCITC || {};
window.DCITC.navigate = { init: init, go: go };
window.DCITC.bindOnce = bindOnce;
window.DCITC.bindScope = bindScope;
})();
(function () {
'use strict';
var TRACKS = [
{ id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', author: 'Rick Astley' },
{ id: '9bZkp7q19f0', title: 'Gangnam Style', author: 'PSY' },
{ id: 'kJQP7kiw5Fk', title: 'Despacito (audio)', author: 'Luis Fonsi & Daddy Yankee' },
];
var LS_KEY = 'dcitc-music';
var YT_HOST = 'https://www.youtube.com/iframe_api';
var THUMB = 'https://i.ytimg.com/vi/%ID%/mqdefault.jpg';
var mq = window.matchMedia ? window.matchMedia('(min-width: 900px)') : null;
var root, fields = {};
var player = null;
var index = 0;
var bound = false;
function ensureApi() {
return new Promise(function (resolve, reject) {
if (window.YT && window.YT.Player) {
resolve();
return;
}
var queue = window.__dcitcYtQueue || (window.__dcitcYtQueue = []);
queue.push({ resolve: resolve, reject: reject });
if (window.__dcitcYtLoading) return;
window.__dcitcYtLoading = true;
window.onYouTubeIframeAPIReady = function () {
var q = window.__dcitcYtQueue;
window.__dcitcYtQueue = [];
window.__dcitcYtLoading = false;
q.forEach(function (e) { e.resolve(); });
};
var s = document.createElement('script');
s.src = YT_HOST;
s.async = true;
s.onerror = function () {
window.__dcitcYtLoading = false;
var q = window.__dcitcYtQueue;
window.__dcitcYtQueue = [];
q.forEach(function (e) { e.reject(); });
};
document.head.appendChild(s);
});
}
function track() { return TRACKS[index % TRACKS.length] || TRACKS[0]; }
function render() {
var t = track();
fields.title.textContent = t.title;
fields.sub.textContent = t.author;
fields.count.textContent = pad(index + 1) + ' / ' + pad(TRACKS.length);
var img = fields.thumb;
if (img.dataset.src !== t.id) {
img.onerror = function () { img.hidden = true; };
img.src = THUMB.replace('%ID%', t.id);
img.hidden = false;
img.dataset.src = t.id;
}
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function setStatus(label) { fields.status.textContent = label; }
function setError(msg) {
fields.err.textContent = msg;
fields.err.hidden = !msg;
root.classList.toggle('is-error', !!msg);
}
function setPlaying(on) {
root.classList.toggle('is-playing', on);
fields.play.textContent = on ? '\u275A\u275A' : '\u25B6';
fields.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
setStatus(on ? 'PLAYING' : 'PAUSED');
}
function buildPlayer() {
var host = document.createElement('div');
host.className = 'mus-frame-host';
document.body.appendChild(host);
player = new window.YT.Player(host, {
width: '1',
height: '1',
playerVars: {
rel: 0,
controls: 0,
disablekb: 1,
playsinline: 1,
iv_load_policy: 3,
},
events: {
onStateChange: function (e) {
var ST = window.YT.PlayerState;
root.classList.remove('is-buffering');
if (e.data === ST.PLAYING) {
setPlaying(true);
} else if (e.data === ST.PAUSED || e.data === ST.CUED) {
setPlaying(false);
} else if (e.data === ST.BUFFERING) {
root.classList.add('is-buffering');
setStatus('BUFFERING');
} else if (e.data === ST.ENDED) {
setPlaying(false);
load(index + 1);
}
},
onError: function () {
root.classList.remove('is-buffering');
setPlaying(false);
setError('Could not play that track. Check the video id.');
},
},
});
}
function play(i) {
index = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
var t = track();
setError(null);
root.classList.add('is-buffering');
setStatus('LOADING');
render();
ensureApi()
.then(function () {
if (!player) buildPlayer();
try {
player.loadVideoById({ videoId: t.id });
} catch (e) {
player.loadVideoById(t.id);
}
player.playVideo();
})
.catch(function () {
setError('YouTube could not be reached. Check your connection.');
});
persist();
}
function toggle() {
if (player && player.getPlayerState && player.getPlayerState() === window.YT.PlayerState.PLAYING) {
player.pauseVideo();
return;
}
play(index);
}
function persist() {
try {
localStorage.setItem(LS_KEY, JSON.stringify({ i: index, n: TRACKS.length }));
} catch (e) {}
}
function restore() {
var raw;
try { raw = localStorage.getItem(LS_KEY); } catch (e) { return; }
if (!raw) return;
try {
var d = JSON.parse(raw);
if (d && typeof d.i === 'number' && d.i >= 0 && d.i < TRACKS.length) index = d.i;
} catch (e) {}
}
function bind() {
if (bound) return;
bound = true;
fields.open.addEventListener('click', function () { root.classList.add('is-open'); });
fields.close.addEventListener('click', function () { root.classList.remove('is-open'); });
fields.play.addEventListener('click', toggle);
fields.next.addEventListener('click', function () { play(index + 1); });
fields.prev.addEventListener('click', function () { play(index - 1); });
document.addEventListener('visibilitychange', function () {
if (document.hidden && player && player.pauseVideo) player.pauseVideo();
});
document.addEventListener('keydown', function (e) {
if (e.key === 'Escape' && root.classList.contains('is-open')) root.classList.remove('is-open');
});
}
function init() {
var now = window.matchMedia('(min-width: 900px)').matches;
if (!now && window.DCITC.bindOnce) {
window.DCITC.bindOnce(mq, 'change', onGate);
return;
}
root = document.querySelector('[data-mus]');
if (!root) return;
fields = {
open: root.querySelector('[data-mus-open]'),
close: root.querySelector('[data-mus-close]'),
play: root.querySelector('[data-mus-play]'),
prev: root.querySelector('[data-mus-prev]'),
next: root.querySelector('[data-mus-next]'),
title: root.querySelector('[data-mus-title]'),
sub: root.querySelector('[data-mus-sub]'),
count: root.querySelector('[data-mus-count]'),
thumb: root.querySelector('[data-mus-thumb]'),
status: root.querySelector('[data-mus-status]'),
err: root.querySelector('[data-mus-err]'),
};
if (!fields.open || !fields.close || !fields.play) return;
restore();
render();
setStatus('PAUSED');
bind();
}
function onGate(e) {
if (e.matches) init();
}
window.DCITC = window.DCITC || {};
window.DCITC.musicPlayer = { init: init };
})();
(function () {
'use strict';
var NS = (window.DCITC = window.DCITC || {});
var mounted = false;
var TARGET_LONG_SIDE = 128 * 74;
var MIN_GRID_SIZE = 8;
var CELL_CROP_X = 1;
var CELL_CROP_Y = 2;
var BASE = [
['~', 12198],
[':', 6921],
['-', 5589],
['·', 3267],
[' ', 0],
[' ', 0],
];
var RENDER_CHARS = [
[
['F', 26574],
['F', 26574],
['f', 17490],
].concat(BASE),
[
['L', 21327],
['L', 21327],
['l', 14019],
].concat(BASE),
[
['U', 32973],
['U', 32973],
['u', 24093],
].concat(BASE),
[
['I', 14883],
['I', 14883],
['i', 13638],
].concat(BASE),
[
['D', 36198],
['D', 36198],
['d', 30762],
].concat(BASE),
];
var SPEED_1 = 1.0 / 60.0 / 16;
var SPEED_BASE = 1.0 / 60.0 / 3;
var SPEED_2 = 1.0 / 60.0 / 1.25;
function clamp(x, min, max) {
if (x < min) return min;
else if (x > max) return max;
else return x;
}
var GRAVITY = -9.81;
var gravityVector = null;
function FlipFluid(density, width, height, spacing, particleRadius, maxParticles) {
this.density = density;
this.fNumX = Math.floor(width / spacing);
this.fNumY = Math.floor(height / spacing);
this.h = Math.max(width / this.fNumX, height / this.fNumY);
this.fInvSpacing = 1.0 / this.h;
this.fNumCells = this.fNumX * this.fNumY;
this.u = new Float32Array(this.fNumCells);
this.v = new Float32Array(this.fNumCells);
this.du = new Float32Array(this.fNumCells);
this.dv = new Float32Array(this.fNumCells);
this.prevU = new Float32Array(this.fNumCells);
this.prevV = new Float32Array(this.fNumCells);
this.p = new Float32Array(this.fNumCells);
this.s = new Float32Array(this.fNumCells);
this.cellType = new Int32Array(this.fNumCells);
this.cellColor = new Float32Array(3 * this.fNumCells);
this.maxParticles = maxParticles;
this.particlePos = new Float32Array(2 * this.maxParticles);
this.particleVel = new Float32Array(2 * this.maxParticles);
this.particleDensity = new Float32Array(this.fNumCells);
this.particleRestDensity = 0.0;
this.particleRadius = particleRadius;
this.pInvSpacing = 1.0 / (2.2 * particleRadius);
this.pNumX = Math.floor(width * this.pInvSpacing) + 1;
this.pNumY = Math.floor(height * this.pInvSpacing) + 1;
this.pNumCells = this.pNumX * this.pNumY;
this.numCellParticles = new Int32Array(this.pNumCells);
this.firstCellParticle = new Int32Array(this.pNumCells + 1);
this.cellParticleIds = new Int32Array(maxParticles);
this.numParticles = 0;
}
FlipFluid.prototype.integrateParticles = function (dt) {
for (var i = 0; i < this.numParticles; i++) {
var gravityX = 0;
var gravityY = GRAVITY;
if (gravityVector) {
gravityX = gravityVector.x;
gravityY = gravityVector.y;
}
this.particleVel[2 * i] += dt * gravityX;
this.particleVel[2 * i + 1] += dt * gravityY;
this.particlePos[2 * i] += this.particleVel[2 * i] * dt;
this.particlePos[2 * i + 1] += this.particleVel[2 * i + 1] * dt;
}
};
FlipFluid.prototype.pushParticlesApart = function (numIters) {
var colorDiffusionCoeff = 0.001;
this.numCellParticles.fill(0);
for (var i = 0; i < this.numParticles; i++) {
var x = this.particlePos[2 * i];
var y = this.particlePos[2 * i + 1];
var xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
var yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
var cellNr = xi * this.pNumY + yi;
this.numCellParticles[cellNr]++;
}
var first = 0;
for (var i2 = 0; i2 < this.pNumCells; i2++) {
first += this.numCellParticles[i2];
this.firstCellParticle[i2] = first;
}
this.firstCellParticle[this.pNumCells] = first;
for (var i3 = 0; i3 < this.numParticles; i3++) {
var x3 = this.particlePos[2 * i3];
var y3 = this.particlePos[2 * i3 + 1];
var xi3 = clamp(Math.floor(x3 * this.pInvSpacing), 0, this.pNumX - 1);
var yi3 = clamp(Math.floor(y3 * this.pInvSpacing), 0, this.pNumY - 1);
var cellNr3 = xi3 * this.pNumY + yi3;
this.firstCellParticle[cellNr3]--;
this.cellParticleIds[this.firstCellParticle[cellNr3]] = i3;
}
var minDist = 2.0 * this.particleRadius;
var minDist2 = minDist * minDist;
for (var iter = 0; iter < numIters; iter++) {
for (var i4 = 0; i4 < this.numParticles; i4++) {
var px = this.particlePos[2 * i4];
var py = this.particlePos[2 * i4 + 1];
var pxi = Math.floor(px * this.pInvSpacing);
var pyi = Math.floor(py * this.pInvSpacing);
var x0 = Math.max(pxi - 1, 0);
var y0 = Math.max(pyi - 1, 0);
var x1 = Math.min(pxi + 1, this.pNumX - 1);
var y1 = Math.min(pyi + 1, this.pNumY - 1);
for (var xi4 = x0; xi4 <= x1; xi4++) {
for (var yi4 = y0; yi4 <= y1; yi4++) {
var cellNr4 = xi4 * this.pNumY + yi4;
var first4 = this.firstCellParticle[cellNr4];
var last = this.firstCellParticle[cellNr4 + 1];
for (var j = first4; j < last; j++) {
var id = this.cellParticleIds[j];
if (id === i4) continue;
var qx = this.particlePos[2 * id];
var qy = this.particlePos[2 * id + 1];
var dx = qx - px;
var dy = qy - py;
var d2 = dx * dx + dy * dy;
if (d2 > minDist2 || d2 === 0.0) continue;
var d = Math.sqrt(d2);
var s = (0.5 * (minDist - d)) / d;
dx *= s;
dy *= s;
this.particlePos[2 * i4] -= dx;
this.particlePos[2 * i4 + 1] -= dy;
this.particlePos[2 * id] += dx;
this.particlePos[2 * id + 1] += dy;
}
}
}
}
}
};
FlipFluid.prototype.handleParticleCollisions = function (obstacleX, obstacleY, obstacleRadius) {
var h = 1.0 / this.fInvSpacing;
var r = this.particleRadius;
var minX = h + r;
var maxX = (this.fNumX - 1) * h - r;
var minY = h + r;
var maxY = (this.fNumY - 1) * h - r;
for (var i = 0; i < this.numParticles; i++) {
var x = this.particlePos[2 * i];
var y = this.particlePos[2 * i + 1];
var trianglePoints = [
{ x: obstacleX, y: obstacleY + obstacleRadius },
{
x: obstacleX - obstacleRadius * Math.cos(Math.PI / 6),
y: obstacleY - obstacleRadius * Math.sin(Math.PI / 6),
},
{
x: obstacleX + obstacleRadius * Math.cos(Math.PI / 6),
y: obstacleY - obstacleRadius * Math.sin(Math.PI / 6),
},
];
function pointInTriangle(px, py, v1, v2, v3) {
var d1 = sign(px, py, v1.x, v1.y, v2.x, v2.y);
var d2 = sign(px, py, v2.x, v2.y, v3.x, v3.y);
var d3 = sign(px, py, v3.x, v3.y, v1.x, v1.y);
var hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
var hasPos = d1 > 0 || d2 > 0 || d3 > 0;
return !(hasNeg && hasPos);
}
function sign(px, py, x1, y1, x2, y2) {
return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
}
if (pointInTriangle(x, y, trianglePoints[0], trianglePoints[1], trianglePoints[2])) {
var closestPoint = { x: x, y: y };
var minDist = Number.MAX_VALUE;
for (var e = 0; e < 3; e++) {
var p1 = trianglePoints[e];
var p2 = trianglePoints[(e + 1) % 3];
var edge = { x: p2.x - p1.x, y: p2.y - p1.y };
var point = { x: x - p1.x, y: y - p1.y };
var len = edge.x * edge.x + edge.y * edge.y;
var t = Math.max(0, Math.min(1, (point.x * edge.x + point.y * edge.y) / len));
var proj = { x: p1.x + t * edge.x, y: p1.y + t * edge.y };
var dist = Math.sqrt((x - proj.x) * (x - proj.x) + (y - proj.y) * (y - proj.y));
if (dist < minDist) {
minDist = dist;
closestPoint = proj;
}
}
var dx = x - closestPoint.x;
var dy = y - closestPoint.y;
var dd = Math.sqrt(dx * dx + dy * dy);
if (dd > 0) {
x = closestPoint.x;
y = closestPoint.y;
}
this.particleVel[2 * i] = 0;
this.particleVel[2 * i + 1] = 0;
}
if (x < minX) {
x = minX;
this.particleVel[2 * i] = 0.0;
}
if (x > maxX) {
x = maxX;
this.particleVel[2 * i] = 0.0;
}
if (y < minY) {
y = minY;
this.particleVel[2 * i + 1] = 0.0;
}
if (y > maxY) {
y = maxY;
this.particleVel[2 * i + 1] = 0.0;
}
this.particlePos[2 * i] = x;
this.particlePos[2 * i + 1] = y;
}
};
FlipFluid.prototype.updateParticleDensity = function () {
var n = this.fNumY;
var h = this.h;
var h1 = this.fInvSpacing;
var h2 = 0.5 * h;
var d = this.particleDensity;
d.fill(0.0);
for (var i = 0; i < this.numParticles; i++) {
var x = clamp(this.particlePos[2 * i], h, (this.fNumX - 1) * h);
var y = clamp(this.particlePos[2 * i + 1], h, (this.fNumY - 1) * h);
var x0 = Math.floor((x - h2) * h1);
var tx = (x - h2 - x0 * h) * h1;
var x1 = Math.min(x0 + 1, this.fNumX - 2);
var y0 = Math.floor((y - h2) * h1);
var ty = (y - h2 - y0 * h) * h1;
var y1 = Math.min(y0 + 1, this.fNumY - 2);
var sx = 1.0 - tx;
var sy = 1.0 - ty;
if (x0 < this.fNumX && y0 < this.fNumY) d[x0 * n + y0] += sx * sy;
if (x1 < this.fNumX && y0 < this.fNumY) d[x1 * n + y0] += tx * sy;
if (x1 < this.fNumX && y1 < this.fNumY) d[x1 * n + y1] += tx * ty;
if (x0 < this.fNumX && y1 < this.fNumY) d[x0 * n + y1] += sx * ty;
}
if (this.particleRestDensity === 0.0) {
var sum = 0.0;
var numFluidCells = 0;
for (var c = 0; c < this.fNumCells; c++) {
if (this.cellType[c] === FLUID_CELL) {
sum += d[c];
numFluidCells++;
}
}
if (numFluidCells > 0) this.particleRestDensity = sum / numFluidCells;
}
};
FlipFluid.prototype.transferVelocities = function (toGrid, flipRatio) {
var n = this.fNumY;
var h = this.h;
var h1 = this.fInvSpacing;
var h2 = 0.5 * h;
if (toGrid) {
this.prevU.set(this.u);
this.prevV.set(this.v);
this.du.fill(0.0);
this.dv.fill(0.0);
this.u.fill(0.0);
this.v.fill(0.0);
for (var ci = 0; ci < this.fNumCells; ci++)
this.cellType[ci] = this.s[ci] === 0.0 ? SOLID_CELL : AIR_CELL;
for (var pi = 0; pi < this.numParticles; pi++) {
var pxi = clamp(Math.floor(this.particlePos[2 * pi] * h1), 0, this.fNumX - 1);
var pyi = clamp(Math.floor(this.particlePos[2 * pi + 1] * h1), 0, this.fNumY - 1);
var pc = pxi * n + pyi;
if (this.cellType[pc] === AIR_CELL) this.cellType[pc] = FLUID_CELL;
}
}
for (var component = 0; component < 2; component++) {
var dx = component === 0 ? 0.0 : h2;
var dy = component === 0 ? h2 : 0.0;
var f = component === 0 ? this.u : this.v;
var prevF = component === 0 ? this.prevU : this.prevV;
var d = component === 0 ? this.du : this.dv;
for (var i = 0; i < this.numParticles; i++) {
var x = clamp(this.particlePos[2 * i], h, (this.fNumX - 1) * h);
var y = clamp(this.particlePos[2 * i + 1], h, (this.fNumY - 1) * h);
var x0 = Math.min(Math.floor((x - dx) * h1), this.fNumX - 2);
var tx = (x - dx - x0 * h) * h1;
var x1 = Math.min(x0 + 1, this.fNumX - 2);
var y0 = Math.min(Math.floor((y - dy) * h1), this.fNumY - 2);
var ty = (y - dy - y0 * h) * h1;
var y1 = Math.min(y0 + 1, this.fNumY - 2);
var sx = 1.0 - tx;
var sy = 1.0 - ty;
var d0 = sx * sy;
var d1 = tx * sy;
var d2 = tx * ty;
var d3 = sx * ty;
var nr0 = x0 * n + y0;
var nr1 = x1 * n + y0;
var nr2 = x1 * n + y1;
var nr3 = x0 * n + y1;
if (toGrid) {
var pv = this.particleVel[2 * i + component];
f[nr0] += pv * d0;
d[nr0] += d0;
f[nr1] += pv * d1;
d[nr1] += d1;
f[nr2] += pv * d2;
d[nr2] += d2;
f[nr3] += pv * d3;
d[nr3] += d3;
} else {
var offset = component === 0 ? n : 1;
var valid0 =
this.cellType[nr0] !== AIR_CELL || this.cellType[nr0 - offset] !== AIR_CELL ? 1.0 : 0.0;
var valid1 =
this.cellType[nr1] !== AIR_CELL || this.cellType[nr1 - offset] !== AIR_CELL ? 1.0 : 0.0;
var valid2 =
this.cellType[nr2] !== AIR_CELL || this.cellType[nr2 - offset] !== AIR_CELL ? 1.0 : 0.0;
var valid3 =
this.cellType[nr3] !== AIR_CELL || this.cellType[nr3 - offset] !== AIR_CELL ? 1.0 : 0.0;
var v = this.particleVel[2 * i + component];
var dv = valid0 * d0 + valid1 * d1 + valid2 * d2 + valid3 * d3;
if (dv > 0.0) {
var picV =
(valid0 * d0 * f[nr0] +
valid1 * d1 * f[nr1] +
valid2 * d2 * f[nr2] +
valid3 * d3 * f[nr3]) /
dv;
var corr =
(valid0 * d0 * (f[nr0] - prevF[nr0]) +
valid1 * d1 * (f[nr1] - prevF[nr1]) +
valid2 * d2 * (f[nr2] - prevF[nr2]) +
valid3 * d3 * (f[nr3] - prevF[nr3])) /
dv;
var flipV = v + corr;
this.particleVel[2 * i + component] = (1.0 - flipRatio) * picV + flipRatio * flipV;
}
}
}
if (toGrid) {
for (var fi = 0; fi < f.length; fi++) if (d[fi] > 0.0) f[fi] /= d[fi];
for (var ix = 0; ix < this.fNumX; ix++) {
for (var jy = 0; jy < this.fNumY; jy++) {
var solid = this.cellType[ix * n + jy] === SOLID_CELL;
if (solid || (ix > 0 && this.cellType[(ix - 1) * n + jy] === SOLID_CELL))
this.u[ix * n + jy] = this.prevU[ix * n + jy];
if (solid || (jy > 0 && this.cellType[ix * n + jy - 1] === SOLID_CELL))
this.v[ix * n + jy] = this.prevV[ix * n + jy];
}
}
}
}
};
FlipFluid.prototype.solveIncompressibility = function (
numIters,
dt,
overRelaxation,
compensateDrift,
) {
this.p.fill(0.0);
this.prevU.set(this.u);
this.prevV.set(this.v);
var n = this.fNumY;
var cp = (this.density * this.h) / dt;
for (var iter = 0; iter < numIters; iter++) {
for (var i = 1; i < this.fNumX - 1; i++) {
for (var j = 1; j < this.fNumY - 1; j++) {
if (this.cellType[i * n + j] !== FLUID_CELL) continue;
var center = i * n + j;
var left = (i - 1) * n + j;
var right = (i + 1) * n + j;
var bottom = i * n + j - 1;
var top = i * n + j + 1;
var s = this.s[left] + this.s[right] + this.s[bottom] + this.s[top];
if (s === 0.0) continue;
var div = this.u[right] - this.u[center] + this.v[top] - this.v[center];
if (this.particleRestDensity > 0.0 && compensateDrift) {
var k = 1.0;
var compression = this.particleDensity[i * n + j] - this.particleRestDensity;
if (compression > 0.0) div = div - k * compression;
}
var p = -div / s;
p *= overRelaxation;
this.p[center] += cp * p;
this.u[center] -= this.s[left] * p;
this.u[right] += this.s[right] * p;
this.v[center] -= this.s[bottom] * p;
this.v[top] += this.s[top] * p;
}
}
}
};
FlipFluid.prototype.updateCellColors = function () {
this.cellColor.fill(0.0);
for (var i = 0; i < this.fNumCells; i++) {
if (this.cellType[i] === SOLID_CELL) {
this.cellColor[3 * i] = 0.5;
this.cellColor[3 * i + 1] = 0.5;
this.cellColor[3 * i + 2] = 0.5;
} else if (this.cellType[i] === FLUID_CELL) {
var d = this.particleDensity[i];
if (this.particleRestDensity > 0.0) d /= this.particleRestDensity;
var val = Math.min(Math.max(d, 0.0), 2.0 - 0.0001);
val = val / 2.0;
var m = 0.25;
var num = Math.floor(val / m);
var s = (val - num * m) / m;
var g = num % 2 === 0 ? s : 1.0 - s;
this.cellColor[3 * i] = g;
this.cellColor[3 * i + 1] = g;
this.cellColor[3 * i + 2] = g;
}
}
};
FlipFluid.prototype.simulate = function (
dt,
gravity,
flipRatio,
numPressureIters,
numParticleIters,
overRelaxation,
compensateDrift,
separateParticles,
obstacleX,
obstacleY,
obstacleRadius,
) {
var numSubSteps = 1;
var sdt = dt / numSubSteps;
for (var step = 0; step < numSubSteps; step++) {
this.integrateParticles(sdt);
if (separateParticles) this.pushParticlesApart(numParticleIters);
this.handleParticleCollisions(obstacleX, obstacleY, obstacleRadius);
this.transferVelocities(true);
this.updateParticleDensity();
this.solveIncompressibility(numPressureIters, sdt, overRelaxation, compensateDrift);
this.transferVelocities(false, flipRatio);
}
this.updateCellColors();
};
var FLUID_CELL = 0;
var AIR_CELL = 1;
var SOLID_CELL = 2;
var scene = {
gravity: GRAVITY,
dt: SPEED_BASE,
flipRatio: 0.9,
numPressureIters: 30,
numParticleIters: 2,
overRelaxation: 1.9,
compensateDrift: true,
separateParticles: true,
obstacleX: 0.0,
obstacleY: 0.0,
obstacleRadius: 0,
paused: true,
fluid: null,
};
var GRID_SIZE = MIN_GRID_SIZE;
var renderEl = null;
function computeGrid() {
GRID_SIZE = Math.max(
Math.round(Math.sqrt((window.innerWidth * window.innerHeight) / TARGET_LONG_SIDE)),
MIN_GRID_SIZE,
);
}
function realWidth() {
return Math.ceil(window.innerWidth / GRID_SIZE + CELL_CROP_X * 2) * GRID_SIZE;
}
function realHeight() {
return Math.ceil(window.innerHeight / GRID_SIZE + CELL_CROP_Y * 2) * GRID_SIZE;
}
var Y_RESOLUTION = 0;
var RESOLUTION = 0;
var simHeight = 2.0;
var cScale = 1;
var simWidth = 0;
var f = null;
function setupScene() {
computeGrid();
var rw = realWidth();
var rh = realHeight();
Y_RESOLUTION = rh / GRID_SIZE;
RESOLUTION = Y_RESOLUTION;
cScale = rh / simHeight;
simWidth = rw / cScale;
if (renderEl) {
renderEl.style.width = realWidth() + 'px';
renderEl.style.height = realHeight() + 'px';
renderEl.style.setProperty('font-size', GRID_SIZE + 'px');
renderEl.style.lineHeight = GRID_SIZE + 'px';
}
var res = RESOLUTION;
var tankHeight = 1.0 * simHeight;
var tankWidth = 1.0 * simWidth;
var h = tankHeight / res;
var density = 1000.0;
var relWaterHeight = 0.618;
var relWaterWidth = 1;
var r = 0.3 * h;
var dx = 2.0 * r;
var dy = (Math.sqrt(3.0) / 2.0) * dx;
var numX = Math.floor((relWaterWidth * tankWidth - 2.0 * h - 2.0 * r) / dx);
var numY = Math.floor((relWaterHeight * tankHeight - 2.0 * h - 2.0 * r) / dy);
var maxParticles = numX * numY;
f = scene.fluid = new FlipFluid(density, tankWidth, tankHeight, h, r, maxParticles);
f.numParticles = numX * numY;
var p = 0;
for (var i = 0; i < numX; i++) {
for (var j = 0; j < numY; j++) {
var xOffset = (tankWidth - numX * dx) / 2;
var yOffset = (tankHeight - numY * dy) * -0.5;
f.particlePos[p++] = h + r + dx * i + (j % 2 === 0 ? 0.0 : r) + xOffset;
f.particlePos[p++] = h + r + dy * j + yOffset;
}
}
var n = f.fNumY;
for (var ix = 0; ix < f.fNumX; ix++) {
for (var jy = 0; jy < f.fNumY; jy++) {
var s = 1.0;
if (ix === 0 || ix === f.fNumX - 1 || jy === 0) s = 0.0;
f.s[ix * n + jy] = s;
}
}
}
function setObstacle(x, y, reset) {
var vx = 0.0;
var vy = 0.0;
if (!reset) {
vx = (x - scene.obstacleX) / scene.dt;
vy = (y - scene.obstacleY) / scene.dt;
}
scene.obstacleX = x;
scene.obstacleY = y;
}
var mouseDown = false;
function simCoords(clientX, clientY) {
var rect = renderEl.getBoundingClientRect();
var mx = clientX - rect.left;
var my = clientY - rect.top;
return {
x: mx / cScale,
y: (rect.height - my) / cScale,
};
}
function startDrag(clientX, clientY) {
mouseDown = true;
document.body.classList.add('is-fluid-grabbing');
var c = simCoords(clientX, clientY);
setObstacle(c.x, c.y, true);
scene.paused = false;
}
function drag(clientX, clientY) {
if (!mouseDown) return;
var c = simCoords(clientX, clientY);
setObstacle(c.x, c.y, false);
}
function endDrag() {
mouseDown = false;
document.body.classList.remove('is-fluid-grabbing');
}
function onMouseDown(e) {
if (e.button !== 0 || reduced.matches) return;
scene.obstacleRadius = 0.0;
scene.dt = SPEED_1;
startDrag(e.clientX, e.clientY);
}
function onMouseMove(e) {
drag(e.clientX, e.clientY);
}
function onMouseUp() {
scene.dt = SPEED_2;
endDrag();
}
function onTouchStart(e) {
if (!e.touches.length || reduced.matches) return;
scene.obstacleRadius = 0.0;
scene.dt = SPEED_1;
startDrag(e.touches[0].clientX, e.touches[0].clientY);
}
function onTouchMove(e) {
if (!mouseDown || !e.touches.length) return;
drag(e.touches[0].clientX, e.touches[0].clientY);
}
function onTouchEnd() {
scene.dt = SPEED_2;
endDrag();
}
function requestDeviceMotion() {
if (
typeof window.DeviceMotionEvent !== 'undefined' &&
typeof DeviceMotionEvent.requestPermission === 'function'
) {
DeviceMotionEvent.requestPermission()
.then(function (permission) {
if (permission === 'granted') setupDeviceMotion();
})
.catch(function () {
});
} else if (typeof window.DeviceMotionEvent !== 'undefined') {
setupDeviceMotion();
}
}
function setupDeviceMotion() {
window.addEventListener('devicemotion', function (event) {
var a = event.accelerationIncludingGravity;
if (!a || (a.x == null && a.y == null)) return;
var x = a.x || 0;
var y = a.y || 0;
if (!x && !y) return;
var angle = 0;
if (window.screen && screen.orientation && typeof screen.orientation.angle === 'number')
angle = screen.orientation.angle;
else if (typeof window.orientation === 'number') angle = window.orientation;
if (angle === 90) {
var t = x;
x = -y;
y = t;
} else if (angle === -90 || angle === 270) {
var t2 = x;
x = y;
y = -t2;
} else if (angle === 180 || angle === -180) {
x = -x;
y = -y;
}
gravityVector = { x: x, y: y };
scene.gravity = 0;
});
}
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
var rafId = null;
var FRAME_MIN_MS = 1000 / 30;
var lastFrameT = 0;
function update(now) {
rafId = null;
if (!pausedForever && now - lastFrameT < FRAME_MIN_MS) {
rafId = requestAnimationFrame(update);
return;
}
lastFrameT = now;
var MAX_RADIUS = window.innerWidth > window.innerHeight ? 0.47 : 0.37;
scene.obstacleRadius = (scene.obstacleRadius * 3 + MAX_RADIUS) / 4;
if (!scene.paused) {
scene.fluid.simulate(
scene.dt,
scene.gravity,
scene.flipRatio,
scene.numPressureIters,
scene.numParticleIters,
scene.overRelaxation,
scene.compensateDrift,
scene.separateParticles,
scene.obstacleX,
scene.obstacleY,
scene.obstacleRadius,
);
}
var toRender = '';
for (var i = f.fNumY - CELL_CROP_Y; i > CELL_CROP_Y; i--) {
var row = '';
for (var j = CELL_CROP_X; j < f.fNumX - CELL_CROP_X; j++) {
var dict = RENDER_DICTS[(i + j + 1) % RENDER_DICTS.length];
var cellColor = f.cellColor[3 * (j * f.fNumY + i)];
row += dict[Math.floor(cellColor * dict.length)];
}
toRender += row + '\n';
}
renderEl.textContent = toRender;
if (!pausedForever) {
if (settleFrames > 0) {
if (--settleFrames === 0) {
pausedForever = true;
scene.paused = true;
}
}
if (!pausedForever) rafId = requestAnimationFrame(update);
}
}
var RENDER_DICTS = RENDER_CHARS.map(function (ramp) {
return ramp
.slice()
.sort(function (a, b) {
return a[1] - b[1];
})
.map(function (pair) {
return pair[0];
})
.join('');
});
var pausedForever = false;
var settleFrames = 0;
var DESKTOP_MQ = window.matchMedia('(min-width: 900px)');
var listenersBound = false;
function bindListeners() {
if (listenersBound) return;
listenersBound = true;
window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('touchstart', onTouchStart, { passive: true });
window.addEventListener('touchmove', onTouchMove, { passive: true });
window.addEventListener('touchend', onTouchEnd, { passive: true });
var motionOnce = function () {
window.removeEventListener('mousedown', motionOnce);
window.removeEventListener('touchend', motionOnce);
requestDeviceMotion();
};
window.addEventListener('mousedown', motionOnce, { once: true });
window.addEventListener('touchend', motionOnce, { once: true });
var resizeTimer;
window.addEventListener('resize', function () {
if (!DESKTOP_MQ.matches) return;
clearTimeout(resizeTimer);
resizeTimer = setTimeout(function () {
setupScene();
startDrag(window.innerWidth / 2, window.innerHeight * 0.54);
endDrag();
}, 250);
});
}
function start() {
if (!renderEl) {
var mount = document.querySelector('[data-fluid-triangle]');
if (!mount) return;
renderEl = document.createElement('div');
renderEl.className = 'render';
mount.appendChild(renderEl);
}
setupScene();
bindListeners();
pausedForever = false;
if (reduced.matches) {
settleFrames = 60;
scene.paused = false;
startDrag(window.innerWidth / 2, window.innerHeight * 0.54);
endDrag();
rafId = requestAnimationFrame(update);
return;
}
startDrag(window.innerWidth / 2, window.innerHeight * 0.54);
endDrag();
scene.paused = false;
rafId = requestAnimationFrame(update);
}
function stopAll() {
if (rafId !== null) cancelAnimationFrame(rafId);
rafId = null;
scene.paused = true;
pausedForever = true;
if (renderEl) renderEl.textContent = '';
}
function onDesktopGate(e) {
if (e.matches && mounted) start();
else if (!e.matches) stopAll();
}
var gateBound = false;
function init() {
var el = document.querySelector('[data-fluid-triangle]');
renderEl = el ? el.querySelector('.render') : null;
if (!gateBound) {
gateBound = true;
DESKTOP_MQ.addEventListener('change', onDesktopGate);
}
if (!el) {
stopAll();
return;
}
if (!mounted) {
mounted = true;
gravityVector = null;
}
if (DESKTOP_MQ.matches) start();
else if (!DESKTOP_MQ.matches) stopAll();
}
NS.fluidTriangle = { init: init };
})();
(function () {
'use strict';
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var mqDesktop = window.matchMedia('(min-width: 900px)');
var PAR_F = 0.12;
var PAR_MAX = 260;
var state = null;
var clickBound = false;
function cancelLoop() {
if (!state) return;
state.running = false;
if (state.raf !== null) cancelAnimationFrame(state.raf);
state.items.forEach(function (it, i) {
it.style.transform = '';
state.offs[i] = 0;
});
state = null;
}
function onDocClick(e) {
if (!state || !clickBound) return;
if (!mqDesktop.matches) return;
var hit = document.elementFromPoint(e.clientX, e.clientY);
var img = hit && hit.closest('.gal-item img');
if (!img) return;
var imgs = state.imgs;
img.classList.add('-clicked');
setTimeout(function () {
img.classList.remove('-clicked');
imgs.forEach(function (im) { im.classList.remove('-active'); });
setTimeout(function () {
imgs.forEach(function (im, i) {
im.style.transitionDelay = reduced ? '0s' : (i % 4) * 0.06 + 's';
im.classList.add('-active');
});
}, 120);
}, 1200);
}
function init() {
cancelLoop();
if (!clickBound) {
clickBound = true;
document.addEventListener('click', onDocClick);
}
var track = document.querySelector('[data-gallery]');
if (!track) return;
var items = Array.prototype.slice.call(track.querySelectorAll('.gal-item'));
if (!items.length) return;
var imgs = items.map(function (it) { return it.querySelector('img'); });
var speeds = items.map(function (it) { return parseFloat(it.getAttribute('data-speed')) || 1; });
var offs = new Array(items.length).fill(0);
state = { items: items, imgs: imgs, speeds: speeds, offs: offs, running: false, raf: null };
function reveal() {
imgs.forEach(function (img, i) {
img.style.transitionDelay = reduced ? '0s' : (i % 4) * 0.06 + 's';
img.classList.add('-active');
});
}
function tick() {
state.raf = null;
if (!state.running) return;
var half = window.innerWidth / 2;
for (var i = 0; i < state.items.length; i++) {
var it = state.items[i];
var r = it.getBoundingClientRect();
var centre = r.left + r.width / 2 - state.offs[i] - half;
var target = centre * (state.speeds[i] - 1) * PAR_F;
if (target > PAR_MAX) target = PAR_MAX;
else if (target < -PAR_MAX) target = -PAR_MAX;
var off = state.offs[i] + (target - state.offs[i]) * 0.18;
if (Math.abs(off - state.offs[i]) > 0.05) {
state.offs[i] = off;
it.style.transform = 'translateX(' + off.toFixed(1) + 'px)';
}
}
state.raf = requestAnimationFrame(tick);
}
if (!reduced) {
state.running = true;
if (!state.raf) state.raf = requestAnimationFrame(tick);
}
reveal();
}
window.DCITC = window.DCITC || {};
window.DCITC.gallery = { init: init };
})();
(function () {
'use strict';
function boot() {
if (window.DCITC.theme) window.DCITC.theme.init();
if (window.DCITC.transitions) window.DCITC.transitions.init();
if (window.DCITC.navigate) window.DCITC.navigate.init();
if (window.DCITC.musicPlayer) window.DCITC.musicPlayer.init();
}
function page() {
if (window.DCITC.horizontal) window.DCITC.horizontal.init();
if (window.DCITC.reveal) window.DCITC.reveal.init();
if (window.DCITC.pages) window.DCITC.pages.init();
if (window.DCITC.gallery) window.DCITC.gallery.init();
if (window.DCITC.fluidTriangle) window.DCITC.fluidTriangle.init();
}
window.DCITC = window.DCITC || {};
window.DCITC.boot = boot;
window.DCITC.page = page;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', function () {
boot();
page();
});
} else {
boot();
page();
}
})();
