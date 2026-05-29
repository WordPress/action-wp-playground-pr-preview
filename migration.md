---
layout: default
title: Migrating from v2 to v3
description: How to move WordPress Playground PR Preview setups from v2 to v3.
permalink: /migration/
---

{% raw %}

# Migrating from v2 to v3

v3 keeps the direct action path for plugins and themes that do not need a build step, and adds reusable build/publish workflows for previews that need Composer, npm, Vite, or other generated files.

Use this page to decide what to replace. If you need the old behavior for reference, see the [archived v2 documentation](../v2/).

## Choose the migration path

| Your current v2 setup | Recommended v3 setup |
|---|---|
| `WordPress/action-wp-playground-pr-preview@v2` with `plugin-path` or `theme-path` | Change to `@v3`; keep the same direct action shape. |
| A hand-written two-workflow artifact setup using `expose-artifact-on-public-url` | Replace it with `preview-build.yml@v3` and `preview-publish.yml@v3`. |
| A custom Blueprint that installs from the repository | Keep using `blueprint` or `blueprint-url`; update the action ref to `@v3`. |
| A custom Blueprint that installs built ZIP artifacts | Use `preview-build.yml@v3` to produce named ZIPs and `preview-publish.yml@v3` with `blueprint` placeholders such as `{{ARTIFACT_URL:my-plugin}}`. |

## Direct no-build action

If your v2 workflow used `plugin-path`, `theme-path`, `mode`, `description-template`, or `comment-template`, the migration is usually just the version tag:

```yaml
- uses: WordPress/action-wp-playground-pr-preview@v3
  with:
    plugin-path: .
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Keep the workflow permissions:

```yaml
permissions:
  contents: read
  pull-requests: write
```

You do not need to create `secrets.GITHUB_TOKEN`; GitHub provides it automatically.

## Built artifacts

In v2, built previews often required custom glue code:

- build the ZIP in one workflow;
- parse the PR number and commit SHA from artifact names;
- call the legacy `expose-artifact-on-public-url` helper;
- generate a Blueprint by hand;
- remember to publish the draft release so Playground could download assets.

In v3, use two reusable workflows instead.

### Build workflow

```yaml
# .github/workflows/pr-preview-build.yml
name: PR Preview - Build
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

jobs:
  build:
    uses: WordPress/action-wp-playground-pr-preview/.github/workflows/preview-build.yml@v3
    with:
      artifacts: my-plugin=build/my-plugin.zip
      build-command: |
        npm ci
        npm run build:plugin-zip
```

The left side of `artifacts` (`my-plugin`) is the artifact name. The right side (`build/my-plugin.zip`) is the path your `build-command` must create.

### Publish workflow

```yaml
# .github/workflows/pr-preview-publish.yml
name: PR Preview - Publish
on:
  workflow_run:
    workflows: ["PR Preview - Build"]
    types: [completed]

permissions:
  contents: write
  pull-requests: write

jobs:
  publish:
    permissions:
      contents: write
      pull-requests: write
    uses: WordPress/action-wp-playground-pr-preview/.github/workflows/preview-publish.yml@v3
    with:
      kind: plugin
```

Use `kind: theme` for a single theme ZIP. Use `blueprint` instead when the preview needs multiple ZIPs or extra setup steps.

## Input mapping

| v2 pattern | v3 replacement |
|---|---|
| `plugin-path`, `theme-path` | Still supported by the direct action. |
| `mode`, `description-template`, `comment-template`, `restore-button-if-removed` | Still supported by the direct action and by the publish workflow where applicable. |
| `artifact-name`, `artifact-filename`, `artifact-source-run-id`, `pr-number`, `commit-sha` in custom publish YAML | Usually no longer needed; the reusable workflows handle artifact naming and PR metadata. |
| `artifacts-to-keep` | Use `artifacts-to-keep` on `preview-publish.yml@v3`. |
| Manual release publishing | v3 creates the `ci-artifacts` release as a prerelease automatically for new setups. |
| Custom artifact Blueprint URLs | Use `{{ARTIFACT_URL:<name>}}` placeholders in the publish workflow's `blueprint` input. |

## One-time release cleanup

If your v2 setup created a `ci-artifacts` draft release, Playground cannot download assets from it without authentication. Either delete that draft release and let v3 create a fresh prerelease, or convert the existing release from draft to prerelease in the GitHub Releases UI.

## Validation checklist

After migrating, open a test pull request and confirm:

- the build workflow creates every ZIP path listed in `artifacts`;
- plugin ZIPs extract to a slug-named folder, such as `my-plugin/my-plugin.php`;
- the publish workflow succeeds;
- the PR description or comment contains one Preview button;
- clicking the button opens Playground with the expected plugin or theme installed.
{% endraw %}
