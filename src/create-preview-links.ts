import fs from 'node:fs';
import path from 'node:path';
import { debug, getInput } from '@actions/core';
import type { getOctokit } from '@actions/github';
import type { Context } from '@actions/github/lib/context';

interface ThemeData {
	resource: string;
	url: string;
}

interface PluginData {
	resource: string;
	slug: string;
}

interface Step {
	step: string;
	username?: string;
	password?: string;
	themeData?: ThemeData;
	pluginData?: PluginData;
	themeFolderName?: string;
	options?: {
		activate?: boolean;
	};
}

interface Template {
	steps: Step[];
}

export const COMMENT_BLOCK_START = '### Preview changes';

function buildProxyURL(
	repo: string,
	branch: string,
	themeDir?: string,
): string {
	const queryParams = {
		action: themeDir ? 'partial' : 'archive',
		repo: repo,
		branch: branch,
		...(themeDir ? { directory: themeDir } : {}),
	};
	const queryString = new URLSearchParams(queryParams).toString();
	return `https://github-proxy.com/proxy.php?${queryString}`;
}
/*
 * This function creates a WordPress Playground blueprint JSON string for a theme.
 *
 * @param {string} themeSlug - The slug of the theme to create a blueprint for, also used to name the theme folder in Playground.
 * @param {string} branch - The branch where the theme changes are located.
 * @param {string} repo - The repository where the theme changes are located, in the format 'owner/repo'.
 * @param {string} themeDir - The directory of the theme in the repository.
 * @returns {string} - A JSON string representing the blueprint.
 */
function createBlueprint(
	themeSlug: string,
	branch: string,
	repo: string,
	themeDir?: string,
): string {
	debug(
		`Creating blueprint for themeSlug: ${themeSlug}, branch: ${branch}, repo: ${repo}${themeDir ? `, themeDir: ${themeDir}` : ''}`,
	);
	/* If themeDir is not provided, we assume that the action is running in a single theme workflow and the theme folder name will be the theme slug + the branch name.
	 * If themeDir is provided, we assume that the action is running in a multi theme workflow and the theme folder name will be the theme slug.
	 */
	const themeFolderName = !themeDir ? `${themeSlug}-${branch}` : themeSlug;
	debug(`Theme folder name: ${themeFolderName}`);
	const template: Template = {
		steps: [
			{
				step: 'login',
				username: 'admin',
				password: 'password',
			},
			{
				step: 'installPlugin',
				pluginData: {
					resource: 'wordpress.org/plugins',
					slug: 'theme-check',
				},
				options: {
					activate: true,
				},
			},
			{
				step: 'installTheme',
				themeData: {
					resource: 'url',
					url: buildProxyURL(repo, branch, themeDir),
				},
				options: {
					activate: true,
				},
			},
		],
	};

	const blueprint = JSON.stringify(template);
	debug(`Blueprint created: ${blueprint}`);
	return blueprint;
}

/*
 * This function gets the theme slug from the style.css file.
 *
 * @param {string} themeDir - The directory of the theme.
 * @returns {string} - The theme slug.
 */
function getThemeSlugFromStylesheet(themeDir: string): string {
	const stylesheet = fs.readFileSync(path.join(themeDir, 'style.css'), 'utf8');
	const themeSlug = stylesheet.match(/Text Domain:\s*(.*)/)?.[1]?.trim();

	if (!themeSlug) {
		debug(`Theme slug not found in ${themeDir}/style.css`);
		return getInput('theme-slug');
	}

	return themeSlug;
}
/*
 * This function creates a comment on a PR with preview links for the changed themes.
 * It is used by `preview-theme` workflow.
 *
 * @param {ReturnType<typeof getOctokit>} github - An authenticated instance of the GitHub API.
 * @param {Context} context - The context of the event that triggered the action.
 * @param {Record<string, string>} changedThemes - An object with the theme name as the key and the theme directory as the value.
 */
export default async function createPreviewLinksComment(
	github: ReturnType<typeof getOctokit>,
	context: Context,
	changedThemes: Record<string, string>,
): Promise<void> {
	debug('Starting createPreviewLinksComment');
	const pullRequest = context.payload?.pull_request;
	if (!pullRequest) {
		debug('No pull request found in context payload');
		throw new Error('No pull request found in context payload');
	}

	debug(`Pull request found: #${pullRequest.number}`);

	const repo = `${context.repo.owner}/${context.repo.repo}`;

	const isSingleTheme = getInput('single-theme') === 'true';
	let previewLinks = '';

	if (isSingleTheme) {
		debug(`Theme dir: ${getInput('theme-dir')}`);
		const themeDir = getInput('theme-dir');
		const themeSlug = getThemeSlugFromStylesheet(themeDir);
		previewLinks = `- [Preview changes for **${themeSlug}**](https://playground.wordpress.net/#${createBlueprint(
			themeSlug,
			pullRequest.head.ref,
			repo,
		)})`;
	} else {
		debug(`Changed themes: ${changedThemes}`);
		previewLinks = Object.entries(changedThemes)
			.map(([themeName, themeDir]) => {
				const themeSlug = getThemeSlugFromStylesheet(themeDir);
				const parentThemeSlug = themeName.split('_childof_')[1];
				const blueprintUrl = createBlueprint(
					themeSlug,
					pullRequest.head.ref,
					repo,
					themeSlug,
				);
				const previewLink = `https://playground.wordpress.net/#${blueprintUrl}`;
				return `- [Preview changes for **${themeName.split('_childof_')[0]}**](${previewLink})${
					parentThemeSlug ? ` (child of **${parentThemeSlug}**)` : ''
				}`;
			})
			.join('\n');
	}

	debug(`Preview links generated: ${previewLinks}`);

	const includesChildThemes = previewLinks.includes('child of');
	debug(`Includes child themes: ${includesChildThemes}`);

	const themesMessage = !isSingleTheme
		? `I've detected changes to the following themes in this PR: ${Object.keys(
				changedThemes,
			)
				.map((themeName) => themeName.split('_childof_')[0])
				.join(', ')}.
	`
		: '';

	const comment = `
${themesMessage}You can preview these changes by following the ${isSingleTheme ? 'link' : 'links'} below:

${previewLinks}

I will update this comment with the latest preview links as you push more changes to this PR.
**⚠️ Note:** The preview sites are created using [WordPress Playground](https://wordpress.org/playground/). You can add content, edit settings, and test the themes as you would on a real site, but please note that changes are not saved between sessions.
${
	includesChildThemes
		? '\n**⚠️ Note:** Child themes are dependent on their parent themes. You will have to install the parent theme as well for the preview to work correctly.'
		: ''
}`;

	const repoData = {
		owner: context.repo.owner,
		repo: context.repo.repo,
	};

	debug('Checking for existing comments');
	const { data: comments } = await github.rest.issues.listComments({
		issue_number: pullRequest.number,
		...repoData,
	});
	const existingComment = comments.find(
		(comment) =>
			comment.user?.login === 'github-actions[bot]' &&
			comment.body?.includes(COMMENT_BLOCK_START),
	);
	const commentObject = {
		body: `${COMMENT_BLOCK_START}\n${comment}`,
		...repoData,
	};

	if (existingComment) {
		debug(`Updating existing comment: ${existingComment.id}`);
		await github.rest.issues.updateComment({
			comment_id: existingComment.id,
			...commentObject,
		});
		return;
	}

	debug('Creating new comment');
	await github.rest.issues.createComment({
		issue_number: pullRequest.number,
		...commentObject,
	});
}
