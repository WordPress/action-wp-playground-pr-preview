import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findPrDescriptionBlueprintOverride } = require('../src/pr-description-blueprint-override.js');

const detailsBlock = (summary, codeBlock) => [
  '<details>',
  `<summary>${summary}</summary>`,
  '',
  codeBlock,
  '',
  '</details>',
].join('\n');

test('extracts json from a longer backtick fence containing triple backticks', () => {
  const body = detailsBlock('Playground Blueprint', [
    '````json',
    '{',
    '  "landingPage": "/wp-admin/",',
    '  "example": "``` is content, not a closing fence"',
    '}',
    '````',
  ].join('\n'));

  assert.equal(
    findPrDescriptionBlueprintOverride(body, 'Playground Blueprint'),
    '{\n  "landingPage": "/wp-admin/",\n  "example": "``` is content, not a closing fence"\n}'
  );
});

test('extracts json from a GFM fence with extra info text', () => {
  const body = detailsBlock('Playground Blueprint', [
    '```json blueprint',
    '{ "landingPage": "/" }',
    '```',
  ].join('\n'));

  assert.equal(
    findPrDescriptionBlueprintOverride(body, 'Playground Blueprint'),
    '{ "landingPage": "/" }'
  );
});

test('ignores details blocks with other summaries', () => {
  const body = [
    detailsBlock('Not this one', '```json\n{ "wrong": true }\n```'),
    '',
    detailsBlock('Playground Blueprint', '~~~json\n{ "right": true }\n~~~'),
  ].join('\n');

  assert.equal(
    findPrDescriptionBlueprintOverride(body, 'Playground Blueprint'),
    '{ "right": true }'
  );
});

test('throws when a matching details block has no json fence', () => {
  const body = detailsBlock('Playground Blueprint', '```php\necho "Nope";\n```');

  assert.throws(
    () => findPrDescriptionBlueprintOverride(body, 'Playground Blueprint'),
    /does not contain a non-empty json code block/
  );
});

test('throws when a matching json fence is empty', () => {
  const body = detailsBlock('Playground Blueprint', '```json\n   \n```');

  assert.throws(
    () => findPrDescriptionBlueprintOverride(body, 'Playground Blueprint'),
    /does not contain a non-empty json code block/
  );
});

test('throws when blueprint override summary is empty', () => {
  assert.throws(
    () => findPrDescriptionBlueprintOverride('', '   '),
    /blueprint-override-summary must not be empty/
  );
});

test('returns an empty string when no matching details block exists', () => {
  assert.equal(findPrDescriptionBlueprintOverride('', 'Playground Blueprint'), '');
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
