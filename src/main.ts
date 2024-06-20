import { getInput, setFailed } from '@actions/core';
import { exec } from '@actions/exec';
import { context, getOctokit } from '@actions/github';

export async function run() {
	try {
		const token = getInput('github-token', { required: true });
		const octokit = getOctokit(token);
		// Get org and repo names from context
		const org = context.repo.owner;
		const repo = context.repo.repo;

		// Clone the repository
		await exec('git', [
			'clone',
			'--depth=1',
			'--branch',
			'trunk',
			`https://github.com/${org}/${repo}.git`,
		]);

		// Add more steps as necessary, replicating the original YAML workflow
	} catch (error: unknown) {
		if (error instanceof Error) {
			return setFailed(error.message);
		}

		return setFailed('An unexpected error occurred');
	}
}
