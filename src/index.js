const core = require('@actions/core');
const githubLib = require('@actions/github');

(async () => {
  const context = githubLib.context;
  const githubToken = core.getInput('github-token', {required: false});
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN (or github-token input) is required to call the GitHub API.');
  }
  const github = githubLib.getOctokit(githubToken);
  const mode = (core.getInput('mode', {required: false}) || '').trim().toLowerCase();
  if (mode !== 'append-to-description' && mode !== 'comment') {
    throw new Error(`Invalid preview mode: ${mode}. Accepted values: append-to-description, comment.`);
  }

  // Accept data from both context and inputs
  const prNumberInput = core.getInput('pr-number', {required: false});

  let pr = context.payload.pull_request;
  let repo = context.payload.repository;

  // If pr-number is provided as input, fetch PR details from GitHub API
  if (prNumberInput) {
    const prNumber = parseInt(prNumberInput, 10);
    core.info(`Fetching PR #${prNumber} details from GitHub API...`);

    // Get repo info from context or use current repo
    const owner = repo ? (repo.owner.login || repo.owner.name || repo.owner.id) : context.repo.owner;
    const repoName = repo ? repo.name : context.repo.repo;

    try {
      const {data: prData} = await github.rest.pulls.get({
        owner,
        repo: repoName,
        pull_number: prNumber,
      });

      // Replace pr and repo with fetched data
      pr = prData;
      if (!repo) {
        repo = prData.base.repo;
      }
      core.info(`Successfully fetched PR #${prNumber}: "${prData.title}"`);
    } catch (error) {
      throw new Error(`Failed to fetch PR #${prNumber}: ${error.message}`);
    }
  }

  // Validate we have PR data from either context or API
  if (!pr) {
    throw new Error('This workflow must run on a pull_request event payload, or pr-number must be provided as input.');
  }

  const owner = repo.owner.login || repo.owner.name || repo.owner.id;
  const repoName = repo.name;
  const repoFullName = repo.full_name;
  const prNumber = pr.number;
  const prTitle = pr.title;
  const headRef = pr.head.ref;
  const headSha = pr.head.sha;
  const baseRef = pr.base.ref;

  const playgroundHostRaw = core.getInput('playground-host', {required: false}) || 'https://playground.wordpress.net';
  const playgroundHost = playgroundHostRaw.replace(/\/+$/, '');

  const pluginPath = (core.getInput('plugin-path', {required: false}) || '').trim();
  const themePath = (core.getInput('theme-path', {required: false}) || '').trim();
  const blueprintInput = core.getInput('blueprint', {required: false}) || '';
  const blueprintUrlInput = (core.getInput('blueprint-url', {required: false}) || '').trim();
  const previewVariantsInput = core.getInput('preview-variants', {required: false}) || '';

  if(!pluginPath && !themePath && !blueprintInput && !blueprintUrlInput) {
    throw new Error('One of `plugin-path`, `theme-path`, `blueprint`, or `blueprint-url` inputs is required.');
  }

  const descriptionTemplateInput = core.getInput('description-template', {required: false}) || '';
  const commentTemplateInput = core.getInput('comment-template', {required: false}) || '';
  const descriptionMarkerStart = '<!-- wp-playground-preview:start -->';
  const descriptionMarkerEnd = '<!-- wp-playground-preview:end -->';
  const commentIdentifier = '<!-- wp-playground-preview-comment -->';
  const restoreButtonIfRemoved = core.getInput('restore-button-if-removed', {required: false}) !== 'false';

  const safeParseJson = (label, value, fallback = {}) => {
    if (!value || !value.trim()) {
  	return fallback;
    }
    try {
  	return JSON.parse(value);
    } catch (error) {
  	throw new Error(`Unable to parse ${label} as JSON. ${error.message}`);
    }
  };

  const parsePreviewVariantString = (value) => {
    const separator = value.indexOf(':');
    if (separator === -1) {
      throw new Error(`Invalid preview variant shorthand: ${value}. Expected php:<version>, wp:<version>, or features:<name>[,<name>].`);
    }

    const kind = value.slice(0, separator).trim().toLowerCase();
    const rawValue = value.slice(separator + 1).trim();
    if (!rawValue) {
      throw new Error(`Invalid preview variant shorthand: ${value}. The value after ':' must not be empty.`);
    }

    if (kind === 'php') {
      return { label: `PHP ${rawValue}`, preferredVersions: { php: rawValue } };
    }
    if (kind === 'wp' || kind === 'wordpress') {
      return { label: `WordPress ${rawValue}`, preferredVersions: { wp: rawValue } };
    }
    if (kind === 'feature' || kind === 'features') {
      const features = rawValue.split(',').map((feature) => feature.trim()).filter(Boolean);
      if (!features.length) {
        throw new Error(`Invalid preview variant shorthand: ${value}. At least one feature name is required.`);
      }
      return {
        label: features.length === 1 ? `Feature: ${features[0]}` : `Features: ${features.join(', ')}`,
        features: Object.fromEntries(features.map((feature) => [feature, true]))
      };
    }

    throw new Error(`Invalid preview variant shorthand: ${value}. Expected php:<version>, wp:<version>, or features:<name>[,<name>].`);
  };

  const normalizePreviewVariant = (entry, index) => {
    if (typeof entry === 'string') {
      return parsePreviewVariantString(entry.trim());
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`preview-variants[${index}] must be a string shorthand or an object.`);
    }

    const { label, php, wp, wordpress, ...blueprintPatch } = entry;
    const preferredVersions = { ...(blueprintPatch.preferredVersions || {}) };
    if (php !== undefined) {
      preferredVersions.php = String(php);
    }
    if (wp !== undefined || wordpress !== undefined) {
      preferredVersions.wp = String(wp !== undefined ? wp : wordpress);
    }
    if (Object.keys(preferredVersions).length) {
      blueprintPatch.preferredVersions = preferredVersions;
    }

    return {
      label: typeof label === 'string' && label.trim() ? label.trim() : '',
      ...blueprintPatch
    };
  };

  const parsePreviewVariants = (input) => {
    const variants = safeParseJson('preview-variants', input, []);
    if (!Array.isArray(variants)) {
      throw new Error('preview-variants must be a JSON array.');
    }
    return variants.map(normalizePreviewVariant);
  };

  const describePreviewVariant = (variant, index) => {
    if (variant.label) {
      return variant.label;
    }

    const parts = [];
    if (variant.preferredVersions && variant.preferredVersions.php) {
      parts.push(`PHP ${variant.preferredVersions.php}`);
    }
    if (variant.preferredVersions && variant.preferredVersions.wp) {
      parts.push(`WordPress ${variant.preferredVersions.wp}`);
    }
    if (variant.features && Object.keys(variant.features).length) {
      parts.push(`Features: ${Object.keys(variant.features).join(', ')}`);
    }
    return parts.length ? parts.join(' / ') : `Preview ${index + 1}`;
  };

  const mergeBlueprintVariant = (baseBlueprintJson, variant, index) => {
    const base = safeParseJson('base blueprint', baseBlueprintJson);
    const { label, prependSteps, appendSteps, siteOptions, ...override } = variant;

    if (Object.prototype.hasOwnProperty.call(override, 'steps')) {
      throw new Error('preview-variants entries must use prependSteps or appendSteps instead of steps.');
    }

    const merged = {
      ...base,
      ...override,
      preferredVersions: {
        ...(base.preferredVersions || {}),
        ...(override.preferredVersions || {}),
      },
      features: {
        ...(base.features || {}),
        ...(override.features || {}),
      },
    };

    const steps = Array.isArray(base.steps) ? [...base.steps] : [];
    if (siteOptions && typeof siteOptions === 'object' && !Array.isArray(siteOptions)) {
      const siteOptionsStep = steps.find((step) => step && step.step === 'setSiteOptions');
      if (siteOptionsStep) {
        siteOptionsStep.options = {
          ...(siteOptionsStep.options || {}),
          ...siteOptions,
        };
      } else {
        steps.unshift({ step: 'setSiteOptions', options: siteOptions });
      }
    }

    merged.steps = [
      ...(Array.isArray(prependSteps) ? prependSteps : []),
      ...steps,
      ...(Array.isArray(appendSteps) ? appendSteps : [])
    ];

    return {
      label: describePreviewVariant({ label, ...override, siteOptions }, index),
      blueprintJson: JSON.stringify(merged)
    };
  };

  const archiveBranchSegment = headRef.replace(/[^0-9A-Za-z]/g, '-');
  const repoArchiveRoot = `${repoName}-${archiveBranchSegment}`;
  const repoGitUrl = `https://github.com/${repoFullName}.git`;

  const normalizePath = (path) => {
    const raw = (path || '').trim();
    if (!raw || raw === '.' || raw === './') {
  	return '';
    }
    return raw.replace(/^\.\/+/, '').replace(/^\/+|\/+$/g, '');
  };
  const sanitizeSlug = (value, fallback) => {
    if (!value) return fallback;
    const cleaned = value
  	.toLowerCase()
  	.replace(/[^a-z0-9-]+/g, '-')
  	.replace(/^-+|-+$/g, '');
    return cleaned || fallback;
  };
  const repoSlug = sanitizeSlug(repoName, 'project');
  const inferSlug = (path, fallback) => {
    const clean = normalizePath(path).split('/').filter(Boolean).pop();
    if (!clean || clean === '.' || clean === '..') return fallback;
    return sanitizeSlug(clean, fallback);
  };

  const pluginSlug = pluginPath ? inferSlug(pluginPath, repoSlug) : '';
  const themeSlug = themePath ? inferSlug(themePath, `${repoSlug}-theme`) : '';

  const buildAutoBlueprint = () => {
    const steps = [];

    if (pluginPath) {
  	steps.push(
  	  {
  		step: 'installPlugin',
  		pluginData: {
  		  resource: 'git:directory',
  		  url: repoGitUrl,
  		  ref: headRef,
  		  path: normalizePath(pluginPath) || "/"
  		},
  		options: {
  		  activate: true
  		}
  	  }
  	);
    }

    if (themePath) {
  	steps.push(
  	  {
  		step: 'installTheme',
  		themeData: {
  		  resource: 'git:directory',
  		  url: repoGitUrl,
  		  ref: headRef,
  		  path: normalizePath(themePath) || "/"
  		},
  		options: {
  		  activate: true
  		}
  	  }
  	);
    }

    return JSON.stringify(
  	{
  	  $schema: 'https://playground.wordpress.net/blueprint-schema.json',
  	  preferredVersions: {
  		php: '8.2',
  		wp: 'latest'
  	  },
  	  steps
  	}
    );
  };

  let blueprintJson = '';
  if (blueprintInput && blueprintInput.trim().length) {
    blueprintJson = blueprintInput.trim();
  } else if (pluginPath || themePath) {
    blueprintJson = buildAutoBlueprint();
  }

  const previewVariants = parsePreviewVariants(previewVariantsInput);
  if (previewVariants.length && blueprintUrlInput) {
    throw new Error('preview-variants requires an inline Blueprint; blueprint-url cannot be rewritten per variant.');
  }

  const previewBlueprints = previewVariants.length
    ? previewVariants.map((variant, index) => mergeBlueprintVariant(blueprintJson, variant, index))
    : [{ label: 'Preview', blueprintJson }];
  blueprintJson = previewBlueprints[0] ? previewBlueprints[0].blueprintJson : blueprintJson;

  if (blueprintJson) {
    try {
      JSON.parse(blueprintJson);
    } catch (error) {
      core.warning(blueprintJson);
      throw new Error(`Blueprint is not valid JSON. ${error.message}`);
    }
  }

  const mergeVariables = (...maps) => maps.reduce((acc, map) => {
    Object.entries(map || {}).forEach(([key, value]) => {
  	if (value === undefined || value === null) {
  	  return;
  	}
  	acc[String(key).toUpperCase()] = typeof value === 'string' ? value : JSON.stringify(value);
    });
    return acc;
  }, {});

  const substitute = (template, values) => {
    if (!template) {
  	return '';
    }
    return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/gi, (match, key) => {
  	const upperKey = key.toUpperCase();
  	let value = Object.prototype.hasOwnProperty.call(values, upperKey)
  	  ? values[upperKey]
  	  : '';

  	// Escape HTML entities somewhat naively to prevent the values leaking
  	// into HTML syntax elements.
	  if (upperKey !== 'PLAYGROUND_BUTTON' && upperKey !== 'PLAYGROUND_URLS_MARKDOWN') {
  	  value = value
  		.replace(/&/g, '&amp;')
  		.replace(/</g, '&lt;')
  		.replace(/>/g, '&gt;')
  		.replace(/"/g, '&quot;')
  		.replace(/'/g, '&#039;');
  	}
  	return value;
    });
  };

  const buildPreviewUrl = (previewBlueprintJson) => {
    const blueprintDataUrl = previewBlueprintJson
      ? `data:application/json,${encodeURIComponent(previewBlueprintJson)}`
      : '';
    const finalBlueprintUrl = blueprintUrlInput || blueprintDataUrl;
    const blueprintQueryValue = blueprintUrlInput
      ? encodeURIComponent(blueprintUrlInput)
      : blueprintDataUrl;

    return {
      url: `${playgroundHost}${playgroundHost.includes('?') ? '&' : '?'}blueprint-url=${blueprintQueryValue}`,
      blueprintDataUrl: finalBlueprintUrl
    };
  };

  const previewLinks = previewBlueprints.map((preview) => {
    const { url, blueprintDataUrl } = buildPreviewUrl(preview.blueprintJson);
    return { ...preview, url, blueprintDataUrl };
  });
  const firstPreview = previewLinks[0];
  const previewUrl = firstPreview.url;
  const previewUrlsJson = JSON.stringify(previewLinks.map(({ label, url }) => ({ label, url })));
  const previewUrlsMarkdown = previewLinks.map(({ label, url }) => `- [${label}](${url})`).join('\n');

  const joinWithNewline = (segments) => segments.join('\n');
  const defaultButtonImageUrl = 'https://raw.githubusercontent.com/adamziel/playground-preview/refs/heads/trunk/assets/playground-preview-button.svg';

  const defaultButtonTemplate = joinWithNewline([
    '<a href="{{PLAYGROUND_URL}}" target="_blank" rel="noopener noreferrer">',
    '  <img src="{{PLAYGROUND_BUTTON_IMAGE_URL}}" alt="Open WordPress Playground Preview" width="220" height="57" />',
    '</a>'
  ]);

  const defaultDescriptionTemplate = joinWithNewline([
    '{{PLAYGROUND_BUTTON}}',
  ]);

  const defaultCommentTemplate = joinWithNewline([
    '### WordPress Playground Preview',
    '',
    'The changes in this pull request can previewed and tested using a WordPress Playground instance.',
    '',
    '{{PLAYGROUND_BUTTON}}',
  ]);

  const baseTemplateVars = {
    PR_NUMBER: String(prNumber),
    PR_TITLE: prTitle,
    PR_HEAD_REF: headRef,
    PR_HEAD_SHA: headSha,
    PR_BASE_REF: baseRef,
    REPO_OWNER: owner,
    REPO_NAME: repoName,
    REPO_FULL_NAME: repoFullName,
    REPO_ARCHIVE_ROOT: repoArchiveRoot,
    REPO_SLUG: repoSlug,
    PLUGIN_PATH: pluginPath,
    THEME_PATH: themePath,
    PLUGIN_SLUG: pluginSlug,
    THEME_SLUG: themeSlug,
    PLAYGROUND_HOST: playgroundHost
  };

  const templateVariables = mergeVariables(
    baseTemplateVars,
    {
  	PLAYGROUND_URL: previewUrl,
    PLAYGROUND_URLS_JSON: previewUrlsJson,
    PLAYGROUND_URLS_MARKDOWN: previewUrlsMarkdown,
  	PLAYGROUND_BLUEPRINT_JSON: blueprintJson,
    PLAYGROUND_BLUEPRINT_DATA_URL: firstPreview.blueprintDataUrl,
  	PLAYGROUND_BUTTON_IMAGE_URL: defaultButtonImageUrl,
  	PLAYGROUND_BUTTON: substitute(defaultButtonTemplate, {})
    }
  );

  templateVariables.PLAYGROUND_BUTTON = substitute(defaultButtonTemplate, templateVariables);

  const descriptionTemplate = descriptionTemplateInput && descriptionTemplateInput.trim().length
    ? descriptionTemplateInput
    : defaultDescriptionTemplate;
  const commentTemplate = commentTemplateInput && commentTemplateInput.trim().length
    ? commentTemplateInput
    : defaultCommentTemplate;

  const renderedDescription = substitute(descriptionTemplate, templateVariables);
  const renderedComment = substitute(commentTemplate, templateVariables);

  const performDescriptionUpdate = async () => {
    const currentBody = pr.body || '';
    const managedBlock = `${descriptionMarkerStart}${String.fromCodePoint(10)}${renderedDescription.trim()}${String.fromCodePoint(10)}${descriptionMarkerEnd}`;
    let nextBody;

    if (currentBody.includes(descriptionMarkerStart) && currentBody.includes(descriptionMarkerEnd)) {
  	// Markers exist - check if there's a user placeholder
  	const pattern = new RegExp(
  	  `${descriptionMarkerStart}([\\s\\S]*?)${descriptionMarkerEnd}`,
  	  'm'
  	);
  	const match = currentBody.match(pattern);
  	if (match) {
  	  const existingContent = match[1].trim();
  	  // If content exists but doesn't contain typical button HTML, assume it's a user placeholder
  	  const looksLikeButton = existingContent.includes('<a ') && existingContent.includes('playground');
  	  if (existingContent && !looksLikeButton) {
  		core.info('User placeholder detected between markers. Skipping update to respect user preference.');
  		return;
  	  }
  	}
  	// Update existing button
  	nextBody = currentBody.replace(pattern, managedBlock);
    } else {
  	// Markers don't exist - check if we should restore
  	if (!restoreButtonIfRemoved) {
  	  core.info('Button markers not found and restore-button-if-removed is false. Skipping to respect user removal.');
  	  return;
  	}
  	// Add the button
  	const trimmed = currentBody.trimEnd();
  	nextBody = trimmed ? `${trimmed}${String.fromCodePoint(10)}${String.fromCodePoint(10)}${managedBlock}` : managedBlock;
    }

    if (nextBody !== currentBody) {
  	await github.rest.pulls.update({
  	  owner,
  	  repo: repoName,
  	  pull_number: prNumber,
  	  body: nextBody
  	});
  	core.info('PR description updated with Playground preview button.');
    } else {
  	core.info('PR description already up to date. No changes applied.');
    }
  };

  const removeManagedDescriptionBlock = async () => {
    const currentBody = pr.body || '';
    if (!currentBody.includes(descriptionMarkerStart) || !currentBody.includes(descriptionMarkerEnd)) {
  	return;
    }

    const pattern = new RegExp(
  	`${descriptionMarkerStart}[\\s\\S]*?${descriptionMarkerEnd}\\s*`,
  	'm'
    );
    const nextBody = currentBody.replace(pattern, '').trimEnd();

    if (nextBody !== currentBody) {
  	await github.rest.pulls.update({
  	  owner,
  	  repo: repoName,
  	  pull_number: prNumber,
  	  body: nextBody
  	});
  	core.info('Removed managed Playground block from PR description (comment mode active).');
    }
  };

  const performCommentUpdate = async () => {
    const managedBody = `${commentIdentifier}${String.fromCodePoint(10)}${renderedComment.trim()}`;
    const comments = await github.paginate(github.rest.issues.listComments, {
  	owner,
  	repo: repoName,
  	issue_number: prNumber,
  	per_page: 100
    });

    const existing = comments.find((comment) =>
  	typeof comment.body === 'string' && comment.body.includes(commentIdentifier)
    );

    if (existing) {
  	if (existing.body !== managedBody) {
  	  await github.rest.issues.updateComment({
  		owner,
  		repo: repoName,
  		comment_id: existing.id,
  		body: managedBody
  	  });
  	  core.info(`Updated existing preview comment (id: ${existing.id}).`);
  	} else {
  	  core.info('Preview comment already up to date.');
  	}
  	return existing.id;
    }

    const created = await github.rest.issues.createComment({
  	owner,
  	repo: repoName,
  	issue_number: prNumber,
  	body: managedBody
    });
    core.info(`Posted new preview comment (id: ${created.data.id}).`);
    return created.data.id;
  };

  let commentId = '';
  if (mode === 'append-to-description') {
    await performDescriptionUpdate();
  } else {
    await removeManagedDescriptionBlock();
    commentId = String(await performCommentUpdate() || '');
  }

  core.setOutput('mode', mode);
  core.setOutput('preview-url', previewUrl);
  core.setOutput('preview-urls-json', previewUrlsJson);
  core.setOutput('blueprint-json', blueprintJson);
  core.setOutput('rendered-description', renderedDescription);
  core.setOutput('rendered-comment', renderedComment);
  core.setOutput('comment-id', commentId);
})().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
