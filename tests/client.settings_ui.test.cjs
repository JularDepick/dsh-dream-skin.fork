/**
 * dsh-dream-skin — the 「外观设置」section, rendered for real (refactor baseline W1).
 *
 * WHY THIS FILE EXISTS. The rest of the client suite stubs `react/jsx-runtime` as `jsx: () => 0` and
 * the slot hosts drop the component they are registered with, so the plugin's UI layer never ran in a
 * test. That is fine for storage/gate cases and useless for a refactor that moves controls around: a
 * row could lose its sliders, its switches or a whole conditional block and every existing case would
 * stay green. `tests/fixtures/settings-render.cjs` renders instead — it keeps the registered
 * components, hands each one the props the host hands it (translator, `useStore`, injected action bag)
 * and expands the result into a `{ tag, props, children }` tree.
 *
 * WHAT THESE CASES ARE, AND ARE NOT. They are a CHARACTERIZATION baseline: every assertion below is a
 * fact about the panel as it ships today, so the refactor (a11y → shared controls → responsive →
 * regrouping) has a red light the moment it changes the structure by accident. They are deliberately
 * Most of them are NOT the target state — but where a round shipped a deliberate change (W2's a11y
 * fixes, W4's viewport tiers, W5's four zones), that round's case lives here too, written as the fact
 * the round now guarantees. When a later round moves a control ON PURPOSE, updating this file is part
 * of that round, and the diff says what moved.
 *
 * Both mutating legs (slot order, kind conditional) prove the interesting assertions can fail: a
 * baseline that cannot redden is a comment with an assertion's syntax.
 */
const { test, after } = require('node:test');
const assert = require('node:assert');
const { CODE, releaseAllIntervals } = require('./fixtures/page-sandbox.cjs');
const {
	buildSettingsPage,
	findAll,
	findOne,
	textOf,
	firstText,
	inputTypes,
	controls
} = require('./fixtures/settings-render.cjs');

// Pages built here release their own timers, but a case that throws before it renders would leave the
// sandbox's composer poll armed; sweeping every sandbox once is cheaper than a 24s idle exit.
after(releaseAllIntervals);

/** The advanced-wallpaper row, addressed by its registered id in every case below. */
const ADV = 'dream-skin-wallpaper-advanced';

/**
 * The four zones, in the order settings-theme-ui.md draws them (W5). The GLASS zone prints
 * `glass.title` instead of a fifth key: the zone and its only block are the same thing, so the
 * heading is that block title promoted to an <h3> — reusing the key is what keeps one concept one
 * word (and the alternative, a second copy of the title, was the duplicate W5 had to remove).
 */
const ZONE_ORDER = ['zone.theme', 'glass.title', 'zone.wallpaper', 'zone.packs'];

/**
 * Every title line the section prints, in reading order: the four zone headings interleaved with the
 * block titles that sit inside those zones. `bg2.title` is the advanced block's FOLD TOGGLE, so its
 * title line is a button; the rest are a zone <h3> or a block title div.
 */
const TITLE_ORDER = [
	'zone.theme', 'skin.title', 'accent.title',
	'glass.title',
	'zone.wallpaper', 'background.title', 'bg2.title',
	'zone.packs', 'packs.title'
];

/** How many times `needle` occurs in `hay` — every mutation below asserts this is exactly 1. */
const countOf = (hay, needle) => hay.split(needle).length - 1;

/** The section's group roots: one child per registered row that renders a node at all. */
const groupRoots = (section) => (section[0] ? section[0].children : []);

/**
 * A title line, addressed by SHAPE rather than by component name (the fixture returns host nodes):
 * a zone <h3>, a block title div (styles.title's colour + size), or a fold toggle (the one button
 * that carries `aria-expanded`).
 */
const isTitleLine = (node) => node.tag === 'h3'
	|| (node.tag === 'button' && 'aria-expanded' in node.props)
	|| (node.tag === 'div' && node.props.style !== undefined
		&& node.props.style.color === 'var(--dsw-alias-label-primary)'
		&& node.props.style.fontSize === '14px');

/** Every title line under `nodes`, in document order. */
const titleLines = (nodes) => findAll(nodes, isTitleLine);

/** The zone headings — the title lines that are <h3> elements. */
const zoneHeadings = (nodes) => titleLines(nodes).filter((node) => node.tag === 'h3');

/** A fold toggle's caret is decoration, so its title is the LAST span, not the first text node. */
const titleText = (node) => {
	if (node.tag !== 'button') return firstText([node]);
	const spans = node.children.filter((child) => child.tag === 'span');
	return spans.length === 0 ? null : firstText([spans[spans.length - 1]]);
};

/** The title line each group opens with: a zone heading, a block title, or a block's fold toggle. */
const groupOpeners = (section) => groupRoots(section).map((group) => {
	const opener = findOne([group], isTitleLine);
	return opener === null ? null : titleText(opener);
});

const rangeInputs = (nodes) => findAll(nodes, (node) => node.tag === 'input' && node.props.type === 'range');

const numberInputs = (nodes) => findAll(nodes, (node) => node.tag === 'input' && node.props.type === 'number');

/** The gradient preset chips are the buttons whose background IS the gradient value they apply. */
const gradientChips = (nodes) => findAll(nodes, (node) => node.tag === 'button'
	&& typeof node.props.style === 'object' && node.props.style !== null
	&& typeof node.props.style.background === 'string'
	&& node.props.style.background.startsWith('linear-gradient(135deg'));

/** [key, aria-pressed] for every chip-style button, in document order. */
const pressedChips = (nodes) => findAll(nodes, (node) => node.tag === 'button' && 'aria-pressed' in node.props)
	.map((node) => [firstText([node]), node.props['aria-pressed']]);

const checkboxLabels = (nodes) => controls(nodes).filter((control) => control.type === 'checkbox').map((control) => control.label);

// ---------------------------------------------------------------------------
// 1. the registration inventory (the hard pin every later round must not move)
// ---------------------------------------------------------------------------

test('the bundle registers the seven item rows exactly once each, and orders them 20..50 by zone', () => {
	// This is the invariant the refactor plan calls a 「硬钉点」: the row set may be REGROUPED later, but
	// a renamed, merged or duplicated item id breaks the host slot wiring silently.
	const page = buildSettingsPage({});
	const items = page.registrations.filter((entry) => entry.desc.name === 'settings.dreamSkin.item');
	assert.equal(items.length, 7, 'expected exactly 7 "settings.dreamSkin.item" registrations');
	assert.deepEqual(items.map((entry) => entry.desc.id).sort(), [
		'dream-skin',
		'dream-skin-accent',
		'dream-skin-glass',
		'dream-skin-modal-opacity',
		'dream-skin-packs',
		'dream-skin-wallpaper',
		'dream-skin-wallpaper-advanced'
	], 'the item id set changed — the host slot and several gates address these ids by name');
	assert.equal(new Set(items.map((entry) => entry.desc.id)).size, 7, 'no item id is registered twice');
	// W5 spread the orders one zone per run: 20+25 theme, 30 glass, 35+40 background, 45
	// import/export, and 50 for the thin modal row that renders nothing.
	assert.deepEqual(page.orderedRows.map((entry) => entry.desc.order), [20, 25, 30, 35, 40, 45, 50],
		'the slot ORDER is what the user reads top to bottom, and it now reads zone by zone');

	// The section itself: the nav entry, its ns, and the child slot it forecloses to a root-scoped list.
	assert.ok(page.section, 'a "settings.section" registration must exist');
	assert.equal(page.section.desc.id, 'dream-skin');
	assert.equal(page.section.desc.order, 10);
	assert.equal(page.section.desc.label, 'Theme / 外观', 'the settings nav label is a 钉点: other gates match the whole string');
	assert.equal(page.section.desc.locale, 'settings.dreamSkin');
	assert.deepEqual(page.section.desc.children, { 'settings.dreamSkin.item': { kind: 'list', scope: 'root' } },
		'the section must still declare one root-scoped list child, or the rows have nowhere to mount');
	assert.equal(typeof page.section.Component, 'function', 'the section component itself is registered, not just its descriptor');
});

// ---------------------------------------------------------------------------
// 2. the section renders every row, in slot order, as one group each
// ---------------------------------------------------------------------------

test('the section renders one group per row, in slot order, and the thin modal row renders nothing', () => {
	const page = buildSettingsPage({});
	const section = page.renderSection();
	assert.equal(section.length, 1, 'the section expands to exactly one host node (its wrapper div)');
	assert.equal(section[0].tag, 'div', 'the wrapper is a plain div');
	const groups = groupRoots(section);
	assert.equal(groups.length, 6, 'six rows produce a group; dream-skin-modal-opacity is a thin registration that renders null');
	assert.deepEqual(groupOpeners(section), ['zone.theme', 'accent.title', 'glass.title', 'zone.wallpaper', 'bg2.title', 'zone.packs'],
		'the group order IS the slot order — W5 regrouped it into zones, and a later round moves it only on purpose');
	for (const group of groups) assert.equal(group.tag, 'div', 'every group is a div, not a fragment or a bare control');

	// The thin row is what makes "7 registrations, 6 groups" honest rather than an arithmetic accident.
	assert.deepEqual(page.renderRow('dream-skin-modal-opacity'), [],
		'dream-skin-modal-opacity must keep rendering nothing: the slider lives in the glass group and this registration only keeps the store bound');
});

// ---------------------------------------------------------------------------
// 3. the default panel's control fingerprint
// ---------------------------------------------------------------------------

test('the default panel carries one control family per group, and only the glass group owns sliders', () => {
	const page = buildSettingsPage({});
	const section = page.renderSection();
	const types = inputTypes(section);
	assert.equal(types.filter((type) => type === 'range').length, 5, 'five sliders on a default panel');
	assert.equal(types.filter((type) => type === 'checkbox').length, 3, 'three switches: sidebar link, low power, auto-dim');
	assert.equal(types.filter((type) => type === 'file').length, 2, 'two file pickers: the local wallpaper and the theme-pack import');
	assert.equal(types.filter((type) => type === 'color').length, 1, 'one system colour picker (the accent)');
	assert.equal(types.length, 11, 'the panel total moved — a control was added or dropped');

	// Which group owns which family is the part a regrouping round actually moves, so it is named.
	assert.deepEqual(inputTypes(page.renderRow('dream-skin-glass')),
		['range', 'range', 'range', 'checkbox', 'range', 'range', 'checkbox'],
		'the glass group owns all five sliders and two of the three switches — and the sidebar switch sits INSIDE the slider list, right after the sidebar slider it releases');
	assert.deepEqual(inputTypes(page.renderRow(ADV)), ['checkbox'],
		'with no picture set the advanced row shows only its auto-dim switch — framing is gated on a picture');
	for (const id of ['dream-skin', 'dream-skin-accent', 'dream-skin-wallpaper', 'dream-skin-packs']) {
		assert.deepEqual(rangeInputs(page.renderRow(id)), [], id + ' must stay slider-free on a default panel');
	}
});

// ---------------------------------------------------------------------------
// 4. the glass group, control by control
// ---------------------------------------------------------------------------

test('the glass group lists its five translucency sliders first and its two switches after', () => {
	const page = buildSettingsPage({});
	const glass = page.renderRow('dream-skin-glass');
	const state = page.stateOf('dream-skin-glass');
	const sliders = controls(glass).filter((control) => control.type === 'range');
	assert.deepEqual(sliders.map((slider) => slider.label),
		['background.opacity', 'background.blur', 'background.sidebarOpacity', 'composer.opacity', 'modal.title'],
		'the slider ORDER is the reading order of the panel');
	assert.deepEqual(sliders.map((slider) => [slider.node.props.min, slider.node.props.max, slider.node.props.step]),
		[[0, 100, 1], [0, 60, 1], [0, 100, 1], [0, 100, 1], [0, 100, 1]],
		'the ranges are the shipped ones: opacity is shown as TRANSPARENCY (100 - stored), blur is 0..60px');

	// The displayed value is not the stored value: opacity channels are inverted for the user.
	assert.equal(sliders[0].node.props.value, 100 - Math.round(state.opacity * 100), 'wallpaper opacity is shown inverted');
	assert.equal(sliders[1].node.props.value, state.blur, 'blur is shown as-is');
	assert.equal(sliders[2].node.props.value, 100 - Math.round(state.sidebarOpacity * 100), 'sidebar opacity is shown inverted');
	assert.equal(sliders[3].node.props.value, 100 - Math.round(state.composerOpacity * 100), 'composer opacity is shown inverted');
	assert.equal(sliders[4].node.props.value, 100 - Math.round(state.modalOpacity * 100), 'popup opacity is shown inverted');

	assert.deepEqual(checkboxLabels(glass), ['background.sidebarLink', 'glass.performance'],
		'two switches, in this order: follow-the-wallpaper for the sidebar, then low-power mode');
	const boxes = controls(glass).filter((control) => control.type === 'checkbox');
	assert.equal(boxes[0].node.props.checked, false, 'a fresh profile does not pin the sidebar separately');
	assert.equal(boxes[1].node.props.checked, !!state.performance, 'the low-power switch mirrors the store, not a hard-coded false');
});

// ---------------------------------------------------------------------------
// 5. the advanced row's control set follows the wallpaper kind
// ---------------------------------------------------------------------------

test('url kind: the link box, the refresh switch, the rotation source and the link list', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	const row = page.renderRow(ADV);
	const urlBox = findOne(row, (node) => node.tag === 'input' && node.props.type === 'url');
	assert.ok(urlBox, 'url kind renders the link box');
	assert.equal(urlBox.props.defaultValue, 'https://example.com/w.jpg', 'an uncontrolled box still starts on the stored link');

	assert.deepEqual(checkboxLabels(row), ['bg2.refresh', 'bg2.rotation', 'bg2.autodim'],
		'url kind adds the scheduled-refresh and rotation switches in front of the shared auto-dim one');
	// W6a: the three kind chips are gone — the FORM is a <select> now (see §13) — and
	// what stays here is the fixed picture's own source pair (link / local file).
	assert.deepEqual(pressedChips(row), [
		['bg2.url', true], ['bg2.local', false],
		['bg2.fillCover', true], ['bg2.fillContain', false], ['bg2.fillBlur', false],
		['bg2.rotationSourceLinks', true], ['bg2.rotationSourceFolder', false]
	], 'the image-source pair, three fill chips and two rotation-source chips, each mirroring the store');

	const list = findOne(row, (node) => node.tag === 'textarea');
	assert.ok(list, 'the link list is a textarea');
	assert.equal(list.props.rows, 4, 'four visible rows');

	// Framing only makes sense over a picture, and a stored URL IS one.
	assert.deepEqual(rangeInputs(row).map((node) => firstText([node.parent.children[0]])),
		['bg2.frameX', 'bg2.frameY', 'bg2.frameZoom'],
		'with a URL stored the framing sliders appear (horizontal / vertical / zoom)');
	assert.ok(!textOf(row).includes('bg2.urlEmpty'), 'a stored URL must not trigger the empty-state warning');
});

test('gradient kind: the preset grid replaces the link box, and the fill selector disappears', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'gradient' });
	const row = page.renderRow(ADV);
	const text = textOf(row);
	assert.equal(gradientChips(row).length, 6, 'six shipped gradients');
	assert.ok(!text.includes('bg2.fill'), 'a gradient has no intrinsic size, so the fill selector is NOT offered');
	assert.ok(!text.includes('bg2.rotation'), 'rotation belongs to a URL list; the gradient kind has none');
	assert.equal(findOne(row, (node) => node.tag === 'input' && node.props.type === 'url'), null, 'no link box on the gradient tab');
	assert.equal(findOne(row, (node) => node.tag === 'textarea'), null, 'no link list either');
	assert.deepEqual(checkboxLabels(row), ['bg2.autodim'], 'only the shared auto-dim switch survives');
	assert.ok(text.includes('bg2.remove'), 'the single clear action stays on every kind');
	assert.deepEqual(rangeInputs(row), [], 'no framing sliders without a picture');
});

test('image kind: the fill selector is there, framing waits for an actual picture', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'image', hasImage: false });
	const withoutPicture = page.renderRow(ADV);
	assert.ok(textOf(withoutPicture).includes('bg2.fill'), 'the local-image tab offers the fill selector');
	assert.deepEqual(rangeInputs(withoutPicture), [], 'no picture → no framing group');

	// The gate is `hasImage`, a STORE field: the fixture drives it exactly like the host's sync does.
	page.setState(ADV, { hasImage: true });
	const withPicture = page.renderRow(ADV);
	assert.deepEqual(rangeInputs(withPicture).map((node) => firstText([node.parent.children[0]])),
		['bg2.frameX', 'bg2.frameY', 'bg2.frameZoom'],
		'with a picture the framing group opens');
});

test('url kind with nothing stored warns where the control set alone cannot: the empty-value line', () => {
	// The mis-click guard deliberately writes nothing on an empty apply, so "url kind, no URL" is a state
	// the user can reach by doing nothing at all. Today it is answered with one warning line and no
	// framing controls; both halves are pinned because a later round may move the warning.
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: null });
	const row = page.renderRow(ADV);
	assert.ok(textOf(row).includes('bg2.urlEmpty'), 'the empty state has to say what is missing');
	assert.deepEqual(rangeInputs(row), [], 'framing over nothing would be dead controls');
	assert.ok(findOne(row, (node) => node.tag === 'input' && node.props.type === 'url'), 'the box the user has to fill is still there');
});

// ---------------------------------------------------------------------------
// 6. the conditional sub-blocks open only while their condition holds
// ---------------------------------------------------------------------------

test('the refresh / rotation / folder sub-blocks open and close with their own conditions', () => {
	const page = buildSettingsPage({});
	const rotation = (over) => Object.assign({
		on: true,
		mode: 'sequential',
		minutes: 30,
		urls: ['https://a.jpg', 'https://b.jpg'],
		source: 'links',
		folder: '',
		folderCount: null,
		folderError: null
	}, over || {});

	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg', refreshOn: false });
	assert.deepEqual(numberInputs(page.renderRow(ADV)), [], 'both switches off → no interval boxes at all');

	page.setState(ADV, { refreshOn: true, refreshHours: 12 });
	const withRefresh = numberInputs(page.renderRow(ADV));
	assert.equal(withRefresh.length, 1, 'the refresh switch opens exactly one interval box');
	assert.deepEqual([withRefresh[0].props.min, withRefresh[0].props.max, withRefresh[0].props.value], [1, 720, 12],
		'the refresh box is hours, 1..720, and shows the persisted value');

	page.setState(ADV, { rotation: rotation() });
	let row = page.renderRow(ADV);
	const numbers = numberInputs(row);
	assert.equal(numbers.length, 2, 'the rotation switch adds its own interval box next to the refresh one');
	const rotationBox = numbers[1];
	assert.deepEqual([rotationBox.props.min, rotationBox.props.max, rotationBox.props.value], [5, 10080, 30],
		'the rotation interval is minutes, 5..10080 (seven days)');
	assert.deepEqual(pressedChips(row).filter(([key]) => key.startsWith('bg2.rotation')),
		[['bg2.rotationSourceLinks', true], ['bg2.rotationSourceFolder', false],
			['bg2.rotationSequential', true], ['bg2.rotationRandom', false]],
		'with two links the mode chips open too');
	assert.ok(textOf(row).includes('bg2.rotationNow'), 'and the "switch now" action');

	// One link is not a rotation: the mode/interval block closes while the list box stays.
	page.setState(ADV, { rotation: rotation({ urls: ['https://a.jpg'] }) });
	row = page.renderRow(ADV);
	assert.deepEqual(numberInputs(row).map((node) => node.props.value), [12],
		'below two links the mode/interval block is gone (only the refresh box remains)');
	assert.ok(textOf(row).includes('bg2.rotationList'), 'the list box itself stays: that is where the second link comes from');

	// The folder source swaps the list box for a path box and reports the host's count.
	page.setState(ADV, { rotation: rotation({ source: 'folder', folder: '~/Pictures/Walls', folderCount: 7 }) });
	row = page.renderRow(ADV);
	assert.equal(findOne(row, (node) => node.tag === 'textarea'), null, 'folder source → no link list');
	const folderBox = findOne(row, (node) => node.tag === 'input' && node.props.type === 'text');
	assert.ok(folderBox, 'folder source → a path box');
	assert.equal(folderBox.props.defaultValue, '~/Pictures/Walls', 'the path box starts on the saved path');
	assert.ok(textOf(row).includes('bg2.rotationFolderCount'), 'the count line comes from the store, not from a default');
	assert.deepEqual(pressedChips(row).filter(([key]) => key.startsWith('bg2.rotation')),
		[['bg2.rotationSourceLinks', false], ['bg2.rotationSourceFolder', true],
			['bg2.rotationByFolder', true], ['bg2.rotationRandom', false]],
		'in a folder, sequential order is labelled "by folder"');
});

// ---------------------------------------------------------------------------
// 7. the state the panel reads comes from storage, through the slot store
// ---------------------------------------------------------------------------

test('a seeded profile reaches the rendered panel through the slot store, not a render-time read', () => {
	// Closes the loop the fixture could otherwise fake: patching the store proves the RENDER reacts to
	// state, and this proves the state itself arrives from what the plugin persisted.
	const page = buildSettingsPage({
		seed: {
			'dsh-dream-skin:wallpaper-kind': 'url',
			'dsh-dream-skin:wallpaper-url': 'https://example.com/bing.jpg'
		}
	});
	const advanced = page.stateOf(ADV);
	assert.equal(advanced.kind, 'url', 'the kind came from storage through the row store');
	assert.equal(advanced.url, 'https://example.com/bing.jpg', 'and so did the URL');

	const section = page.renderSection();
	assert.ok(findOne(section, (node) => node.tag === 'input' && node.props.type === 'url'),
		'the SECTION (not just the row on its own) renders the link box on a seeded profile');
	assert.ok(textOf(section).includes('bg2.frame'), 'and the framing group, because the stored URL is a picture');
});

// ---------------------------------------------------------------------------
// 8. the two mutating legs: this baseline can fail
// ---------------------------------------------------------------------------

test('mutation: moving one row down the slot order reddens the order baseline', () => {
	// Anchor by the id AND the order, so the mutation cannot land on a different registration that
	// happens to carry order: 20.
	const anchor = 'id: "dream-skin",\n\t\t\t\torder: 20,';
	assert.equal(countOf(CODE, anchor), 1, 'the skin row registration anchor must occur exactly once: ' + anchor);
	const mutated = CODE.replace(anchor, 'id: "dream-skin",\n\t\t\t\torder: 50,');
	assert.notEqual(mutated, CODE, 'mutation ① has to change the bundle');

	const control = titleLines(buildSettingsPage({}).renderSection()).map(titleText);
	assert.deepEqual(control, TITLE_ORDER, 'control: the unmutated bundle renders the documented order');

	const moved = titleLines(buildSettingsPage({ code: mutated }).renderSection()).map(titleText);
	assert.deepEqual(moved, ['accent.title', 'glass.title', 'zone.wallpaper', 'background.title', 'bg2.title',
		'zone.packs', 'packs.title', 'zone.theme', 'skin.title'],
		'mutation expected: the theme zone is now last, which is exactly what the order case above forbids');
});

test('mutation: a kind conditional that stops discriminating reddens the gradient baseline', () => {
	// W6a: the gradient preset grid is now gated on the DERIVED form, not on the raw
	// kind — a solid colour is kind=gradient too, and it must not show the presets.
	const anchor = 'form === "gradient" ? (0, react_jsx_runtime.jsxs)("div", {';
	assert.equal(countOf(CODE, anchor), 1, 'the gradient-branch anchor must occur exactly once: ' + anchor);
	const mutated = CODE.replace(anchor, 'form === "solid" ? (0, react_jsx_runtime.jsxs)("div", {');
	assert.notEqual(mutated, CODE, 'mutation ② has to change the bundle');

	const controlPage = buildSettingsPage({});
	controlPage.setState(ADV, { kind: 'gradient' });
	assert.equal(gradientChips(controlPage.renderRow(ADV)).length, 6, 'control: the gradient tab ships six presets');

	const mutatedPage = buildSettingsPage({ code: mutated });
	mutatedPage.setState(ADV, { kind: 'gradient' });
	assert.equal(gradientChips(mutatedPage.renderRow(ADV)).length, 0,
		'mutation expected: the preset grid disappears from the gradient tab — the control set no longer follows the kind');
});
// ---------------------------------------------------------------------------
// 9. a11y: the names, the labels, the card structure and the focus ring
//
// W2 (the package that actually fixes these) owns the target state: a slider
// that announces what it is and what it reads, a switch whose text is part of
// its own label, a theme-pack card that is a GROUP of three real buttons
// instead of a button inside a button, and a card that shows a keyboard focus
// ring. The four mutation legs at the end are the proof that these cases can
// fail: each one breaks exactly one fix in the bundle source and expects the
// SAME checker that the positive case uses to name it.
// ---------------------------------------------------------------------------

/** A slider as the user meets it: the label text, the printed value, and the two aria strings. */
const sliderFacts = (nodes) => findAll(nodes, (node) => node.tag === 'input' && node.props.type === 'range')
	.map((input) => {
		const siblings = input.parent ? input.parent.children : [];
		const at = siblings.indexOf(input);
		const ariaLabel = input.props['aria-label'];
		const ariaValueText = input.props['aria-valuetext'];
		return {
			label: siblings[0] && siblings[0] !== input ? firstText([siblings[0]]) : null,
			shown: siblings[at + 1] ? textOf([siblings[at + 1]]) : null,
			ariaLabel: typeof ariaLabel === 'string' && ariaLabel !== '' ? ariaLabel : null,
			ariaValueText: typeof ariaValueText === 'string' && ariaValueText !== '' ? ariaValueText : null
		};
	});

/** Everything wrong with the sliders under `nodes` — one line per defect, empty when they are named. */
const sliderProblems = (nodes) => {
	const problems = [];
	for (const fact of sliderFacts(nodes)) {
		if (fact.ariaLabel === null) problems.push(`${fact.label}: the slider has no aria-label, so it is announced as an unnamed slider`);
		else if (fact.ariaLabel !== fact.label) problems.push(`${fact.label}: aria-label reads "${fact.ariaLabel}"`);
		if (fact.ariaValueText === null) problems.push(`${fact.label}: the slider has no aria-valuetext, so the number on screen is not the number read out`);
		else if (fact.ariaValueText !== fact.shown) problems.push(`${fact.label}: aria-valuetext reads "${fact.ariaValueText}" while the page prints "${fact.shown}"`);
	}
	return problems;
};

/** A switch row as assistive tech meets it: the enclosing element and its whole text. */
const switchFacts = (nodes) => findAll(nodes, (node) => node.tag === 'input' && node.props.type === 'checkbox')
	.map((input) => ({
		node: input,
		parentTag: input.parent === null ? null : input.parent.tag,
		labelText: input.parent === null ? null : textOf([input.parent]),
		onChange: input.props.onChange
	}));

/** Everything wrong with the switches under `nodes`, in the order the row lists them. */
const switchProblems = (nodes, keys) => {
	const facts = switchFacts(nodes);
	const problems = [];
	if (facts.length !== keys.length) problems.push(`expected ${keys.length} switches, rendered ${facts.length}`);
	facts.forEach((fact, i) => {
		const key = keys[i] || '#' + i;
		if (fact.parentTag !== 'label') problems.push(`${key}: the input is not inside a <label> (its parent is "${fact.parentTag}"), so the wording is not its name`);
		else if (fact.labelText === null || !fact.labelText.includes(key)) problems.push(`${key}: the enclosing label does not carry the wording (reads "${fact.labelText}")`);
		if (typeof fact.onChange !== 'function') problems.push(`${key}: the switch lost its onChange`);
	});
	return problems;
};

/** Every button that sits inside another button — the nesting the host reads as one control. */
const nestedButtons = (nodes) => findAll(nodes, (node) => {
	if (node.tag !== 'button') return false;
	for (let parent = node.parent; parent !== null; parent = parent.parent) {
		if (parent.tag === 'button') return true;
	}
	return false;
});

/** The pack cards, addressed the way the fix declares them: a labelled group. */
const packCards = (nodes) => findAll(nodes, (node) => node.props && node.props.role === 'group');

/** Everything wrong with a pack grid — empty once a card is a group of three buttons. */
const packProblems = (row) => {
	const problems = [];
	const cards = packCards(row);
	if (cards.length !== 2) problems.push(`expected 2 pack cards, rendered ${cards.length}`);
	for (const card of cards) {
		const name = card.props['aria-label'];
		if (card.tag !== 'div') problems.push(`card "${name}" is a <${card.tag}>, so it is still an interactive card`);
		if (typeof name !== 'string' || name === '') problems.push('a pack card has no aria-label, so the group is unnamed');
		const buttons = findAll([card], (node) => node.tag === 'button' && node !== card);
		if (buttons.length !== 3) problems.push(`card "${name}" renders ${buttons.length} buttons, expected apply / favourite / remove`);
		for (const button of buttons) {
			if (typeof button.props.onClick !== 'function') problems.push(`a button of card "${name}" lost its onClick`);
		}
	}
	const nested = nestedButtons(row);
	if (nested.length > 0) problems.push(`${nested.length} button(s) are nested inside another button`);
	return problems;
};

/** The card whose label text is `key` (the identity translator keeps the i18n key as the text). */
const cardByText = (nodes, key) => findOne(nodes, (node) => node.tag === 'button' && firstText([node]) === key);

/** Everything wrong with a card's focus affordance — empty when it can show a ring at all. */
const focusProblems = (skinRow, key) => {
	const problems = [];
	const card = cardByText(skinRow, key);
	if (card === null) return ['no card renders the text "' + key + '"'];
	if ('outline' in card.props.style) problems.push(`the card still pins outline: ${JSON.stringify(card.props.style.outline)}, so the UA ring is suppressed`);
	if (typeof card.props.onFocus !== 'function') problems.push('the card has no onFocus handler');
	if (typeof card.props.onBlur !== 'function') problems.push('the card has no onBlur handler');
	return problems;
};

/** The cards under `nodes` whose style paints a ring — the focus state expressed as a style. */
const ringedCards = (nodes) => findAll(nodes, (node) => node.props && node.props.style
	&& typeof node.props.style.outline === 'string' && node.props.style.outline.includes('brand-primary'));

test('a11y: all eight sliders carry their label as their name and the printed value as aria-valuetext', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg', posX: -20, posY: 30, zoom: 150 });
	page.setState('dream-skin-glass', { opacity: 0.4, blur: 12, sidebarOpacity: 0.55, composerOpacity: 0.75, modalOpacity: 0.85 });
	const section = page.renderSection();
	const sliders = sliderFacts(section);
	assert.equal(sliders.length, 8, 'the open framing group brings the panel to eight sliders');
	assert.deepEqual(sliders.map((slider) => slider.label),
		['background.opacity', 'background.blur', 'background.sidebarOpacity', 'composer.opacity', 'modal.title',
			'bg2.frameX', 'bg2.frameY', 'bg2.frameZoom'],
		'the reading order is the order the announcer will meet them in');

	// The accessible name is the visible label; the value text is what the row PRINTS, not the raw
	// stored number — the opacity channels are inverted for the user and the frame offsets are a %.
	assert.deepEqual(sliders.map((slider) => slider.ariaValueText),
		['60%', '12px', '45%', '25%', '15%', '-20%', '30%', '150%'],
		'aria-valuetext repeats the printed value, inversion included');
	assert.deepEqual(sliderProblems(section), [], 'every slider is named and reads out its own display');
});

test('a11y: all five switches sit inside their own <label>, wording and onChange intact', () => {
	const page = buildSettingsPage({});
	const glass = page.renderRow('dream-skin-glass');
	assert.deepEqual(switchProblems(glass, ['background.sidebarLink', 'glass.performance']), [],
		'the two glass switches are labelled by their own text');

	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	assert.deepEqual(switchProblems(page.renderRow(ADV), ['bg2.refresh', 'bg2.rotation', 'bg2.autodim']), [],
		'the three advanced-wallpaper switches too');
});

test('a11y: a theme-pack card is a labelled group of three buttons, never a button inside a button', () => {
	const page = buildSettingsPage({});
	page.setState('dream-skin-packs', {
		ids: ['pack-a', 'pack-b'],
		names: { 'pack-a': 'Pack A', 'pack-b': 'Pack B' },
		favorites: ['pack-b'],
		active: 'pack-a'
	});
	const row = page.renderRow('dream-skin-packs');
	assert.deepEqual(packProblems(row), [], 'the pack grid is two labelled groups of three real buttons');

	const cards = packCards(row);
	assert.deepEqual(cards.map((card) => card.props['aria-label']), ['Pack A', 'Pack B'], 'each group is named by its pack');
	const buttons = findAll([cards[0]], (node) => node.tag === 'button');
	assert.deepEqual(buttons.map((button) => firstText([button])), ['packs.apply', '☆', 'packs.remove'],
		'apply / favourite / remove keep their wording and their order');
	assert.equal(buttons[0].props['aria-pressed'], true, 'the applied pack is still announced as pressed');
	assert.equal(findAll([cards[1]], (node) => node.tag === 'button')[0].props['aria-pressed'], false,
		'and a pack that is not applied is not');
});

test('a11y: the skin and pack cards expose a keyboard focus ring, and nothing pins outline: none', () => {
	const page = buildSettingsPage({});
	const skinRow = page.renderRow('dream-skin');
	assert.ok(cardByText(skinRow, 'skin.default'), 'the default chip is the card addressed here');
	assert.deepEqual(focusProblems(skinRow, 'skin.default'), [], 'the default chip can show a ring');
	assert.deepEqual(focusProblems(skinRow, 'skin.abyss'), [], 'and so can a skin card');

	// The handler drives the state: the fixture records the setter calls, so the wiring is observable
	// even though it cannot re-render.
	page.clearHookCalls();
	cardByText(skinRow, 'skin.abyss').props.onFocus();
	cardByText(skinRow, 'skin.abyss').props.onBlur();
	assert.deepEqual(page.hookCalls, [{ hook: 'SkinRow#0', value: 'abyss' }, { hook: 'SkinRow#0', value: null }],
		'focus pins the card id, blur releases it');

	// The state drives the style: a page whose focus cell starts on one card paints the ring on THAT
	// card only — the half a handler-only assertion cannot see.
	const focused = buildSettingsPage({ hookInitials: { 'SkinRow#0': 'abyss' } });
	const focusedRow = focused.renderRow('dream-skin');
	assert.deepEqual(ringedCards(focusedRow).map((card) => firstText([card])), ['skin.abyss'],
		'exactly the focused skin card paints the ring');
	assert.equal(cardByText(focusedRow, 'skin.abyss').props['aria-pressed'], false,
		'aria-pressed still reports selection, not focus');

	const focusedPacks = buildSettingsPage({ hookInitials: { 'PacksRow#0': 'pack-a' } });
	focusedPacks.setState('dream-skin-packs', {
		ids: ['pack-a', 'pack-b'],
		names: { 'pack-a': 'Pack A', 'pack-b': 'Pack B' },
		favorites: [],
		active: 'pack-b'
	});
	const packRow = focusedPacks.renderRow('dream-skin-packs');
	assert.deepEqual(ringedCards(packRow).map((card) => card.props['aria-label']), ['Pack A'],
		'a child button taking focus lights its own pack card, and only that one');
});

test('mutation: dropping the slider aria-label reddens the slider case', () => {
	const anchor = '"aria-label": label,\n\t\t\t\t\t\t"aria-valuetext": shown,';
	assert.equal(countOf(CODE, anchor), 1, 'the slider aria anchor must occur exactly once: ' + JSON.stringify(anchor));
	const mutated = CODE.replace(anchor, '"aria-valuetext": shown,');
	assert.notEqual(mutated, CODE, 'mutation ③ has to change the bundle');

	const control = buildSettingsPage({});
	assert.deepEqual(sliderProblems(control.renderRow('dream-skin-glass')), [], 'control: the shipped sliders are named');

	const broken = buildSettingsPage({ code: mutated });
	const problems = sliderProblems(broken.renderRow('dream-skin-glass'));
	assert.ok(problems.length >= 5, 'mutation expected: every slider is unnamed again, got: ' + JSON.stringify(problems));
	assert.match(problems[0], /^background\.opacity: the slider has no aria-label/, 'and the first defect names the first slider');
});

test('mutation: un-wrapping the shared switch row reddens the switch case', () => {
	// The extraction put ONE label construction behind every switch (W3), so the anchor is that
	// construction — and the expected damage is every switch in the group, not just one.
	const anchor = 'const row = (0, react_jsx_runtime.jsxs)("label", {\n\t\t\t\tstyle: rowStyle || styles.actionRow,';
	assert.equal(countOf(CODE, anchor), 1, 'the shared switch-row label anchor must occur exactly once');
	const mutated = CODE.replace(anchor, anchor.replace('("label"', '("div"'));
	assert.notEqual(mutated, CODE, 'mutation ④ has to change the bundle');

	const control = buildSettingsPage({});
	assert.deepEqual(switchProblems(control.renderRow('dream-skin-glass'), ['background.sidebarLink', 'glass.performance']), [],
		'control: both glass switches are wrapped');

	const broken = buildSettingsPage({ code: mutated });
	const problems = switchProblems(broken.renderRow('dream-skin-glass'), ['background.sidebarLink', 'glass.performance']);
	assert.deepEqual(problems, [
		'background.sidebarLink: the input is not inside a <label> (its parent is "div"), so the wording is not its name',
		'glass.performance: the input is not inside a <label> (its parent is "div"), so the wording is not its name'
	], 'mutation expected: both glass switches lose their label and their name — one shared row, one break');
});

test('mutation: restoring the nested button reddens the pack-card case', () => {
	const anchor = 'jsxs)("div", {\n\t\t\t\t\t\t\t\tkey: id,\n\t\t\t\t\t\t\t\trole: "group",';
	assert.equal(countOf(CODE, anchor), 1, 'the pack-card container anchor must occur exactly once');
	const mutated = CODE.replace(anchor, anchor.replace('jsxs)("div"', 'jsxs)("button"'));
	assert.notEqual(mutated, CODE, 'mutation ⑤ has to change the bundle');

	const seeded = { ids: ['pack-a', 'pack-b'], names: { 'pack-a': 'Pack A', 'pack-b': 'Pack B' }, favorites: [], active: 'pack-a' };
	const control = buildSettingsPage({});
	control.setState('dream-skin-packs', seeded);
	assert.deepEqual(packProblems(control.renderRow('dream-skin-packs')), [], 'control: the shipped pack grid is legal');

	const broken = buildSettingsPage({ code: mutated });
	broken.setState('dream-skin-packs', seeded);
	const problems = packProblems(broken.renderRow('dream-skin-packs'));
	assert.deepEqual(problems, [
		'card "Pack A" is a <button>, so it is still an interactive card',
		'card "Pack B" is a <button>, so it is still an interactive card',
		'6 button(s) are nested inside another button'
	], 'mutation expected: the outer wrapper is a button again, so three buttons per card sit inside one');
});

test('mutation: putting outline: none back reddens the focus case', () => {
	const anchor = 'font: "inherit",\n\t\t\t\tboxSizing: "border-box",\n\t\t\t\tposition: "relative"\n\t\t\t},';
	assert.equal(countOf(CODE, anchor), 1, 'the card style anchor must occur exactly once');
	const mutated = CODE.replace(anchor, anchor.replace('position: "relative"', 'position: "relative",\n\t\t\t\toutline: "none"'));
	assert.notEqual(mutated, CODE, 'mutation ⑥ has to change the bundle');

	const control = buildSettingsPage({});
	assert.deepEqual(focusProblems(control.renderRow('dream-skin'), 'skin.default'), [], 'control: the card does not pin an outline');

	const broken = buildSettingsPage({ code: mutated });
	assert.deepEqual(focusProblems(broken.renderRow('dream-skin'), 'skin.default'),
		['the card still pins outline: "none", so the UA ring is suppressed'],
		'mutation expected: the focus ring is suppressed again');
});

// ---------------------------------------------------------------------------
// 10. W3: the shared controls (Choose / CheckRow / SectionHeading)
//
// Four chip groups, six group headings and five switch rows used to be three
// shapes copied by hand. W3 moved them behind shared helpers with no DOM, style
// or wording change, so these cases assert the SEMANTICS the helpers exist to
// keep: each chip group marks exactly one pressed option, each heading is the
// row's title line carrying the ONE shared help badge, and a switch row's
// trailing action stays outside its label. The two mutation legs at the end
// break the helpers themselves (not a call site) and expect the SAME checkers
// to name it — that is what "the extraction did not quietly drop an attribute"
// means when the call sites are the thing being rewritten.
// ---------------------------------------------------------------------------

/** The four chip groups, by the i18n key each chip prints (the identity translator keeps the key). */
const CHIP_GROUPS = {
	// W6a: the three kind chips became the form <select>; the source pair is what a
	// fixed picture offers, so it takes this slot in the four-group check.
	fixedSource: ['bg2.url', 'bg2.local'],
	fill: ['bg2.fillCover', 'bg2.fillContain', 'bg2.fillBlur'],
	rotationSource: ['bg2.rotationSourceLinks', 'bg2.rotationSourceFolder'],
	order: ['bg2.rotationSequential', 'bg2.rotationRandom']
};

/**
 * The state every chip-group case renders: a URL wallpaper with two links in random
 * order. W6a: the rotation switch is OFF on purpose — a fixed picture is what shows
 * the FIXED source pair, and the rotation's own source chips are checked separately.
 */
const ROTATING = {
	on: false,
	mode: 'random',
	minutes: 30,
	urls: ['https://a.jpg', 'https://b.jpg'],
	source: 'links',
	folder: '',
	folderCount: null,
	folderError: null
};

const chipByText = (nodes, key) => findOne(nodes, (node) => node.tag === 'button' && firstText([node]) === key);

/** Everything wrong with the named chip groups under `row` — empty when each is ONE group with one pressed chip. */
const chipGroupProblems = (row, groups) => {
	const problems = [];
	for (const keys of groups) {
		const chips = keys.map((key) => ({ key, node: chipByText(row, key) }));
		const missing = chips.filter((chip) => chip.node === null).map((chip) => chip.key);
		if (missing.length > 0) {
			problems.push(`[${keys.join(', ')}]: ${missing.join(', ')} not rendered at all — the group is incomplete`);
			continue;
		}
		const parents = new Set(chips.map((chip) => chip.node.parent));
		if (parents.size !== 1) problems.push(`[${keys.join(', ')}]: the chips have ${parents.size} different parents, so they are not one group`);
		const silent = chips.filter((chip) => typeof chip.node.props['aria-pressed'] !== 'boolean').map((chip) => chip.key);
		if (silent.length > 0) problems.push(`[${keys.join(', ')}]: ${silent.join(', ')} announce no pressed state (no boolean aria-pressed), so the selection is silent`);
		const pressed = chips.filter((chip) => chip.node.props['aria-pressed'] === true).map((chip) => chip.key);
		if (pressed.length !== 1) problems.push(`[${keys.join(', ')}]: ${pressed.length} chips read as pressed (${pressed.join(', ') || 'none'}) — exactly one option must carry the selection`);
	}
	return problems;
};

/** The one shared help-badge shape: a span whose whole text is "?" and which announces itself. */
const badgeFacts = (node) => findAll([node], (child) => child !== node && child.tag === 'span' && firstText([child]) === '?')
	.map((child) => ({
		role: child.props.role,
		title: child.props.title,
		announced: child.props['aria-label'],
		tabbable: child.props.tabIndex
	}));

/** Which title line carries which explanation (the three that document one). */
const HEADING_HELP = { 'accent.title': 'accent.hint', 'background.title': 'background.hint', 'glass.title': 'glass.help' };

/** Everything wrong with the section's title lines — empty once each is one line carrying its badge. */
const headingProblems = (section) => {
	const problems = [];
	const lines = titleLines(section);
	if (lines.length !== TITLE_ORDER.length) problems.push(`expected ${TITLE_ORDER.length} title lines, rendered ${lines.length}`);
	lines.forEach((heading, i) => {
		const key = TITLE_ORDER[i] || '#' + i;
		const text = titleText(heading);
		if (text !== key) problems.push(`${key}: the heading reads "${text}"`);
		const colour = heading.props.style && heading.props.style.color;
		if (colour !== 'var(--dsw-alias-label-primary)') problems.push(`${key}: the heading no longer uses styles.title (colour ${JSON.stringify(colour)})`);
		const badges = badgeFacts(heading);
		const helpKey = HEADING_HELP[key];
		if (helpKey === undefined) {
			if (badges.length !== 0) problems.push(`${key}: ${badges.length} help badge(s) on a heading that documents none`);
			return;
		}
		if (badges.length !== 1) {
			problems.push(`${key}: expected exactly one help badge, found ${badges.length}`);
			return;
		}
		const badge = badges[0];
		if (badge.role !== 'note') problems.push(`${key}: the badge is a hand-rolled look-alike (role ${JSON.stringify(badge.role)}), not the shared HelpDot`);
		if (badge.title !== helpKey) problems.push(`${key}: the badge explains "${badge.title}", expected "${helpKey}"`);
		if (badge.announced !== helpKey) problems.push(`${key}: the badge is announced as "${badge.announced}"`);
		if (badge.tabbable !== 0) problems.push(`${key}: the badge is not keyboard reachable (tabIndex ${JSON.stringify(badge.tabbable)})`);
	});
	return problems;
};

test('shared controls: each of the four chip groups announces exactly one pressed option', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg', rotation: ROTATING });
	const row = page.renderRow(ADV);
	const groups = [CHIP_GROUPS.fixedSource, CHIP_GROUPS.fill, CHIP_GROUPS.rotationSource, CHIP_GROUPS.order];
	assert.deepEqual(chipGroupProblems(row, groups), [],
		'four groups, one pressed chip each, and the chips of a group share their parent');

	// The STORE decides which chip is pressed — each group mirrors its own field.
	const pressed = groups.flat().filter((key) => chipByText(row, key).props['aria-pressed'] === true);
	assert.deepEqual(pressed, ['bg2.url', 'bg2.fillCover', 'bg2.rotationSourceLinks', 'bg2.rotationRandom'],
		'a link source, cover fill, links pool and random order are the four selections shown');
});

test('shared controls: every title line is one shape, and the three help badges are the shared dot', () => {
	const section = buildSettingsPage({}).renderSection();
	assert.deepEqual(headingProblems(section), [], 'nine title lines (four zone headings + five block titles), three shared badges');
	assert.deepEqual(titleLines(section).map(titleText), TITLE_ORDER,
		'neither the extraction nor the regroup moved a title line');
	// The glass heading's badge stopped being a hand-rolled twin in W3: it is the SAME node now, and
	// W5 promoted that heading to the zone's <h3> while keeping the badge.
	const glassHeading = titleLines(section).find((node) => titleText(node) === 'glass.title');
	assert.equal(glassHeading.tag, 'h3', 'the glass zone heading IS the block title, promoted');
	const glassBadge = badgeFacts(glassHeading)[0];
	assert.deepEqual([glassBadge.role, glassBadge.title, glassBadge.tabbable], ['note', 'glass.help', 0],
		'the glass heading wears the shared badge, announced and keyboard reachable');
});

test('mutation: dropping the shared chips pressed state reddens the chip-group case', () => {
	const anchor = '"aria-pressed": value === option.id,';
	assert.equal(countOf(CODE, anchor), 1, 'the Choose pressed anchor must occur exactly once: ' + JSON.stringify(anchor));
	const mutated = CODE.replace(anchor, '"aria-pressed-x": value === option.id,');
	assert.notEqual(mutated, CODE, 'mutation ⑦ has to change the bundle');

	const page = buildSettingsPage({ code: mutated });
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg', rotation: ROTATING });
	const problems = chipGroupProblems(page.renderRow(ADV), [CHIP_GROUPS.fixedSource, CHIP_GROUPS.fill, CHIP_GROUPS.rotationSource, CHIP_GROUPS.order]);
	const silent = problems.filter((problem) => problem.includes('announce no pressed state'));
	assert.equal(silent.length, 4, 'mutation expected: all four groups lose the announcement, got: ' + JSON.stringify(problems));
	assert.match(silent[0], /^\[bg2\.url, bg2\.local\]: /, 'and the first defect names the first group');
});

test('mutation: dropping the heading help badge reddens the heading case', () => {
	const badgeLine = '\n\t\t\t\t(0, react_jsx_runtime.jsx)(HelpDot, { text: help })';
	assert.equal(countOf(CODE, badgeLine), 1, 'the shared heading badge anchor must occur exactly once');
	const mutated = CODE.replace(badgeLine, '');
	assert.notEqual(mutated, CODE, 'mutation ⑧ has to change the bundle');

	const problems = headingProblems(buildSettingsPage({ code: mutated }).renderSection());
	assert.equal(problems.length, 3, 'mutation expected: the three documented headings lose their badge, got: ' + JSON.stringify(problems));
	for (const key of Object.keys(HEADING_HELP)) {
		assert.ok(problems.some((problem) => problem.startsWith(key + ': expected exactly one help badge, found 0')),
			key + ' must be named by the heading checker');
	}
});

// ---------------------------------------------------------------------------
// 11. W4: the three responsive tiers (559 / 311 / 131 content columns)
//
// The settings content column is a pure function of the viewport —
// `min(559, vw - 289)` (panel 800 / nav 188 / padding 24 / scrollbar 5) — so
// three widths are in scope and the two narrow ones used to clip the shipped
// rows (measured: the 420px viewport put the slider row's right edge at x=476
// and the link box at x=456, past the panel's right edge at 396). W4 answers
// with ONE viewport media query plus inline overrides (A10 keeps the injected
// sheets at two), so the cases below render the SAME rows twice: with the query
// off (the wide panel, which must not have moved) and with it on (the narrow
// tiers, which must restack). The two mutation legs at the end break the
// compact branch itself and put the 220px floor back, and expect the same
// checker the positive case uses to name the defect.
// ---------------------------------------------------------------------------

/** The media stub the fixture hands the bundle: `compact` answers the breakpoint query. */
const mediaStub = (compact) => (query) => compact && query.includes('max-width');

const widePage = (opts) => buildSettingsPage(Object.assign({ matchMedia: mediaStub(false) }, opts || {}));
const compactPage = (opts) => buildSettingsPage(Object.assign({ matchMedia: mediaStub(true) }, opts || {}));

/** The glass group's slider rows: one entry per range input, with each of the three cells' styles. */
const sliderRowFacts = (nodes) => rangeInputs(nodes).map((input) => {
	const row = input.parent;
	const at = row.children.indexOf(input);
	return {
		label: firstText([row.children[0]]),
		rowStyle: row.props.style,
		labelStyle: row.children[0].props.style,
		trackStyle: input.props.style,
		valueStyle: row.children[at + 1].props.style
	};
});

/** The two material cards: the buttons that carry the material tooltip. */
const materialCards = (row) => findAll(row, (node) => node.tag === 'button' && node.props.title === 'material.hint');

/** The link box and the button that commits it, plus the row gap that separates them. */
const linkBoxFacts = (row) => {
	const box = findOne(row, (node) => node.tag === 'input' && node.props.type === 'url');
	if (box === null) return null;
	const parent = box.parent;
	return {
		boxStyle: box.props.style,
		actionStyle: parent.children.find((node) => node.tag === 'button').props.style,
		gap: Number(String(parent.props.style.gap).replace('px', ''))
	};
};

/** A style length as a number ("44px" / 44 -> 44; anything unusable -> NaN). */
const px = (value) => Number(String(value).replace('px', ''));

/** Everything wrong with the compact tier's slider rows — empty when they restack as designed. */
const compactSliderProblems = (nodes) => {
	const problems = [];
	for (const row of sliderRowFacts(nodes)) {
		const at = row.label + ': ';
		if (row.rowStyle.flexWrap !== 'wrap') problems.push(at + 'the row still cannot wrap (flexWrap ' + JSON.stringify(row.rowStyle.flexWrap) + '), so all three cells must fit one line');
		if (row.rowStyle.minWidth !== '0') problems.push(at + 'the row still carries a ' + JSON.stringify(row.rowStyle.minWidth) + ' floor, so a narrow column clips it');
		if (row.labelStyle.flexBasis !== '100%') problems.push(at + 'the label does not own a line (flexBasis ' + JSON.stringify(row.labelStyle.flexBasis) + ')');
		if (row.labelStyle.whiteSpace !== 'normal') problems.push(at + 'the label is still unbreakable (whiteSpace ' + JSON.stringify(row.labelStyle.whiteSpace) + ')');
		if (row.trackStyle.minWidth !== '0') problems.push(at + 'the track cannot shrink (minWidth ' + JSON.stringify(row.trackStyle.minWidth) + ')');
	}
	return problems;
};

/** The basis percentage a `flex` shorthand asks for (`1 1 100%` -> 100; `1` -> NaN). */
const flexBasisPercent = (flex) => parseFloat(String(flex).split(' ')[2]);

/** Everything wrong with the compact tier's material cards — empty when they stack. */
const compactCardProblems = (nodes) => {
	const problems = [];
	const cards = materialCards(nodes);
	if (cards.length !== 2) problems.push('expected 2 material cards, rendered ' + cards.length);
	for (const card of cards) {
		if (card.props.style.flexBasis !== '100%') problems.push('a material card still shares its line (flexBasis ' + JSON.stringify(card.props.style.flexBasis) + ')');
	}
	return problems;
};

/** Everything wrong with the compact tier's link row — empty when the box and button restack. */
const compactLinkProblems = (row) => {
	const problems = [];
	const link = linkBoxFacts(row);
	if (link === null) return ['the link box is not rendered at all'];
	if (link.boxStyle.minWidth !== '0') problems.push('the link box still carries a ' + JSON.stringify(link.boxStyle.minWidth) + ' floor');
	if (flexBasisPercent(link.boxStyle.flex) !== 100) problems.push('the link box does not ask for a whole line (flex ' + JSON.stringify(link.boxStyle.flex) + ')');
	if (String(link.actionStyle.flex) !== '1 1 auto') problems.push('the commit button does not take the line the box left (flex ' + JSON.stringify(link.actionStyle.flex) + ')');
	return problems;
};

test('responsive: the wide tier keeps its one-line rows, and is what a DOM without matchMedia gets', () => {
	const page = widePage({});
	const glassRows = sliderRowFacts(page.renderRow('dream-skin-glass'));
	assert.equal(glassRows.length, 5, 'the wide tier still renders the five glass sliders');
	for (const row of glassRows) {
		assert.equal(row.rowStyle.minWidth, '240px', row.label + ': the wide row keeps its 240px floor');
		assert.equal(row.rowStyle.flexWrap, undefined, row.label + ': the wide row stays one line');
		assert.equal(row.labelStyle.flexBasis, undefined, row.label + ': the wide label keeps its intrinsic width');
		assert.equal(row.labelStyle.whiteSpace, 'nowrap', row.label + ': the wide label stays on one line');
	}
	const cards = materialCards(page.renderRow('dream-skin-glass'));
	assert.equal(cards.length, 2, 'two material cards');
	for (const card of cards) assert.equal(card.props.style.flexBasis, undefined, 'wide: a material card takes half the row');

	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	const link = linkBoxFacts(page.renderRow(ADV));
	assert.equal(link.boxStyle.minWidth, '220px', 'wide: the link box keeps its 220px floor');
	assert.equal(link.actionStyle.flex, undefined, 'wide: the commit button keeps its intrinsic width');

	// A DOM that cannot answer a media query renders that SAME panel: the fallback is the shipped
	// layout, never the tier that restacks rows (a sandbox, a stripped webview).
	const bare = widePage({ noMatchMedia: true });
	assert.deepEqual(sliderRowFacts(bare.renderRow('dream-skin-glass')).map((row) => row.rowStyle),
		glassRows.map((row) => row.rowStyle),
		'a DOM without matchMedia must render the wide rows — not throw, and not restack');
	assert.equal(bare.mediaQueries.filter((list) => list.media.includes('max-width')).length, 0,
		'and nothing may ask for a query that DOM cannot answer');
});

test('responsive: the compact tier restacks the slider rows, the link box and the material cards', () => {
	const page = compactPage({});
	const glass = page.renderRow('dream-skin-glass');
	assert.equal(sliderRowFacts(glass).length, 5, 'the compact tier renders the same five glass sliders');
	assert.deepEqual(compactSliderProblems(glass), [],
		'below the breakpoint every slider row wraps, its label owns a line and its track can shrink');
	assert.equal(sliderRowFacts(glass)[0].valueStyle.width, '44px', 'the value cell keeps its 44px box in both tiers');

	assert.deepEqual(compactCardProblems(glass), [], 'below the breakpoint the two material cards stack');
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	const advanced = page.renderRow(ADV);
	assert.deepEqual(compactLinkProblems(advanced), [],
		'below the breakpoint the link box asks for a line of its own and the commit button takes the next one');
	// The framing sliders are the SAME component, so they take the same tier.
	assert.deepEqual(compactSliderProblems(advanced), [], 'the framing sliders restack too');
});

/**
 * px constants for the arithmetic below, both PESSIMISTIC (the error side is "too wide"):
 * the widest shipped slider label is the German popup-transparency one at 161px
 * (measured on the live panel), and a 32px-tall button with 14px of horizontal
 * padding and a two-word label cannot be narrower than ~96px.
 */
const WIDEST_LABEL_PX = 161;
const COMMIT_BUTTON_PX = 96;

/** The content column the host gives this section at a viewport (measured: min(559, vw - 289)). */
const contentColumn = (vw) => Math.min(559, vw - 289);

/** The viewports that matter, and which tier each one is served. */
const RESPONSIVE_TIERS = [
	{ vw: 1455, tier: 'wide', column: 559, why: 'the default panel' },
	{ vw: 681, tier: 'wide', column: 392, why: 'the narrowest viewport still served the wide tier' },
	{ vw: 600, tier: 'compact', column: 311, why: 'the first narrow panel' },
	{ vw: 420, tier: 'compact', column: 131, why: 'the narrowest reported panel (was clipped before W4)' }
];

test('responsive: the slider and link rows fit every content column (559 / 311 / 131)', () => {
	const pages = { wide: widePage({}), compact: compactPage({}) };
	for (const page of Object.values(pages)) page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	const factsOf = {
		wide: { slider: sliderRowFacts(pages.wide.renderRow('dream-skin-glass'))[0], link: linkBoxFacts(pages.wide.renderRow(ADV)) },
		compact: { slider: sliderRowFacts(pages.compact.renderRow('dream-skin-glass'))[0], link: linkBoxFacts(pages.compact.renderRow(ADV)) }
	};

	const readings = [];
	for (const tier of RESPONSIVE_TIERS) {
		const facts = factsOf[tier.tier];
		const column = tier.column;
		assert.equal(column, contentColumn(tier.vw), 'the tier table and the host formula must agree at vw ' + tier.vw);

		const gap = px(facts.slider.rowStyle.gap);
		const value = px(facts.slider.valueStyle.width);
		const labelFloor = px(facts.slider.labelStyle.minWidth);
		const rowFloor = px(facts.slider.rowStyle.minWidth);
		const labelOnOwnLine = facts.slider.labelStyle.flexBasis === '100%';
		const labelWidth = labelOnOwnLine ? column : Math.max(WIDEST_LABEL_PX, labelFloor);
		const track = labelOnOwnLine ? column - gap - value : column - labelWidth - 2 * gap - value;

		// The row's own floor may not exceed the column: that floor was the clipping.
		assert.ok(rowFloor <= column,
			tier.tier + ' tier at ' + column + 'px: the row floor is ' + rowFloor + 'px — the row is wider than the column');
		// Neither may the label cell (wrapped, the whole column is its line).
		assert.ok(labelWidth <= column,
			tier.tier + ' tier at ' + column + 'px: the label needs ' + labelWidth + 'px — wider than the column');
		// The track is the only flexible cell: it must stay positive, and the line must add up.
		assert.ok(track > 0,
			tier.tier + ' tier at ' + column + 'px: label ' + labelWidth + ' + gaps ' + 2 * gap + ' + value ' + value + ' leaves the track ' + track + 'px — nothing left to drag');
		assert.equal(labelOnOwnLine ? track + gap + value : labelWidth + 2 * gap + track + value, column,
			tier.tier + ' tier at ' + column + 'px: the slider line must add up to the column (' + tier.why + ')');

		// Below the breakpoint the raw label is WIDER than the whole column, so the wrap is what
		// saves it — a nowrap label could not fit whatever the track does.
		if (WIDEST_LABEL_PX > column) {
			assert.equal(facts.slider.labelStyle.whiteSpace, 'normal',
				'at ' + column + 'px the widest shipped label (' + WIDEST_LABEL_PX + 'px) cannot fit on one line, so the label must be allowed to wrap');
		}

		const link = facts.link;
		const boxFloor = px(link.boxStyle.minWidth);
		const boxOnOwnLine = px(String(link.boxStyle.flex).split(' ')[2]) === 100;
		if (boxOnOwnLine) {
			// The box gets a whole line and the button the next one: neither may be wider.
			assert.ok(boxFloor <= column,
				tier.tier + ' tier at ' + column + 'px: the link box floor is ' + boxFloor + 'px — wider than the column');
			assert.ok(COMMIT_BUTTON_PX <= column,
				tier.tier + ' tier at ' + column + 'px: the commit button needs ' + COMMIT_BUTTON_PX + 'px — wider than the column');
		} else {
			assert.ok(boxFloor + link.gap + COMMIT_BUTTON_PX <= column,
				tier.tier + ' tier at ' + column + 'px: link box floor ' + boxFloor + ' + gap ' + link.gap + ' + button ' + COMMIT_BUTTON_PX +
				' = ' + (boxFloor + link.gap + COMMIT_BUTTON_PX) + 'px — over the column');
		}

		readings.push({ column, track, labelLine: labelWidth, boxLine: boxOnOwnLine ? column : boxFloor, buttonLine: boxOnOwnLine ? COMMIT_BUTTON_PX : 0 });
	}

	// The readings, as facts: the 311px column leaves a 257px track and the 131px one 77px.
	assert.deepEqual(readings.map((reading) => reading.track), [334, 167, 257, 77],
		'the four slider tracks, computed from the rendered gap/value cells: ' + JSON.stringify(readings));
	for (const reading of readings) {
		for (const cell of ['column', 'track', 'labelLine', 'boxLine', 'buttonLine']) {
			assert.ok(reading[cell] >= 0, cell + ' cannot be negative at ' + reading.column + 'px');
		}
	}
});

test('responsive: the compact subscription is one per component and is released on cleanup', () => {
	const page = compactPage({});
	page.renderSection();
	const mql = page.mediaQueries.find((list) => list.media === '(max-width: 680px)');
	assert.ok(mql, 'every responsive render must ask for the documented breakpoint: ' + JSON.stringify(page.mediaQueries.map((list) => list.media)));
	assert.equal(mql.matches, true, 'the stub reported the compact tier');
	assert.equal(mql.listeners.length, 0, 'rendering alone subscribes nothing: the listener is an effect');
	const cleanups = page.effects.map((effect) => effect());
	const subscribed = cleanups.filter((cleanup) => typeof cleanup === 'function').length;
	assert.ok(subscribed >= 7,
		'the two rows that own a layout tier plus every slider render a subscription, got ' + subscribed);
	assert.equal(mql.listeners.length, subscribed,
		'exactly one subscription per component — a shared query list, not a per-render leak');

	page.clearHookCalls();
	mql.change(false);
	assert.equal(page.hookCalls.length, subscribed,
		'a query change re-renders every component that subscribed, and only those');

	for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup();
	assert.equal(mql.listeners.length, 0, 'the cleanup releases exactly the subscriptions this panel made');
	page.clearHookCalls();
	mql.change(true);
	assert.deepEqual(page.hookCalls, [], 'a released subscription cannot re-render anything');
});

test('mutation: dropping the compact slider row reddens the compact case', () => {
	const anchor = 'style: narrow ? { ...styles.sliderRow, ...narrowStyles.sliderRow } : styles.sliderRow,';
	assert.equal(countOf(CODE, anchor), 1, 'the compact slider-row branch must occur exactly once: ' + anchor);
	const mutated = CODE.replace(anchor, 'style: styles.sliderRow,');
	assert.notEqual(mutated, CODE, 'mutation ⑨ has to change the bundle');

	const control = buildSettingsPage({ matchMedia: mediaStub(true) });
	assert.deepEqual(compactSliderProblems(control.renderRow('dream-skin-glass')), [],
		'control: the shipped compact slider row restacks');

	const broken = buildSettingsPage({ code: mutated, matchMedia: mediaStub(true) });
	const problems = compactSliderProblems(broken.renderRow('dream-skin-glass'));
	assert.equal(problems.length, 10,
		'mutation expected: every slider row loses BOTH its wrap and its zero floor (5 rows x 2), got: ' + JSON.stringify(problems));
	assert.match(problems[0], /^background\.opacity: the row still cannot wrap \(flexWrap undefined\)/,
		'and the first defect names the first slider');
	assert.match(problems[1], /^background\.opacity: the row still carries a "240px" floor/,
		'the 240px floor is exactly the value that clipped the 131px column');
});

test('mutation: restoring the 220px floor on the link box reddens the compact case', () => {
	const anchor = 'input: { minWidth: "0", flex: "1 1 100%" },';
	assert.equal(countOf(CODE, anchor), 1, 'the compact input entry must occur exactly once: ' + anchor);
	const mutated = CODE.replace(anchor, 'input: { minWidth: "220px", flex: "1 1 100%" },');
	assert.notEqual(mutated, CODE, 'mutation ⑩ has to change the bundle');

	const control = buildSettingsPage({ matchMedia: mediaStub(true) });
	control.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	assert.deepEqual(compactLinkProblems(control.renderRow(ADV)), [], 'control: the shipped compact link row fits');

	const broken = buildSettingsPage({ code: mutated, matchMedia: mediaStub(true) });
	broken.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	assert.deepEqual(compactLinkProblems(broken.renderRow(ADV)),
		['the link box still carries a "220px" floor'],
		'mutation expected: the 220px floor is back — the box that measured 220px wide at x=456 in the 420px panel');
});
// ---------------------------------------------------------------------------
// 12. W5: the four zones, the ONE rule between them, and the fold container
//
// The section used to be six same-looking groups in slot order. W5 groups them
// into the design's four zones (主题与配色 / 玻璃效果 / 背景与壁纸 / 导入与导出),
// promotes every zone title to an <h3> so the panel finally has an OUTLINE,
// keeps exactly one rule between two zones (never above the first, never after
// the last block), and gives the advanced-wallpaper block a fold whose state is
// announced. The three cases below state those facts; the three mutation legs at
// the end demote a zone title, draw the rule on EVERY block and drop
// `aria-expanded`, and expect the same checkers to name the defect.
// ---------------------------------------------------------------------------

/** Everything wrong with the zone outline — empty when the four zones are there, once each, in order. */
const zoneProblems = (section) => {
	const problems = [];
	const titles = zoneHeadings(section).map(titleText);
	if (titles.join(' | ') !== ZONE_ORDER.join(' | ')) {
		problems.push('the zone headings read [' + titles.join(', ') + '], expected [' + ZONE_ORDER.join(', ') + ']');
	}
	for (const key of ZONE_ORDER) {
		const count = titles.filter((title) => title === key).length;
		if (count !== 1) problems.push(key + ': ' + count + ' zone headings print this key — every zone needs exactly one <h3>');
	}
	// No zone may repeat a title inside itself. W5's one real duplicate (the glass zone WAS the
	// glass block) is resolved by reusing the key as the zone heading, so the key may print once.
	for (const group of groupRoots(section)) {
		const keys = titleLines([group]).map(titleText);
		if (new Set(keys).size !== keys.length) problems.push('one group prints the same title twice: ' + keys.join(' / '));
	}
	const glass = titleLines(section).filter((node) => titleText(node) === 'glass.title').length;
	if (glass !== 1) problems.push('glass.title prints ' + glass + ' times — the zone heading IS the block title, so it appears once');
	return problems;
};

/** Everything wrong with the rules — empty when exactly the zone openers wear one. */
const dividerProblems = (section) => {
	const problems = [];
	const groups = groupRoots(section);
	const openers = groupOpeners(section);
	groups.forEach((group, i) => {
		const name = openers[i] === null ? 'group #' + i : openers[i];
		const opener = findOne([group], isTitleLine);
		const opensZone = opener !== null && opener.tag === 'h3';
		const style = group.props.style || {};
		const drawn = style.borderTop !== undefined;
		if (style.borderBottom !== undefined) {
			problems.push(name + ': the block closes itself with a rule, so the last zone would end on one');
		}
		if (opensZone && i === 0 && drawn) {
			problems.push(name + ': the first zone draws a rule above itself — there is nothing to separate it from');
		}
		if (opensZone && i > 0 && !drawn) {
			problems.push(name + ': a zone opens here but no rule separates it from the zone above');
		}
		if (!opensZone && drawn) {
			problems.push(name + ': a block inside a zone draws a rule — blocks are separated by spacing only');
		}
	});
	const drawnCount = groups.filter((group) => (group.props.style || {}).borderTop !== undefined).length;
	const zones = zoneHeadings(section).length;
	if (zones > 0 && drawnCount !== zones - 1) {
		problems.push(drawnCount + ' rules for ' + zones + ' zones — every zone but the first needs one, and only one');
	}
	return problems;
};

/** The fold toggles: the buttons whose text is the advanced block's title. */
const foldToggles = (nodes) => findAll(nodes, (node) => node.tag === 'button' && titleText(node) === 'bg2.title');

/** Everything wrong with a fold — empty when the toggle announces its state and the body follows it. */
const foldProblems = (row) => {
	const toggles = foldToggles(row);
	if (toggles.length !== 1) {
		return ['expected exactly one fold toggle (a button whose text is "bg2.title"), rendered ' + toggles.length];
	}
	const problems = [];
	const toggle = toggles[0];
	const expanded = toggle.props['aria-expanded'];
	if (typeof expanded !== 'boolean') {
		problems.push('bg2.title: the fold toggle does not announce its state (aria-expanded is ' + JSON.stringify(expanded) + ')');
	}
	// The announced state and the mounted body are ONE fact read twice: a body that is mounted
	// while the toggle says "closed" is content the user was told is gone.
	const bodyMounted = toggle.parent !== null && toggle.parent.children.length === 2;
	if (typeof expanded === 'boolean' && expanded !== bodyMounted) {
		problems.push('bg2.title: the toggle says aria-expanded=' + expanded + ' while the body is '
			+ (bodyMounted ? 'mounted' : 'not mounted'));
	}
	const caret = toggle.children[0];
	if (caret === undefined || caret.props['aria-hidden'] !== true) {
		problems.push('bg2.title: the caret is not aria-hidden, so it is read out as part of the name');
	}
	return problems;
};

test('zones: the four zones read in design order, each opens on an <h3>, and no title prints twice', () => {
	const section = buildSettingsPage({}).renderSection();
	assert.deepEqual(zoneProblems(section), [], 'four zones, four <h3> headings, and the glass zone reuses glass.title');
	assert.deepEqual(zoneHeadings(section).map(titleText), ZONE_ORDER,
		'the zone order is settings-theme-ui.md\'s reading order, top to bottom');
	assert.deepEqual(titleLines(section).map(titleText), TITLE_ORDER,
		'and the block titles sit inside their zones, in the order a reader meets them');
	// Every zone heading opens its group, i.e. nothing but the zone title sits above the first block.
	for (const group of groupRoots(section)) {
		const opener = findOne([group], isTitleLine);
		assert.ok(opener, 'every group opens with a title line');
		assert.equal(opener.parent, group, 'the title line is the group\'s own first heading, not a nested block\'s');
	}
	// A zone must never be a bare <h3> with no block: the two are one thing in the glass case.
	assert.equal(findAll(section, (node) => node.tag === 'h3').length, ZONE_ORDER.length,
		'exactly four h3 elements — no block title was promoted by accident');
});

test('zones: exactly one rule between two zones — none above the first, none after the last block', () => {
	const section = buildSettingsPage({}).renderSection();
	assert.deepEqual(dividerProblems(section), [], 'the shipped section separates its zones and nothing else');
	const groups = groupRoots(section);
	assert.deepEqual(groups.map((group) => ((group.props.style || {}).borderTop === undefined ? '-' : 'rule')),
		['-', '-', 'rule', 'rule', '-', 'rule'],
		'the rule is a ZONE marker: zone 2 (glass), zone 3 (background) and zone 4 (import/export) open on one');
	assert.equal(groupOpeners(section)[groups.length - 1], 'zone.packs',
		'the section ends on the last zone, whose rule can only ever be ABOVE it — there is no trailing line');
});

test('fold: the advanced block collapses through one toggle that announces its state', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	const open = page.renderRow(ADV);
	assert.deepEqual(foldProblems(open), [], 'open: the toggle announces it and the body is mounted');
	const toggle = foldToggles(open)[0];
	assert.equal(titleText(toggle), 'bg2.title', 'the toggle IS the block title line');
	const body = toggle.parent.children[1];
	assert.ok(findOne([body], (node) => node.tag === 'input' && node.props.type === 'url'),
		'the link box lives INSIDE the fold body, so folding it really hides it');

	// The handler drives the state; the hook cell it writes is the Foldable component's own, which
	// is what makes two folds in one row impossible (the W5 note on the component).
	page.clearHookCalls();
	toggle.props.onClick();
	const hookKey = page.hookCalls[0] && page.hookCalls[0].hook;
	assert.equal(typeof hookKey, 'string', 'clicking the toggle writes a hook cell: ' + JSON.stringify(page.hookCalls));
	assert.equal(page.hookCalls.length, 1, 'one click, one state write');
	assert.equal(page.hookCalls[0].value, false, 'the click asks for the closed state');

	// The state drives the DOM: a page whose cell starts closed renders the toggle and NOTHING else.
	const closed = buildSettingsPage({ hookInitials: { [hookKey]: false } });
	closed.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	const folded = closed.renderRow(ADV);
	assert.deepEqual(foldProblems(folded), [], 'closed: the toggle still announces its state, and the body is gone');
	const closedToggle = foldToggles(folded)[0];
	assert.equal(closedToggle.props['aria-expanded'], false, 'closed: the toggle says so');
	assert.equal(closedToggle.parent.children.length, 1,
		'closed: nothing is MOUNTED under the toggle, so hidden content is unreachable rather than clipped');
	assert.equal(findOne(folded, (node) => node.tag === 'input' && node.props.type === 'url'), null,
		'closed: the link box is gone, not merely scrolled out of view');
});

test('mutation: demoting one zone heading reddens the zone case', () => {
	const anchor = 'ZoneHeading({ title: t("zone.packs") })';
	assert.equal(countOf(CODE, anchor), 1, 'the import/export zone heading anchor must occur exactly once: ' + anchor);
	const mutated = CODE.replace(anchor, 'SectionHeading({ title: t("zone.packs") })');
	assert.notEqual(mutated, CODE, 'mutation ⑪ has to change the bundle');

	assert.deepEqual(zoneProblems(buildSettingsPage({}).renderSection()), [], 'control: the shipped section opens four zones');
	const problems = zoneProblems(buildSettingsPage({ code: mutated }).renderSection());
	assert.ok(problems.length >= 1, 'mutation expected: the outline loses a zone, got: ' + JSON.stringify(problems));
	assert.ok(problems.some((problem) => problem.startsWith('zone.packs: 0 zone headings')),
		'and the defect names the demoted zone, got: ' + JSON.stringify(problems));
});

test('mutation: drawing the rule on every block reddens the divider case', () => {
	const anchor = 'return divided ? { ...styles.group, ...styles.zoneDivider } : styles.group;';
	assert.equal(countOf(CODE, anchor), 1, 'the block-style anchor must occur exactly once');
	const mutated = CODE.replace(anchor, 'return { ...styles.group, ...styles.zoneDivider };');
	assert.notEqual(mutated, CODE, 'mutation ⑫ has to change the bundle');

	assert.deepEqual(dividerProblems(buildSettingsPage({}).renderSection()), [], 'control: the shipped section draws three rules');
	const problems = dividerProblems(buildSettingsPage({ code: mutated }).renderSection());
	assert.deepEqual(problems, [
		'zone.theme: the first zone draws a rule above itself — there is nothing to separate it from',
		'accent.title: a block inside a zone draws a rule — blocks are separated by spacing only',
		'bg2.title: a block inside a zone draws a rule — blocks are separated by spacing only',
		'6 rules for 4 zones — every zone but the first needs one, and only one'
	], 'mutation expected: every block drew one, so blocks and zones read alike again — the exact failure the marker was introduced to end');
});

test('mutation: dropping aria-expanded reddens the fold case', () => {
	const anchor = '\n\t\t\t\t\t\t"aria-expanded": open,';
	assert.equal(countOf(CODE, anchor), 1, 'the fold toggle aria anchor must occur exactly once');
	const mutated = CODE.replace(anchor, '');
	assert.notEqual(mutated, CODE, 'mutation ⑬ has to change the bundle');

	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	assert.deepEqual(foldProblems(page.renderRow(ADV)), [], 'control: the shipped toggle announces its state');

	const broken = buildSettingsPage({ code: mutated });
	broken.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	assert.deepEqual(foldProblems(broken.renderRow(ADV)),
		['bg2.title: the fold toggle does not announce its state (aria-expanded is undefined)'],
		'mutation expected: the fold still opens and closes, but a screen reader can no longer hear which');
});

// ---------------------------------------------------------------------------
// 13. W6a: the background zone's FOUR forms, one entry each
//
// 「同一件事的多个入口收敛成一个入口」 is the whole point of this round, so the
// cases below are written against ENTRY COUNTS as much as against behaviour:
// one form <select> (derived from the store, never stored), one image-source
// choice, one clear button, one recent strip filtered to the current form. The
// four mutation legs at the end break the derivation, restore the second clear
// entry and remove the history filter, and expect the SAME checkers to name it.
// ---------------------------------------------------------------------------

/** A same-colour two-stop gradient — exactly what the row writes for 纯色背景. */
const solidGradient = (color) => 'linear-gradient(0deg, ' + color + ', ' + color + ')';

/** One shipped preset gradient (a real gradient, therefore NOT a solid one). */
const PRESET_GRADIENT = 'linear-gradient(135deg, #022c22 0%, #0d9488 100%)';

/** A rotation config with everything but the switch on. */
const ROTATION = {
	on: false,
	mode: 'sequential',
	minutes: 30,
	urls: ['https://a.jpg', 'https://b.jpg'],
	source: 'links',
	folder: '',
	folderCount: null,
	folderError: null
};

/** The advanced row's form <select>. */
const formSelect = (nodes) => findOne(nodes, (node) => node.tag === 'select');

/** The option ids the form select offers, in reading order. */
const formOptionIds = (nodes) => {
	const select = formSelect(nodes);
	return select === null ? [] : select.children.filter((child) => child.tag === 'option').map((child) => child.props.value);
};

/** Pick a form the way a user does: the select's change handler with the option id. */
const pickFormWith = (page, id) => {
	const select = formSelect(page.renderRow(ADV));
	assert.ok(select, 'the advanced row must render the form select');
	select.props.onChange({ target: { value: id } });
};

/** The solid-colour presets: buttons whose title IS the colour they paint. */
const solidChips = (nodes) => findAll(nodes, (node) => node.tag === 'button'
	&& typeof node.props.title === 'string' && /^#[0-9a-f]{6}$/i.test(node.props.title)
	&& typeof node.props.style === 'object' && node.props.style !== null
	&& node.props.style.background === node.props.title);

/** The recent-wallpaper thumbnails: buttons carrying the shared apply wording. */
const historyThumbs = (nodes) => findAll(nodes, (node) => node.tag === 'button'
	&& node.props.title === 'background.historyApply');

/** Every button on the panel that clears the wallpaper — under EITHER wording. */
const clearEntries = (nodes) => findAll(nodes, (node) => node.tag === 'button'
	&& (firstText([node]) === 'bg2.remove' || firstText([node]) === 'background.remove'));

/**
 * The state → form table. Each row is a STORE state and the form it reads as; the
 * positive case and mutation ⑭ both run this table, so a broken derivation is
 * named by the same line the passing case asserted.
 */
const FORM_TABLE = [
	{ patch: { kind: 'image', gradient: null, rotation: Object.assign({}, ROTATION) }, want: 'fixed', why: 'a local file' },
	{ patch: { kind: 'url', url: 'https://example.com/w.jpg', rotation: Object.assign({}, ROTATION) }, want: 'fixed', why: 'a link with the rotation switch off' },
	{ patch: { kind: 'url', url: 'https://example.com/w.jpg', rotation: Object.assign({}, ROTATION, { on: true }) }, want: 'rotation', why: 'kind=url with the rotation switch ON — the derived fourth form' },
	{ patch: { kind: 'gradient', gradient: null, rotation: Object.assign({}, ROTATION) }, want: 'gradient', why: 'the gradient kind with nothing chosen yet' },
	{ patch: { kind: 'gradient', gradient: PRESET_GRADIENT, rotation: Object.assign({}, ROTATION) }, want: 'gradient', why: 'a real gradient' },
	{ patch: { kind: 'gradient', gradient: solidGradient('#3b0764'), rotation: Object.assign({}, ROTATION) }, want: 'solid', why: 'a same-colour two-stop gradient IS the solid form' },
	{ patch: { kind: 'gradient', gradient: solidGradient('#F5F3EE'), rotation: Object.assign({}, ROTATION) }, want: 'solid', why: 'the colour test does not depend on case' }
];

/** Everything wrong with the derived form — empty when every state reads as it is. */
const formTableProblems = (page) => {
	const problems = [];
	for (const row of FORM_TABLE) {
		page.setState(ADV, row.patch);
		const select = formSelect(page.renderRow(ADV));
		const got = select === null ? '(no select at all)' : select.props.value;
		if (got !== row.want) problems.push(row.why + ': the selector reads "' + got + '", the stored state IS "' + row.want + '"');
	}
	return problems;
};

/**
 * One recent entry per form: a preset gradient, a solid colour, a link and a photo —
 * the four buckets a five-entry list can hold.
 */
const HISTORY_ENTRIES = [
	{ kind: 'gradient', value: PRESET_GRADIENT },
	{ kind: 'gradient', value: solidGradient('#3b0764') },
	{ kind: 'url', value: 'https://example.com/history.jpg' },
	{ kind: 'image', value: 'data:image/png;base64,QUJD' }
];

/** The entries each form may show, as the CSS each thumbnail paints. */
const HISTORY_TABLE = [
	{ patch: { kind: 'gradient', gradient: PRESET_GRADIENT, rotation: Object.assign({}, ROTATION) }, want: [PRESET_GRADIENT], why: 'the gradient form' },
	{ patch: { kind: 'gradient', gradient: solidGradient('#3b0764'), rotation: Object.assign({}, ROTATION) }, want: [solidGradient('#3b0764')], why: 'the solid form' },
	{ patch: { kind: 'url', url: 'https://example.com/history.jpg', rotation: Object.assign({}, ROTATION) }, want: ['url("https://example.com/history.jpg") center/cover no-repeat'], why: 'the fixed-link form' },
	{ patch: { kind: 'url', url: 'https://example.com/history.jpg', rotation: Object.assign({}, ROTATION, { on: true }) }, want: ['url("https://example.com/history.jpg") center/cover no-repeat'], why: 'the rotation form (its pool entries are links)' },
	{ patch: { kind: 'image', hasImage: true, rotation: Object.assign({}, ROTATION) }, want: ['url("data:image/png;base64,QUJD") center/cover no-repeat'], why: 'the local-file form' }
];

/** Everything wrong with the recent strip — empty when each form sees only its own entries. */
const historyProblems = (page) => {
	const problems = [];
	for (const row of HISTORY_TABLE) {
		page.setState(ADV, row.patch);
		const got = historyThumbs(page.renderRow(ADV)).map((node) => node.props.style.background);
		if (got.join(' | ') !== row.want.join(' | ')) problems.push(row.why + ': the strip shows ' + JSON.stringify(got) + ', expected ' + JSON.stringify(row.want));
	}
	return problems;
};

/** Everything wrong with the clear entry — empty when the panel has exactly one. */
const clearProblems = (nodes) => {
	const keys = clearEntries(nodes).map((node) => firstText([node]));
	const problems = [];
	if (keys.length !== 1) problems.push(keys.length + ' clear entries (' + (keys.join(', ') || 'none') + '): one user decision gets one entry');
	if (keys.length === 1 && keys[0] !== 'bg2.remove') problems.push('the clear entry reads "' + keys[0] + '", expected the shared 清除壁纸 wording');
	return problems;
};

test('w6a: the background form is DERIVED — four forms out of the same three stored values', () => {
	const page = buildSettingsPage({});
	assert.deepEqual(formOptionIds(page.renderRow(ADV)), ['solid', 'gradient', 'fixed', 'rotation'],
		'the design\'s four forms, in the design\'s order');
	assert.deepEqual(formTableProblems(page), [],
		'every state reads as the form it IS: solid and gradient split the gradient kind, the rotation switch makes the fourth');

	// The claim behind the whole derivation: NOTHING was added to the store to
	// carry it. The field set is the one W1 recorded, read through the fixture.
	assert.deepEqual(Object.keys(page.stateOf(ADV)).sort(), [
		'autodim', 'fit', 'gradient', 'hasImage', 'kind', 'posX', 'posY',
		'refreshHours', 'refreshOn', 'revision', 'rotation', 'url', 'zoom'
	], 'the advanced row store gained no field: the form is computed from kind + gradient + rotation.on');
});

test('w6a: picking a form writes exactly the state that form IS, and the selector reads it back', () => {
	const page = buildSettingsPage({});
	const read = () => formSelect(page.renderRow(ADV)).props.value;

	pickFormWith(page, 'solid');
	assert.equal(page.stateOf(ADV).kind, 'gradient', '纯色背景 is the gradient kind (A1: no fourth kind)');
	assert.equal(page.stateOf(ADV).gradient, solidGradient('#0b1120'), 'and its value is a same-colour two-stop gradient');
	assert.equal(read(), 'solid', 'the selector reads the state back, it does not remember the click');

	pickFormWith(page, 'gradient');
	assert.match(page.stateOf(ADV).gradient, /^linear-gradient\(135deg, /,
		'a solid value cannot stay when the user asks for 渐变色: it would derive back to 纯色, so a real gradient is written');
	assert.equal(solidChips(page.renderRow(ADV)).length, 0, 'and the row is a gradient form now, not a solid one');
	assert.equal(read(), 'gradient');

	pickFormWith(page, 'fixed');
	assert.equal(page.stateOf(ADV).kind, 'url', 'a fixed picture needs one of its two kinds, and the link is the default one');
	assert.equal(read(), 'fixed');

	// 轮播 without a pool: the action refuses (alert + no write), and the row keeps
	// saying what the state really is instead of pretending the click worked.
	assert.notEqual(read(), 'rotation', 'nothing armed, so nothing reads as a rotation');
});

test('w6a: a REFUSED rotation arms nothing and leaves the reason on the row, not only in an alert', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg', rotation: Object.assign({}, ROTATION, { urls: [] }) });
	assert.equal(formSelect(page.renderRow(ADV)).props.value, 'fixed');

	page.clearHookCalls();
	pickFormWith(page, 'rotation');
	const hookKey = page.hookCalls[0] && page.hookCalls[0].hook;
	assert.equal(typeof hookKey, 'string', 'picking a form that cannot arm must write a view-state cell: ' + JSON.stringify(page.hookCalls));
	assert.deepEqual(page.hookCalls.map((call) => call.value), [null, 'bg2.rotationNeedTwo'],
		'the reason is the SAME sentence the action would have alerted, kept on the row');
	assert.equal(page.stateOf(ADV).rotation.on, false, 'and nothing was armed: one link is not a rotation');

	// The state drives the DOM: a page whose cell holds the reason RENDERS it, in the
	// error colour the other in-place warnings use.
	const refused = buildSettingsPage({ hookInitials: { [hookKey]: 'bg2.rotationNeedTwo' } });
	refused.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg', rotation: Object.assign({}, ROTATION, { urls: [] }) });
	const row = refused.renderRow(ADV);
	assert.ok(textOf(row).includes('bg2.rotationNeedTwo'), 'the row has to SAY why the slideshow did not start');
	const line = findOne(row, (node) => node.tag === 'div' && textOf([node]) === 'bg2.rotationNeedTwo');
	assert.equal(line.props.style.color, 'var(--dsw-alias-state-error-primary)',
		'the reason is an error, so it wears the error colour rather than a neutral hint');

	// Once the pool can carry a rotation, the same click arms it. The pool is written
	// through the ACTION, because that is what the click will read (storage, not the store).
	page.actionsOf(ADV).setRotationList('https://a.jpg\nhttps://b.jpg');
	assert.equal(page.stateOf(ADV).rotation.urls.length, 2, 'two links are stored');
	pickFormWith(page, 'rotation');
	assert.equal(page.stateOf(ADV).rotation.on, true, 'two links arm it');
	assert.equal(formSelect(page.renderRow(ADV)).props.value, 'rotation', 'and now the selector really does read 轮播图片');
});

test('w6a: the image source is ONE choice — link / local file under a fixed picture, the pool under a rotation', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg', rotation: Object.assign({}, ROTATION) });
	let row = page.renderRow(ADV);
	assert.deepEqual(pressedChips(row).filter(([key]) => key === 'bg2.url' || key === 'bg2.local'),
		[['bg2.url', true], ['bg2.local', false]], 'a fixed link shows the source pair, with the link pressed');
	assert.ok(!pressedChips(row).some(([key]) => key === 'bg2.gradient'), 'and no third chip: the OTHER forms are the selector\'s job now');

	chipByText(row, 'bg2.local').props.onClick();
	assert.equal(page.stateOf(ADV).kind, 'image', '本地图片 IS the image kind');
	assert.equal(formSelect(page.renderRow(ADV)).props.value, 'fixed', 'the form does not move: both sources are a fixed picture');
	chipByText(page.renderRow(ADV), 'bg2.url').props.onClick();
	assert.equal(page.stateOf(ADV).kind, 'url', 'and switching back is the same single choice');

	// A rotation has its own pool, so the fixed pair is NOT offered there: one
	// picture source per form, never two.
	page.setState(ADV, { rotation: Object.assign({}, ROTATION, { on: true }) });
	row = page.renderRow(ADV);
	assert.equal(chipByText(row, 'bg2.local'), null, 'under 轮播图片 there is no "local image" source');
	assert.deepEqual(pressedChips(row).filter(([key]) => key.startsWith('bg2.rotationSource')),
		[['bg2.rotationSourceLinks', true], ['bg2.rotationSourceFolder', false]], 'the pool choice is the rotation\'s own');
});

test('w6a: the whole section has exactly ONE clear entry, and the action of the one that left stays on its bag', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	page.setState('dream-skin-wallpaper', { url: 'data:image/png;base64,QUJD' });

	const section = page.renderSection();
	assert.deepEqual(clearProblems(section), [], 'one danger button, and it is 清除壁纸');
	assert.ok(!textOf(section).includes('background.remove'),
		'the removed wording is gone from the panel too — the key was dropped in all eight dictionaries');

	// The image row is a PICKER now. Its clear entry used a different action with a
	// different outcome (it left url / gradient / kind behind), which is exactly why
	// two buttons that both read "remove the picture" had to become one.
	const wallpaperRow = page.renderRow('dream-skin-wallpaper');
	assert.deepEqual(findAll(wallpaperRow, (node) => node.tag === 'button').map((node) => firstText([node])),
		['background.choose'], 'the image row offers its file picker and nothing else');
	const bag = page.actionsOf('dream-skin-wallpaper');
	assert.equal(typeof bag.setWallpaper, 'function', 'the action the second entry called is still on the bag');
	assert.equal(typeof bag.clearWallpaper, 'function', 'and so is the one the surviving button uses');
});

test('w6a: the recent list shows only the entries the CURRENT form can paint', () => {
	const page = buildSettingsPage({ seed: { 'dsh-dream-skin:wallpaper-history': JSON.stringify(HISTORY_ENTRIES) } });
	assert.deepEqual(historyProblems(page), [], 'four buckets, one strip: each form sees its own entries and only those');

	// ONE strip, not one per form: whatever the form, the wording prints once.
	for (const row of HISTORY_TABLE) {
		page.setState(ADV, row.patch);
		const rendered = page.renderRow(ADV);
		assert.equal(findAll(rendered, (node) => node.tag === '#text' && node.text === 'background.history').length, 1,
			row.why + ': exactly one 最近使用 line');
	}

	// The thumbnails are the apply entry, so a click has to reach the same action the
	// image row used — one implementation, two bags.
	page.setState(ADV, { kind: 'image', hasImage: true, rotation: Object.assign({}, ROTATION) });
	const thumbs = historyThumbs(page.renderRow(ADV));
	assert.equal(thumbs.length, 1, 'the local-file form shows the photo');
	thumbs[0].props.onClick();
	assert.equal(page.stateOf(ADV).kind, 'image', 'applying a history entry keeps the kind it was recorded with');
});

test('w6a: each form renders its own control set, and none of the other forms\'', () => {
	const page = buildSettingsPage({});
	// 纯色背景: preset colours + the system picker, and no image controls at all.
	page.setState(ADV, { kind: 'gradient', gradient: solidGradient('#0b1120'), rotation: Object.assign({}, ROTATION), hasImage: false });
	let row = page.renderRow(ADV);
	assert.equal(solidChips(row).length, 6, 'six preset colours');
	assert.deepEqual(solidChips(row).filter((node) => node.props['aria-pressed'] === true).map((node) => node.props.title), ['#0b1120'],
		'the stored colour is the pressed preset');
	assert.equal(inputTypes(row).filter((type) => type === 'color').length, 1, 'and the system colour picker beside them');
	assert.equal(gradientChips(row).length, 0, 'a solid colour is not offered the gradient presets');
	assert.ok(!textOf(row).includes('bg2.fill'), 'a solid colour has no intrinsic size, so there is no fill choice');
	assert.equal(chipByText(row, 'bg2.local'), null, 'and no image source');
	assert.equal(findOne(row, (node) => node.tag === 'input' && node.props.type === 'url'), null, 'nor a link box');

	// 渐变色: the preset stack, and no solid palette.
	page.setState(ADV, { gradient: PRESET_GRADIENT });
	row = page.renderRow(ADV);
	assert.equal(gradientChips(row).length, 6, 'six shipped gradients');
	assert.equal(solidChips(row).length, 0, 'and no solid palette');
	assert.equal(inputTypes(row).filter((type) => type === 'color').length, 0, 'no colour picker either');

	// 固定图片 (link): a picture, so fill + framing come back.
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	row = page.renderRow(ADV);
	assert.ok(textOf(row).includes('bg2.fill'), 'a picture HAS an intrinsic size, so the fill choice is offered');
	assert.deepEqual(rangeInputs(row).map((node) => firstText([node.parent.children[0]])), ['bg2.frameX', 'bg2.frameY', 'bg2.frameZoom'],
		'and the framing group, because a stored URL is a picture');
	assert.equal(solidChips(row).length + gradientChips(row).length, 0, 'no colour controls on a picture');

	// 轮播图片: the pool editor is the rotation's, and the fill/framing still apply.
	page.setState(ADV, { rotation: Object.assign({}, ROTATION, { on: true }) });
	row = page.renderRow(ADV);
	assert.equal(chipByText(row, 'bg2.rotationSourceLinks').props['aria-pressed'], true, 'the pool choice mirrors rotation.source');
	assert.ok(findOne(row, (node) => node.tag === 'textarea'), 'and the link list is where the pool is edited');
	assert.equal(solidChips(row).length + gradientChips(row).length, 0);
});

test('mutation: a solid test that cannot recognise its own value reddens the derivation', () => {
	const anchor = '\t\t\tconst color = m[1].toLowerCase();\n\t\t\treturn color === m[2].toLowerCase() ? color : null;';
	assert.equal(countOf(CODE, anchor), 1, 'the solid-colour comparison must occur exactly once: ' + JSON.stringify(anchor));
	const mutated = CODE.replace(anchor, '\t\t\treturn null;');
	assert.notEqual(mutated, CODE, 'mutation ⑭ has to change the bundle');

	assert.deepEqual(formTableProblems(buildSettingsPage({})), [], 'control: every state reads as its form');
	const problems = formTableProblems(buildSettingsPage({ code: mutated }));
	assert.ok(problems.length >= 2, 'mutation expected: both solid rows lose their form, got: ' + JSON.stringify(problems));
	assert.match(problems[0], /^a same-colour two-stop gradient IS the solid form: the selector reads "gradient"/,
		'and the defect names the solid row it broke');
});

test('mutation: a derivation that forgets the rotation switch reddens the form table', () => {
	const anchor = '\t\t\tif (kind === "url" && rotationOn) return "rotation";';
	assert.equal(countOf(CODE, anchor), 1, 'the rotation branch must occur exactly once');
	const mutated = CODE.replace(anchor, '');
	assert.notEqual(mutated, CODE, 'mutation ⑮ has to change the bundle');

	assert.deepEqual(formTableProblems(buildSettingsPage({})), [], 'control: the rotation switch is what makes 轮播图片');
	const problems = formTableProblems(buildSettingsPage({ code: mutated }));
	assert.deepEqual(problems, ['kind=url with the rotation switch ON — the derived fourth form: the selector reads "fixed", the stored state IS "rotation"'],
		'mutation expected: the fourth form collapses into 固定图片, which is exactly the regression this table forbids');
});

test('mutation: putting the second clear entry back reddens the single-clear case', () => {
	const anchor = '\t\t\t\t\t\t\t\tchildren: t("background.choose")\n\t\t\t\t\t\t\t}),';
	assert.equal(countOf(CODE, anchor), 1, 'the image row\'s picker anchor must occur exactly once');
	const mutated = CODE.replace(anchor, '\t\t\t\t\t\t\t\tchildren: t("background.choose")\n' +
		'\t\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("button", {\n' +
		'\t\t\t\t\t\t\t\ttype: "button",\n' +
		'\t\t\t\t\t\t\t\tstyle: { ...styles.button, ...styles.buttonDanger },\n' +
		'\t\t\t\t\t\t\t\tonClick: () => setWallpaper(null),\n' +
		'\t\t\t\t\t\t\t\tchildren: t("background.remove")\n' +
		'\t\t\t\t\t\t\t}),');
	assert.notEqual(mutated, CODE, 'mutation ⑯ has to change the bundle');

	const control = buildSettingsPage({});
	control.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	control.setState('dream-skin-wallpaper', { url: 'data:image/png;base64,QUJD' });
	assert.deepEqual(clearProblems(control.renderSection()), [], 'control: one clear entry on the shipped panel');

	const broken = buildSettingsPage({ code: mutated });
	broken.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	broken.setState('dream-skin-wallpaper', { url: 'data:image/png;base64,QUJD' });
	const problems = clearProblems(broken.renderSection());
	assert.equal(problems.length, 1, 'mutation expected: two clear entries again, got: ' + JSON.stringify(problems));
	assert.match(problems[0], /^2 clear entries \(background\.remove, bg2\.remove\)/,
		'and the defect names both entries — the duplicate this round removed');
});

test('mutation: dropping the history filter reddens the recent-list case', () => {
	const anchor = '\t\t\tconst historyForForm = readWallpaperHistory().filter((entry) => historyMatchesForm(entry, form, kind));';
	assert.equal(countOf(CODE, anchor), 1, 'the filtered history read must occur exactly once');
	const mutated = CODE.replace(anchor, '\t\t\tconst historyForForm = readWallpaperHistory();');
	assert.notEqual(mutated, CODE, 'mutation ⑰ has to change the bundle');

	const control = buildSettingsPage({ seed: { 'dsh-dream-skin:wallpaper-history': JSON.stringify(HISTORY_ENTRIES) } });
	assert.deepEqual(historyProblems(control), [], 'control: every form sees only its own entries');

	const broken = buildSettingsPage({ code: mutated, seed: { 'dsh-dream-skin:wallpaper-history': JSON.stringify(HISTORY_ENTRIES) } });
	const problems = historyProblems(broken);
	assert.ok(problems.length >= 3, 'mutation expected: the forms stop discriminating, got: ' + JSON.stringify(problems));
	assert.match(problems[0], /^the gradient form: the strip shows /,
		'and the defect names the form it looked at first');
	assert.ok(problems[0].includes('data:image/png;base64,QUJD'), 'the strip really does show the photo under a gradient form');
});

// ---------------------------------------------------------------------------
// 14. W6b: the picture sub-blocks — two folds, two shared blocks, one wording
//
// The design draws S1 (填充方式) and S2 (位置与缩放) as blocks SHARED by both
// picture forms, and folds 轮播设置 / 位置与缩放 away when the user is not using
// them. Both halves are only observable through the tree, so the cases below read
// the fold toggles (announced state + MOUNTED body) and the controls INSIDE them,
// and the mutation legs at the end break the announced state, the form coverage,
// the fold's default and one action wiring, one at a time.
// ---------------------------------------------------------------------------

/**
 * Every fold toggle under `nodes`, in document order. Found by SHAPE, not by one attribute: a fold
 * is a button that either announces `aria-expanded` or opens with the caret glyph. A lost attribute
 * must still be findable, or the mutation that drops it would read as "no folds at all".
 */
const CARETS = '\u25be\u25b8';
const isFoldToggle = (node) => node.tag === 'button'
	&& (Object.prototype.hasOwnProperty.call(node.props, 'aria-expanded')
		|| (node.children.length >= 1 && node.children[0].tag === 'span' && CARETS.includes(firstText([node.children[0]]) || '')));
const foldTogglesOf = (nodes) => findAll(nodes, isFoldToggle);

/** The body a fold mounts while open, or null while it is closed. */
const foldBody = (toggle) => (toggle.parent !== null && toggle.parent.children.length === 2 ? toggle.parent.children[1] : null);

/**
 * Everything wrong with one row's folds: which titles appear (in order), that each announces the
 * state the shared cell was pinned to (`open`), that the announced state and the mounted body are
 * ONE fact, and that the caret is decoration.
 */
const subFoldProblems = (row, expected, open) => {
	const wantOpen = open !== false;
	const toggles = foldTogglesOf(row);
	const problems = [];
	const titles = toggles.map(titleText);
	if (titles.join(' | ') !== expected.join(' | ')) {
		problems.push('the row folds [' + titles.join(', ') + '], expected [' + expected.join(', ') + ']');
	}
	for (const toggle of toggles) {
		const name = titleText(toggle);
		const announced = toggle.props['aria-expanded'];
		if (typeof announced !== 'boolean') {
			problems.push(name + ': the fold does not announce its state (aria-expanded is ' + JSON.stringify(announced) + ')');
			continue;
		}
		if (announced !== wantOpen) problems.push(name + ': ' + (wantOpen ? 'starts closed' : 'starts open') + ', but the fold has no persisted state');
		const mounted = foldBody(toggle) !== null;
		if (announced !== mounted) problems.push(name + ': says aria-expanded=' + announced + ' while the body is ' + (mounted ? 'mounted' : 'not mounted'));
		const caret = toggle.children[0];
		if (caret === undefined || caret.props['aria-hidden'] !== true) problems.push(name + ': the caret is not aria-hidden');
	}
	return problems;
};

/** The two picture forms the shared blocks have to appear in, and the state that puts a page in each. */
const PICTURE_FORMS = [
	['固定图片', { rotation: Object.assign({}, ROTATION) }],
	['轮播图片', { rotation: Object.assign({}, ROTATION, { on: true }) }]
];

/** S1's three chips, in the order the design lists them. */
const FILL_KEYS = ['bg2.fillCover', 'bg2.fillContain', 'bg2.fillBlur'];

/**
 * Everything wrong with the shared S1 / S2 blocks: present under BOTH picture forms, mirroring the
 * store, and reaching the SAME row actions with the same arguments. The action bag is spied on
 * before the renders, so "same action" is observed as a call rather than inferred from a prop name.
 */
const sharedBlockProblems = (page) => {
	const problems = [];
	const calls = [];
	const bag = page.actionsOf(ADV);
	for (const name of ['setFit', 'setFrameX', 'setFrameY', 'setFrameZoom', 'resetFrame']) {
		bag[name] = (...args) => { calls.push([name].concat(args)); };
	}
	for (const [formName, patch] of PICTURE_FORMS) {
		page.setState(ADV, Object.assign({ kind: 'url', url: 'https://example.com/w.jpg', fit: 'cover', posX: -20, posY: 30, zoom: 150 }, patch));
		const row = page.renderRow(ADV);
		const chips = FILL_KEYS.map((key) => chipByText(row, key));
		const sliders = rangeInputs(row);
		const labels = sliders.map((node) => firstText([node.parent.children[0]]));
		if (chips.some((node) => node === null)) {
			problems.push(formName + ': S1 (填充方式) is not offered');
			continue;
		}
		const pressed = chips.map((node) => node.props['aria-pressed']);
		if (pressed.join('|') !== 'true|false|false') problems.push(formName + ': S1 does not mirror the stored fit (' + pressed.join('|') + ')');
		if (labels.join('|') !== 'bg2.frameX|bg2.frameY|bg2.frameZoom') {
			problems.push(formName + ': S2 (位置与缩放) is not offered (sliders: ' + JSON.stringify(labels) + ')');
			continue;
		}
		const values = sliders.map((node) => node.props.value);
		if (values.join('|') !== '-20|30|150') problems.push(formName + ': S2 does not mirror the stored framing (' + values.join('|') + ')');
		const before = calls.length;
		chips[1].props.onClick();
		sliders[0].props.onChange({ target: { value: '-35' } });
		const got = JSON.stringify(calls.slice(before));
		if (got !== JSON.stringify([['setFit', 'contain'], ['setFrameX', -35]])) {
			problems.push(formName + ': the shared blocks do not reach the row actions (' + got + ')');
		}
	}
	return problems;
};

test('w6b: the framing sub-block is its own fold, open by default and mounted inside the row', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	const row = page.renderRow(ADV);
	assert.deepEqual(subFoldProblems(row, ['bg2.title', 'bg2.frame']), [],
		'fixed picture: the block and its 位置与缩放 sub-block are two folds, in reading order');
	const frame = foldTogglesOf(row)[1];
	const body = foldBody(frame);
	assert.deepEqual(body === null ? [] : rangeInputs([body]).map((node) => firstText([node.parent.children[0]])),
		['bg2.frameX', 'bg2.frameY', 'bg2.frameZoom'],
		'the three framing sliders are INSIDE the fold, so folding really hides them');

	// The click writes the fold's OWN cell — that is what makes two folds in one row two switches.
	page.clearHookCalls();
	frame.props.onClick();
	assert.deepEqual(page.hookCalls.map((call) => call.value), [false], 'the framing toggle asks for the closed state');

	// The state drives the DOM: a page whose cell starts closed mounts nothing in either fold.
	const closed = buildSettingsPage({ hookInitials: { 'Foldable#0': false } });
	closed.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	const folded = closed.renderRow(ADV);
	assert.deepEqual(subFoldProblems(folded, ['bg2.title'], false), [],
		'closed: the outer fold says so and mounts nothing, which is why the inner one is gone with it');
	assert.deepEqual(rangeInputs(folded), [], 'closed: the framing controls are unmounted, not merely clipped');
	assert.equal(chipByText(folded, 'bg2.fillCover'), null, 'closed: so is the fill choice in the block body');
});

test('w6b: 轮播设置 is its own fold, and the pool editor stays outside it', () => {
	const page = buildSettingsPage({});
	page.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg', refreshOn: true, refreshHours: 6, rotation: Object.assign({}, ROTATION, { on: true }) });
	const row = page.renderRow(ADV);
	assert.deepEqual(subFoldProblems(row, ['bg2.title', 'bg2.frame', 'bg2.rotationSettings']), [],
		'轮播图片: the block, 位置与缩放 and 轮播设置 are three folds, in reading order');
	const body = foldBody(foldTogglesOf(row)[2]);
	const boxes = body === null ? [] : numberInputs([body]);
	assert.equal(boxes.length, 1, 'the interval box is inside 轮播设置');
	assert.deepEqual([boxes.length === 0 ? null : boxes[0].props.min, boxes.length === 0 ? null : boxes[0].props.max], [5, 10080],
		'and it is still the minutes box (5..10080), so the row contract is intact');
	assert.ok(findOne(body === null ? [] : [body], (node) => node.tag === 'button' && firstText([node]) === 'bg2.rotationRandom'),
		'the order chips are inside the fold with it');
	// The pool editor is NOT folded away: it is where the second link comes from.
	assert.ok(findOne(row, (node) => node.tag === 'textarea'), 'the link list stays outside the fold');
	assert.equal(numberInputs(row).length, 2, 'the refresh box stays outside too, so the row counts two number boxes');
});

test('w6b: S1 and S2 are ONE implementation under both picture forms, with the same actions', () => {
	const page = buildSettingsPage({});
	assert.deepEqual(sharedBlockProblems(page), [],
		'the fill choice and the framing group mirror the store and reach the same actions under 固定图片 and 轮播图片');
});

test('w6b: the sub-block titles are one dictionary key each, added in all eight languages', () => {
	const LANGS = ['zh', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'ru'];
	const titles = ['bg2.fill', 'bg2.frame', 'bg2.rotationSettings'];
	for (const lang of LANGS) {
		const start = CODE.indexOf('const ' + lang + ' = {');
		assert.notEqual(start, -1, 'dictionary ' + lang + ' is defined');
		const body = CODE.slice(start, CODE.indexOf('};', start));
		for (const key of titles) {
			assert.ok(body.includes('"' + key + '":'), lang + ' has no copy for the sub-block title "' + key + '"');
		}
	}
	for (const key of titles) {
		assert.equal(countOf(CODE, 't("' + key + '")'), 1,
			'"' + key + '" is looked up exactly once — a sub-block and its title are one thing');
	}
});

test('mutation: dropping the shared aria-expanded reddens BOTH sub-block folds', () => {
	const anchor = '\n\t\t\t\t\t\t"aria-expanded": open,';
	assert.equal(countOf(CODE, anchor), 1, 'the fold toggle aria anchor must occur exactly once: ' + JSON.stringify(anchor));
	const mutated = CODE.replace(anchor, '');
	assert.notEqual(mutated, CODE, 'mutation ⑱ has to change the bundle');

	const control = buildSettingsPage({});
	control.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	assert.deepEqual(subFoldProblems(control.renderRow(ADV), ['bg2.title', 'bg2.frame']), [],
		'control: the shipped folds announce their state');

	const broken = buildSettingsPage({ code: mutated });
	broken.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	assert.deepEqual(subFoldProblems(broken.renderRow(ADV), ['bg2.title', 'bg2.frame']), [
		'bg2.title: the fold does not announce its state (aria-expanded is undefined)',
		'bg2.frame: the fold does not announce its state (aria-expanded is undefined)'
	], 'mutation expected: the SHARED toggle goes silent, so the failure names every sub-block that rides on it');
});

test('mutation: framing that forgets the rotation form reddens the shared-block case', () => {
	const anchor = 'const showFraming = kind === "image" ? hasImage : kind === "url" ? Boolean(url) : false;';
	assert.equal(countOf(CODE, anchor), 1, 'the showFraming gate must occur exactly once');
	const mutated = CODE.replace(anchor, 'const showFraming = kind === "image" ? hasImage : Boolean(url) && !rotation.on;');
	assert.notEqual(mutated, CODE, 'mutation ⑲ has to change the bundle');

	assert.deepEqual(sharedBlockProblems(buildSettingsPage({})), [], 'control: S2 is mounted under both picture forms');
	assert.deepEqual(sharedBlockProblems(buildSettingsPage({ code: mutated })), [
		'轮播图片: S2 (位置与缩放) is not offered (sliders: [])'
	], 'mutation expected: the frame group survives under a fixed picture and disappears from the rotation form');
});

test('mutation: a fold that starts closed reddens the default-state case', () => {
	const anchor = 'const foldState = (0, _react.useState)(true);';
	assert.equal(countOf(CODE, anchor), 1, 'the fold default anchor must occur exactly once');
	const mutated = CODE.replace(anchor, 'const foldState = (0, _react.useState)(false);');
	assert.notEqual(mutated, CODE, 'mutation ⑳ has to change the bundle');

	const broken = buildSettingsPage({ code: mutated });
	broken.setState(ADV, { kind: 'url', url: 'https://example.com/w.jpg' });
	assert.deepEqual(subFoldProblems(broken.renderRow(ADV), ['bg2.title', 'bg2.frame']), [
		'the row folds [bg2.title], expected [bg2.title, bg2.frame]',
		'bg2.title: starts closed, but the fold has no persisted state'
	], 'mutation expected: a reload comes back collapsed — the open state is a view affordance, never persisted');
});

test('mutation: a shared slider wired to the wrong action reddens the shared-block case', () => {
	const anchor = 'Slider({ label: t("bg2.frameX"), value: x, min: WALLPAPER_POS_MIN, max: WALLPAPER_POS_MAX, step: 1, format: percent, onChange: setX })';
	assert.equal(countOf(CODE, anchor), 1, 'the horizontal framing slider line must occur exactly once');
	const mutated = CODE.replace(anchor, anchor.replace('onChange: setX', 'onChange: setY'));
	assert.notEqual(mutated, CODE, 'mutation ㉑ has to change the bundle');

	const problems = sharedBlockProblems(buildSettingsPage({ code: mutated }));
	assert.deepEqual(problems, [
		'固定图片: the shared blocks do not reach the row actions ([["setFit","contain"],["setFrameY",-35]])',
		'轮播图片: the shared blocks do not reach the row actions ([["setFit","contain"],["setFrameY",-35]])'
	], 'mutation expected: the horizontal slider drives the vertical offset — one action per control is what S2 shares');
});

