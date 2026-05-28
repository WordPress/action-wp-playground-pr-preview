# WordPress Playground PR Preview

Add a **Preview in WordPress Playground** button to every pull request — so reviewers can try your plugin or theme in a real WordPress instance, in their browser, with one click.

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

> **Heads up — v3 is a meaningful change from v2.** The action's no-build inputs (`plugin-path:`, `theme-path:`, `blueprint:`, `blueprint-url:`) still work the same way, but v3 adds two reusable workflows that replace the common old hand-rolled "Advanced: Testing Built CI Artifacts" pattern (~107 lines of caller-side YAML → ~14), and the shared `ci-artifacts` release is now created as a prerelease instead of a draft so download URLs are public on first run. The legacy artifact helper still exists for unusual cross-repository or custom-retention setups. See [Migrating from older usage](#migrating-from-older-usage) before upgrading. **Looking for the v2 docs?** They live at the [pre-v3 README on GitHub](https://github.com/WordPress/action-wp-playground-pr-preview/blob/c860752/README.md).

This repo ships **one action and two reusable workflows**, all pinnable as `@v3`:

- **`WordPress/action-wp-playground-pr-preview@v3`** — posts the preview button on a PR. Use it directly when your plugin or theme has no build step.
- **`.../preview-build.yml@v3`** — reusable workflow that runs your build (Composer, npm, Vite, anything) and uploads the resulting zip(s).
- **`.../preview-publish.yml@v3`** — reusable workflow that exposes those zips on a public URL and calls the action to post the button.

Everything you need is in the **[Quick start](#quick-start)** section. Pick the variant that matches whether your code needs a build step.

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

Your plugin or theme runs as-is from a clone of the repo (no Composer, no npm, no asset pipeline). Drop **one** workflow file in your repo:

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

Open a PR. The action edits the description with a Preview button. Click it; Playground fetches your plugin from GitHub and boots WordPress with it activated.

That's it. No artifact hosting, no second workflow.

> **Fork PR note:** this direct one-workflow setup is simplest for same-repository PRs. Public fork PRs usually receive a read-only `GITHUB_TOKEN`, so the action may be unable to edit the PR description. If fork contributors need working previews, use the two-workflow build/publish setup below even when the build command is just a small zip step.

### With a build step

Your plugin or theme needs `composer install`, `npm run build`, or similar before it works. Two workflow files:

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

Open a PR. The build workflow runs `npm ci && npm run build:plugin-zip`, the publish workflow uploads the resulting zip to a public release URL and posts the Preview button. Click it; Playground installs your *built* plugin and activates it.

> **Why two files?** `pull_request` events run with read-only permissions (so PRs from forks are safe). Posting a comment and uploading to a release needs write permissions, which only `workflow_run` can grant safely. The split is a GitHub trigger-permission constraint; see [How it works](#how-it-works).

---

## See it live

Each link is a real, public repo running these workflows. Each PR has a working Preview button that boots Playground with the PR's contents.

| Shape | Repo | Same-repo PR | Fork PR |
|---|---|---|---|
| Single plugin, build step (`kind: plugin`) | [example-simple](https://github.com/adamziel/preview-in-playground-button-v3-example-simple) | [#2](https://github.com/adamziel/preview-in-playground-button-v3-example-simple/pull/2) | [#3](https://github.com/adamziel/preview-in-playground-button-v3-example-simple/pull/3) |
| Monorepo, fixed activation set (`blueprint:` template) | [example-monorepo](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo) | [#2](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo/pull/2) | [#3](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo/pull/3) |
| Monorepo, install only changed plugin (`blueprint-from-artifact`) | [example-monorepo-selective](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo-selective) | [#2](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo-selective/pull/2) | [#3](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo-selective/pull/3) |
| Composer + Vite plugin (multi-toolchain build) | [example-composer-vite](https://github.com/adamziel/preview-in-playground-button-v3-example-composer-vite) | [#1](https://github.com/adamziel/preview-in-playground-button-v3-example-composer-vite/pull/1) | [#2](https://github.com/adamziel/preview-in-playground-button-v3-example-composer-vite/pull/2) |

If you're scaffolding via an LLM, point it at one of these repos and the README's [Recipes](#recipes) section.

---

## Recipes

Pick the one that matches your repo. Copy-paste, edit the obvious bits, ship.

### Plugin in a subdirectory

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

```yaml
# build
artifacts: |
  site-toolkit=build/site-toolkit.zip
  site-analytics=build/site-analytics.zip
build-command: |
  for slug in site-toolkit site-analytics; do
    ( cd "plugins/$slug" && zip -r "../../build/$slug.zip" . )
  done
```

```yaml
# publish — replace `kind:` with a `blueprint:` template
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

`{{ARTIFACT_URL:<name>}}` is replaced with the public URL of the matching zip. The placeholder is JSON-string-safe — quotes, backslashes, and control characters in URLs are escaped, so the caller-side `"{{...}}"` quoting always produces valid JSON.

Live: [example-monorepo](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo).

### Monorepo, install only the plugin touched by the PR

The build script computes the diff against the base ref and writes a tailored `blueprint.json`. The publish workflow reads that blueprint from the artifact bundle.

```yaml
# build
fetch-depth: 0          # so `git diff` against base ref works
artifacts: |
  alpha=build/alpha.zip
  beta=build/beta.zip
blueprint-from-build: blueprint.json
build-command: |
  set -euo pipefail
  for slug in alpha beta; do
    ( cd "plugins/$slug" && zip -r "../../build/$slug.zip" . )
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

```yaml
# publish
blueprint-from-artifact: true
```

Live: [example-monorepo-selective](https://github.com/adamziel/preview-in-playground-button-v3-example-monorepo-selective). PR description blueprints decode to install **only** the plugin(s) the PR touched.

### Composer **and** npm/Vite plugin

```yaml
# build
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

Publish workflow stays at `kind: plugin`. Live: [example-composer-vite](https://github.com/adamziel/preview-in-playground-button-v3-example-composer-vite).


### Real-world: Plugin Check-style fork-safe preview

[WordPress/plugin-check#1330](https://github.com/WordPress/plugin-check/pull/1330) uses the same fork-safe shape: build a production plugin zip in `pull_request`, then let `workflow_run` publish the zip and post a button that opens directly to Tools → Plugin Check. In v3, the custom publish workflow can collapse to the reusable workflows:

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
      artifacts: plugin-check=build/plugin-check.zip
      build-command: |
        set -euo pipefail
        composer install --no-dev --optimize-autoloader --no-interaction --no-progress
        mkdir -p build/plugin-check
        rsync -a --delete \
          --exclude-from='.distignore' \
          --exclude='.git' \
          --exclude='.github' \
          --exclude='build' \
          ./ build/plugin-check/
        ( cd build && zip -qr plugin-check.zip plugin-check )
```

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
          "landingPage": "/wp-admin/tools.php?page=plugin-check",
          "phpExtensionBundles": ["kitchen-sink"],
          "steps": [
            { "step": "login", "username": "admin", "password": "password" },
            { "step": "installPlugin",
              "pluginZipFile": { "resource": "url", "url": "{{ARTIFACT_URL:plugin-check}}" },
              "options": { "activate": true } }
          ]
        }
```

The important parts are the artifact name (`plugin-check`) and the matching `{{ARTIFACT_URL:plugin-check}}` placeholder. The reusable publish workflow derives the PR number and head SHA from the workflow-run artifact name, so Plugin Check does not need to upload a separate metadata artifact.

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

Playground runs WordPress entirely in the browser via WebAssembly. Anything Playground needs to install — a plugin zip, a theme zip, a WXR file — must be reachable via a public URL at click-time. This action's only job is to **build the right Blueprint and put a button to it on your PR**.

Two kinds of public URL work:

1. **`git:directory`** — Playground fetches your repo at a specific ref directly from GitHub. No CI artifact hosting needed. Fast to set up but doesn't run any build step.
2. **A release-asset URL** — your CI builds a zip and uploads it to a release in your repo. Required when `composer install` / `npm run build` / asset compilation is needed for your plugin to actually work.

The action handles (1) directly. The two reusable workflows handle (2) end-to-end: they run your build, upload the result to a `ci-artifacts` prerelease, and call the action with a Blueprint pointing at the resulting URL.

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

Translation: the action does not require any trust in PR code. The zip is treated as opaque bytes everywhere except inside the Playground iframe, where the WebAssembly sandbox is the actual mitigation.

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
| `blueprint-json` | Rendered Blueprint JSON string. |
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

Without these, the run startup-fails with no logs (a hard-to-diagnose GitHub default). See [Troubleshooting](#troubleshooting).

### Template variables

Available in `description-template` and `comment-template` strings (case-insensitive `{{NAME}}` syntax):

| Variable | Value |
|---|---|
| `PLAYGROUND_BUTTON` | Full button HTML — recommended in any custom template. |
| `PLAYGROUND_URL` | Full Playground URL with embedded blueprint. |
| `PLAYGROUND_BUTTON_IMAGE_URL` | URL of the button image asset. |
| `PLAYGROUND_BLUEPRINT_JSON` | Stringified Blueprint JSON. |
| `PLAYGROUND_BLUEPRINT_DATA_URL` | Data URL of the Blueprint. |
| `PLAYGROUND_HOST` | Playground host (default `https://playground.wordpress.net`). |
| `PR_NUMBER`, `PR_TITLE`, `PR_HEAD_REF`, `PR_HEAD_SHA`, `PR_BASE_REF` | Pull request metadata. |
| `REPO_OWNER`, `REPO_NAME`, `REPO_FULL_NAME`, `REPO_SLUG` | Repository metadata. |
| `PLUGIN_PATH`, `PLUGIN_SLUG` | Set when `plugin-path:` is provided. |
| `THEME_PATH`, `THEME_SLUG` | Set when `theme-path:` is provided. |

All variables except `PLAYGROUND_BUTTON` are HTML-escaped before substitution.

---

## Limitations & gotchas

- **Two workflow files when there's a build step.** GitHub's permission model around fork PRs makes this unavoidable. The reusable workflows minimise but don't eliminate the boilerplate.
- **Permissions ceiling is rigid.** Reusable workflows declare a max permission set; callers can match but not extend. Almost certainly a feature, but worth naming if you need the publish workflow to also push tags.
- **Build and publish workflows must be pinned to compatible versions.** The artifact-naming format is the implicit interface between them. Use the same `@v3` (or branch ref) in both.
- **Fork PR build output becomes public.** The publish workflow never trusts the zip, but it does upload it to a public release URL so Playground can fetch it. Keep `artifacts-to-keep` low unless you deliberately want longer retention.
- **`{{ARTIFACT_URL:<name>}}` substitution is the only template feature.** No conditionals, no loops, no other placeholders. For per-PR variable shapes, write the blueprint at build time and use `blueprint-from-artifact: true`.
- **One zip per `artifacts` entry.** Multi-file install bundles still need a hand-rolled flow.
- **Plugin zips must extract to a slug-named folder.** When you `zip -r my-plugin.zip .` from inside the plugin dir, the zip contents are at the root, and Playground will install them with no slug folder. Wrap with a directory: `mkdir stage/my-plugin && rsync -a ./ stage/my-plugin/ && (cd stage && zip -r ../my-plugin.zip my-plugin)`.
- **Vite/webpack assets need stable filenames.** Playground enqueues from a fixed path, so disable hashing on the entry file (`rollupOptions.output.entryFileNames: 'admin.js'`) or read the build manifest in PHP.
- **Hidden directories are skipped by `actions/upload-artifact@v4`.** If you stage your bundle in a `.foo/` directory it'll silently produce an empty artifact. Use a non-hidden name.
- **`fetch-depth: 0` is required for diffs.** The default checkout is shallow (depth 1). Diffs against the PR base ref need full history, otherwise `git diff` fails with "no merge base."
- **The `ci-artifacts` release is shared across all PRs.** Each PR's zips are unique (`pr-<N>-<SHA>-<name>.zip`); cleanup keeps the N most recent commit-sets per PR.
- **`artifacts-to-keep` must be a positive integer or `keep-all`.** `0`, negative numbers, and arbitrary strings fail before any release assets are uploaded.
- **`workflow_run`-triggered workflows always read their YAML from the default branch.** Workflow changes on a PR branch don't take effect until merged. Test publish-side changes on a scratch repo first.
- **Private repos won't work.** Playground runs in the user's browser and needs unauthenticated download URLs. `git:directory` and release assets in private repos both require auth Playground doesn't have. Make the repo public or self-host the zip.

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

### The build workflow uploads an empty artifact

If you see `No files were found with the provided path: ...`, your staging directory probably starts with a dot. `actions/upload-artifact@v4` excludes hidden files unless `include-hidden-files: true`. Rename the dir.

### The Preview button 404s when clicked

Either the artifact wasn't uploaded, or the release is a draft (auth-protected). Check the `ci-artifacts` release in your repo's Releases page. If it's a draft, flip it to a prerelease — the action does this automatically for new releases but won't change an existing draft.

### My plugin needs `composer install` or `npm run build` and shows up empty

You're using `plugin-path:` on the action directly, which uses `git:directory` and ships your repo at HEAD with no build step. Switch to the [build-step setup](#with-a-build-step) — `composer install` and `npm ci` need to run in CI before zipping.

### `git diff origin/$GITHUB_BASE_REF...HEAD` fails with "no merge base"

The default `actions/checkout` is shallow. Set `fetch-depth: 0` on the build reusable workflow input.

### "PHP.run() failed with exit code 255" with no stderr

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

The common pre-v3 advanced pattern asked you to maintain ~107 lines of YAML across two workflow files (hand-rolled `actions/github-script` for parsing artifact metadata, hand-rolled `node` heredoc for building the Blueprint, plus a manual one-time UI step to publish a draft release). All of that is now internal to the reusable workflows. If you used less-common `expose-artifact-on-public-url` inputs such as `artifact-source-repository`, `release-repository`, `create-release-if-missing`, or `cleanup-enabled`, keep using the legacy helper or wrap the reusable workflow until v3 grows those knobs.

To migrate:

1. **Replace your build workflow.** Move whatever it ran (`composer install`, `npm ci`, etc.) into the `build-command:` input of `preview-build.yml@v3`. Replace `actions/upload-artifact@v4` with `name=path` lines in `artifacts:`.
2. **Replace your publish workflow.** Pick a [blueprint mode](#reusable-workflow-preview-publishyml-v3): `kind:` for a single zip, `blueprint:` for fixed shapes, `blueprint-from-artifact:` for per-PR shapes. Add the `permissions:` block on both the workflow and the calling job.
3. **One-time:** if you have an existing `ci-artifacts` draft release, either delete it (the next run creates a fresh prerelease automatically) or flip it from draft → prerelease in the Releases UI. Without this, Playground continues to silently 404 on existing assets.

Old README content (covering the manually-orchestrated pattern, plus the legacy github-proxy.com URL scheme that this action's blueprints used to rewrite from) is preserved in this repo's git history — `git log -- README.md` then check out any pre-v3 commit, or browse the file at that commit on GitHub.

---

## Contributing

Issues and PRs welcome at <https://github.com/WordPress/action-wp-playground-pr-preview>.

The four [example repos](#see-it-live) are the de-facto integration tests. If you add a new feature or fix a bug, point an example repo at your branch and confirm the smoke-test PR still produces a working Preview button.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
