import { getInput, setFailed } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import createPreviewLinksComment from './create-preview-links';
import { detectThemeChanges } from './get-changed-themes';

export async function run() {
	try {
		const token = getInput('github-token', { required: true });
		const octokit = getOctokit(token);

		// Get org and repo names from context
		const { eventName } = context;

		// Only run on pull_request_target events
		if (eventName !== 'pull_request_target') {
			return;
		}

		// Get the changed themes
		const { hasThemeChanges, changedThemes } = detectThemeChanges();

		if (!hasThemeChanges) {
			return;
		}

		const changedThemeSlugs = Object.keys(changedThemes).join(',');

		await createPreviewLinksComment(octokit, context, changedThemeSlugs);
	} catch (error: unknown) {
		if (error instanceof Error) {
			return setFailed(error.message);
		}

		return setFailed('An unexpected error occurred');
	}
}
