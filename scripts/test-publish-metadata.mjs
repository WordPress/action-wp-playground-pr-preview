import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/preview-publish.yml', import.meta.url), 'utf8');

for (const spelling of ['7', '07', '007', '0'.repeat(100) + '7']) {
  test(`publish metadata uses PR 7 for artifact spelling ${spelling}`, async () => {
    const { outputs, lookups } = await identifyBundle(spelling);
    assert.deepEqual(lookups, [7]);
    assert.equal(outputs['pr-number'], '7');
    assert.equal(outputs['artifact-name'], `wp-playground-preview-pr${spelling}-${'a'.repeat(40)}`);
  });
}

for (const spelling of ['0', '000', '9007199254740993', '9'.repeat(400)]) {
  test(`publish metadata rejects PR number ${spelling.slice(0, 20)}`, async () => {
    await assert.rejects(identifyBundle(spelling), /positive safe integer/);
  });
}

test('zero-padded artifact numbers share release names and retention with PR 7', async () => {
  const { outputs } = await identifyBundle('007');
  const directory = mkdtempSync(join(tmpdir(), 'publish-number-'));
  try {
    mkdirSync(join(directory, 'bundle/zips'), { recursive: true });
    mkdirSync(join(directory, 'bin'));
    writeFileSync(join(directory, 'bundle/zips/plugin.zip'), 'zip bytes');
    writeFileSync(join(directory, 'bin/gh'), `#!/bin/bash
set -euo pipefail
if [ "$1 $2" = 'release view' ]; then
  [[ "$9" == *'startswith("pr-7-")'* ]]
  printf '%s\\n' "2026-09-12|pr-7-$COMMIT_SHA-plugin.zip" '2026-09-11|pr-7-old-plugin.zip'
elif [ "$1 $2" = 'release delete-asset' ]; then
  printf '%s\\n' "$4" >> "$RUNNER_TEMP/deleted"
else
  exit 1
fi
`, { mode: 0o755 });
    const env = {
      ...process.env, PATH: `${directory}/bin:${process.env.PATH}`,
      RUNNER_TEMP: directory, GITHUB_ENV: join(directory, 'env'),
      GITHUB_REPOSITORY: 'example/source', RELEASE_TAG: 'ci-artifacts',
      PR_NUMBER: outputs['pr-number'], COMMIT_SHA: outputs['commit-sha'], ARTIFACTS_TO_KEEP: '1',
    };
    for (const name of ['Prepare release assets', 'Cleanup old artifacts']) {
      const step = workflow.match(new RegExp(`- name: ${name}\\n[\\s\\S]*?run: \\|\\n([\\s\\S]*?)(?=\\n      - name:)`));
      assert.ok(step, `${name} step not found`);
      const result = spawnSync('bash', ['-c', step[1].replace(/^ {10}/gm, '')], {
        cwd: directory, env, encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(readFileSync(join(directory, `release-assets/pr-7-${env.COMMIT_SHA}-plugin.zip`), 'utf8'), 'zip bytes');
    assert.equal(readFileSync(join(directory, 'deleted'), 'utf8'), 'pr-7-old-plugin.zip\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function identifyBundle(spelling) {
  const step = workflow.match(/- name: Identify artifact bundle[\s\S]*?script: \|\n([\s\S]*?)(?=\n      - name:)/);
  assert.ok(step, 'Identify artifact bundle script not found');
  const sha = 'a'.repeat(40);
  const outputs = {};
  const lookups = [];
  const github = { rest: {
    actions: { listWorkflowRunArtifacts: async () => ({ data: { artifacts: [
      { id: 42, name: `wp-playground-preview-pr${spelling}-${sha}` },
    ] } }) },
    pulls: { get: async ({ pull_number }) => {
      assert.ok(Number.isSafeInteger(pull_number) && pull_number > 0, 'Invalid PR lookup');
      lookups.push(pull_number);
      return { data: { head: { sha } } };
    } },
  } };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('github', 'context', 'core', 'process', step[1].replace(/^ {12}/gm, ''))(
    github,
    { repo: { owner: 'example', repo: 'source' }, payload: { workflow_run: { head_sha: sha } } },
    { setOutput: (key, value) => { outputs[key] = value; } },
    { env: { SOURCE_RUN_ID: '123' } },
  );
  return { outputs, lookups };
}
