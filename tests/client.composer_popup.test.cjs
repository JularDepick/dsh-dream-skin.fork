"use strict";
/**
 * The "/" trigger menu is painted by US, because the host paints nothing there
 * (issue #124).
 *
 * Measured from the host's own shipped bytes, on two channels:
 *   - the menu the "/" opens is `dsh-client-ui-input-trigger`'s `MenuView`; its
 *     class declares layout only (`position:absolute; bottom:calc(100% + 4px);
 *     overflow:hidden`) and no `background` / `backdrop-filter` at all — read
 *     from the locally installed `0.2.0-rc.1` and again from
 *     `@deepseek-ai/dsh-client-ui-input-trigger@0.2.1-rc.3` pulled from npm;
 *   - the slot it renders into, `[data-composer-overlay]`, is
 *     `height:0; position:absolute` with no background either (that attribute
 *     exists from `0.2.1-rc.3`; `0.2.0-rc.1` does not stamp it, so the rule is a
 *     no-op on the older line rather than a regression — the corpus leg below
 *     says which version it saw).
 * Against an opaque host theme the composer card behind it hides that hole. Our
 * composer is glass, so the chat text showed THROUGH the command list and the
 * popup-opacity slider had nothing to move — the report in #124.
 *
 * So the shipped sheet paints `[data-composer-overlay] > *` from our own
 * variable (mirrored from the popup channel), and the blur follows the same
 * glass knob as every other pane. This file keeps that repair from being
 * silently deleted.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CLIENT = path.join(ROOT, 'lib', 'client.js');
const SOURCE = fs.readFileSync(CLIENT, 'utf8');

/** The shipped sheet, as the craft gates read it — the same reader, not a copy. */
function shippedSheet() {
	const { extractSheets } = require('../scripts/craft-audit.cjs');
	const sheets = extractSheets(SOURCE);
	return Array.isArray(sheets) ? sheets.map((s) => s.css || '').join('\n') : String(sheets);
}

const RULE = /\[data-composer-overlay\]\s*>\s*\*\s*\{([^}]*)\}/;

/** Problems with the trigger-menu repair, given a sheet text and a bundle text. */
function popupSurfaceProblems(sheet, bundle) {
	const problems = [];
	const rule = RULE.exec(sheet);
	if (!rule) {
		problems.push('no `[data-composer-overlay] > *` rule in the shipped sheet — the trigger menu is transparent again');
		return problems;
	}
	const body = rule[1];
	if (!/background\s*:\s*var\(--dsh-dream-skin-popup-fill/.test(body)) {
		problems.push('the trigger-menu rule does not paint from `--dsh-dream-skin-popup-fill` — it is not ours to tune');
	}
	if (!/backdrop-filter\s*:\s*blur\(/.test(body)) {
		problems.push('the trigger-menu rule declares no backdrop blur — a see-through surface with no frost is the bug');
	}
	if (!/const POPUP_FILL_VAR = "--dsh-dream-skin-popup-fill"/.test(bundle)) {
		problems.push('POPUP_FILL_VAR is gone — the sheet variable has no publisher');
	}
	if (!/overrides\[POPUP_FILL_VAR\]\s*=\s*overrides\["--dsw-specific-menu"\]/.test(bundle)) {
		problems.push('the popup fill is no longer mirrored from `--dsw-specific-menu` — the slider stops reaching the trigger menu');
	}
	// Low power drops every blur; the menu channel must therefore be floored, or
	// the popup we just painted goes flat AND see-through at the same time.
	if (!/for \(const name of \["--dsw-menu-surface-fill", "--dsw-specific-menu"\]\)/.test(bundle)) {
		problems.push('the low-power floor no longer covers `--dsw-specific-menu`');
	}
	return problems;
}

test('#124: the shipped sheet paints the "/" trigger menu', () => {
	const problems = popupSurfaceProblems(shippedSheet(), SOURCE);
	assert.deepEqual(problems, [], problems.join('\n  '));
});

test('#124: the anchor this rule hangs on is the host\'s own attribute, not a build hash', (t) => {
	// The rule is only as stable as its anchor. `data-composer-overlay` is a data
	// attribute the host stamps in the InputBar, so it survives class re-hashing.
	const hostRoot = process.env.DSH_HOST_ROOT
		|| path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai');
	const conversation = path.join(hostRoot, 'dsh-client-ui-conversation', 'lib', 'client.js');
	if (!fs.existsSync(conversation)) {
		t.skip(`no installed host at ${hostRoot} — the structural legs above ran, the corpus leg could not`);
		return;
	}
	const version = (() => {
		try { return JSON.parse(fs.readFileSync(path.join(hostRoot, 'dsh-client-ui-conversation', 'package.json'), 'utf8')).version; }
		catch { return 'unknown'; }
	})();
	const host = fs.readFileSync(conversation, 'utf8');
	if (!host.includes('data-composer-overlay')) {
		// Measured: 0.2.0-rc.1 does not stamp it; 0.2.1-rc.3 does. On the older
		// line the rule matches nothing — a no-op, not a regression.
		t.skip(`installed dsh-client-ui-conversation@${version} predates the data-composer-overlay anchor — the rule is a no-op on that line (measured: 0.2.1-rc.3 has it)`);
		return;
	}
	assert.ok(
		host.includes('renderSlot("conversation.input.overlay"'),
		'the overlay slot hosting the trigger menu moved — the anchor above may now point at something else'
	);
});

function withRuleBody(sheet, body) {
	return sheet.replace(RULE, `[data-composer-overlay] > * {${body}}`);
}

test('#124: mutation — each way the repair can rot is named', () => {
	const sheet = shippedSheet();
	assert.deepEqual(popupSurfaceProblems(sheet, SOURCE), [], 'control: the shipped tree must be clean, or the mutations below prove nothing');

	// 1) the rule is deleted (e.g. a refactor drops the block)
	assert.match(
		popupSurfaceProblems(sheet.replace(RULE, ''), SOURCE).join(' / '),
		/no .*rule in the shipped sheet/
	);
	// 2) the rule is kept but painted from something we do not publish
	assert.match(
		popupSurfaceProblems(withRuleBody(sheet, ' background: transparent; backdrop-filter: blur(4px);'), SOURCE).join(' / '),
		/does not paint from `--dsh-dream-skin-popup-fill`/
	);
	// 3) the blur is dropped — a "cleaner" surface that is a hole again
	assert.match(
		popupSurfaceProblems(withRuleBody(sheet, ' background: var(--dsh-dream-skin-popup-fill);'), SOURCE).join(' / '),
		/declares no backdrop blur/
	);
	// 4) the publisher is severed: the variable stops following the slider
	assert.match(
		popupSurfaceProblems(sheet, SOURCE.replace(/overrides\[POPUP_FILL_VAR\]\s*=\s*overrides\["--dsw-specific-menu"\];/, '')).join(' / '),
		/no longer mirrored from `--dsw-specific-menu`/
	);
	// 5) the low-power floor stops covering the menu channel
	assert.match(
		popupSurfaceProblems(sheet, SOURCE.replace('for (const name of ["--dsw-menu-surface-fill", "--dsw-specific-menu"])', 'for (const name of ["--dsw-menu-surface-fill"])')).join(' / '),
		/low-power floor no longer covers/
	);
});
