# "Try it in Playground" GitHub Workflow for WordPress

This workflow automatically adds a "Try it in Playground" button to your pull requests, enabling easy testing and feedback for WordPress plugins and themes.

<img width="1000" alt="CleanShot 2025-11-10 at 11 29 52@2x" src="https://github.com/user-attachments/assets/631e793d-3e56-4f74-940e-eac60919f52d" />

## Usage

Say you're developing a plugin called `my-awesome-plugin` and your source code lives in the repository root. Even though this workflow supports testing CI artifacts, for now assume your plugin doesn't have a build step.

To enable the "Try it in Playground" button, create a `.github/workflows/pr-preview.yml` file in your repository with the following content:

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
      - name: Post Playground Preview Button
        uses: WordPress/action-wp-playground-pr-preview@v2
        with:
          # "append-to-description"  – add the button to the PR description
          # "comment"           – create a new comment with the preview button
          mode: "append-to-description"

          # Use "." if plugin is in repository root
          plugin-path: .
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

> **Important:** `WordPress/action-wp-playground-pr-preview@v2` is a regular action. Always reference it inside a job step (under `jobs.<job_id>.steps`). GitHub only allows `jobs.<job_id>.uses` for reusable workflows that point to another workflow file such as `owner/repo/.github/workflows/workflow.yml@ref`.

## Examples

### Plugin repository without a CI build process

See the usage example above. You may also want to inspect a live repository that uses this action: [adamziel/preview-in-playground-button-plugin-example](https://github.com/adamziel/preview-in-playground-button-plugin-example/pull/3).

### Plugin or theme repository with a CI build process

See the [preview-in-playground-button-built-artifact-example](#advanced-testing-built-ci-artifacts) section below for an example of how to test built artifacts in WordPress Playground.

### Theme repository without a CI build process

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
      - name: Post Playground Preview Button
        uses: WordPress/action-wp-playground-pr-preview@v2
        with:
          # Use "." if theme is in repository root
          theme-path: .
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Plugin in a subdirectory

If your plugin lives in `plugins/my-awesome-plugin/`:

```yaml
with:
  plugin-path: plugins/my-awesome-plugin
```

### Post as comment instead of updating description

```yaml
with:
  plugin-path: .
  mode: comment
```

### Custom Blueprint

For advanced configurations, you can provide a custom blueprint:

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
                  }
                },
                {
                  "step": "installPlugin",
                  "pluginData": {
                    "resource": "wordpress.org/plugins",
                    "slug": "woocommerce"
                  }
                }
              ]
            };
            return JSON.stringify(blueprint);
          result-encoding: string

  playground-preview:
    name: Post Playground Preview Button
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

### External Blueprint URL

Already hosting your blueprint JSON elsewhere? Provide a `blueprint-url` input pointing to that file:

```yaml
with:
  mode: append-to-description
  blueprint-url: https://example.com/path/to/blueprint.json
```

When `blueprint-url` is set, you can omit `plugin-path`, `theme-path`, and `blueprint`—the action links directly to the remote blueprint via `?blueprint-url=...`.

### Customize the preview button/comment

Customize the preview button appearance:

```yaml
with:
  plugin-path: .
  description-template: |
    ### Test this PR in WordPress Playground

    {{PLAYGROUND_BUTTON}}

    **Branch:** {{PR_HEAD_REF}}
    **Testing:** Plugin `{{PLUGIN_SLUG}}`
```

Or customize comment format:

```yaml
with:
  mode: comment
  comment-template: |
    ## Preview Changes in WordPress Playground

    {{PLAYGROUND_BUTTON}}

    ### Testing Instructions
    1. Click the button above to open Playground
    2. Navigate to Plugins → Installed Plugins
    3. Verify that `{{PLUGIN_SLUG}}` is active
    4. Test the new functionality

    **PR:** #{{PR_NUMBER}} - {{PR_TITLE}}
```

## Usage in other repositories

* WordPress/blueprints: [CI workflow](https://raw.githubusercontent.com/WordPress/blueprints/6390c687c03035e088d1646cad28b8310bb3f705/.github/workflows/preview-comment.yml), [Sample PR](https://github.com/WordPress/blueprints/pull/155)
* adamziel/preview-in-playground-button-plugin-example: [CI workflow](https://raw.githubusercontent.com/adamziel/preview-in-playground-button-plugin-example/d15b741deaae32ebef5bdf1009aaed3c614e6f4a/.github/workflows/pr-playground-preview.yml), [Sample PR](https://github.com/adamziel/preview-in-playground-button-plugin-example/pull/3)
* adamziel/preview-in-playground-button-built-artifact-example: [CI workflow](https://raw.githubusercontent.com/adamziel/preview-in-playground-button-built-artifact-example/83f91ecf83843b102d19afdf56802b2608a2e98f/.github/workflows/pr-playground-preview.yml), [Sample PR](https://github.com/adamziel/preview-in-playground-button-built-artifact-example/pull/2)

## Inputs

### `mode`

**Optional** How to publish the preview button.

Accepted values:
- `append-to-description` (default) – Automatically updates the PR description with a managed block containing the preview button. The block is wrapped in HTML comment markers (`<!-- wp-playground-preview:start -->` and `<!-- wp-playground-preview:end -->`) so it can be updated on subsequent workflow runs.
- `comment` – Posts the preview button as a PR comment. Updates the same comment on subsequent runs rather than creating duplicates.

**Default:** `append-to-description`

### `playground-host`

**Optional** Base WordPress Playground host URL used to build the preview link.

The workflow appends blueprint parameters to this URL to create the final preview link.

**Default:** `https://playground.wordpress.net`

### `blueprint`

**Optional** Custom WordPress Blueprint as a JSON string.

When provided, this blueprint is used as-is and the `plugin-path` and `theme-path` inputs are ignored. If omitted, the workflow automatically generates a blueprint based on `plugin-path` or `theme-path`.

The blueprint must be a complete, ready-to-use JSON object (not a template). It will be URL-encoded and passed to Playground via the `blueprint-url` parameter.

Learn more about blueprints: https://wordpress.github.io/wordpress-playground/blueprints/

**Example (custom blueprint with specific WordPress version):**
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

### `plugin-path`

**Optional** Installs and activates a plugin from a path inside the repository.

This is a shortcut for plugins that don't need any bundling and can be installed directly from the repository.

The path string should point to a directory containing a valid WordPress plugin with a main plugin file.

This option is ignored if the `blueprint` input is provided.

**Example (plugin in repository root):**
```yaml
with:
  plugin-path: .
```

**Example (plugin in subdirectory):**
```yaml
with:
  plugin-path: plugins/my-awesome-plugin
```

### `theme-path`

**Optional** Installs and activates a theme from a path inside the repository.

The path string should point to a directory containing a valid WordPress theme with a style.css file.

This option is ignored if the `blueprint` input is provided.

**Example (theme in repository root):**
```yaml
with:
  theme-path: .
```

**Example (theme in subdirectory):**
```yaml
with:
  theme-path: themes/my-cool-theme
```

**Example (testing theme + plugin):**
```yaml
with:
  plugin-path: plugins/my-plugin
  theme-path: themes/my-theme
```

### `description-template`

**Optional** Custom markdown/HTML template for the content added to PR descriptions (only used in `append-to-description` mode).

The template supports variable interpolation using `{{VARIABLE_NAME}}` syntax (case-insensitive). The rendered content will be wrapped in HTML comment markers so it can be updated on subsequent runs.

**Available template variables:**
- `{{PLAYGROUND_BUTTON}}` - Rendered preview button HTML (recommended to include)
- `{{PLAYGROUND_URL}}` - Full URL to the Playground preview
- `{{PLAYGROUND_BUTTON_IMAGE_URL}}` - URL to the button image
- `{{PLAYGROUND_BLUEPRINT_JSON}}` - Complete blueprint JSON string
- `{{PLAYGROUND_BLUEPRINT_DATA_URL}}` - Data URL containing the blueprint
- `{{PLAYGROUND_HOST}}` - Playground host URL
- `{{PR_NUMBER}}` - Pull request number
- `{{PR_TITLE}}` - Pull request title
- `{{PR_HEAD_REF}}` - Source branch name
- `{{PR_HEAD_SHA}}` - Latest commit SHA
- `{{PR_BASE_REF}}` - Target branch name
- `{{REPO_OWNER}}` - Repository owner username/org
- `{{REPO_NAME}}` - Repository name
- `{{REPO_FULL_NAME}}` - Full repository name (owner/repo)
- `{{REPO_SLUG}}` - Sanitized repository name
- `{{PLUGIN_PATH}}` - Plugin path (if provided)
- `{{PLUGIN_SLUG}}` - Derived plugin slug
- `{{THEME_PATH}}` - Theme path (if provided)
- `{{THEME_SLUG}}` - Derived theme slug

**Default template:**
```
{{PLAYGROUND_BUTTON}}
```

**Example (custom template with additional context):**
```yaml
with:
  description-template: |
    ### Test this PR in WordPress Playground

    {{PLAYGROUND_BUTTON}}

    **Branch:** {{PR_HEAD_REF}}
    **Testing:** Plugin `{{PLUGIN_SLUG}}`
```

### `comment-template`

**Optional** Custom markdown/HTML template for PR comments (only used in `comment` mode).

The template supports variable interpolation using `{{VARIABLE_NAME}}` syntax (case-insensitive). The rendered comment will include a hidden identifier marker so it can be updated on subsequent runs.

**Available template variables:** Same as `description-template` above.

**Default template:**
```markdown
### WordPress Playground Preview

The changes in this pull request can previewed and tested using a WordPress Playground instance.

{{PLAYGROUND_BUTTON}}
```

**Example (custom comment with testing instructions):**
```yaml
with:
  mode: comment
  comment-template: |
    ## Preview Changes in WordPress Playground

    {{PLAYGROUND_BUTTON}}

    ### Testing Instructions
    1. Click the button above to open Playground
    2. Navigate to Plugins → Installed Plugins
    3. Verify that `{{PLUGIN_SLUG}}` is active
    4. Test the new functionality

    **PR:** #{{PR_NUMBER}} - {{PR_TITLE}}
```

### `restore-button-if-removed`

**Optional** Only applies to `append-to-description` mode.

Controls whether the preview button is automatically restored to the PR description if removed by the PR author.

**When `true` (default):**
- If PR author completely removes the button markers → workflow re-adds them on next run
- If PR author replaces button with custom placeholder → workflow respects it (does not update)

**When `false`:**
- If PR author completely removes the button markers → they stay removed
- If markers exist with custom placeholder → workflow respects it (does not update)
- If markers exist with the button → workflow updates the button normally

**How PR authors can keep the button removed:**
1. Replace with placeholder (always works):
   ```html
   <!-- wp-playground-preview:start -->
   <!-- Preview button hidden by PR author -->
   <!-- wp-playground-preview:end -->
   ```

2. Delete completely (only works when this is set to false):
   Delete the entire managed block including the markers

**Example (respect when PR author removes button):**
```yaml
with:
  mode: append-to-description
  restore-button-if-removed: false
```

**Default:** `true`

## Secrets

### `github-token`

**Optional** GitHub token used to update PR descriptions and post/update comments.

If not provided, defaults to the calling workflow's `GITHUB_TOKEN` (recommended for most cases).

**Required permissions:**
- `pull-requests: write` - To update PR descriptions and manage comments
- `contents: read` - To access repository information

The default `GITHUB_TOKEN` automatically has these permissions in most workflows.

Only provide a custom token if you need to:
- Use a fine-grained personal access token with specific permissions
- Work around workflow restrictions in your repository

**Example:**

```yaml
steps:
  - uses: WordPress/action-wp-playground-pr-preview@v2
    with:
      plugin-path: .
      github-token: ${{ secrets.CUSTOM_TOKEN }}
```

## Outputs

- `preview-url`: The full URL to the WordPress Playground preview.
- `blueprint-json`: The complete blueprint JSON string used for the preview.
- `rendered-description`: The rendered description content (when using `append-to-description` mode).
- `rendered-comment`: The rendered comment content (when using `comment` mode).
- `mode`: The mode used for publishing the preview.
- `comment-id`: The ID of the created/updated comment (when using `comment` mode).

---

## Advanced: Testing Built CI Artifacts

If your plugin or theme requires a build step, you can use the `expose-artifact-on-public-url` action to publish CI artifacts on a URL that WordPress Playground can fetch. Under the hood the action uploads ZIP files to one draft release (shared across all PRs) and keeps only the most recent artifacts you tell it to keep.

> **:warning: Important Notice:**  
> Before using the preview button with artifacts you **must make the draft release public (publish it or flag it as a pre-release)**. Otherwise WordPress Playground cannot download the ZIP and the button fails.

### Why two workflow files?

Pull requests from forks run with the more restrictive `pull_request` security model: they cannot access repository secrets, cannot write to releases, and cannot update PR descriptions. The safest pattern is therefore to split the process into two workflows:

- `PR Playground Preview - Build` runs on every `pull_request` with the default read-only token. It builds your ZIP and uploads it as an artifact. Because forked PRs run this workflow in the base repository, the artifact always ends up in a trusted account even when the code came from a fork.
- `PR Playground Preview - Publish` is triggered via `workflow_run` only after the build workflow succeeds. This job runs with `contents: write` and `pull-requests: write`, so it can expose the artifact on a release, generate a Playground blueprint, and update the PR description. It never checks out the untrusted code—it just manipulates artifacts produced by the build workflow.

This separation keeps secrets and write permissions away from untrusted code while still giving fork contributors the same Playground experience.

### Workflow 1: `PR Playground Preview - Build`

Create `.github/workflows/pr-playground-preview-build.yml` (or similar) with a minimal set of permissions. The example below builds a Gutenberg ZIP and names the artifact with both the PR number and the head SHA so the publish workflow can map the correct preview back to the PR.

```yaml
name: PR Playground Preview - Build

# Use pull_request for untrusted code with read-only permissions
# No access to secrets, no write permissions
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
          # Explicitly disable credential persistence for security
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

### Workflow 2: `PR Playground Preview - Publish`

Create a second workflow (for example `.github/workflows/pr-playground-preview-publish.yml`) that listens for the build workflow to finish. Because it runs in a separate, privileged workflow you can safely grant it `contents: write` and `pull-requests: write`. The script step at the beginning finds the artifact that belongs to the originating PR, and the remaining steps expose the ZIP, build a blueprint, and append the Playground button to the PR description.

```yaml
name: PR Playground Preview - Publish

# Use workflow_run for privileged operations
# Runs with write permissions and access to secrets
# Operates on artifacts from the unprivileged build workflow
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
    # Only run if the build workflow succeeded and was triggered by a pull_request
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

            // Parse: gutenberg-plugin-zip-pr123-abc123def...
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
        uses: WordPress/action-wp-playground-pr-preview/.github/actions/expose-artifact-on-public-url@main
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
        uses: WordPress/action-wp-playground-pr-preview@main
        with:
          mode: append-to-description
          blueprint: ${{ steps.blueprint.outputs.blueprint }}
          pr-number: ${{ steps.pr-metadata.outputs.pr-number }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Key takeaways from this setup:

- `artifact-source-run-id` tells the action to read artifacts created by the build workflow. You never need to redownload or re-upload ZIPs manually.
- The naming convention `gutenberg-plugin-zip-pr${PR}-${SHA}` makes it trivial to recover the PR number and commit from inside the publish workflow.
- `artifacts-to-keep` automatically prunes old ZIPs for the same PR so your release draft does not grow without bounds.

You can adapt the same pattern for theme builds, different package managers, or multiple artifacts—just ensure the publish workflow can deterministically find the right artifact name for each PR.

### Expose Artifact Inputs

#### `artifact-name`

**Required** Name of the GitHub Actions artifact to expose on a public URL

This should match the name used in actions/upload-artifact@v4 in the build job.
The artifact should contain a single zip file.

Some artifacts have dynamic names, e.g. `built-plugin-${{ github.event.pull_request.number }}-${{ github.sha }}`.
You can use the same syntax to format the artifact-name for this job.

Example: 'built-plugin'

#### `artifact-filename`

**Optional** Name of the zip file inside the downloaded artifact bundle.

**Default:** `plugin.zip`

Set this if your artifact uploads a differently named ZIP (for example `theme.zip`).

#### `artifact-source-run-id`

**Optional** ID of the workflow run that originally uploaded the artifact.

**Default:** Uses the current workflow run.

Set this input when you're running the action in a `workflow_run` (or any other) workflow that needs to pull artifacts from a *different* run. Example: `${{ github.event.workflow_run.id }}`.

#### `artifact-source-repository`

**Optional** Repository (`owner/name`) that owns the workflow run referenced by `artifact-source-run-id`.

**Default:** Uses the repository that invokes the action.

Only override this when your build workflow runs in another repository.

#### `pr-number`

**Required** The current pull request number.

**Example:** `${{ github.event.pull_request.number }}`

#### `commit-sha`

**Required** The current commit SHA.

**Example:** `${{ github.sha }}`

#### `artifacts-to-keep`

**Optional** Number of most recent artifacts to keep for this PR (default: 2)

After exposing a new artifact, this workflow automatically deletes older
artifacts for the same PR, keeping only the N most recent.

#### `release-tag`

**Optional** GitHub release tag to use for exposing artifacts.

**Default:** `ci-artifacts`

#### `release-repository`

**Optional** Target repository in `owner/name` form when you want to store artifacts somewhere other than the current repository.

**Default:** Uses the repository that runs the workflow.

#### `create-release-if-missing`

**Optional** Automatically creates the `release-tag` if it does not already exist.

**Default:** `true`

#### `cleanup-enabled`

**Optional** Set to `false` to skip deleting older artifacts for the same PR.

**Default:** `true`

#### `github-token`

**Optional** Token with `contents: write` access to the release repository.

If omitted, the action falls back to the workflow's `${{ secrets.GITHUB_TOKEN }}`.

### Expose Artifact Outputs

#### `artifact-url`

Public download URL for the exposed artifact.

**Format:** `https://github.com/OWNER/REPO/releases/download/TAG/pr-NUMBER-SHA.zip`

#### `artifact-name`

Filename of the exposed artifact.

**Format:** `pr-NUMBER-SHA.zip`

## Troubleshooting

### GitHub reports a `workflow-call` lint error

If you see `reusable workflow call ... is not following the format "owner/repo/path/to/workflow.yml@ref"`, it means you tried to run this action as a reusable workflow. `WordPress/action-wp-playground-pr-preview@v2` is a regular action, so keep it under `jobs.<job_id>.steps`:

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

As mentioned in [Advanced: Testing Built CI Artifacts](#advanced-testing-built-ci-artifacts), the artifact helper stores files on a single draft release. Draft releases remain private until they are published. Publish or mark that release as a pre-release so the download URL becomes public; otherwise WordPress Playground cannot fetch the zip and the preview button fails.

### Workflow fails with "Resource not accessible by integration"

Updating PR descriptions or comments requires the workflow (or custom token) to have `pull-requests: write` plus `contents: read`. Add the permissions block from the basic example or provide a PAT with the same scopes. Without those permissions GitHub blocks the API call and you will see this error in the `Post Playground Preview Button` step.

### Step fails with "You must configure plugin-path/theme-path/blueprint"

The action needs either `plugin-path`, `theme-path`, `blueprint`, or `blueprint-url`. Forgetting to set any of them causes an early failure. Point `plugin-path` or `theme-path` to the folder that contains `my-plugin.php` or `style.css`, or pass a custom blueprint if you have more complex needs.

### Playground opens but plugin changes look stale

When the plugin lives in a subdirectory (for example, `plugins/my-awesome-plugin`), you must point `plugin-path` at that subfolder. Otherwise the action zips the repository root and Playground never loads your updated code. The same applies to built artifacts—ensure the uploaded ZIP contains the build you expect.

### Custom blueprint fails with "Unexpected token" or blank Playground

Custom blueprints are JSON strings; a missing comma or dangling comment will break the preview. Validate the blueprint locally (e.g., `node -e 'JSON.parse(fs.readFileSync("blueprint.json"))'`) before passing it through the workflow, or store it in a separate `.json` file and feed it via `blueprint-url`.

## License

This project is licensed under the GPL-2.0-or-later License - see the [LICENSE](LICENSE) file for details.
