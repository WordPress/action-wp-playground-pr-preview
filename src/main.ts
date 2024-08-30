import { debug, getInput, setFailed } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import createPreviewLinksComment from './create-preview-links';
import deletePreviewLinksComment from './delete-comment';
import { detectThemeChanges } from './get-changed-themes';

export async function run() {
	try {
		debug('Starting action execution');
		const token = getInput('github-token', { required: true });
		debug('GitHub token obtained');
		const octokit = getOctokit(token);
		debug('Octokit client initialized');

		// Get org and repo names from context
		const { eventName } = context;
		debug(`Event name: ${eventName}`);

		// Only run on pull_request_target events
		if (eventName !== 'pull_request_target') {
			debug('Event is not pull_request_target, exiting');
			return;
		}

		// Get the changed themes
		debug('Detecting theme changes');
		const { hasThemeChanges, changedThemes } = await detectThemeChanges();
		debug(`Theme changes detected: ${hasThemeChanges}`);

		if (!hasThemeChanges) {
			debug('No theme changes, exiting');
			await deletePreviewLinksComment(octokit, context);
			return;
		}

		await createPreviewLinksComment(octokit, context, changedThemes);
		debug('Preview links comment created');
	} catch (error: unknown) {
		if (error instanceof Error) {
			debug(`Error occurred: ${error.message}`);
			return setFailed(error.message);
		}

		debug('An unexpected error occurred');
		return setFailed('An unexpected error occurred');
	}
}
