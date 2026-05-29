# WordPress Playground PR Preview Action

Add a WordPress Playground preview link to pull requests for WordPress plugins and themes.

The action builds a Playground URL, then publishes it either in the pull request description or in a managed pull request comment. For plugins and themes that can run directly from the repository, the action can generate the WordPress Blueprint for you. For projects that need a build step, see [Testing built CI artifacts](#testing-built-ci-artifacts).

<img width="1000" alt="Pull request with a WordPress Playground preview button" src="https://github.com/user-attachments/assets/631e793d-3e56-4f74-940e-eac60919f52d" />

## Quick start

Use this setup when your plugin can be installed directly from the repository, without a build step. This example assumes the plugin files live in the repository root.

Create `.github/workflows/pr-preview.yml`:

```yaml
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
      - name: Post Playground preview button
        uses: WordPress/action-wp-playground-pr-preview@v2
        with:
          plugin-path: .
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

`WordPress/action-wp-playground-pr-preview@v2` is a GitHub Action, not a reusable workflow. Use it inside a job step, as shown above.

By default, the action appends a managed block to the pull request description. Re-running the workflow updates that block instead of adding another button.

## Common examples

### Theme in the repository root

```yaml
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
      - name: Post Playground preview button
        uses: WordPress/action-wp-playground-pr-preview@v2
        with:
          theme-path: .
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Plugin in a subdirectory

```yaml
with:
  plugin-path: plugins/my-awesome-plugin
```

### Theme and plugin together

```yaml
with:
  plugin-path: plugins/my-plugin
  theme-path: themes/my-theme
```

### Publish the preview as a comment

```yaml
with:
  plugin-path: .
  mode: comment
```

In `comment` mode, the action updates one managed comment on later runs rather than creating duplicates.

### Use a custom Blueprint JSON string

Use `blueprint` when you need a Playground setup that the `plugin-path` and `theme-path` shortcuts cannot describe.

```yaml
name: PR Playground Preview
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

jobs:
  create-blueprint:
    name: Create Blueprint
    runs-on: ubuntu-latest
    outputs:
      blueprint: ${{ steps.blueprint.outputs.result }}
    steps:
      - name: Create Blueprint
        id: blueprint
        uses: actions/github-script@v7
        with:
          script: |
            const blueprint = {
              steps: [
                {
                  step: "installPlugin",
                  pluginData: {
                    resource: "git:directory",
                    url: `https://github.com/${context.repo.owner}/${context.repo.repo}.git`,
                    ref: context.payload.pull_request.head.ref,
                    path: "/"
                  },
                  options: { activate: true }
                },
                {
                  step: "installPlugin",
                  pluginData: {
                    resource: "wordpress.org/plugins",
                    slug: "woocommerce"
                  }
                }
              ]
            };
            return JSON.stringify(blueprint);
          result-encoding: string

  playground-preview:
    name: Post Playground preview button
    needs: create-blueprint
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: WordPress/action-wp-playground-pr-preview@v2
        with:
          blueprint: ${{ needs.create-blueprint.outputs.blueprint }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

When `blueprint` is set, `plugin-path` and `theme-path` are ignored.

### Link to a Blueprint hosted elsewhere

If you already publish a Blueprint JSON file at a public URL, pass that URL with `blueprint-url`:

```yaml
with:
  mode: append-to-description
  blueprint-url: https://example.com/path/to/blueprint.json
```

When `blueprint-url` is set, the action links Playground directly to that URL. You do not need to set `plugin-path`, `theme-path`, or `blueprint`.

### Customize the description or comment

Use `description-template` for `append-to-description` mode:

```yaml
with:
  plugin-path: .
  description-template: |
    ### Test this PR in WordPress Playground

    {{PLAYGROUND_BUTTON}}

    **Branch:** {{PR_HEAD_REF}}
    **Testing:** Plugin `{{PLUGIN_SLUG}}`
```

Use `comment-template` with `mode: comment`:

```yaml
with:
  mode: comment
  plugin-path: .
  comment-template: |
    ## Preview Changes in WordPress Playground

    {{PLAYGROUND_BUTTON}}

    ### Testing Instructions
    1. Click the button above to open Playground.
    2. Navigate to Plugins → Installed Plugins.
    3. Verify that `{{PLUGIN_SLUG}}` is active.
    4. Test the changes in this pull request.

    **PR:** #{{PR_NUMBER}} - {{PR_TITLE}}
```

## Example repositories

- WordPress/blueprints: [CI workflow](https://raw.githubusercontent.com/WordPress/blueprints/6390c687c03035e088d1646cad28b8310bb3f705/.github/workflows/preview-comment.yml), [sample PR](https://github.com/WordPress/blueprints/pull/155)
- adamziel/preview-in-playground-button-plugin-example: [CI workflow](https://raw.githubusercontent.com/adamziel/preview-in-playground-button-plugin-example/d15b741deaae32ebef5bdf1009aaed3c614e6f4a/.github/workflows/pr-playground-preview.yml), [sample PR](https://github.com/adamziel/preview-in-playground-button-plugin-example/pull/3)
- adamziel/preview-in-playground-button-built-artifact-example: [CI workflow](https://raw.githubusercontent.com/adamziel/preview-in-playground-button-built-artifact-example/83f91ecf83843b102d19afdf56802b2608a2e98f/.github/workflows/pr-playground-preview.yml), [sample PR](https://github.com/adamziel/preview-in-playground-button-built-artifact-example/pull/2)

## Inputs

### `mode`

**Optional.** How to publish the preview link.

Accepted values:

- `append-to-description` (default): updates a managed block in the pull request description. The block is wrapped in `<!-- wp-playground-preview:start -->` and `<!-- wp-playground-preview:end -->` markers.
- `comment`: posts or updates a managed pull request comment.

**Default:** `append-to-description`

### `playground-host`

**Optional.** Base WordPress Playground host URL used to build the preview link.

**Default:** `https://playground.wordpress.net`

### `blueprint`

**Optional.** Complete WordPress Blueprint JSON, passed as a string.

Use this when you want full control over the Playground setup. If this input is set, `plugin-path` and `theme-path` are ignored.

Learn more about Blueprints: https://wordpress.github.io/wordpress-playground/blueprints/

Example:

```yaml
with:
  blueprint: |
    {
      "$schema": "https://playground.wordpress.net/blueprint-schema.json",
      "preferredVersions": {
        "php": "8.3",
        "wp": "6.4"
      },
      "steps": [
        {
          "step": "installPlugin",
          "pluginData": {
            "resource": "git:directory",
            "url": "https://github.com/owner/repo.git",
            "ref": "feature-branch",
            "path": "my-plugin"
          },
          "options": { "activate": true }
        }
      ]
    }
```

### `blueprint-url`

**Optional.** Public URL for a Blueprint JSON file.

Use this when another workflow or service already publishes the Blueprint. If this input is set, the action uses it directly in the Playground link.

### `plugin-path`

**Optional.** Path to a WordPress plugin directory inside the repository.

Use this shortcut when the plugin can be installed directly from the repository. The directory should contain a valid WordPress plugin file.

This option is ignored if `blueprint` is provided.

Examples:

```yaml
with:
  plugin-path: .
```

```yaml
with:
  plugin-path: plugins/my-awesome-plugin
```

### `theme-path`

**Optional.** Path to a WordPress theme directory inside the repository.

The directory should contain a valid WordPress theme, including `style.css`.

This option is ignored if `blueprint` is provided.

Examples:

```yaml
with:
  theme-path: .
```

```yaml
with:
  theme-path: themes/my-cool-theme
```

### `description-template`

**Optional.** Markdown/HTML template for content added to the pull request description. Only used in `append-to-description` mode.

The rendered content is wrapped in managed markers so it can be updated by later workflow runs.

**Default:**

```markdown
{{PLAYGROUND_BUTTON}}
```

### `comment-template`

**Optional.** Markdown/HTML template for the managed pull request comment. Only used in `comment` mode.

The rendered comment includes a hidden marker so the action can update the same comment on later runs.

**Default:**

```markdown
### WordPress Playground Preview

The changes in this pull request can be previewed and tested in WordPress Playground.

{{PLAYGROUND_BUTTON}}
```

### Template variables

`description-template` and `comment-template` support case-insensitive `{{VARIABLE_NAME}}` placeholders.

Available variables:

- `{{PLAYGROUND_BUTTON}}`: rendered preview button HTML
- `{{PLAYGROUND_URL}}`: full URL to the Playground preview
- `{{PLAYGROUND_BUTTON_IMAGE_URL}}`: URL to the button image
- `{{PLAYGROUND_BLUEPRINT_JSON}}`: generated or supplied Blueprint JSON string
- `{{PLAYGROUND_BLUEPRINT_DATA_URL}}`: data URL containing the Blueprint, or the supplied `blueprint-url`
- `{{PLAYGROUND_HOST}}`: Playground host URL
- `{{PR_NUMBER}}`: pull request number
- `{{PR_TITLE}}`: pull request title
- `{{PR_HEAD_REF}}`: source branch name
- `{{PR_HEAD_SHA}}`: latest commit SHA
- `{{PR_BASE_REF}}`: target branch name
- `{{REPO_OWNER}}`: repository owner
- `{{REPO_NAME}}`: repository name
- `{{REPO_FULL_NAME}}`: full repository name (`owner/repo`)
- `{{REPO_ARCHIVE_ROOT}}`: generated archive root directory name
- `{{REPO_SLUG}}`: sanitized repository name
- `{{PLUGIN_PATH}}`: plugin path, if provided
- `{{PLUGIN_SLUG}}`: derived plugin slug, if `plugin-path` is provided
- `{{THEME_PATH}}`: theme path, if provided
- `{{THEME_SLUG}}`: derived theme slug, if `theme-path` is provided

### `restore-button-if-removed`

**Optional.** Controls what happens when the managed description block is missing. Only used in `append-to-description` mode.

When set to `true`, the action adds the managed block again on the next run. When set to `false`, the action leaves the pull request description unchanged if the block has been removed.

The action also respects custom content between the managed markers. This lets a PR author replace the button with a note without the workflow overwriting it:

```html
<!-- wp-playground-preview:start -->
<!-- Preview button hidden by PR author -->
<!-- wp-playground-preview:end -->
```

**Default:** `true`

### `github-token`

**Required.** GitHub token used to update pull request descriptions and comments.

For most workflows, pass `${{ secrets.GITHUB_TOKEN }}` and include the permissions block shown in the examples. The token needs:

- `pull-requests: write`
- `contents: read`

Example:

```yaml
steps:
  - uses: WordPress/action-wp-playground-pr-preview@v2
    with:
      plugin-path: .
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

### `pr-number`

**Optional.** Pull request number to update.

Normally the action reads the pull request number from the `pull_request` event payload. Set this input when the action runs from another event, such as `workflow_run`, and needs to update the original pull request.

## Outputs

- `preview-url`: full URL to the WordPress Playground preview.
- `blueprint-json`: Blueprint JSON string used for the preview.
- `rendered-description`: rendered description content for `append-to-description` mode.
- `rendered-comment`: rendered comment content for `comment` mode.
- `mode`: publish mode used by the action.
- `comment-id`: ID of the created or updated comment in `comment` mode.

## Testing built CI artifacts

Use the `plugin-path` and `theme-path` shortcuts only when Playground can install files directly from the repository. If your project needs a build step, publish the built ZIP somewhere Playground can download it, then pass a Blueprint that installs that ZIP.

This repository includes a helper action for that case:

```yaml
uses: WordPress/action-wp-playground-pr-preview/.github/actions/expose-artifact-on-public-url@v2
```

The helper downloads a GitHub Actions artifact, uploads the ZIP to a GitHub release, and returns a public download URL. The main preview action can then use that URL in a custom Blueprint.

> [!IMPORTANT]
> WordPress Playground must be able to download the ZIP without authentication. The helper creates a draft release when the release does not exist. Publish that release before relying on the generated preview links. It can be marked as a pre-release if you do not want it to look like a normal project release.

### Why the artifact example uses two workflows

Pull requests from forks run with limited permissions. They cannot access repository secrets, write to releases, or update pull request descriptions. For repositories that accept forked PRs and need built artifacts, split the process into two workflows:

1. A `pull_request` workflow builds the ZIP with read-only permissions and uploads it as a workflow artifact.
2. A `workflow_run` workflow runs after the build succeeds. It has write permissions, reads the artifact from the completed build, exposes the ZIP on a release, and updates the pull request.

This keeps write permissions away from untrusted pull request code.

### Workflow 1: build the ZIP

Create `.github/workflows/pr-playground-preview-build.yml`. This example builds a Gutenberg ZIP and names the artifact with the pull request number and head SHA so the publish workflow can find the matching artifact.

```yaml
name: PR Playground Preview - Build

on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

permissions:
  contents: read

jobs:
  build-plugin-zip:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false

      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: npm

      - name: Build Gutenberg plugin zip
        env:
          NO_CHECKS: 1
        run: npm run build:plugin-zip

      - name: Upload Gutenberg plugin zip
        uses: actions/upload-artifact@v4
        with:
          name: gutenberg-plugin-zip-pr${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.sha }}
          path: gutenberg.zip
          if-no-files-found: error
```

### Workflow 2: expose the ZIP and post the preview

Create `.github/workflows/pr-playground-preview-publish.yml`. This workflow runs after the build workflow succeeds.

```yaml
name: PR Playground Preview - Publish

on:
  workflow_run:
    workflows: ["PR Playground Preview - Build"]
    types:
      - completed

permissions:
  contents: write
  pull-requests: write

jobs:
  publish-preview:
    runs-on: ubuntu-latest
    if: >
      github.event.workflow_run.event == 'pull_request' &&
      github.event.workflow_run.conclusion == 'success'
    outputs:
      artifact-url: ${{ steps.expose.outputs.artifact-url }}
      artifact-name: ${{ steps.expose.outputs.artifact-name }}
    steps:
      - name: Extract PR metadata from artifact name
        id: pr-metadata
        uses: actions/github-script@v7
        with:
          script: |
            const artifacts = await github.rest.actions.listWorkflowRunArtifacts({
              owner: context.repo.owner,
              repo: context.repo.repo,
              run_id: ${{ github.event.workflow_run.id }},
            });

            const artifact = artifacts.data.artifacts.find(a =>
              a.name.startsWith("gutenberg-plugin-zip-pr")
            );

            if (!artifact) {
              throw new Error('Could not find plugin artifact');
            }

            const match = artifact.name.match(/^gutenberg-plugin-zip-pr(\d+)-(.+)$/);
            if (!match) {
              throw new Error(`Could not parse artifact name: ${artifact.name}`);
            }

            const [, prNumber, commitSha] = match;

            core.setOutput('pr-number', prNumber);
            core.setOutput('commit-sha', commitSha);
            core.setOutput('artifact-name', artifact.name);

      - name: Expose built artifact
        id: expose
        uses: WordPress/action-wp-playground-pr-preview/.github/actions/expose-artifact-on-public-url@v2
        with:
          artifact-name: ${{ steps.pr-metadata.outputs.artifact-name }}
          artifact-filename: gutenberg.zip
          pr-number: ${{ steps.pr-metadata.outputs.pr-number }}
          commit-sha: ${{ steps.pr-metadata.outputs.commit-sha }}
          artifact-source-run-id: ${{ github.event.workflow_run.id }}
          artifacts-to-keep: '2'

      - name: Generate Playground blueprint JSON
        id: blueprint
        run: |
          node - <<'NODE' >> "$GITHUB_OUTPUT"
          const url = process.env.ARTIFACT_URL;
          if (!url) {
            throw new Error('ARTIFACT_URL is required');
          }

          const blueprint = {
            steps: [
              {
                step: 'installPlugin',
                pluginZipFile: {
                  resource: 'url',
                  url,
                },
              },
            ],
          };

          console.log(`blueprint=${JSON.stringify(blueprint)}`);
          NODE
        env:
          ARTIFACT_URL: ${{ steps.expose.outputs.artifact-url }}

      - name: Post Playground preview button
        uses: WordPress/action-wp-playground-pr-preview@v2
        with:
          mode: append-to-description
          blueprint: ${{ steps.blueprint.outputs.blueprint }}
          pr-number: ${{ steps.pr-metadata.outputs.pr-number }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The important details are:

- The build artifact name includes the PR number and commit SHA.
- `artifact-source-run-id` tells the helper to download the artifact from the completed build workflow.
- `pr-number` tells the main preview action which pull request to update, because the second workflow runs on `workflow_run` rather than `pull_request`.
- `artifacts-to-keep` prunes older ZIPs for the same PR.

You can use the same pattern for themes, different build commands, or multiple artifacts. Keep the artifact naming predictable so the publish workflow can identify the right file.

## Expose artifact helper inputs

### `artifact-name`

**Required.** Name of the GitHub Actions artifact to expose.

This should match the `name` used by `actions/upload-artifact@v4`. The artifact should contain a single ZIP file.

### `artifact-filename`

**Optional.** Name of the ZIP file inside the downloaded artifact.

**Default:** `plugin.zip`

### `artifact-source-run-id`

**Optional.** ID of the workflow run that uploaded the artifact.

Use this in a `workflow_run` workflow to read artifacts from the completed build run.

**Default:** current workflow run.

### `artifact-source-repository`

**Optional.** Repository (`owner/name`) that owns the workflow run referenced by `artifact-source-run-id`.

**Default:** repository running the workflow.

### `pr-number`

**Required.** Pull request number used in the exposed ZIP filename and cleanup matching.

### `commit-sha`

**Required.** Commit SHA used in the exposed ZIP filename.

### `artifacts-to-keep`

**Optional.** Number of most recent release assets to keep for this PR. Set to `keep-all` to disable count-based pruning.

**Default:** `2`

### `release-tag`

**Optional.** GitHub release tag used to store exposed artifacts.

**Default:** `ci-artifacts`

### `release-repository`

**Optional.** Repository (`owner/name`) where release assets should be stored.

**Default:** repository running the workflow.

### `create-release-if-missing`

**Optional.** Creates `release-tag` as a draft release if it does not already exist.

**Default:** `true`

### `cleanup-enabled`

**Optional.** Set to `false` to skip cleanup of older artifacts for the same PR.

**Default:** `true`

### `github-token`

**Optional.** Token with `contents: write` access to the release repository.

If omitted, the helper uses the workflow's default GitHub token.

## Expose artifact helper outputs

- `artifact-url`: public download URL for the exposed ZIP.
- `artifact-name`: filename of the exposed ZIP, in the format `pr-NUMBER-SHA.zip`.

## Troubleshooting

### GitHub reports a reusable workflow lint error

If GitHub says `reusable workflow call ... is not following the format "owner/repo/path/to/workflow.yml@ref"`, the action was probably used as a reusable workflow. Move it under `jobs.<job_id>.steps`:

```yaml
jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: WordPress/action-wp-playground-pr-preview@v2
        with:
          plugin-path: .
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### CI artifacts are not accessible in WordPress Playground

The artifact helper stores ZIPs as GitHub release assets. If the release is still a draft, unauthenticated visitors cannot download those assets. Publish the release so WordPress Playground can fetch the ZIP. It can be marked as a pre-release if you do not want it to look like a normal project release.

### Workflow fails with `Resource not accessible by integration`

The token cannot update the pull request. Add this permissions block to the workflow, or provide a token with equivalent access:

```yaml
permissions:
  contents: read
  pull-requests: write
```

### Step fails with `One of plugin-path, theme-path, blueprint, or blueprint-url inputs is required`

The action needs to know what Playground should install. Set `plugin-path`, `theme-path`, `blueprint`, or `blueprint-url`.

### Playground opens but plugin changes look stale

Check that `plugin-path` or `theme-path` points to the directory that contains the plugin or theme files. For built artifacts, check that the uploaded ZIP contains the build output you expect.

### Custom Blueprint fails with a JSON error or opens a blank Playground

Custom Blueprints must be valid JSON. Validate the JSON before passing it to the action. For example:

```bash
node -e 'JSON.parse(require("fs").readFileSync("blueprint.json", "utf8"))'
```

## License

This project is licensed under the GPL-2.0-or-later License. See [LICENSE](LICENSE) for details.
