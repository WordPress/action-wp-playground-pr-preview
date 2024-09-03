import { debug } from '@actions/core';
import type { getOctokit } from '@actions/github';
import type { Context } from '@actions/github/lib/context';

interface ThemeZipFile {
	resource: string;
	url: string;
}

interface PluginZipFile {
	resource: string;
	slug: string;
}

interface Step {
	step: string;
	username?: string;
	password?: string;
	themeZipFile?: ThemeZipFile;
	pluginZipFile?: PluginZipFile;
	themeFolderName?: string;
	options?: {
		activate?: boolean;
	};
}

interface Template {
	steps: Step[];
}

export const COMMENT_BLOCK_START = '### Preview changes';

/*
 * This function creates a WordPress Playground blueprint JSON string for a theme.
 *
 * @param {string} themeSlug - The slug of the theme to create a blueprint for.
 * @param {string} branch - The branch where the theme changes are located.
 * @param {string} repo - The repository where the theme changes are located, in the format 'owner/repo'.
 * @returns {string} - A JSON string representing the blueprint.
 */
function createBlueprint(
	themeSlug: string,
	branch: string,
	repo: string,
): string {
	debug(
		`Creating blueprint for themeSlug: ${themeSlug}, branch: ${branch}, repo: ${repo}`,
	);
	const template: Template = {
		steps: [
			{
				step: 'login',
				username: 'admin',
				password: 'password',
			},
			{
				step: 'installPlugin',
				pluginZipFile: {
					resource: 'wordpress.org/plugins',
					slug: 'theme-check',
				},
				options: {
					activate: true,
				},
			},
			{
				step: 'installTheme',
				themeZipFile: {
					resource: 'url',
					url: `https://github-proxy.com/proxy.php?action=partial&repo=${repo}&directory=${themeSlug}&branch=${branch}`,
				},
			},
			{
				step: 'activateTheme',
				themeFolderName: themeSlug,
			},
		],
	};

	const blueprint = JSON.stringify(template);
	debug(`Blueprint created: ${blueprint}`);
	return blueprint;
}

/*
 * This function creates a comment on a PR with preview links for the changed themes.
 * It is used by `preview-theme` workflow.
 *
 * @param {ReturnType<typeof getOctokit>} github - An authenticated instance of the GitHub API.
 * @param {Context} context - The context of the event that triggered the action.
 * @param {string} changedThemeSlugs - A comma-separated string of theme slugs that have changed.
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
	debug(`Changed themes: ${changedThemes}`);

	const previewLinks = Object.entries(changedThemes)
		.map(([themeName, themeDir]) => {
			const themeSlug = themeDir.split('/')[0].trim();
			const parentThemeSlug = themeName.split('_childof_')[1];
			const repo = `${context.repo.owner}/${context.repo.repo}`;
			return `- [Preview changes for **${
				themeName.split('_childof_')[0]
			}**](https://playground.wordpress.net/#${createBlueprint(
				themeSlug,
				pullRequest.head.ref,
				repo,
			)})${parentThemeSlug ? ` (child of **${parentThemeSlug}**)` : ''}`;
		})
		.join('\n');

	debug(`Preview links generated: ${previewLinks}`);

	const includesChildThemes = previewLinks.includes('child of');
	debug(`Includes child themes: ${includesChildThemes}`);

	const comment = `
I've detected changes to the following themes in this PR: ${Object.keys(
		changedThemes,
	)
		.map((themeName) => themeName.split('_childof_')[0])
		.join(', ')}.

You can preview these changes by following the links below:

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
