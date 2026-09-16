import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const publishWorkflow = readFileSync(
  new URL('../.github/workflows/preview-publish.yml', import.meta.url),
  'utf8'
);
const exposeArtifactAction = readFileSync(
  new URL('../.github/actions/expose-artifact-on-public-url/action.yml', import.meta.url),
  'utf8'
);
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('wrong-trigger misuse fails in the guard step, not at job level', () => {
  assert.doesNotMatch(
    publishWorkflow,
    /^\s*if:\s*github\.event_name\s*==\s*'workflow_run'\s*$/m
  );
  assert.match(
    publishWorkflow,
    /if \[ "\$EVENT_NAME" != "workflow_run" \]; then[\s\S]*?exit 1/
  );
  assert.match(
    readme,
    /Non-PR source runs and failed build runs\s+skip intentionally/
  );
});

test('publish workflow validates the untrusted artifact name against workflow_run metadata', () => {
  assert.match(
    publishWorkflow,
    /const artifacts = list\.data\.artifacts\.filter/
  );
  assert.match(publishWorkflow, /artifacts\.length !== 1/);
  assert.match(publishWorkflow, /context\.payload\.workflow_run\.head_sha/);
  assert.match(publishWorkflow, /commitSha !== expectedSha/);
  assert.match(publishWorkflow, /github\.rest\.pulls\.get/);
  assert.match(publishWorkflow, /pull_number: Number\(prNumber\)/);
  assert.match(publishWorkflow, /prResponse\.data\.head\.sha !== expectedSha/);
});

test('release cleanup failures fail the workflow instead of being swallowed', () => {
  assert.match(publishWorkflow, /delete_errors=0/);
  assert.match(
    publishWorkflow,
    /if ! gh release delete-asset "\$RELEASE_TAG" "\$asset"/
  );
  assert.match(
    publishWorkflow,
    /::error::Failed to delete release asset: \$asset/
  );
  assert.match(
    publishWorkflow,
    /if \[ "\$delete_errors" -ne 0 \]; then\s+exit 1\s+fi/
  );

  const cleanupBlock = publishWorkflow.match(
    /- name: Cleanup old artifacts[\s\S]*?- name: Post Playground preview button/
  )?.[0];
  assert.ok(cleanupBlock, 'Cleanup step not found');
  assert.doesNotMatch(cleanupBlock, /delete-asset[\s\S]*\|\| true/);
});

test('publish workflow validates release retention before uploading assets', () => {
  assert.match(
    publishWorkflow,
    /artifacts-to-keep must be a positive integer or 'keep-all'/
  );
  assert.match(publishWorkflow, /\[\[ "\$ARTIFACTS_TO_KEEP" =~ \^\[0-9\]\+\$ \]\]/);
  assert.match(publishWorkflow, /\[ "\$ARTIFACTS_TO_KEEP" -lt 1 \]/);
});


test('cleanup sorts release assets by the GitHub CLI createdAt field', () => {
  assert.doesNotMatch(publishWorkflow, /created_at/);
  assert.match(publishWorkflow, /createdAt/);
  assert.doesNotMatch(exposeArtifactAction, /created_at/);
  assert.match(exposeArtifactAction, /createdAt/);
});

const upgradeWarning = 'WordPress/action-wp-playground-pr-preview v3 is deprecated. Upgrade to v4; for built previews, update both build and publish workflow references. Migration guide: https://github.com/WordPress/action-wp-playground-pr-preview/blob/v4/README.md#upgrading-from-v3';

for (const entry of ['src/index.js', 'dist/index.js']) {
  test(`${entry} warns before validating inputs`, () => {
    const result = spawnSync(process.execPath, [new URL(`../${entry}`, import.meta.url).pathname], {
      encoding: 'utf8',
      env: { ...process.env, 'INPUT_GITHUB-TOKEN': '' },
    });
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes(`::warning::${upgradeWarning}`));
    assert.ok(result.stdout.includes('::error::GITHUB_TOKEN (or github-token input) is required'));
  });
}

for (const entry of [
  '.github/workflows/preview-build.yml',
  '.github/workflows/preview-publish.yml',
  '.github/actions/expose-artifact-on-public-url/action.yml',
]) {
  test(`${entry} emits a warning without failing`, () => {
    const yaml = readFileSync(new URL(`../${entry}`, import.meta.url), 'utf8');
    const warning = yaml.match(/- name: Warn about v3\n\s+shell: bash\n\s+run: \|\n\s+(echo [^\n]+)\n/);
    assert.ok(warning, 'Missing v3 warning step');
    const result = spawnSync('bash', ['-e', '-c', warning[1]], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), `::warning::${upgradeWarning}`);
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
