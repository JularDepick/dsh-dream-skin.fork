#!/usr/bin/env node
/**
 * dsh-dream-skin — compositor audit (issue #123).
 *
 * WHAT THIS IS. A STATIC inventory of the things that cost the compositor real
 * work in the shipped browser half: `backdrop-filter` declarations, `filter:`
 * blurs, radial-gradient layers, and `requestAnimationFrame` loops. Every row
 * carries the source line, so a number here can be traced to a change.
 *
 * WHAT THIS IS NOT. It does not measure frames, GPU time, or "how many layers are
 * live right now" — those depend on which surfaces the page has mounted, on the
 * driver, and on the machine. Issue #110's report is a GPU-utilisation report from
 * one M4 Mac; nothing in this file pretends to explain it. What the audit does is
 * make the *static* half of that argument reproducible, so a discussion about
 * "too much blur" starts from counted declarations instead of an impression.
 *
 * COUNTING RULES (the part that makes the numbers meaningful):
 *   - comments do not count. The first draft of issue #123 quoted "40 backdrop-filter"
 *     and "31 blur()" for this file; those are the counts INCLUDING the prose in its
 *     comments (41 and 20 mentions, of which 12 and 17 are code). A comment is not a
 *     declaration, so code lines are classified apart and reported apart.
 *   - `-webkit-backdrop-filter` is counted, and every standard declaration is
 *     required to have its twin (Safari/Chromium both run it).
 *   - a blur radius is resolved as far as it can be statically: a literal `blur(20px)`
 *     is 20; `blur(var(--glass-blur, 14px))` is the FALLBACK with `slider: true`,
 *     because the live value comes from the wallpaper-blur slider (clamped 0–60).
 *     A `calc()` radius is the sum of its parts, flagged `slider: true` when a var
 *     without a literal fallback is involved.
 *
 * USAGE
 *   node scripts/compositor-audit.cjs            # human table
 *   node scripts/compositor-audit.cjs --json     # machine form (the gate reads this)
 *   node scripts/compositor-audit.cjs --sheet <file>   # audit a saved CSS fixture
 *
 * EXIT CODES follow this repository's convention: 0 = the audit ran, 2 = the input
 * it was pointed at is not there (an environment fact, not a verdict). Budgets live
 * in `tests/compositor_budget.test.cjs`, not here — one question per tool.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const SOURCE = path.join(REPO, 'lib', 'client.js');

const isCommentLine = (line) => {
	const t = line.trim();
	return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('*/');
};

// A selector line inside the CSS arrays: a quoted string ending in `{` (possibly
// with a trailing comma). Host selectors are concatenated, so a bare `"... ,"` line
// also opens the context — we keep the most recent one we saw. Matching happens on
// the FLATTENED line (see below), because most selectors here are built from
// constants (`"html[" + PERFORMANCE_ATTR + "] *::after {"`) and the raw text never
// contains a literal `{`.

/**
 * The CSS in this bundle is built by concatenating string literals with JS
 * expressions (`"  backdrop-filter: blur(var(" + GLASS_BLUR_VAR + ", " + DEFAULT_GLASS_BLUR + "px))…"`).
 * Flattening keeps the expressions inline (`" + X + "` → `X`) so a declaration can
 * be parsed as text while the constant names stay resolvable.
 */
function flattenCssLine(line) {
	return line
		.trim()
		.replace(/^"/, '')
		.replace(/"\s*,?\s*$/, '')
		.replace(/"\s*\+\s*/g, '')
		.replace(/\s*\+\s*"/g, '')
		.trim();
}

/** `const DEFAULT_GLASS_BLUR = 14;` → { DEFAULT_GLASS_BLUR: 14 } — radii hide behind these. */
function numericConstants(text) {
	const table = {};
	for (const m of text.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*(\d+(?:\.\d+)?)\s*;/g)) table[m[1]] = Number(m[2]);
	return table;
}

/**
 * Pull the argument of the FIRST `blur(...)` out of a value, respecting nested
 * parentheses — a greedy regex would swallow the filter chain around it
 * (`blur(24px) saturate(150%)`) and read 150 as part of the radius.
 */
function blurArgument(value) {
	const start = value.indexOf('blur(');
	if (start === -1) return null;
	let depth = 0;
	for (let i = start + 5; i < value.length; i += 1) {
		const ch = value[i];
		if (ch === '(') depth += 1;
		else if (ch === ')') {
			if (depth === 0) return value.slice(start + 5, i);
			depth -= 1;
		}
	}
	return null;
}

/**
 * Resolve the blur radius of a value string, as far as a static pass honestly can.
 * Returns { px, slider } where px is the number the browser will use when the
 * user has not moved a slider.
 */
function resolveBlur(value, constants = {}) {
	const raw = blurArgument(value);
	if (raw === null) return null;
	let expr = raw.trim();
	for (const [name, number] of Object.entries(constants)) {
		expr = expr.split(`${name}px`).join(`${number}px`).split(name).join(String(number));
	}
	const literal = expr.match(/^(-?[\d.]+)px$/);
	if (literal) return { px: Number(literal[1]), slider: false, expression: expr };
	// var(--name, 14px) -> the fallback is what a fresh profile renders.
	const withFallback = expr.match(/^var\([^,]+,\s*(-?[\d.]+)px\s*\)$/);
	if (withFallback) return { px: Number(withFallback[1]), slider: true, expression: expr };
	// calc(var(--a, 14px) + var(--b, 20px)) -> the sum of the statically known parts.
	const terms = [...expr.matchAll(/(-?[\d.]+)px/g)].map((t) => Number(t[1]));
	if (terms.length > 0) return { px: terms.reduce((a, b) => a + b, 0), slider: true, expression: expr, terms };
	return { px: null, slider: true, expression: expr };
}

function auditSource(text, label) {
	const lines = text.split('\n');
	const constants = numericConstants(text);
	const out = {
		source: label,
		bytes: Buffer.byteLength(text, 'utf8'),
		lines: lines.length,
		counts: {
			backdropFilterDeclarations: 0,
			webkitBackdropFilterDeclarations: 0,
			filterDeclarations: 0,
			radialGradients: 0,
			requestAnimationFrames: 0,
			inlineFilterSites: 0,
			mentionsInComments: { backdropFilter: 0, blur: 0 },
		},
		backdropFilters: [],
		filters: [],
		inlineFilters: [],
		lowPower: { selectorLines: [], removesAllBackdropFilters: false, coversPseudoElements: false },
	};
	let selector = null;
	let atRule = null;
	const declarations = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const lineNo = i + 1;
		if (isCommentLine(line)) {
			out.counts.mentionsInComments.backdropFilter += (line.match(/backdrop-filter/g) || []).length;
			out.counts.mentionsInComments.blur += (line.match(/blur\(/g) || []).length;
			continue;
		}
		out.counts.radialGradients += (line.match(/radial-gradient/g) || []).length;
		out.counts.requestAnimationFrames += (line.match(/requestAnimationFrame\s*\(/g) || []).length;
		const flat = flattenCssLine(line);
		if (flat === '}') { atRule = null; continue; }
		if (flat.endsWith('{')) {
			const head = flat.replace(/\{$/, '').trim();
			if (head.startsWith('@')) atRule = head;
			else { selector = head; atRule = null; }
			continue;
		}
		// A selector LIST split across lines (`"a,"`, `"b;"`…) — keep the first fragment
		// as the context so the row still names the surface instead of `<module level>`.
		if (/,$/.test(flat) && !flat.includes(':') && !/\(/.test(flat)) {
			if (!selector) selector = flat.replace(/,$/, '').trim();
			continue;
		}
		const decl = flat.match(/^(-webkit-)?(backdrop-filter|filter)\s*:\s*(.+?)\s*;?$/);
		if (decl) {
			const [, webkit, property, rawValue] = decl;
			const value = rawValue.trim();
			const blur = resolveBlur(value, constants);
			const row = { line: lineNo, selector, atRule, property: property, value, blurPx: blur ? blur.px : null, sliderDriven: blur ? blur.slider : false };
			if (property === 'backdrop-filter') {
				if (webkit) out.counts.webkitBackdropFilterDeclarations += 1;
				else out.counts.backdropFilterDeclarations += 1;
				out.backdropFilters.push(webkit ? { ...row, webkit: true } : row);
			} else {
				out.counts.filterDeclarations += 1;
				out.filters.push(row);
			}
			declarations.push({ line: lineNo, property, webkit: Boolean(webkit), value });
		} else if (/\.style\.filter\s*=/.test(line) && /blur\(/.test(line)) {
			// The wallpaper is not styled by a sheet: `el.style.filter = 'blur(Npx)'` is
			// set in JS, and it is the LARGEST offscreen pass in the plugin (a
			// viewport-sized layer, doubled in `blur` fit by the bleed halo). A gate that
			// only read CSS declarations would have reported "zero filter blurs" while
			// the most expensive one was right there — measured, then fixed.
			out.counts.inlineFilterSites += 1;
			// 40 lines, not 5: the wallpaper guard and the assignment are separated by a
			// comment block that explains why low-power forces the layer flat.
			const guardStart = Math.max(0, i - 40);
			const guarded = lines.slice(guardStart, i + 1).some((l) => /readPerformanceMode\s*\(/.test(l));
			out.inlineFilters.push({
				line: lineNo,
				expression: line.trim().replace(/^.*?\.style\.filter\s*=\s*/, '').replace(/;\s*$/, '').slice(0, 120),
				guardedByPerformanceMode: guarded,
			});
		}
	}
	// WebKit twins: every standard declaration needs one, or Safari silently loses it.
	out.webkitTwinParity = out.counts.backdropFilterDeclarations === out.counts.webkitBackdropFilterDeclarations;
	// The low-power kill switch is a SELECTOR GROUP + a declaration; both halves are
	// checked, because either alone is a rule that renders nothing. The attribute
	// name reaches this file two ways — the literal in the constant's own definition
	// and the constant identifier inside the selector strings — so both are accepted
	// and the definition line itself is skipped.
	const attrMarkers = ['data-dsh-dream-skin-performance', 'PERFORMANCE_ATTR'];
	for (let i = 0; i < lines.length; i += 1) {
		if (isCommentLine(lines[i])) continue;
		const flat = flattenCssLine(lines[i]);
		if (/^const\s/.test(flat)) continue;
		if (!attrMarkers.some((m) => flat.includes(m))) continue;
		out.lowPower.selectorLines.push({ line: i + 1, selector: flat.replace(/\{$/, '').replace(/,$/, '').trim() });
		// Look ahead inside this block for the declaration that does the work.
		for (let j = i + 1; j < Math.min(lines.length, i + 8); j += 1) {
			const d = flattenCssLine(lines[j]);
			if (/^backdrop-filter\s*:\s*none\s*!important/.test(d)) out.lowPower.removesAllBackdropFilters = true;
			if (d === '}') break;
		}
	}
	out.lowPower.coversPseudoElements = out.lowPower.selectorLines.some((s) => s.selector.includes('*::before'))
		&& out.lowPower.selectorLines.some((s) => s.selector.includes('*::after'));
	out.declarations = declarations;
	return out;
}

function printTable(report) {
	const { counts } = report;
	console.log(`compositor audit — ${report.source} (${report.bytes} B, ${report.lines} lines)`);
	console.log('');
	console.log(`  backdrop-filter declarations : ${counts.backdropFilterDeclarations} (+${counts.webkitBackdropFilterDeclarations} -webkit- twins)`);
	console.log(`  filter: declarations         : ${counts.filterDeclarations}`);
	console.log(`  radial-gradient occurrences  : ${counts.radialGradients}`);
	console.log(`  requestAnimationFrame sites  : ${counts.requestAnimationFrames}`);
	console.log(`  inline style.filter blurs    : ${counts.inlineFilterSites}`);
	console.log(`  mentions in comments (excluded): backdrop-filter ${counts.mentionsInComments.backdropFilter}, blur( ${counts.mentionsInComments.blur}`);
	console.log('');
	console.log('  backdrop-filter sites');
	console.log('  ' + 'line'.padEnd(6) + 'blur'.padEnd(8) + 'slider'.padEnd(8) + 'selector');
	for (const row of report.backdropFilters.filter((r) => !r.webkit)) {
		console.log('  ' + String(row.line).padEnd(6) + String(row.blurPx === null ? '?' : `${row.blurPx}px`).padEnd(8) + String(row.sliderDriven ? 'yes' : 'no').padEnd(8) + String(row.selector || '<module level>').slice(0, 96));
	}
	if (report.filters.length) {
		console.log('');
		console.log('  filter: sites');
		for (const row of report.filters) {
			console.log('  ' + String(row.line).padEnd(6) + String(row.blurPx === null ? '?' : `${row.blurPx}px`).padEnd(8) + String(row.sliderDriven ? 'yes' : 'no').padEnd(8) + String(row.selector || '<module level>').slice(0, 96));
		}
	}
	console.log('');
	console.log(`  low-power kill switch: ${report.lowPower.removesAllBackdropFilters ? 'present' : 'MISSING'} `
		+ `(* / *::before / *::after covered: ${report.lowPower.coversPseudoElements ? 'yes' : 'no'})`);
	console.log('  NOTE: these are DECLARED sites. How many are live depends on which surfaces the page has mounted.');
}

function main(argv) {
	const sheetIdx = argv.indexOf('--sheet');
	let text;
	let label;
	if (sheetIdx !== -1) {
		const file = argv[sheetIdx + 1];
		if (!file || !fs.existsSync(file)) {
			console.error(`--sheet ${file || '(missing)'} is not a readable file — nothing to audit`);
			process.exit(2);
		}
		text = fs.readFileSync(file, 'utf8');
		label = path.basename(file);
	} else {
		text = fs.readFileSync(SOURCE, 'utf8');
		label = 'lib/client.js';
	}
	const report = auditSource(text, label);
	if (argv.includes('--json')) console.log(JSON.stringify(report, null, '\t'));
	else printTable(report);
}

module.exports = { auditSource, resolveBlur };

if (require.main === module) main(process.argv.slice(2));
