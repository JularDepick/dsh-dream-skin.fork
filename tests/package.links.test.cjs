/**
 * dsh-dream-skin — a shipped document must not link to a file the tarball omits.
 *
 * The npm page renders the packaged README, so a repository-relative link to a
 * doc that is not in `files` is a 404 for anyone installing from the registry.
 * `tests/previews.test.cjs` already enforced this for `docs/previews`; issue #122
 * exposed that every other relative link had the same hole. This gate generalizes
 * the rule to every markdown file the package actually ships.
 *
 * What it does NOT claim: it does not prove an absolute URL is reachable, and it
 * does not police links inside fenced code blocks (those are samples, not links).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');

// npm publishes these regardless of `files`:
// https://docs.npmjs.com/cli/configuring-npm/package-json#files
const ALWAYS_SHIPPED = ['package.json', 'README.md', 'LICENSE', 'LICENCE'];

/** A `files` entry names either one file or a directory subtree. */
function entryMatcher(entry) {
	const clean = entry.replace(/^\.\//, '').replace(/\/$/, '');
	return (rel) => rel === clean || rel.startsWith(clean + '/');
}

function shippedPredicate(files) {
	const entries = files.map(entryMatcher);
	return (rel) => {
		const clean = rel.replace(/^\.\//, '');
		if (ALWAYS_SHIPPED.includes(clean)) return true;
		return entries.some((f) => f(clean));
	};
}

/** Every `.md` on disk that the declared `files` list would publish. */
function shippedMarkdown(files) {
	const ships = shippedPredicate(files);
	const out = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === 'node_modules' || entry.name === '.git') continue;
			const abs = path.join(dir, entry.name);
			const rel = path.relative(ROOT, abs).split(path.sep).join('/');
			if (entry.isDirectory()) walk(abs);
			else if (entry.name.endsWith('.md') && ships(rel)) out.push(rel);
		}
	};
	walk(ROOT);
	return out.sort();
}

/** Fenced blocks are samples; a `](...)` inside one is not a link. */
function stripFences(text) {
	const out = [];
	let fenced = false;
	for (const line of text.split('\n')) {
		if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
		if (!fenced) out.push(line);
	}
	return out.join('\n');
}

function relativeLinks(text) {
	const links = [];
	for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) links.push(m[1]);
	for (const m of text.matchAll(/(?:href|src)="([^"]+)"/g)) links.push(m[1]);
	return links;
}

/**
 * Relative links that a reader of the published package could not follow.
 * `relFile` is the markdown file's repo-relative path, so `./x` inside
 * `docs/themes-spec.md` resolves to `docs/x`, not to `x`.
 */
function unaddressableLinks(relFile, text, ships) {
	const problems = [];
	const dir = path.posix.dirname(relFile);
	for (const raw of relativeLinks(stripFences(text))) {
		if (/^(https?:|mailto:|#|data:)/.test(raw)) continue;
		const withoutAnchor = raw.split('#')[0];
		if (!withoutAnchor) continue;
		const resolved = path.posix
			.normalize(path.posix.join(dir === '.' ? '' : dir, withoutAnchor))
			.replace(/^\.\//, '');
		if (resolved.startsWith('../')) {
			problems.push(`${relFile}: "${raw}" leaves the package root`);
			continue;
		}
		if (!ships(resolved)) {
			problems.push(`${relFile}: "${raw}" resolves to ${resolved}, which package.json "files" does not ship — npm renders it as a 404`);
		}
	}
	return problems;
}

function allProblems(files = pkg.files) {
	const ships = shippedPredicate(files);
	const problems = [];
	let scanned = 0;
	const shippedDocs = shippedMarkdown(files);
	for (const rel of shippedDocs) {
		const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
		scanned += relativeLinks(stripFences(text)).filter(
			(r) => !/^(https?:|mailto:|#|data:)/.test(r) && r.split('#')[0]
		).length;
		problems.push(...unaddressableLinks(rel, text, ships));
	}
	return { problems, scanned, shippedDocs };
}

test('shipped documents: every relative link resolves to a file the tarball carries', () => {
	const { problems, scanned, shippedDocs } = allProblems();
	assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
	// Non-vacuous: the scan has to have seen real files and real relative links.
	assert.ok(shippedDocs.includes('README.md'), `README.md must be in the shipped markdown set, saw ${JSON.stringify(shippedDocs)}`);
	assert.ok(shippedDocs.length >= 2, `expected README plus at least one shipped doc, saw ${JSON.stringify(shippedDocs)}`);
	assert.ok(scanned > 0, 'the scan found no relative links at all — the extractor is broken, not the docs');
});

test('mutation: an unshipped relative target reddens, an absolute URL and a shipped target do not', () => {
	const ships = shippedPredicate(pkg.files);
	const unshipped = unaddressableLinks('README.md', '[x](./docs/desktop-support.md)', ships);
	assert.equal(unshipped.length, 1, 'a relative link to a doc outside `files` must be a problem');
	assert.match(unshipped[0], /does not ship/);
	assert.deepEqual(
		unaddressableLinks('README.md', '[x](https://github.com/RevolutionLA/dsh-dream-skin/blob/main/docs/desktop-support.md)', ships),
		[],
		'an absolute URL is always addressable, even when the target is not shipped'
	);
	assert.deepEqual(
		unaddressableLinks('README.md', '[x](./docs/themes-spec.md)', ships),
		[],
		'a relative link to a shipped file must stay green'
	);
	// Directory-relative resolution: `./examples/...` inside docs/ is docs/examples/.
	assert.deepEqual(
		unaddressableLinks('docs/themes-spec.md', '[x](./examples/sample-theme-pack.json)', ships),
		[],
		'resolution must be relative to the document, not to the repository root'
	);
});

test('the package ships runtime files and the Store archive, not maintainer-only docs', () => {
	const files = pkg.files;
	for (const kept of ['locale', 'icon.svg', 'lib/client.js', 'lib/index.js', 'docs/evidence/dsh-store-1411-followup-2026-10-15.md']) {
		assert.ok(files.includes(kept), `${kept} must stay in "files" — a reader depends on it`);
	}
	for (const removed of ['docs/i18n', 'docs/desktop-support.md', 'docs/publishing-to-npm.md', 'docs/design-philosophy.md', 'docs/computed-style-gate-in-ci.md']) {
		assert.ok(!files.includes(removed), `${removed} is maintainer-only; re-adding it inflates every install without serving the runtime`);
	}
});
