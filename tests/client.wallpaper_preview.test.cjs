/**
 * dsh-dream-skin — live wallpaper preview guard (PR #126, by @ppy-web).
 *
 * While one of the two wallpaper sliders is dragged, the settings dialog is
 * reduced to that slider's row so the chat page and the wallpaper behind it are
 * visible. The mechanism is attribute-driven (`data-dsh-dream-skin-wallpaper-preview`)
 * and deliberately keeps the range input where it is: moving, removing or
 * reparenting it mid-gesture would interrupt the native drag.
 *
 * Two things can rot silently here and neither is visible in a screenshot:
 *
 *   1. the cleanup forgets one of its exits, and a user ends up with a settings
 *      dialog whose contents stay invisible until they reopen it;
 *   2. the panel-hiding attribute leaks onto a node that outlives the dialog,
 *      so the next time settings open, the page is still hidden.
 *
 * So this file checks the sheet's shape, then RUNS `beginWallpaperPreview()`
 * against a stub tree shaped like the host's dialog (measured on 0.2.0-rc.1:
 * `div[role="presentation"].overlay` wrapping `div.mask` and
 * `div[role="dialog"][aria-modal="true"].panel`), and finishes with mutation
 * legs that prove each named rule can actually fail.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8');
const ATTR = 'data-dsh-dream-skin-wallpaper-preview';

/** The function body, brace-matched. A regex would stop at the first `}`. */
function previewSource(bundle = BUNDLE) {
	const start = bundle.indexOf('function beginWallpaperPreview(');
	assert.notEqual(start, -1, 'beginWallpaperPreview() is gone — the preview feature was removed without removing this gate');
	let depth = 0;
	let opened = false;
	for (let i = start; i < bundle.length; i++) {
		if (bundle[i] === '{') { depth++; opened = true; }
		else if (bundle[i] === '}') {
			depth--;
			if (opened && depth === 0) return bundle.slice(start, i + 1);
		}
	}
	throw new Error('unbalanced braces around beginWallpaperPreview()');
}

/**
 * The sheet half, as source-shaped regexes: selector → opening brace → the
 * declaration that has to be inside THAT rule. Collecting selectors alone was
 * the first version of this file and it passed with every declaration deleted.
 */
const SHEET = {
	hide: /\[data-dsh-dream-skin-wallpaper-preview="root"\] \*,[^{]*\{[^}]*visibility: hidden/,
	surfaces: /\[data-dsh-dream-skin-wallpaper-preview="path"\][^{]*\{[^}]*background: transparent/,
	row: /\[data-dsh-dream-skin-wallpaper-preview="row"\][^{]*\{[^}]*var\(--dsw-alias-[a-z0-9-]+\)/
};

/**
 * Audit + behaviour checks, in one place so the mutation legs can point at one
 * named failure each. Returns a list of human-readable problems.
 */
function previewProblems(bundle = BUNDLE) {
	const problems = [];
	const src = (() => {
		try { return previewSource(bundle); } catch { return null; }
	})();
	if (src === null) return ['beginWallpaperPreview() is missing or not brace-balanced'];

	// --- the sheet half ---------------------------------------------------
	if (!SHEET.hide.test(bundle)) {
		problems.push('no rule hides the dialog subtree via the root attribute');
	}
	if (!SHEET.surfaces.test(bundle)) {
		problems.push('no rule clears the wrapper surfaces between root and row (the glass would stay)');
	}
	if (!SHEET.row.test(bundle)) {
		problems.push('the row chip is not painted from a --dsw- alias token (craft audit surface)');
	}

	// --- the mechanism half -----------------------------------------------
	for (const exit of ['pointerup', 'pointercancel', 'blur', 'visibilitychange', 'keydown']) {
		if (!src.includes(`"${exit}"`)) problems.push(`cleanup does not listen for ${exit} — one exit path leaks`);
	}
	if (!src.includes('removeAttribute(attr)')) problems.push('cleanup never removes the attribute it added');
	if (!src.includes('else node.setAttribute(attr, previous)')) {
		problems.push('cleanup does not restore a pre-existing attribute value (a second preview would eat the first one\'s state)');
	}
	if (!src.includes('getAttribute("role") === "presentation"')) {
		problems.push('root detection no longer climbs to the presentation wrapper — the host\'s mask is a SIBLING of the dialog, so the dimming layer would stay over the page');
	}

	// --- the focus hazard --------------------------------------------------
	// visibility:hidden blurs a focused descendant, so a keyboard-triggered
	// preview would drop focus out of the slider after one arrow press.
	if (/onKeyDown[^\n]*startPreview/.test(bundle)) {
		problems.push('a keyboard handler starts the preview — hiding a focused subtree moves focus to body, so arrow-key adjustment silently stops after one press');
	}

	// --- behaviour --------------------------------------------------------
	const behaviour = runPreview(src);
	problems.push(...behaviour);
	return problems;
}

/** Stub DOM shaped like the host dialog, then drive the real function. */
function runPreview(src) {
	const problems = [];
	const makeNode = (tag, role) => ({
		// `role` is an ATTRIBUTE in the real DOM; the source reads it with getAttribute,
		// so the stub has to publish it there too or the presentation branch is never taken.
		tagName: tag, role: role || null, attrs: role ? { role } : {}, parentElement: null, children: [],
		addEventListener() {}, removeEventListener() {},
		getAttribute(k) { return this.attrs[k] ?? null; },
		setAttribute(k, v) { this.attrs[k] = String(v); },
		removeAttribute(k) { delete this.attrs[k]; },
		appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
		closest(sel) {
			let node = this;
			while (node) {
				if (sel.includes('role="dialog"') && node.role === 'dialog') return node;
				node = node.parentElement;
			}
			return null;
		}
	});
	const listeners = new Map();
	const doc = {
		hidden: false,
		addEventListener(type, fn, capture) { listeners.set(type, { fn, capture }); },
		removeEventListener(type, fn) { if (listeners.get(type)?.fn === fn) listeners.delete(type); },
		dispatch(type) { const l = listeners.get(type); if (l) l.fn({ type, key: doc.key }); }
	};
	const win = { addEventListener() {}, removeEventListener() {} };

	const overlay = makeNode('div', 'presentation');
	const mask = makeNode('div');
	const panel = makeNode('div', 'dialog');
	const content = makeNode('div');
	const row = makeNode('div');
	const input = makeNode('input');
	overlay.appendChild(mask); overlay.appendChild(panel);
	panel.appendChild(content); content.appendChild(row); row.appendChild(input);
	// A pre-existing value must survive: the panel is reused across previews.
	content.setAttribute(ATTR, 'stale');

	const fn = vm.runInNewContext(`let wallpaperPreviewCleanup = null;\n${src}\nbeginWallpaperPreview;`, { document: doc, window: win });
	const finish = fn(input, () => {});
	if (typeof finish !== 'function') return ['beginWallpaperPreview() returned no cleanup for a dialog-shaped tree'];

	if (overlay.getAttribute(ATTR) !== 'root') problems.push('root is not marked on the presentation wrapper');
	if (panel.getAttribute(ATTR) !== 'path' || content.getAttribute(ATTR) !== 'path') {
		problems.push('the wrappers between root and row are not marked as path — the mask/panel surfaces would show through');
	}
	if (row.getAttribute(ATTR) !== 'row') problems.push('the slider row is not marked as row');
	if (mask.attrs[ATTR] !== undefined) problems.push('the mask sibling was marked; it must be hidden by the root rule, not marked');

	// Every exit the function listens for must restore the whole tree.
	const exits = [
		['pointerup', () => {}],
		['visibilitychange', () => { doc.hidden = true; }],
		['keydown', () => { doc.key = 'Escape'; }]
	];
	for (const [exit, arm] of exits) {
		arm();
		doc.dispatch(exit);
		doc.hidden = false;
		doc.key = '';
		if (overlay.attrs[ATTR] !== undefined || panel.attrs[ATTR] !== undefined || row.attrs[ATTR] !== undefined) {
			problems.push(`${exit} did not restore every marked node`);
		}
		if (content.getAttribute(ATTR) !== 'stale') problems.push(`${exit} did not restore the previous attribute value`);
		if (listeners.size !== 0) problems.push(`${exit} left listeners attached — the next preview would double them`);
		// re-arm for the next exit
		fn(input, () => {});
	}
	return problems;
}

test('wallpaper preview: the sheet reduces the dialog to one row, and every exit restores it', () => {
	assert.deepEqual(previewProblems(), []);
});

test('mutation: each named way the preview can rot is caught, and the control stays green', () => {
	// One mutation, one named red — "at least one problem" would let a single
	// check cover for every other one.
	const cases = [
		['drop the pointercancel exit', (s) => s.replace('listen(document, "pointercancel");', ''), 'pointercancel'],
		['stop removing the attribute', (s) => s.replace('if (previous === null) node.removeAttribute(attr);', 'if (previous === null) { /* leak */ }'), 'never removes the attribute'],
		['stop restoring a previous value', (s) => s.replace('else node.setAttribute(attr, previous);', 'else { /* eat it */ }'), 'pre-existing attribute value'],
		['forget the presentation wrapper (mask stays over the page)', (s) => s.replace('dialog.parentElement?.getAttribute("role") === "presentation" ? dialog.parentElement : dialog', 'dialog'), 'presentation wrapper'],
		['mark the dialog instead of the wrapper', (s) => s.replace('mark(root, "root");', 'mark(dialog, "root");'), 'root is not marked on the presentation wrapper']
	];
	for (const [name, mutate, expected] of cases) {
		const src = previewSource();
		const next = mutate(src);
		assert.notEqual(next, src, `${name}: the mutation did not change the source — it would prove nothing`);
		const problems = previewProblems(BUNDLE.replace(src, next));
		assert.ok(problems.some((p) => p.includes(expected)), `${name}: expected a problem naming "${expected}", got ${JSON.stringify(problems)}`);
	}

	// A keyboard-triggered preview is a source-shape (not source-body) mutation.
	const keyboard = BUNDLE.replace(
		'onPointerDown: (event) => { if (event.button === 0 && event.isPrimary !== false) startPreview(event); }',
		'onPointerDown: (event) => { if (event.button === 0 && event.isPrimary !== false) startPreview(event); }, onKeyDown: (event) => { if (event.key === "ArrowLeft") startPreview(event); }'
	);
	assert.notEqual(keyboard, BUNDLE, 'the keyboard mutation did not apply');
	assert.ok(previewProblems(keyboard).some((p) => p.includes('keyboard handler')), 'a keyboard trigger must be named (focus is lost mid-adjust)');

	// control: the sheet half must be failable on its own. Replace EVERY token use
	// inside the row rule — the chip also gets its ring from the same token, so
	// swapping only the background left the check legitimately green.
	const sheet = BUNDLE.split('var(--dsw-alias-bg-layer-2)').join('pink');
	assert.ok(previewProblems(sheet).some((p) => p.includes('--dsw- alias token')), 'a hard-coded chip colour must be named');
});

test('wallpaper preview: only the two wallpaper sliders opt in', () => {
	const opts = BUNDLE.match(/previewWallpaper: true/g) || [];
	assert.equal(opts.length, 2, 'exactly the wallpaper opacity and blur rows carry previewWallpaper: true');
});
