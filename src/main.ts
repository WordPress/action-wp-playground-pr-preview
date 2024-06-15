import * as core from '@actions/core';
import * as github from '@actions/github';
import { exec } from '@actions/exec';

export async function run() {
  try {
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    // Get org and repo names from context
    const org = github.context.repo.owner;
    const repo = github.context.repo.repo;

    // Clone the repository
    await exec('git', ['clone', '--depth=1', '--branch', 'trunk', `https://github.com/${org}/${repo}.git`]);

    // Add more steps as necessary, replicating the original YAML workflow
  } catch (error) {
    core.setFailed(error.message);
  }
}
