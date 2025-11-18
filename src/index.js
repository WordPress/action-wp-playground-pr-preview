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
  // Inputs take precedence over context values
  const prNumberInput = core.getInput('pr-number', {required: false});
  const prTitleInput = core.getInput('pr-title', {required: false});
  const prHeadRefInput = core.getInput('pr-head-ref', {required: false});
  const prHeadShaInput = core.getInput('pr-head-sha', {required: false});
  const prBaseRefInput = core.getInput('pr-base-ref', {required: false});
  const prBodyInput = core.getInput('pr-body', {required: false});
  const repoOwnerInput = core.getInput('repo-owner', {required: false});
  const repoNameInput = core.getInput('repo-name', {required: false});
  const repoFullNameInput = core.getInput('repo-full-name', {required: false});

  const pr = context.payload.pull_request;
  const repo = context.payload.repository;

  // If inputs are not provided, try to get from context
  if (!prNumberInput && !pr) {
    throw new Error('This workflow must run on a pull_request event payload, or pr-number must be provided as input.');
  }

  const owner = repoOwnerInput || (repo ? (repo.owner.login || repo.owner.name || repo.owner.id) : null);
  const repoName = repoNameInput || (repo ? repo.name : null);
  const repoFullName = repoFullNameInput || (repo ? repo.full_name : null);
  const prNumber = prNumberInput ? parseInt(prNumberInput, 10) : (pr ? pr.number : null);
  const prTitle = prTitleInput || (pr ? pr.title : '');
  const headRef = prHeadRefInput || (pr ? pr.head.ref : null);
  const headSha = prHeadShaInput || (pr ? pr.head.sha : null);
  const baseRef = prBaseRefInput || (pr ? pr.base.ref : null);

  // Validate required fields
  if (!owner || !repoName || !repoFullName || !prNumber || !headRef || !headSha) {
    throw new Error('Missing required data. Provide either pull_request context or all required inputs (pr-number, pr-head-ref, pr-head-sha, repo-owner, repo-name, repo-full-name).');
  }

  // Update pr object to include body from input if provided
  const prWithBody = pr ? {...pr, body: prBodyInput || pr.body} : {number: prNumber, body: prBodyInput || ''};

  const playgroundHostRaw = core.getInput('playground-host', {required: false}) || 'https://playground.wordpress.net';
  const playgroundHost = playgroundHostRaw.replace(/\/+$/, '');

  const pluginPath = (core.getInput('plugin-path', {required: false}) || '').trim();
  const themePath = (core.getInput('theme-path', {required: false}) || '').trim();
  const blueprintInput = core.getInput('blueprint', {required: false}) || '';
  const blueprintUrlInput = (core.getInput('blueprint-url', {required: false}) || '').trim();

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
  	if(key !== 'PLAYGROUND_BUTTON') {
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

  const blueprintDataUrl = blueprintJson
    ? `data:application/json,${encodeURIComponent(blueprintJson)}`
    : '';
  const finalBlueprintUrl = blueprintUrlInput || blueprintDataUrl;
  const blueprintQueryValue = blueprintUrlInput
    ? encodeURIComponent(blueprintUrlInput)
    : blueprintDataUrl;
  const previewUrl = `${playgroundHost}${playgroundHost.includes('?') ? '&' : '?'}blueprint-url=${blueprintQueryValue}`;

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
  	PLAYGROUND_BLUEPRINT_JSON: blueprintJson,
  	PLAYGROUND_BLUEPRINT_DATA_URL: finalBlueprintUrl,
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
    const currentBody = prWithBody.body || '';
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
    const currentBody = prWithBody.body || '';
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
  core.setOutput('blueprint-json', blueprintJson);
  core.setOutput('rendered-description', renderedDescription);
  core.setOutput('rendered-comment', renderedComment);
  core.setOutput('comment-id', commentId);
})().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
