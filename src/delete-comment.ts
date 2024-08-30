import { debug } from '@actions/core';
import type { getOctokit } from '@actions/github';
import type { Context } from '@actions/github/lib/context';
import { COMMENT_BLOCK_START } from './create-preview-links';

/**
 * Deletes the preview links comment from the PR.
 *
 * @param {ReturnType<typeof getOctokit>} github - An authenticated instance of the GitHub API.
 * @param {Context} context - The context of the event that triggered the action.
 */
export default async function deletePreviewLinksComment(
	github: ReturnType<typeof getOctokit>,
	context: Context,
): Promise<void> {
	debug('Deleting preview links comment');
	const pullRequest = context.payload?.pull_request;
	if (!pullRequest) {
		debug('No pull request found in context payload');
		throw new Error('No pull request found in context payload');
	}

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

	if (existingComment) {
		debug(`Deleting existing comment: ${existingComment.id}`);
		await github.rest.issues.deleteComment({
			comment_id: existingComment.id,
			...repoData,
		});
	}
}
