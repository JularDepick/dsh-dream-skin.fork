/**
 * dsh-dream-skin — the host's plugin manager page (issue #130).
 *
 * The official plugin manager (host 0.2.1-rc.5) paints no background on its
 * page, groups or cards: they inherit the layout canvas, and the opaque parts a
 * reader sees are the inner containers. Those containers now join the modal
 * glass recipe — the same blur declaration, no new layer count — and follow the
 * 弹窗透明度 slider; the page root clears any inherited paint under a wash.
 *
 * Boundary: this is a source-level contract for CSS we could not eyeball in a
 * live 0.2.1-rc.5 host (this machine runs 0.2.0-rc.1). It proves the rules are
 * present and gated, not that the page looks right.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8');

const PLUGIN_SELECTORS = [
	'"[data-plugin-group],"',
	'"[data-plugin-item-detail],"',
	'"[data-plugin-detail],"',
	'"[data-plugin-rows],"'
];

/** The whole modal-glass rule plus the page-root rule that follows it. */
function modalGlassSelectors(text) {
	const start = text.indexOf('QUESTION_CARD_SELECTOR + ","');
	if (start < 0) return null;
	const end = text.indexOf('// --- Composer (chat input) glass', start);
	return end > start ? text.slice(start, end) : null;
}

const ROOT_RULE = /"html\[" \+ WASH_ACTIVE_ATTR \+ "\] \[data-plugin-panel\] \{",\s*"  background-color: transparent !important;",/;

function pluginPageProblems(text) {
	const problems = [];
	const block = modalGlassSelectors(text);
	if (block === null) {
		problems.push('modal glass selector block moved — cannot name the rule the plugin page joins');
		return problems;
	}
	// Non-vacuous: the slice must be the rule we think it is.
	if (!block.includes('MODAL_FILL_VAR') || !block.includes('PLAN_CARD_SELECTOR')) {
		problems.push('the slice is not the modal-glass rule (marker lines missing)');
	}
	for (const selector of PLUGIN_SELECTORS) {
		if (!block.includes(selector)) problems.push(`the plugin page selector ${selector} left the modal-glass rule`);
	}
	if (!ROOT_RULE.test(text)) {
		problems.push('the page root is not cleared under a wash (rule missing or no longer gated by WASH_ACTIVE_ATTR)');
	}
	return problems;
}

test('plugin page: its containers join the modal glass, and the root is cleared under a wash', () => {
	assert.deepEqual(pluginPageProblems(CODE), [], `\n${pluginPageProblems(CODE).join('\n')}\n`);
});

test('mutation: dropping any plugin selector from the glass rule reddens by name', () => {
	for (const selector of PLUGIN_SELECTORS) {
		const without = CODE.replace(selector, '');
		assert.notEqual(without, CODE, `the anchor ${selector} moved`);
		const problems = pluginPageProblems(without);
		assert.equal(problems.length, 1, `expected exactly one problem for ${selector}, got ${JSON.stringify(problems)}`);
		assert.match(problems[0], /left the modal-glass rule/);
	}
});

test('mutation: an ungated or deleted page-root rule reddens', () => {
	const ungated = CODE.replace('"html[" + WASH_ACTIVE_ATTR + "] [data-plugin-panel] {"', '"[data-plugin-panel] {"');
	assert.notEqual(ungated, CODE, 'the page-root rule anchor moved');
	assert.ok(pluginPageProblems(ungated).some((p) => p.includes('page root')), 'an ungated root rule must be a problem');

	const deleted = CODE.replace(ROOT_RULE, '');
	assert.notEqual(deleted, CODE, 'the page-root rule anchor moved');
	assert.ok(pluginPageProblems(deleted).some((p) => p.includes('page root')), 'a deleted root rule must be a problem');
});
