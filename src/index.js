const core = require('@actions/core');
const githubLib = require('@actions/github');

(async () => {
  const context = githubLib.context;
  const githubToken = core.getInput('github-token', {required: false}) || process.env.GITHUB_TOKEN || process.env.INPUT_GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN (or github-token input) is required to call the GitHub API.');
  }
  const github = githubLib.getOctokit(githubToken);
  const mode = (process.env.INPUT_PREVIEW_MODE || 'append-to-description').trim().toLowerCase();
  if (mode !== 'append-to-description' && mode !== 'comment') {
    throw new Error(`Invalid preview mode: ${mode}. Accepted values: append-to-description, comment.`);
  }

  const pr = context.payload.pull_request;
  if (!pr) {
    throw new Error('This workflow must run on a pull_request event payload.');
  }

  const repo = context.payload.repository;
  const owner = repo.owner.login || repo.owner.name || repo.owner.id;
  const repoName = repo.name;
  const repoFullName = repo.full_name;
  const prNumber = pr.number;
  const prTitle = pr.title;
  const headRef = pr.head.ref;
  const headSha = pr.head.sha;
  const baseRef = pr.base.ref;

  const playgroundHostRaw = process.env.INPUT_PLAYGROUND_HOST || 'https://playground.wordpress.net';
  const playgroundHost = playgroundHostRaw.replace(/\/+$/, '');

  const pluginPath = (process.env.INPUT_PLUGIN_PATH || '').trim();
  const themePath = (process.env.INPUT_THEME_PATH || '').trim();
  const blueprintInput = process.env.INPUT_BLUEPRINT || '';

  if(!pluginPath && !themePath && !blueprintInput) {
    throw new Error('One of `plugin-path`, `theme-path`, or `blueprint` inputs is required.');
  }

  const descriptionTemplateInput = process.env.INPUT_DESCRIPTION_TEMPLATE || '';
  const commentTemplateInput = process.env.INPUT_COMMENT_TEMPLATE || '';
  const descriptionMarkerStart = '<!-- wp-playground-preview:start -->';
  const descriptionMarkerEnd = '<!-- wp-playground-preview:end -->';
  const commentIdentifier = '<!-- wp-playground-preview-comment -->';
  const restoreButtonIfRemoved = process.env.INPUT_RESTORE_BUTTON_IF_REMOVED !== 'false';

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

  const blueprintJson = blueprintInput && blueprintInput.trim().length
    ? blueprintInput.trim()
    : buildAutoBlueprint();

  try {
    JSON.parse(blueprintJson);
  } catch (error) {
    core.warning(blueprintJson);
    throw new Error(`Blueprint is not valid JSON. ${error.message}`);
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

  const blueprintDataUrl = `data:application/json,${encodeURIComponent(blueprintJson)}`;

  const previewUrl = `${playgroundHost}${playgroundHost.includes('?') ? '&' : '?'}blueprint-url=${blueprintDataUrl}`;

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
  	PLAYGROUND_BLUEPRINT_DATA_URL: blueprintDataUrl,
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
  core.setOutput('blueprint-json', blueprintJson);
  core.setOutput('rendered-description', renderedDescription);
  core.setOutput('rendered-comment', renderedComment);
  core.setOutput('comment-id', commentId);
})().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
