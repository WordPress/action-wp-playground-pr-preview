import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const marker = '<!-- wp-playground-preview-comment -->';

test('comment mode skips an earlier marker from another author', async () => {
  const result = await runAction({ comments: [
    { id: 10, user: { id: 202, type: 'User' }, body: marker },
    { id: 20, user: { id: 101, type: 'Bot' }, body: marker },
  ] });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.calls.filter(call => call.method === 'updateComment').map(call => call.comment_id), [20]);
  assert.equal(result.outputs['comment-id'], '20');
  assert.equal(result.calls.filter(call => call.method === 'createComment').length, 0);
});

for (const user of [{ id: 202, type: 'User' }, { id: 303, type: 'Bot' }, null]) {
  test(`comment mode creates a comment instead of changing a marker from ${user?.type || 'an unknown author'}`, async () => {
    const result = await runAction({ comments: [{ id: 10, user, body: marker }] });
    assert.deepEqual(result.errors, []);
    assert.equal(result.calls.filter(call => call.method === 'updateComment').length, 0);
    assert.equal(result.calls.filter(call => call.method === 'createComment').length, 1);
    assert.equal(result.outputs['comment-id'], '99');
  });
}

test('comment mode also matches the account behind a personal token', async () => {
  const result = await runAction({ viewerId: 202, comments: [
    { id: 10, user: { id: 101, type: 'Bot' }, body: marker },
    { id: 20, user: { id: 202, type: 'User' }, body: marker },
  ] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.outputs['comment-id'], '20');
});

test('matching authors still need the preview marker', async () => {
  const result = await runAction({ comments: [{ id: 10, user: { id: 101 }, body: 'Unrelated comment' }] });
  assert.equal(result.outputs['comment-id'], '99');
  assert.equal(result.calls.filter(call => call.method === 'updateComment').length, 0);
});

test('an unchanged preview comment is reused without an update', async () => {
  const first = await runAction();
  const body = first.calls.find(call => call.method === 'createComment').body;
  const result = await runAction({ comments: [{ id: 20, user: { id: 101 }, body }] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.outputs['comment-id'], '20');
  assert.equal(result.calls.filter(call => ['createComment', 'updateComment'].includes(call.method)).length, 0);
});

for (const viewerId of [null, undefined, 0, '101']) {
  test(`comment mode stops without writes when the token account ID is ${viewerId}`, async () => {
    const result = await runAction({ viewerId, body: '<!-- wp-playground-preview:start -->old<!-- wp-playground-preview:end -->' });
    assert.match(result.errors.join('\n'), /determine the comment author/);
    assert.equal(result.calls.filter(call => ['createComment', 'updateComment', 'updatePull'].includes(call.method)).length, 0);
  });
}

test('a failed token account lookup stops comment updates', async () => {
  const result = await runAction({ viewerError: new Error('Lookup failed') });
  assert.match(result.errors.join('\n'), /Lookup failed/);
  assert.equal(result.calls.filter(call => ['createComment', 'updateComment'].includes(call.method)).length, 0);
});

test('description mode does not need a comment author lookup', async () => {
  const result = await runAction({ inputs: { mode: 'append-to-description' }, viewerError: new Error('Not used') });
  assert.deepEqual(result.errors, []);
  assert.equal(result.calls.filter(call => call.method === 'graphql').length, 0);
  assert.equal(result.calls.filter(call => call.method === 'updatePull').length, 1);
});

for (const [title, expected] of [
  ['[x](https://example.test)', '&#91;x&#93;&#40;https&#58;&#47;&#47;example&#46;test&#41;'],
  ['![x](https://example.test)', '&#33;&#91;x&#93;&#40;https&#58;&#47;&#47;example&#46;test&#41;'],
  ['*bold* _italic_ ~~old~~ `code`', '&#42;bold&#42; &#95;italic&#95; &#126;&#126;old&#126;&#126; &#96;code&#96;'],
  ['# Heading\r\n- item\n1. step\t> quote', '&#35; Heading &#45; item 1&#46; step &#62; quote'],
  ['<img src="x"> &lt;x&gt;', '&#60;img src&#61;&#34;x&#34;&#62; &#38;lt&#59;x&#38;gt&#59;'],
  ['https://example.test www.example.test', 'https&#58;&#47;&#47;example&#46;test www&#46;example&#46;test'],
  ['\\[x](url)', '&#92;&#91;x&#93;&#40;url&#41;'],
  ['    indented  ', '    indented  '],
  ['Zażółć 😀', 'Zażółć 😀'],
]) {
  for (const mode of ['comment', 'append-to-description']) {
    test(`${mode} renders the title ${JSON.stringify(title)} as text`, async () => {
      const result = await runAction({ title, inputs: {
        mode, 'pr-number': '7',
        'comment-template': '**PR:** {{pr_title}}',
        'description-template': '**PR:** {{PR_TITLE}}',
      } });
      assert.deepEqual(result.errors, []);
      const posted = result.calls.find(call => call.method === (mode === 'comment' ? 'createComment' : 'updatePull'));
      assert.ok(posted.body.includes(`**PR:** ${expected.replace(/ /g, '&#32;')}`));
    });
  }
}

test('branch and repository placeholders use the same text escaping', async () => {
  const result = await runAction({ headRef: 'feature/`label`', baseRef: 'release_1', inputs: {
    'comment-template': '{{PR_HEAD_REF}} {{PR_BASE_REF}} {{REPO_FULL_NAME}}',
  } });
  assert.equal(result.outputs['rendered-comment'], 'feature&#47;&#96;label&#96; release&#95;1 example&#47;plugin');
});

test('template markup, URLs, the button, and code-formatted plugin slugs keep their existing form', async () => {
  const result = await runAction({ inputs: {
    'plugin-path': 'plugins/my-plugin',
    'comment-template': '**Preview** [Open]({{PLAYGROUND_URL}})\n{{PLAYGROUND_BUTTON}}\n`{{PLUGIN_SLUG}}`',
  } });
  assert.deepEqual(result.errors, []);
  const rendered = result.outputs['rendered-comment'];
  assert.ok(rendered.startsWith(`**Preview** [Open](${result.outputs['preview-url']})`));
  assert.ok(rendered.includes(`<a href="${result.outputs['preview-url']}"`));
  assert.match(rendered, /<img src="https:\/\/raw.githubusercontent.com\//);
  assert.ok(rendered.endsWith('`my-plugin`'));
});

async function runAction(options = {}) {
  const { comments = [], inputs = {}, body = '', title = 'Add a setting', headRef = 'feature', baseRef = 'main', viewerError } = options;
  const viewerId = Object.hasOwn(options, 'viewerId') ? options.viewerId : 101;
  const calls = [];
  const outputs = {};
  const errors = [];
  const record = (method, args) => calls.push({ method, ...JSON.parse(JSON.stringify(args)) });
  const github = {
    graphql: async query => {
      record('graphql', { query });
      if (viewerError) throw viewerError;
      return { viewer: { databaseId: viewerId } };
    },
    paginate: async (method, args) => { record('listComments', args); return comments; },
    rest: {
      issues: {
        listComments() {},
        updateComment: async args => { record('updateComment', args); },
        createComment: async args => { record('createComment', args); return { data: { id: 99 } }; },
      },
      pulls: {
        get: async args => { record('getPull', args); return { data: pr }; },
        update: async args => { record('updatePull', args); },
      },
    },
  };
  const core = {
    getInput: name => ({ 'github-token': 'test-token', mode: 'comment', 'plugin-path': '.', ...inputs })[name] || '',
    info() {}, warning() {},
    setOutput: (name, value) => { outputs[name] = value; },
    setFailed: message => { errors.push(message); },
  };
  const pr = { number: 7, title, body, head: { ref: headRef, sha: 'a'.repeat(40) }, base: { ref: baseRef } };
  const context = { payload: {
    repository: { owner: { login: 'example' }, name: 'plugin', full_name: 'example/plugin' },
    pull_request: inputs['pr-number'] ? undefined : pr,
  } };
  await runInNewContext(source, { require: name => {
    if (name === '@actions/core') return core;
    if (name === '@actions/github') return { context, getOctokit: () => github };
    throw new Error(`Unexpected module: ${name}`);
  } });
  return { calls, outputs, errors };
}
