# WordPress Playground PR Preview Action

Add a **Preview in WordPress Playground** button to pull requests for WordPress plugins and themes. Reviewers can open the pull request in a browser-based WordPress instance and test the changes with one click.

<p align="center">
  <img src="assets/playground-preview-button.svg" alt="Preview in WordPress Playground" width="220">
</p>
<p align="center">
  <a href="https://github.com/adamziel/preview-in-playground-button-v3-example-simple/pull/2">live example</a>
  ·
  <a href="#quick-start">quick start</a>
  ·
  <a href="#recipes">recipes</a>
  ·
  <a href="#reference">reference</a>
  ·
  <a href="#troubleshooting">troubleshooting</a>
</p>

> **Using v3?** v3 supports two setup paths: direct action inputs for plugins and themes that do not need a build step, and reusable build/publish workflows for previews that need Composer, npm, Vite, or other build output. See [Migrating from older usage](#migrating-from-older-usage) for what changed from older examples.

Start with **[Quick start](#quick-start)** and choose the path that matches your repository.

---

## Table of contents

- [Quick start](#quick-start)
  - [No build step](#no-build-step)
  - [With a build step](#with-a-build-step)
- [See it live](#see-it-live)
- [Recipes](#recipes)
- [How it works](#how-it-works)
- [Reference](#reference)
- [Limitations & gotchas](#limitations--gotchas)
- [Troubleshooting](#troubleshooting)
- [Migrating from older usage](#migrating-from-older-usage)
- [Contributing](#contributing)
- [License](#license)

---

## Quick start

### No build step

Use this setup when your plugin or theme can run directly from the repository, with no Composer install, npm build, or asset pipeline. Create one workflow file:

```yaml
# .github/workflows/pr-preview.yml
name: PR Preview
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

jobs:
  preview:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: WordPress/action-wp-playground-pr-preview@v3
        with:
          plugin-path: .            # or: theme-path: .
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Open a pull request. The action adds a Preview button to the pull request description. When someone clicks it, Playground fetches the plugin or theme from GitHub and boots WordPress with it activated.

This direct setup does not run a build command or publish a ZIP artifact; Playground loads the files from GitHub at the pull request ref.

> **Fork PR note:** this direct one-workflow setup is simplest for same-repository PRs. Public fork PRs usually receive a read-only `GITHUB_TOKEN`, so the action may be unable to edit the PR description. If fork contributors need working previews, use the two-workflow build/publish setup below even when the build command is just a small zip step.

### With a build step

Use this setup when the preview needs generated files, such as Composer dependencies, npm/Vite bundles, or another build output. Create two workflow files: one to build a ZIP artifact and one to publish a Preview button after the build succeeds.

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
      node-version: '20'
      build-command: |
        npm ci
        npm run build:plugin-zip
```

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
      kind: plugin            # or: kind: theme
```

Open a pull request. The build workflow runs `npm ci && npm run build:plugin-zip`. After that succeeds, the publish workflow uploads the resulting ZIP to a public release URL and posts the Preview button. When someone clicks it, Playground installs and activates the built plugin.

> **Why two workflow files?** The build workflow runs untrusted pull request code with read-only permissions. The publish workflow runs later, from the trusted default-branch workflow, with the write permissions needed to upload release assets and update the pull request. See [How it works](#how-it-works).

---

## See it live

Each link is a real, public repo running these workflows. Each PR has a working Preview button that boots Playground with the PR's contents.

| Shape | Repo | Same-repo PR | Fork PR |
|---|---|---|---|
| Single plugin, build step (`kind: plugin`) | [example-simple](https://github.com/adamziel/preview-in-playground-button-v3-example-simple) | [#2](https://github.com/adamziel/preview-in-playground-button-v3-example-simple/pull/2) | [#3](https://github.com/adamziel/preview-in-playground-button-v3-example-simple/pull/3) |
| Monorepo, fixed activation set (`blueprint:` template) | [example-monorepo](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo) | [#2](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo/pull/2) | [#3](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo/pull/3) |
| Monorepo, install only changed plugin (`blueprint-from-artifact`) | [example-monorepo-selective](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo-selective) | [#2](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo-selective/pull/2) | [#3](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo-selective/pull/3) |
| Plugin with PHP dependencies and built JavaScript/CSS | [example-composer-vite](https://github.com/adamziel/preview-in-playground-button-v3-example-composer-vite) | [#1](https://github.com/adamziel/preview-in-playground-button-v3-example-composer-vite/pull/1) | [#2](https://github.com/adamziel/preview-in-playground-button-v3-example-composer-vite/pull/2) |

---

## Recipes

Pick the recipe that matches your repository, then adjust the paths, commands, and artifact names for your project.

Unless a recipe shows a full workflow file, the YAML snippet is a step that goes under `jobs.preview.steps` in the [no-build workflow](#no-build-step).

### Plugin in a subdirectory

In `.github/workflows/pr-preview.yml`, replace the Quick start step under `jobs.preview.steps` with:

```yaml
- uses: WordPress/action-wp-playground-pr-preview@v3
  with:
    plugin-path: plugins/my-awesome-plugin
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Theme

```yaml
- uses: WordPress/action-wp-playground-pr-preview@v3
  with:
    theme-path: .             # or themes/my-theme
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Plugin **and** theme together

```yaml
- uses: WordPress/action-wp-playground-pr-preview@v3
  with:
    plugin-path: plugins/my-plugin
    theme-path:  themes/my-theme
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Custom blueprint (companion plugins, version pin, seed data, login)

When you need more than "install this plugin," provide a full Blueprint via `blueprint:`. Example: install your plugin from the PR, also install WooCommerce from .org, pin PHP and WP versions, and log in as admin.

```yaml
- uses: WordPress/action-wp-playground-pr-preview@v3
  with:
    blueprint: |
      {
        "$schema": "https://playground.wordpress.net/blueprint-schema.json",
        "preferredVersions": { "php": "8.3", "wp": "6.6" },
        "steps": [
          { "step": "installPlugin",
            "pluginData": {
              "resource": "git:directory",
              "url": "https://github.com/${{ github.repository }}.git",
              "ref": "${{ github.event.pull_request.head.ref }}",
              "path": "/"
            },
            "options": { "activate": true } },
          { "step": "installPlugin",
            "pluginData": { "resource": "wordpress.org/plugins", "slug": "woocommerce" },
            "options": { "activate": true } },
          { "step": "login", "username": "admin" }
        ]
      }
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Or host the blueprint elsewhere and pass the URL:

```yaml
- uses: WordPress/action-wp-playground-pr-preview@v3
  with:
    blueprint-url: https://example.com/path/to/blueprint.json
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Learn more about Blueprints: <https://wordpress.github.io/wordpress-playground/blueprints/>.

### Single plugin with a build step

See the [Quick start with a build step](#with-a-build-step) above. The reusable workflow handles checkout, optional Node/PHP setup, build, zip, upload, public URL, blueprint, and button posting.

### Monorepo with multiple plugins, all activated together

Use this when one pull request preview should install more than one built plugin. The build workflow creates one ZIP per plugin; the publish workflow uses a custom Blueprint that installs both ZIPs.

Put the `artifacts` and `build-command` inputs under `jobs.build.with` in `.github/workflows/pr-preview-build.yml`:

```yaml
jobs:
  build:
    uses: WordPress/action-wp-playground-pr-preview/.github/workflows/preview-build.yml@v3
    with:
      artifacts: |
        site-toolkit=build/site-toolkit.zip
        site-analytics=build/site-analytics.zip
      build-command: |
        set -euo pipefail
        mkdir -p build stage
        for slug in site-toolkit site-analytics; do
          rm -rf "stage/$slug"
          mkdir -p "stage/$slug"
          rsync -a "plugins/$slug/" "stage/$slug/"
          ( cd stage && zip -rq "../build/$slug.zip" "$slug" )
        done
```

Put the `blueprint` input under `jobs.publish.with` in `.github/workflows/pr-preview-publish.yml` instead of `kind: plugin`:

```yaml
jobs:
  publish:
    permissions:
      contents: write
      pull-requests: write
    uses: WordPress/action-wp-playground-pr-preview/.github/workflows/preview-publish.yml@v3
    with:
      blueprint: |
        {
          "$schema": "https://playground.wordpress.net/blueprint-schema.json",
          "steps": [
            { "step": "installPlugin",
              "pluginZipFile": { "resource": "url", "url": "{{ARTIFACT_URL:site-toolkit}}" },
              "options": { "activate": true } },
            { "step": "installPlugin",
              "pluginZipFile": { "resource": "url", "url": "{{ARTIFACT_URL:site-analytics}}" },
              "options": { "activate": true } }
          ]
        }
```

`{{ARTIFACT_URL:<name>}}` is replaced with the public URL of the matching ZIP. The `<name>` must match the left side of the corresponding `artifacts` entry, such as `site-toolkit`.

Live: [example-monorepo](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo).

### Monorepo, install only the plugin touched by the PR

The build script computes the diff against the base ref and writes a tailored `blueprint.json`. The publish workflow reads that Blueprint from the artifact bundle.

Put these inputs under `jobs.build.with` in the build workflow:

```yaml
fetch-depth: 0          # so `git diff` against base ref works
artifacts: |
  alpha=build/alpha.zip
  beta=build/beta.zip
blueprint-from-build: blueprint.json
build-command: |
  set -euo pipefail
  mkdir -p build stage
  for slug in alpha beta; do
    rm -rf "stage/$slug"
    mkdir -p "stage/$slug"
    rsync -a "plugins/$slug/" "stage/$slug/"
    ( cd stage && zip -rq "../build/$slug.zip" "$slug" )
  done
  git fetch --no-tags --depth=50 origin "$GITHUB_BASE_REF"
  changed=$(git diff --name-only "origin/$GITHUB_BASE_REF...HEAD" \
    | awk -F/ '/^plugins\// {print $2}' | sort -u)
  node - "$changed" <<'NODE' > blueprint.json
  const slugs = (process.argv[2] || '').split(/\s+/).filter(Boolean);
  process.stdout.write(JSON.stringify({
    $schema: 'https://playground.wordpress.net/blueprint-schema.json',
    steps: (slugs.length ? slugs : ['alpha', 'beta']).map(s => ({
      step: 'installPlugin',
      pluginZipFile: { resource: 'url', url: '{{ARTIFACT_URL:' + s + '}}' },
      options: { activate: true },
    })),
  }));
  NODE
```

Put this under `jobs.publish.with` in the publish workflow:

```yaml
blueprint-from-artifact: true
```

Live: [example-monorepo-selective](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo-selective). PR description blueprints decode to install **only** the plugin(s) the PR touched.

### Plugin with PHP dependencies and built JavaScript/CSS

Use this when the plugin needs both PHP dependencies and compiled front-end assets before Playground can run it. In this example, Composer installs production PHP dependencies, npm/Vite builds JavaScript and CSS, and the build workflow zips the finished plugin.

Put these inputs under `jobs.build.with` in the build workflow:

```yaml
artifacts: my-plugin=build/my-plugin.zip
node-version: '20'
php-version: '8.2'
build-command: |
  set -euo pipefail

  # 1. PHP runtime deps only.
  composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader

  # 2. Vite bundle.
  npm ci
  npm run build

  # 3. Stage a slug-named directory so the zip extracts to
  #    wp-content/plugins/my-plugin/.
  mkdir -p stage/my-plugin build
  rsync -a \
    --exclude '.git' --exclude '.github' \
    --exclude 'node_modules' --exclude 'src-js' \
    --exclude 'vite.config.js' --exclude 'package*.json' \
    --exclude 'composer*.json' --exclude '.gitignore' \
    --exclude 'stage' --exclude 'build' \
    ./ stage/my-plugin/
  ( cd stage && zip -rq ../build/my-plugin.zip my-plugin )
```

The publish workflow can stay at `kind: plugin` because there is still only one plugin ZIP to install. Live: [example-composer-vite](https://github.com/adamziel/preview-in-playground-button-v3-example-composer-vite).


### Built plugin with a custom Playground setup

Use this when a built plugin needs more than the default "install and activate" preview. Common reasons include opening a specific admin page, installing PHP extensions, logging in automatically, or adding setup steps before the reviewer starts testing.

The crux is that forked pull requests cannot safely run with write permissions. The build workflow runs untrusted code with read-only permissions and uploads only a ZIP artifact. The publish workflow runs later with write permissions, never checks out the pull request code, and substitutes the artifact URL into a Blueprint.

Build workflow example:

```yaml
# .github/workflows/pr-playground-preview-build.yml
name: PR Playground Preview Build
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

jobs:
  build:
    uses: WordPress/action-wp-playground-pr-preview/.github/workflows/preview-build.yml@v3
    with:
      php-version: '8.1'
      artifacts: my-plugin=build/my-plugin.zip
      build-command: |
        set -euo pipefail
        composer install --no-dev --optimize-autoloader --no-interaction --no-progress
        mkdir -p build/my-plugin
        rsync -a --delete \
          --exclude-from='.distignore' \
          --exclude='.git' \
          --exclude='.github' \
          --exclude='build' \
          ./ build/my-plugin/
        ( cd build && zip -qr my-plugin.zip my-plugin )
```

Publish workflow example:

```yaml
# .github/workflows/pr-playground-preview-publish.yml
name: PR Playground Preview Publish
on:
  workflow_run:
    workflows: ["PR Playground Preview Build"]
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
      blueprint: |
        {
          "$schema": "https://playground.wordpress.net/blueprint-schema.json",
          "landingPage": "/wp-admin/admin.php?page=my-plugin",
          "phpExtensionBundles": ["kitchen-sink"],
          "steps": [
            { "step": "login", "username": "admin", "password": "password" },
            { "step": "installPlugin",
              "pluginZipFile": { "resource": "url", "url": "{{ARTIFACT_URL:my-plugin}}" },
              "options": { "activate": true } }
          ]
        }
```

The important connection is the artifact name. `artifacts: my-plugin=...` in the build workflow creates an artifact URL placeholder named `{{ARTIFACT_URL:my-plugin}}` for the publish workflow. Use that placeholder anywhere a Blueprint needs the public ZIP URL.

### Post the button as a comment instead of editing the description

```yaml
- uses: WordPress/action-wp-playground-pr-preview@v3
  with:
    plugin-path: .
    mode: comment
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

In the build-step setup, pass `mode: comment` to `preview-publish.yml` instead.

### Customize the button text or add testing instructions

```yaml
- uses: WordPress/action-wp-playground-pr-preview@v3
  with:
    plugin-path: .
    description-template: |
      ### Test this PR in WordPress Playground

      {{PLAYGROUND_BUTTON}}

      **Branch:** {{PR_HEAD_REF}}  ·  **Plugin:** `{{PLUGIN_SLUG}}`
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Or for comment mode:

```yaml
- uses: WordPress/action-wp-playground-pr-preview@v3
  with:
    plugin-path: .
    mode: comment
    comment-template: |
      ## Preview Changes in WordPress Playground

      {{PLAYGROUND_BUTTON}}

      ### Testing checklist
      1. Click the button.
      2. Go to Plugins → Installed Plugins.
      3. Verify `{{PLUGIN_SLUG}}` is active.

      **PR:** #{{PR_NUMBER}} — {{PR_TITLE}}
```

Available template variables are listed under [Reference → Template variables](#template-variables).

---

## How it works

### Mental model

Playground runs WordPress entirely in the browser via WebAssembly. Anything Playground needs to install — a plugin ZIP, a theme ZIP, a WXR file — must be reachable through a public URL when the button is clicked. This action builds the right Blueprint and publishes a button to that Blueprint on the pull request.

The action uses one of two public URL strategies:

1. **`git:directory`** — Playground fetches the repository at a specific ref directly from GitHub. This is the direct no-build setup.
2. **A release-asset URL** — CI builds a ZIP and uploads it to a release in the repository. Use this when the preview needs Composer dependencies, npm output, compiled assets, or any other generated files.

The direct action inputs handle the `git:directory` path. The two reusable workflows handle the release-asset path end to end: they run the build, upload the result to a `ci-artifacts` prerelease, and call the action with a Blueprint that points at the resulting URL.

### Fork safety model (build path only)

GitHub doesn't let one workflow simultaneously (a) run untrusted code from a
fork PR and (b) write to releases or PR comments. The build path therefore
splits the work at the artifact boundary:

- **Build workflow** runs on `pull_request`, `permissions: contents: read`.
  It checks out the `pull_request` ref, runs your `build-command`, validates that the
  expected zip(s) exist, logs `unzip -l` for inspection, and uploads a single
  bundle artifact. It has no secrets and does not persist checkout credentials.
- **Publish workflow** runs on `workflow_run`, `permissions: contents: write`
  + `pull-requests: write`. It never checks out PR code. GitHub reads this
  workflow from the default branch, so a fork PR cannot change the privileged
  publish logic in the same PR.
- **Artifact bundle** is the only handoff from untrusted to trusted code. The
  publish workflow treats it as opaque bytes: it uploads the zip(s), substitutes
  their URLs into a Blueprint, and lets Playground run them later inside its
  browser sandbox.

The publish workflow has a runtime guard that **fails loudly** if invoked from
any trigger other than `workflow_run`. Non-PR source runs and failed build runs
skip intentionally because there is no successful PR preview to publish.
Misconfigured callers (for example someone reaches for `pull_request_target`)
get a red failure instead of a silent skip.

Because the publish workflow is privileged, its third-party action references
are pinned to commit SHAs. This avoids granting write permissions to a moved
major-version tag. The internal button action is also called through an
immutable v2 commit; v3 adds the reusable workflow layer around the same button
action behavior.

### Trigger model and security

| Step | Where it runs | Trust |
|---|---|---|
| `actions/checkout` of the `pull_request` ref | Build workflow (`pull_request`) | Untrusted — no secrets, read-only |
| Your `build-command:` (composer/npm/etc.) | Build workflow | Untrusted — runs in CI, output (the zip) is the only thing that escapes |
| `actions/upload-artifact` of the bundle | Build workflow | Untrusted — bundle is opaque to the publish workflow; publish verifies the artifact PR number and SHA against the `workflow_run` payload and base-repo PR API before using it |
| Reading the bundle, exposing it on a release | Publish workflow (`workflow_run`) | Trusted — workflow YAML from default branch, never checks out PR code |
| Posting the Preview button on the PR | Publish workflow → action | Trusted |
| Clicking the button → Playground in the user's browser | The user's browser | Untrusted code, but iframe-isolated by Playground |

In other words, the publish workflow does not execute pull request code. It treats the ZIP as data until a reviewer opens it in the Playground iframe, where WordPress runs inside Playground's browser sandbox.

For public repositories, release assets are public. A fork PR can therefore
cause its built zip to be hosted on the repository's `ci-artifacts` prerelease
until cleanup removes it. That is the tradeoff that makes one-click browser
previews possible for fork contributors.

`{{ARTIFACT_URL:<name>}}` substitution uses `JSON.stringify(url).slice(1, -1)`, so any character that could break JSON parsing is escaped. The `"{{...}}"` template convention is non-breaking and produces valid JSON for any URL.

The `ci-artifacts` release is created as a **`--prerelease`**, not a draft. Prerelease assets are publicly downloadable on first run; draft assets require auth and Playground can't read them. The action handles this for you on first use; existing draft releases need a one-time conversion (see [Migrating](#migrating-from-older-usage)).

---

## Reference

### Action: `WordPress/action-wp-playground-pr-preview@v3`

Use directly when there's no build step, or have the publish workflow call it (it does, internally).

| Input | Required | Default | Description |
|---|---|---|---|
| `mode` | no | `append-to-description` | `append-to-description` or `comment`. |
| `playground-host` | no | `https://playground.wordpress.net` | Base Playground host URL. |
| `plugin-path` | one of four† | — | Path to plugin directory. `.` for repo root, `plugins/foo` for subdir. Auto-generates a `git:directory` blueprint. |
| `theme-path` | one of four† | — | Path to theme directory. Auto-generates a `git:directory` blueprint. |
| `blueprint` | one of four† | — | Custom Blueprint as a JSON string. When set, `plugin-path` and `theme-path` are ignored. |
| `blueprint-url` | one of four† | — | URL pointing to a hosted Blueprint JSON. Used directly via `?blueprint-url=…`. |
| `description-template` | no | `{{PLAYGROUND_BUTTON}}` | Template for the PR description block. Supports the [template variables](#template-variables). |
| `comment-template` | no | (full default) | Template for the PR comment. Supports the [template variables](#template-variables). |
| `restore-button-if-removed` | no | `true` | If the PR author removes the button block, restore it on the next run. Set `false` to respect deletions. Only applies to `append-to-description` mode. |
| `pr-number` | no | *event payload* | Pull request number. Required when calling from a workflow that doesn't have a `pull_request` event payload (e.g. `workflow_run`). |
| `github-token` | yes | — | Token with `pull-requests: write` and `contents: read`, usually `${{ secrets.GITHUB_TOKEN }}`. |

† Provide `blueprint-url`, `blueprint`, or one/both of `plugin-path` and `theme-path`. Do not combine `blueprint-url` or `blueprint` with path inputs unless you intentionally want the custom Blueprint/URL to win.

#### Outputs

| Output | Description |
|---|---|
| `preview-url` | Full Playground URL embedded in the button. |
| `blueprint-json` | Rendered Blueprint JSON string. Empty when `blueprint-url` is used. |
| `rendered-description` | Markdown/HTML inserted into the PR description (when `mode: append-to-description`). |
| `rendered-comment` | Markdown/HTML used for the PR comment (when `mode: comment`). |
| `mode` | Effective mode (`append-to-description` or `comment`). |
| `comment-id` | ID of the managed PR comment, when applicable. |

### Reusable workflow: `preview-build.yml@v3`

Runs the caller's build command in the read-only `pull_request` context and bundles the produced zip(s) into a single GitHub Actions artifact for the publish workflow to consume.

| Input | Required | Default | Description |
|---|---|---|---|
| `artifacts` | yes | — | Newline-separated `name=path` entries. `name` becomes the slug used in `{{ARTIFACT_URL:<name>}}` and must match `[a-zA-Z0-9_-]+`. `path` is relative to `working-directory`. |
| `build-command` | yes | — | Shell script that produces every path listed in `artifacts`. Runs in `bash`; `set -euo pipefail`-style strictness recommended. |
| `working-directory` | no | `.` | Working directory for `build-command`. |
| `node-version` | no | *unset* | If set, runs `actions/setup-node@v4` before `build-command`. |
| `php-version` | no | *unset* | If set, runs `shivammathur/setup-php@v2` before `build-command`. |
| `fetch-depth` | no | `1` | Passed to `actions/checkout@v4`. Set to `0` when the build needs full history (e.g. diff against the base ref). |
| `blueprint-from-build` | no | *unset* | Path (relative to `working-directory`) to a `blueprint.json` written by `build-command`. Bundled with the artifact for use with `blueprint-from-artifact: true` in publish. Validated as parseable JSON before upload. |

The bundle artifact is named `wp-playground-preview-pr<N>-<SHA>` and contains `zips/<name>.zip` per `artifacts` entry plus optional `blueprint.json`.

### Reusable workflow: `preview-publish.yml@v3`

Runs in the privileged `workflow_run` context, exposes the artifact bundle's zips on a public release URL, renders the Blueprint, and posts the Preview button.

| Input | Required | Default | Description |
|---|---|---|---|
| `blueprint` | one of three‡ | — | Blueprint JSON template. Use `{{ARTIFACT_URL:<name>}}` placeholders inside double quotes. |
| `kind` | one of three‡ | — | `plugin` or `theme`. Shortcut: requires exactly one zip in the bundle, generates an `installPlugin`/`installTheme` step with `activate: true`. |
| `blueprint-from-artifact` | one of three‡ | `false` | When `true`, read `blueprint.json` from the artifact bundle (requires `blueprint-from-build:` on the build side). |
| `artifacts-to-keep` | no | `2` | Positive integer number of distinct PR commits worth of zips to keep on the release. Older zips for the same PR get pruned. Set to `keep-all` to disable cleanup. |
| `release-tag` | no | `ci-artifacts` | Tag used to host artifacts publicly. Auto-created as a prerelease on first use. |
| `mode` | no | `append-to-description` | `append-to-description` or `comment`. |

‡ Provide exactly one of `blueprint`, `kind`, `blueprint-from-artifact`. The publish workflow validates this and fails loudly if zero or two are set.

#### Required caller permissions

The calling workflow **and** the calling job must both grant:

```yaml
permissions:
  contents: write
  pull-requests: write
```

Without these, GitHub may fail the run at startup before the job logs are available. See [Troubleshooting](#troubleshooting).

### Template variables

Available in `description-template` and `comment-template` strings (case-insensitive `{{NAME}}` syntax):

| Variable | Value |
|---|---|
| `PLAYGROUND_BUTTON` | Full button HTML — recommended in any custom template. |
| `PLAYGROUND_URL` | Full Playground URL with embedded blueprint. |
| `PLAYGROUND_BUTTON_IMAGE_URL` | URL of the button image asset. |
| `PLAYGROUND_BLUEPRINT_JSON` | Stringified Blueprint JSON. Empty when `blueprint-url` is used. |
| `PLAYGROUND_BLUEPRINT_DATA_URL` | Blueprint data URL, or the provided `blueprint-url` when `blueprint-url` is used. |
| `PLAYGROUND_HOST` | Playground host (default `https://playground.wordpress.net`). |
| `PR_NUMBER`, `PR_TITLE`, `PR_HEAD_REF`, `PR_HEAD_SHA`, `PR_BASE_REF` | Pull request metadata. |
| `REPO_OWNER`, `REPO_NAME`, `REPO_FULL_NAME`, `REPO_SLUG`, `REPO_ARCHIVE_ROOT` | Repository metadata. |
| `PLUGIN_PATH`, `PLUGIN_SLUG` | Set when `plugin-path:` is provided. |
| `THEME_PATH`, `THEME_SLUG` | Set when `theme-path:` is provided. |

All variables except `PLAYGROUND_BUTTON` are HTML-escaped before substitution.

---

## Limitations & gotchas

- **Two workflow files when there's a build step.** GitHub's permission model around fork PRs makes this unavoidable. The reusable workflows minimise but don't eliminate the boilerplate.
- **Permissions ceiling is rigid.** Reusable workflows declare a maximum permission set; callers can match it or reduce it, not extend it.
- **Build and publish workflows must be pinned to compatible versions.** The artifact-naming format is the implicit interface between them. Use the same `@v3` (or branch ref) in both.
- **Fork PR build output becomes public.** The publish workflow never trusts the zip, but it does upload it to a public release URL so Playground can fetch it. Keep `artifacts-to-keep` low unless you deliberately want longer retention.
- **`{{ARTIFACT_URL:<name>}}` substitution is the only template feature.** No conditionals, no loops, no other placeholders. For per-PR variable shapes, write the blueprint at build time and use `blueprint-from-artifact: true`.
- **One zip per `artifacts` entry.** Use multiple entries plus a custom `blueprint:` for multiple plugin/theme zips; the `kind:` shortcut is only for a single zip.
- **Plugin zips must extract to a slug-named folder.** When you `zip -r my-plugin.zip .` from inside the plugin dir, the zip contents are at the root, and Playground will install them with no slug folder. Wrap with a directory: `mkdir stage/my-plugin && rsync -a ./ stage/my-plugin/ && (cd stage && zip -r ../my-plugin.zip my-plugin)`.
- **`fetch-depth: 0` is required for diffs.** The default checkout is shallow (depth 1). Diffs against the PR base ref need full history, otherwise `git diff` fails with "no merge base."
- **The `ci-artifacts` release is shared across all PRs.** Each PR's zips are unique (`pr-<N>-<SHA>-<name>.zip`); cleanup keeps the N most recent commit-sets per PR.
- **`artifacts-to-keep` must be a positive integer or `keep-all`.** `0`, negative numbers, and arbitrary strings fail before any release assets are uploaded.
- **`workflow_run`-triggered workflows always read their YAML from the default branch.** Workflow changes on a PR branch don't take effect until merged. Test publish-side changes on a scratch repo first.
- **Private repositories are not supported by the default setup.** Playground runs in the user's browser and needs unauthenticated download URLs. `git:directory` and release assets in private repositories both require authentication that Playground does not have. Make the repository public or self-host the ZIP.

---

## Troubleshooting

### The publish workflow run is `startup_failure` with no logs

Almost always a permissions issue. The reusable workflow needs `contents: write` + `pull-requests: write`. Add the block in **two places** in your caller workflow:

```yaml
permissions:
  contents: write
  pull-requests: write

jobs:
  publish:
    permissions:
      contents: write
      pull-requests: write
    uses: WordPress/action-wp-playground-pr-preview/.github/workflows/preview-publish.yml@v3
    # ...
```

### The Preview button 404s when clicked

Either the artifact was not uploaded, or the release is a draft and requires authentication. Check the `ci-artifacts` release in the repository's Releases page. If it is a draft, convert it to a prerelease. The action does this automatically for new releases, but it does not change an existing draft release.

### My plugin needs `composer install` or `npm run build` and shows up empty

The workflow is probably using `plugin-path:` on the action directly. That path uses `git:directory`, so Playground receives the repository files without running a build step. Switch to the [build-step setup](#with-a-build-step) so `composer install`, `npm ci`, or other build commands run in CI before zipping.

### `git diff origin/$GITHUB_BASE_REF...HEAD` fails with "no merge base"

The default `actions/checkout` is shallow. Set `fetch-depth: 0` on the build reusable workflow input.

### `PHP.run()` failed with exit code 255 and no stderr

Usually a fatal in plugin activation — most often a missing `vendor/autoload.php` because Composer wasn't run before zipping. Switch to the build-step setup or check what your `build-command` actually produces. The build workflow logs `unzip -l` of the final artifact for exactly this reason.

### The Preview button gets re-added after I delete it

That's `restore-button-if-removed: true` (the default). Either set it to `false`, or replace the button block with a placeholder so the action treats it as user-customised:

```html
<!-- wp-playground-preview:start -->
<!-- Preview button hidden by PR author -->
<!-- wp-playground-preview:end -->
```

### `Resource not accessible by integration`

`pull-requests: write` is missing from the workflow that calls the action. Add the `permissions:` block.

### The reusable workflow `uses:` line fails YAML lint

`WordPress/action-wp-playground-pr-preview/.github/workflows/preview-{build,publish}.yml@v3` is a *reusable workflow* path, distinct from `WordPress/action-wp-playground-pr-preview@v3` which is the action. Both are valid; use them in the right place. Reusable workflows go under `jobs.<id>.uses`. Actions go under `jobs.<id>.steps[].uses`.

---

## Migrating from older usage

The common pre-v3 advanced pattern required a long custom YAML setup across two workflow files: GitHub Script for parsing artifact metadata, a Node heredoc for building the Blueprint, and a manual one-time step to publish a draft release. The reusable workflows now handle those details. If you used less-common `expose-artifact-on-public-url` inputs such as `artifact-source-repository`, `release-repository`, `create-release-if-missing`, or `cleanup-enabled`, keep using the legacy helper or wrap the reusable workflow until v3 supports those options.

To migrate:

1. **Replace your build workflow.** Move whatever it ran (`composer install`, `npm ci`, etc.) into the `build-command:` input of `preview-build.yml@v3`. Replace `actions/upload-artifact@v4` with `name=path` lines in `artifacts:`.
2. **Replace your publish workflow.** Pick a [blueprint mode](#reusable-workflow-preview-publishymlv3): `kind:` for a single zip, `blueprint:` for fixed shapes, `blueprint-from-artifact:` for per-PR shapes. Add the `permissions:` block on both the workflow and the calling job.
3. **One-time:** if you have an existing `ci-artifacts` draft release, either delete it (the next run creates a fresh prerelease automatically) or convert it from draft to prerelease in the Releases UI. Draft release assets require authentication, so Playground cannot download them.

Older README content is preserved in git history. Use `git log -- README.md`, then check out or browse a pre-v3 commit if you need the manually orchestrated artifact pattern or the legacy `github-proxy.com` URL scheme.

---

## Contributing

Issues and PRs welcome at <https://github.com/WordPress/action-wp-playground-pr-preview>.

Use the four [example repos](#see-it-live) for manual integration testing. If you add a new feature or fix a bug, point an example repo at your branch and confirm the smoke-test PR still produces a working Preview button.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
