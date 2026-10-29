/**
 * dsh-dream-skin — the custom Range contract (PR #128).
 *
 * PR #128 replaced eight native sliders with one hand-written `Range`: a
 * transparent <input type="range"> over a painted rail/fill/thumb. A native
 * control gives keyboard, focus, and assistive-tech behaviour for free; once we
 * paint our own, every one of those is our responsibility. This file executes
 * the component function itself (React is stubbed) and pins:
 *
 *   1. the semantic elements survive (type=range, min/max/step/value,
 *      aria-valuetext, aria-label);
 *   2. a track click maps clientX to a value, a thumb drag does not jump, and
 *      dragging/releasing toggles `data-dragging`;
 *   3. a keyboard change (the input's own onChange) moves the painted position;
 *   4. the accessibility CSS exists (focus-visible outline, reduced motion,
 *      no transition while dragging) and each rule can fail;
 *   5. the wiring that makes the wallpaper preview work is `closest()` on the
 *      row marker, and every Slider call site still passes its range.
 *
 * Boundary: this is not a browser. It does not prove pixels, hit-testing in a
 * real layout, or touch scrolling. `touch-action: none` is a recorded trade-off
 * (CHANGELOG 10.30.0), not something this file can observe.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8');

// The component is hand-written, not minified, and sits between two stable
// neighbours. Slicing between them avoids a brace matcher that would have to
// understand template literals (`${...}`) inside the body.
const RANGE_START = '\t\tfunction Range(';
const SLIDER_START = '\t\tfunction Slider(';
const from = CODE.indexOf(RANGE_START);
const to = CODE.indexOf(SLIDER_START, from);
if (from < 0 || to < from) throw new Error('Range/Slider markers moved out of lib/client.js — this gate cannot name the component');

function loadRange() {
	const sandbox = {
		_react: { useRef: (initial) => ({ current: initial }) },
		react_jsx_runtime: {
			jsx: (type, props) => ({ type, props }),
			jsxs: (type, props) => ({ type, props })
		},
		styles: { range: {}, rangeRail: {}, rangeFill: {}, rangeThumb: {}, rangeInput: {} }
	};
	vm.createContext(sandbox);
	vm.runInContext(`${CODE.slice(from, to)}\nglobalThis.__Range = Range;`, sandbox, { filename: 'range-slice.js' });
	assert.equal(typeof sandbox.__Range, 'function', 'the slice must expose Range');
	return sandbox.__Range;
}

const Range = loadRange();

function walk(node, fn) {
	if (!node || typeof node !== 'object') return;
	fn(node);
	const kids = node.props && node.props.children;
	if (Array.isArray(kids)) kids.forEach((kid) => walk(kid, fn));
	else if (kids) walk(kids, fn);
}

function findAll(node, predicate) {
	const out = [];
	walk(node, (n) => { if (predicate(n)) out.push(n); });
	return out;
}

function render(props = {}) {
	const changes = [];
	const tree = Range({
		value: 50,
		min: 0,
		max: 100,
		step: 1,
		format: (v) => `${v}%`,
		onChange: (v) => changes.push(v),
		inputProps: { 'aria-label': '透明度' },
		...props
	});
	const wrappers = findAll(tree, (n) => n.props && n.props.className === 'dsh-dream-skin-range');
	const inputs = findAll(tree, (n) => n.type === 'input');
	assert.equal(wrappers.length, 1, 'exactly one wrapper');
	assert.equal(inputs.length, 1, 'exactly one native input');
	return { tree, wrapper: wrappers[0], input: inputs[0], changes };
}

function fakeDom() {
	const attrs = Object.create(null);
	const styleProps = Object.create(null);
	const style = { setProperty: (key, value) => { styleProps[key] = value; } };
	const parent = {
		style,
		setAttribute: (key, value) => { attrs[key] = value; },
		removeAttribute: (key) => { delete attrs[key]; }
	};
	const input = {
		value: '0',
		parentElement: parent,
		focus() { this.focused = true; },
		captured: null,
		setPointerCapture(id) { this.captured = id; },
		getBoundingClientRect() { return { left: 0, width: 200 }; }
	};
	return { input, parent, attrs, styleProps };
}

const event = (over = {}) => ({
	button: 0,
	isPrimary: true,
	pointerId: 7,
	buttons: 1,
	clientX: 0,
	prevented: false,
	preventDefault() { this.prevented = true; },
	...over
});

test('range: the native input keeps its semantics (type/min/max/step/value/aria)', () => {
	const { wrapper, input } = render();
	const p = input.props;
	assert.equal(p.type, 'range', 'the element is still a native range input');
	assert.equal(p.min, 0);
	assert.equal(p.max, 100);
	assert.equal(p.step, 1);
	assert.equal(p.value, 50);
	assert.equal(p['aria-label'], '透明度', 'the caller label survives the wrapper');
	assert.equal(p['aria-valuetext'], '50%', 'the formatted value is announced, not the raw number');
	assert.equal(wrapper.props.style['--range-position'], '50%', 'the painted position mirrors the value');
	const parts = findAll(wrapper, (n) => n.props && /^dsh-dream-skin-range-(rail|fill|thumb)$/.test(n.props.className || ''));
	assert.deepEqual(parts.map((n) => n.props.className), [
		'dsh-dream-skin-range-rail', 'dsh-dream-skin-range-fill', 'dsh-dream-skin-range-thumb'
	], 'rail, fill and thumb are all painted children of the wrapper');
});

test('range: a track click jumps, a thumb drag does not, and release clears data-dragging', () => {
	const { input, changes } = render();
	const dom = fakeDom();
	dom.input.value = '50'; // the controlled value React would have written

	input.props.onPointerDown(event({ clientX: 150, currentTarget: dom.input }));
	assert.equal(dom.input.focused, true, 'pointerdown focuses the input so keyboard keeps working');
	assert.equal(dom.input.captured, 7, 'the pointer is captured for the drag');
	assert.equal(changes.at(-1), 78, 'clientX 150 maps to 78 on a 200px track with a 10px inset');
	assert.equal(dom.styleProps['--range-position'], '78%', 'the painted fill/thumb follow the jump');

	input.props.onPointerMove(event({ clientX: 190, currentTarget: dom.input }));
	assert.equal(changes.at(-1), 100, 'dragging to the right edge clamps at max');
	assert.equal(dom.styleProps['--range-position'], '100%');

	const before = changes.length;
	input.props.onPointerUp(event({ currentTarget: dom.input }));
	assert.equal(dom.attrs['data-dragging'], undefined, 'release removes the drag marker');
	input.props.onPointerMove(event({ clientX: 60, buttons: 0, currentTarget: dom.input }));
	assert.equal(changes.length, before, 'a move after release changes nothing (the pointer was cleared)');
});

test('range: grabbing the thumb starts a drag without jumping to the cursor', () => {
	const { input, changes } = render();
	const dom = fakeDom();
	dom.input.value = '50'; // the controlled value React would have written

	// value 50 → thumb centre at 10 + 180 * 0.5 = 100 on a 200px track.
	input.props.onPointerDown(event({ clientX: 100, currentTarget: dom.input }));
	assert.equal(changes.length, 0, 'pressing the thumb must not emit a value change');
	assert.equal(dom.attrs['data-dragging'], '', 'the thumb press marks a drag in progress');

	input.props.onPointerMove(event({ clientX: 120, currentTarget: dom.input }));
	assert.equal(changes.at(-1), 61, 'moving 20px from the thumb centre moves the value by ~11');
});

test('range: a keyboard change (the input\'s onChange) moves the painted position', () => {
	const { input, changes } = render();
	const dom = fakeDom();
	dom.input.value = '30';
	input.props.onChange({ currentTarget: dom.input });
	assert.equal(changes.at(-1), 30, 'the arrow-key path reports the new value');
	assert.equal(dom.styleProps['--range-position'], '30%', 'the painted position follows the keyboard');
});

/** The accessibility rules the painting depends on. Each must be able to fail. */
function styleContractProblems(text) {
	const problems = [];
	const rules = text.split('\n').filter((line) => line.includes('.dsh-dream-skin-range'));
	const has = (predicate) => rules.some(predicate);
	if (!has((line) => line.includes('prefers-reduced-motion') && line.includes('transition: none'))) {
		problems.push('reduced-motion rule is gone — a user who asked for less motion gets animated sliders');
	}
	if (!has((line) => line.includes(':has(input:focus-visible)') && line.includes('outline'))) {
		problems.push('focus-visible outline is gone — the transparent input leaves no visible focus');
	}
	if (!has((line) => line.includes('[data-dragging]') && line.includes('transition: none'))) {
		problems.push('drag rule is gone — the fill/thumb lag behind the pointer while dragging');
	}
	return problems;
}

test('range: the accessibility CSS is present, and removing any rule reddens it', () => {
	assert.deepEqual(styleContractProblems(CODE), [], 'the shipped bundle satisfies the three rules');
	const rm = (needle) => CODE.split('\n').filter((line) => !line.includes(needle)).join('\n');
	assert.ok(styleContractProblems(rm('prefers-reduced-motion')).length >= 1, 'deleting the reduced-motion rule must be named');
	assert.ok(styleContractProblems(rm(':has(input:focus-visible)')).length >= 1, 'deleting the focus rule must be named');
	assert.ok(styleContractProblems(rm('[data-dragging]')).length >= 1, 'deleting the drag rule must be named');
});

test('range: eight sliders share the component and the preview marks the whole row', () => {
	const sliderCalls = CODE.match(/react_jsx_runtime\.jsx\)\(Slider, \{/g) || [];
	assert.equal(sliderCalls.length, 8, `expected 8 Slider call sites, found ${sliderCalls.length}`);
	assert.ok(CODE.includes('react_jsx_runtime.jsx)(Range, {'), 'Slider renders Range instead of a bare input');
	assert.ok(CODE.includes('"data-dsh-dream-skin-slider": ""'), 'the row carries the marker the preview needs');
	assert.ok(CODE.includes('closest("[data-dsh-dream-skin-slider]")'), 'the preview resolves the row, not the input wrapper');
	assert.ok(!/styles\.slider\b/.test(CODE), 'the retired native-slider style object is not referenced');
});
