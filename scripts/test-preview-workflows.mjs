import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const publishWorkflow = readFileSync(
  new URL('../.github/workflows/preview-publish.yml', import.meta.url),
  'utf8'
);
const cleanupWorkflow = readFileSync(
  new URL('../.github/workflows/preview-cleanup.yml', import.meta.url),
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

test('cleanup workflow deletes all assets for the PR on close', () => {
  assert.match(cleanupWorkflow, /startswith\(\\"pr-\$PR_NUMBER-\\"\)/);
  assert.match(cleanupWorkflow, /gh release delete-asset/);
  // The workflow is a reusable workflow_call; callers should use pull_request: types: [closed]
  assert.match(cleanupWorkflow, /on:\s+workflow_call:/s);
  assert.match(cleanupWorkflow, /pull_request:[\s\S]*?types:[\s\S]*?closed/);
});

test('cleanup workflow deletion failures fail the workflow instead of being swallowed', () => {
  assert.match(cleanupWorkflow, /delete_errors=0/);
  assert.match(
    cleanupWorkflow,
    /if ! gh release delete-asset "\$RELEASE_TAG" "\$asset"/
  );
  assert.match(
    cleanupWorkflow,
    /::error::Failed to delete release asset: \$asset/
  );
  assert.match(
    cleanupWorkflow,
    /if \[ "\$delete_errors" -ne 0 \]; then\s+exit 1\s+fi/
  );
});

test('cleanup workflow is documented in the README', () => {
  assert.match(readme, /preview-cleanup\.yml/);
  assert.match(readme, /pull_request.*types.*closed/s);
});

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
