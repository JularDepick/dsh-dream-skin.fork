"use strict";
/**
 * Compositor work budget — issue #123.
 *
 * WHY THIS EXISTS. Issue #110 reports >50% GPU on an M4 Mac with two DSH windows,
 * and it has been open without data for days. That report describes a RUNTIME
 * measurement on someone else's machine, and this file cannot reproduce it. What it
 * can do is stop the *static* side of the argument from being folklore: the things
 * that make the compositor work — `backdrop-filter` panes, blur radii, gradient
 * layers, rAF loops — get counted out of the shipped bundle, by `scripts/compositor-audit.cjs`,
 * with a line number per occurrence.
 *
 * WHAT THE NUMBERS MEAN, EXACTLY. "Declared sites", not live layers. A declaration
 * is what the sheet asks for; whether an element carrying it is mounted right now is
 * a property of the running page, and this gate cannot see it. The audit says so in
 * its own output; repeating it here is deliberate, because the whole point of the
 * issue is that an unqualified number gets quoted as if it were a measurement.
 *
 * THE BUDGETS. Each one is the current measured value plus zero headroom: growth
 * has to be an explicit edit to this table WITH a reason beside it, the same shape
 * as `tests/package.runtime_size.test.cjs`. A ceiling nobody has to argue with is
 * not a budget, it is a comment.
 *
 * WHY BLUR MATTERS MORE THAN COUNT, AND COUNT MATTERS MORE THAN EITHER. On the
 * compositor every `backdrop-filter` pane is a separate offscreen pass; a second
 * window doubles the passes. So the first lever is the NUMBER of panes, the second
 * is the radius (cost grows with the blurred area, and radius above ~40 px costs
 * about the same because the kernel is already wide). The numbers below are shaped
 * that way on purpose.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { auditSource } = require('../scripts/compositor-audit.cjs');

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8');

/**
 * Ceilings. `reason` is mandatory in prose here for the same reason the size gate
 * carries one: the next person's diff should say why this number moved.
 */
const BUDGETS = {
	// Six panes: host question card (24), host todo/queue panel (20), our modal card,
	// our composer ::before, and the @supports composer recipe. The low-power `none`
	// declaration is the kill switch, not a pane, and is counted apart.
	// 6 -> 7 on 10.28.1: the host paints NO surface behind the "/" trigger menu
	// ([data-composer-overlay] is height:0 and the MenuView class declares no
	// background), so the plugin paints that pane itself — issue #124, one real
	// offscreen pass, added on purpose.
	// 7 -> 8 on 10.29.0: the wallpaper-preview rule clears the dialog wrappers while
	// a slider is dragged (`visibility` lets them paint, so their own glass would
	// otherwise blur the page under the floating row). That declaration is a
	// `backdrop-filter: none` — it REMOVES a pass, same class as the low-power kill
	// switch, so the pane count did not grow. The budget counts declarations, not
	// panes (issue #110's boundary), and an 8th declaration still has to be declared
	// here on purpose.
	backdropFilterDeclarations: 8,
	// 34px = the composer's `calc(glass + thickness)` default. 40 is the width above
	// which extra radius buys nothing but fill cost, so the ceiling is 40, not "34 + 1".
	maxStaticBlurPx: 40,
	// Glow layers: each skin's radial-gradient stack. 40 occurrences today; a new
	// skin-wide glow has to arrive with a decision, not as a side effect.
	radialGradients: 40,
	// Two rAF loops (boot fallback + the nav-icon first-frame retry). Every additional
	// loop is a per-frame callback, so this is the strictest of the four.
	requestAnimationFrames: 2,
	// Our own CSS `filter:` blurs: zero. Nothing in the stylesheet blurs a layer.
	filterDeclarations: 0,
	// …but the wallpaper is NOT styled by the sheet: `wallpaperEl.style.filter =
	// blur(Npx)` is a viewport-sized offscreen pass set from JS, and in `blur` fit a
	// second one (the bleed halo) sits behind it. That is the largest compositor item
	// in the plugin, and the first version of this audit reported "zero filter blurs"
	// because it only read CSS declarations. Both sites must stay present AND stay
	// behind the low-power guard — an unguarded one means the switch does not switch.
	inlineFilterSites: 2,
};

const live = auditSource(CLIENT, 'lib/client.js');

test('compositor: the audit reads the shipped bundle (a silent zero is a failure, not a pass)', () => {
	// Issue #102's rule: a check that cannot fail must not look like it ran. If the
	// parser stops recognising declarations, every count becomes 0 and every budget
	// below passes vacuously — so the first assertion is that it sees the real thing.
	assert.ok(live.bytes > 400_000, `audit read ${live.bytes} bytes — that is not the shipped bundle`);
	assert.ok(live.counts.backdropFilterDeclarations > 0, 'the audit found no backdrop-filter declarations at all — the parser is broken, not the file');
	assert.ok(live.counts.radialGradients > 0, 'the audit found no radial-gradient occurrences at all — the parser is broken');
	assert.equal(live.counts.backdropFilterDeclarations, BUDGETS.backdropFilterDeclarations,
		`backdrop-filter declarations moved: ${live.counts.backdropFilterDeclarations} today, ${BUDGETS.backdropFilterDeclarations} budgeted. A new pane needs a line HERE with a reason (see issue #110).`);
	assert.equal(live.counts.radialGradients, BUDGETS.radialGradients, `radial-gradient occurrences: ${live.counts.radialGradients} today, ${BUDGETS.radialGradients} budgeted`);
	assert.equal(live.counts.requestAnimationFrames, BUDGETS.requestAnimationFrames, `rAF sites: ${live.counts.requestAnimationFrames} today, ${BUDGETS.requestAnimationFrames} budgeted`);
	assert.equal(live.counts.filterDeclarations, BUDGETS.filterDeclarations, `CSS filter: declarations: ${live.counts.filterDeclarations} today, ${BUDGETS.filterDeclarations} budgeted — a new filter blur is a new compositor layer`);
	assert.equal(live.counts.inlineFilterSites, BUDGETS.inlineFilterSites, `inline style.filter blur sites: ${live.counts.inlineFilterSites} today, ${BUDGETS.inlineFilterSites} budgeted (wallpaper layer + bleed halo)`);
});

test('compositor: the inline wallpaper blurs stay behind the low-power guard', () => {
	// The dominance check: the wallpaper layer is the biggest blur in the plugin, so the
	// gate must see it at all before it can protect it.
	assert.ok(live.counts.inlineFilterSites > 0, 'the audit saw no inline `style.filter` blurs — the wallpaper layer is the largest pass and it is set from JS, so a zero here means the detector broke');
	for (const site of live.inlineFilters) {
		assert.equal(
			site.guardedByPerformanceMode, true,
			`lib/client.js:${site.line} blurs a full-viewport layer with no \`readPerformanceMode()\` in sight — the low-power switch would leave this pass running`
		);
	}
});

test('compositor: every backdrop-filter pane stays inside the blur ceiling', () => {
	// Both forms are graded: a twin is what Safari actually paints, so a `-webkit-`
	// line carrying a wider radius than its standard sibling is a real pane over budget.
	const panes = live.backdropFilters.filter((row) => row.blurPx !== null);
	assert.ok(panes.length > 0, 'no pane carried a resolvable radius — the resolver regressed');
	for (const row of panes) {
		assert.ok(
			row.blurPx <= BUDGETS.maxStaticBlurPx,
			`lib/client.js:${row.line} asks for ${row.blurPx}px (${row.webkit ? '-webkit-' : ''}${row.selector}) — ceiling is ${BUDGETS.maxStaticBlurPx}px`
		);
	}
	const max = Math.max(...panes.map((r) => r.blurPx));
	assert.ok(max <= BUDGETS.maxStaticBlurPx, `largest static radius is ${max}px, ceiling ${BUDGETS.maxStaticBlurPx}px`);
});

test('compositor: every pane ships its -webkit- twin (Safari loses it otherwise)', () => {
	assert.ok(live.webkitTwinParity, `standard declarations ${live.counts.backdropFilterDeclarations} vs -webkit- twins ${live.counts.webkitBackdropFilterDeclarations}`);
	const missing = live.backdropFilters.filter((r) => !r.webkit).map((r) => r.line)
		.filter((line) => !live.backdropFilters.some((r) => r.webkit && r.line === line - 1));
	assert.deepEqual(missing, [], `these standard declarations have no -webkit- twin on the line above: ${missing.join(', ')}`);
});

test('compositor: the low-power switch still removes every backdrop-filter, pseudo-elements included', () => {
	// Issue #110's switch is the only lever a user has when the compositor is the
	// problem, and it works by flattening `backdrop-filter` on `*` plus both
	// pseudo-element families. Its own rules are the thing this leg protects: drop
	// one selector and the pane the user sees keeps blurring while the switch says on.
	assert.equal(live.lowPower.removesAllBackdropFilters, true, 'the low-power block no longer contains `backdrop-filter: none !important` — the switch renders nothing');
	assert.equal(live.lowPower.coversPseudoElements, true, 'the low-power selector group must cover *::before and *::after; a pane built on a pseudo-element would survive the switch');
});

test('mutation: each budget goes red on a synthetic sheet that exceeds it', () => {
	const sheet = (body) => ['const CSS = [', '  ".card {",', ...body, '  "}"', '];'].join('\n');
	const auditSheet = (body) => auditSource(sheet(body), 'synthetic');
	const withLowPower = [
		'  "html[data-dsh-dream-skin-performance] *,"',
		'  "html[data-dsh-dream-skin-performance] *::before,"',
		'  "html[data-dsh-dream-skin-performance] *::after {"',
		'  "  backdrop-filter: none !important;"',
		'  "}"',
	];

	// 1) one more pane than the budget allows
	const sevenPanes = [];
	for (let i = 0; i < BUDGETS.backdropFilterDeclarations + 1; i += 1) {
		sevenPanes.push('  "  backdrop-filter: blur(10px);",', '  "  -webkit-backdrop-filter: blur(10px);",');
	}
	assert.ok(auditSheet([...sevenPanes, ...withLowPower]).counts.backdropFilterDeclarations > BUDGETS.backdropFilterDeclarations,
		'a sheet with one extra pane must read as over budget — otherwise the count leg cannot fail');

	// 2) a radius past the ceiling
	const fatBlur = auditSheet(['  "  backdrop-filter: blur(56px);",', '  "  -webkit-backdrop-filter: blur(56px);",', ...withLowPower]);
	const fatPane = fatBlur.backdropFilters.find((r) => !r.webkit);
	assert.ok(fatPane && fatPane.blurPx > BUDGETS.maxStaticBlurPx, 'a 56px pane must read above the 40px ceiling');

	// 3) a slider-driven radius is resolved from its fallback, and the calc form sums
	assert.equal(auditSheet(['  "  backdrop-filter: blur(var(--x, 18px));",']).backdropFilters[0].blurPx, 18, 'var() fallback must resolve');
	assert.equal(auditSheet(['  "  backdrop-filter: blur(calc(var(--x, 14px) + 20px));",']).backdropFilters[0].blurPx, 34, 'calc() terms must sum');

	// 4) a missing -webkit- twin
	const noTwin = auditSheet(['  "  backdrop-filter: blur(10px);",', ...withLowPower]);
	assert.equal(noTwin.webkitTwinParity, false, 'a pane without its -webkit- twin must read as parity false');

	// 5) the low-power switch with one selector leg removed is not a switch
	const halfSwitch = auditSheet(['  "  backdrop-filter: blur(10px);",', ...withLowPower.filter((l) => !l.includes('*::after'))]);
	assert.equal(halfSwitch.lowPower.coversPseudoElements, false, 'dropping *::after must be visible to the gate');
	assert.equal(halfSwitch.lowPower.removesAllBackdropFilters, true, 'control: the declaration is still there, only the coverage is wrong');

	// 6) a blurred `filter:` is a new layer and must not slip in silently
	const filterBlur = auditSheet(['  "  filter: blur(8px);",', ...withLowPower]);
	assert.equal(filterBlur.counts.filterDeclarations, 1, 'a CSS filter blur must be counted');
});

test('compositor: comments are not declarations (the issue numbers were inflated by prose)', () => {
	// Issue #123 quoted "40 backdrop-filter" and "31 blur()" for this file. Those are
	// the counts INCLUDING its comments. The audit reports comments apart so the same
	// mistake cannot be made again by copying its output.
	assert.ok(live.counts.mentionsInComments.backdropFilter > live.counts.backdropFilterDeclarations,
		'this file is heavily commented on purpose; if the comment count stopped exceeding the declaration count the classifier broke');
	const onlyComments = auditSource([
		'// backdrop-filter: blur(99px) in a comment is not a declaration',
		'/* another blur(99px) in a block comment */',
	].join('\n'), 'comments-only');
	assert.equal(onlyComments.counts.backdropFilterDeclarations, 0, 'comment text must never count as a declaration');
	assert.equal(onlyComments.counts.mentionsInComments.backdropFilter, 1);
});
