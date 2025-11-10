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
    permissions:
      contents: read
      pull-requests: write
    uses: WordPress/action-wp-playground-pr-preview@v2
    with:
	  # "append-to-description"  – add the button to the PR description
      # "post-comment"           – create a new comment with the preview button
      mode: "append-to-description"
	  
	  # Use "." if plugin is in repository root
      plugin-path: .
```

## Usage

### Plugin repository with no build process

See the usage example above.

### Theme repository with no build process

```yaml
name: PR Preview
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

jobs:
  preview:
    permissions:
      contents: read
      pull-requests: write
    uses: WordPress/action-wp-playground-pr-preview@v2
    with:
	  # Use "." if theme is in repository root
      theme-path: .
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
  mode: post-comment
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
    permissions:
      contents: read
      pull-requests: write
    uses: WordPress/action-wp-playground-pr-preview@v2
    with:
      blueprint: ${{ needs.create-blueprint.outputs.blueprint }}
```

### Plugin or theme repository with a CI build

See the [preview-in-playground-button-built-artifact-example](preview-in-playground-button-built-artifact-example) section below for an example of how to test built artifacts in WordPress Playground.

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
  mode: post-comment
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

## Inputs

### `mode`

**Optional** How to publish the preview button.

Accepted values:
- `append-to-description` (default) – Automatically updates the PR description with a managed block containing the preview button. The block is wrapped in HTML comment markers (`<!-- wp-playground-preview:start -->` and `<!-- wp-playground-preview:end -->`) so it can be updated on subsequent workflow runs.
- `post-comment` – Posts the preview button as a PR comment. Updates the same comment on subsequent runs rather than creating duplicates.

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

**Optional** Custom markdown/HTML template for PR comments (only used in `post-comment` mode).

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
  mode: post-comment
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

**Example (using default token - recommended):**
```yaml
uses: WordPress/action-wp-playground-pr-preview@v2
with:
  plugin-path: .
# No secrets needed - GITHUB_TOKEN is used automatically
```

**Example (using custom token):**
```yaml
uses: WordPress/action-wp-playground-pr-preview@v2
with:
  plugin-path: .
secrets:
  github-token: ${{ secrets.CUSTOM_TOKEN }}
```

## Outputs

### `preview-url`

The full URL to the WordPress Playground preview.

### `blueprint-json`

The complete blueprint JSON string used for the preview.

### `rendered-description`

The rendered description content (when using `append-to-description` mode).

### `rendered-comment`

The rendered comment content (when using `post-comment` mode).

### `mode`

The mode used for publishing the preview.

### `comment-id`

The ID of the created/updated comment (when using `post-comment` mode).

---

## Advanced: Testing Built CI Artifacts

If your plugin or theme requires a build step, you can use the `expose-artifact-on-public-url.yml` workflow to expose the artifacts created in your CI on a public URL that WordPress Playground can access.

This workflow exposes built artifacts on a public URL. It helps WordPress
Playground preview CI artifacts that are normally not accessible via a public URL.
 
Under the hood, it uses the GitHub releases feature. It creates a single public 
draft release and uploads all the handled artifacts to that release. Note this
means **one technical release in total**, not one per handled PR.

This workflow also automatically cleans up old artifacts for the same PR, keeping
only the N most recent.

Here's how to use it:

```yaml
name: PR Preview with Build
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

permissions:
  contents: write
  pull-requests: write

jobs:
  # Build your plugin/theme
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: |
          npm install
          npm run build
          zip -r plugin.zip dist/
      - uses: actions/upload-artifact@v4
        with:
          name: built-plugin
          path: plugin.zip

  # Expose the built artifact on a public URL
  expose-build:
    needs: build
    permissions:
      contents: write
    uses: WordPress/action-wp-playground-pr-preview/expose-artifact-on-public-url.yml@v2
    with:
      artifact-name: 'built-plugin'
      pr-number: ${{ github.event.pull_request.number }}
      commit-sha: ${{ github.sha }}
      artifacts-to-keep: '2' # Number of most recent artifacts to keep for this PR. Use `keep-all` to keep all artifacts.

  # Create the preview with the public URL
  create-blueprint:
    needs: expose-build
    runs-on: ubuntu-latest
    outputs:
      blueprint: ${{ steps.blueprint.outputs.result }}
    steps:
      - uses: actions/github-script@v7
        id: blueprint
        with:
          script: |
            const blueprint = {
              steps: [{
                step: "installPlugin",
                pluginZipFile: {
                  resource: "url",
                  url: "${{ needs.expose-build.outputs.artifact-url }}"
                }
              }]
            };
            return JSON.stringify(blueprint);
          result-encoding: string

  preview:
    needs: create-blueprint
    permissions:
      pull-requests: write
    uses: WordPress/action-wp-playground-pr-preview@v2
    with:
      blueprint: ${{ needs.create-blueprint.outputs.blueprint }}
```

### Expose Artifact Inputs

#### `artifact-name`

**Required** Name of the GitHub Actions artifact to expose on a public URL

This should match the name used in actions/upload-artifact@v4 in the build job.
The artifact should contain a single zip file.

Some artifacts have dynamic names, e.g. `built-plugin-${{ github.event.pull_request.number }}-${{ github.sha }}`.
You can use the same syntax to format the artifact-name for this job.

Example: 'built-plugin'

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

### Expose Artifact Outputs

#### `artifact-url`

Public download URL for the exposed artifact.

**Format:** `https://github.com/OWNER/REPO/releases/download/TAG/pr-NUMBER-SHA.zip`

#### `artifact-name`

Filename of the exposed artifact.

**Format:** `pr-NUMBER-SHA.zip`

#### `artifact-filename`

**Optional** Filename of the zip file inside the exposed artifact.

**Default:** `plugin.zip`

## License

This project is licensed under the GPL-2.0-or-later License - see the [LICENSE](LICENSE) file for details.
