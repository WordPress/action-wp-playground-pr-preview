import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { debug, getInput } from '@actions/core';
import { context, getOctokit } from '@actions/github';

function runCommand(command: string): string {
	debug(`Running command: ${command}`);
	const result = execSync(command, { encoding: 'utf-8' }).trim();
	debug(`Command result: ${result}`);
	return result;
}
async function getChangedFiles(): Promise<string[]> {
	const ref = getInput('ref', { required: true });
	const baseBranch = getInput('base-branch', { required: true });
	const token = getInput('github-token', { required: true });
	const octokit = getOctokit(token);
	const { owner, repo } = context.repo;

	debug(`Getting changed files for ref: ${ref}`);

	/*
	 * This was previously using git commands to get the changed files, but it was
	 * not working as expected in the GitHub Actions environment, as merge-base which was used to
	 * find the common ancestor of the base branch and the current ref is not well supported.
	 *
	 * Reference issue: https://github.com/actions/checkout/discussions/423
	 *
	 * Instead of using workarounds, the current approach is to use the GitHub API to get the changed files.
	 */
	try {
		// Find the merge base commit
		const mergeBaseResponse = await octokit.rest.repos.compareCommits({
			owner,
			repo,
			base: baseBranch,
			head: ref,
		});
		const mergeBaseCommit = mergeBaseResponse.data.merge_base_commit.sha;

		debug(`Merge base commit: ${mergeBaseCommit}`);

		// Compare the merge base commit with the current ref
		const response = await octokit.rest.repos.compareCommits({
			owner,
			repo,
			base: mergeBaseCommit,
			head: ref,
		});

		const filesArray = response.data.files?.map((file) => file.filename) || [];
		debug(`Changed files: ${filesArray.join(', ')}`);
		return filesArray;
	} catch (error) {
		debug(`Error getting changed files: ${error}`);
		throw new Error(`Failed to get changed files: ${error}`);
	}
}

function getThemeDetails(dirName: string): Promise<{
	themeName: string;
	parentTheme: string | null;
}> {
	return new Promise((resolve) => {
		debug(`Getting theme details for directory: ${dirName}`);
		const styleCssPath = path.join(dirName, 'style.css');
		debug(`Reading ${styleCssPath}`);

		let themeName = '';
		let parentTheme: string | null = null;

		const fileStream = fs.createReadStream(styleCssPath);
		const rl = readline.createInterface({
			input: fileStream,
			crlfDelay: Number.POSITIVE_INFINITY,
		});

		rl.on('line', (line) => {
			const themeNameMatch = line.match(/^Theme Name:\s*(.+)$/);
			if (themeNameMatch) {
				themeName = themeNameMatch[1].trim();
			}

			const parentThemeMatch = line.match(/^Template:\s*(.*)$/);
			if (parentThemeMatch) {
				parentTheme = parentThemeMatch[1].trim() || null;
			}
		});

		rl.on('close', () => {
			debug(
				`Found themeName: ${themeName}, parentTheme: ${parentTheme || 'null'}`,
			);
			resolve({ themeName, parentTheme });
		});
	});
}

async function getUniqueDirs(
	changedFiles: string[],
): Promise<Record<string, string>> {
	debug('Getting unique directories from changed files');
	const uniqueDirs: Record<string, string> = {};

	for (const file of changedFiles) {
		let dirName = path.dirname(file);
		while (dirName !== '.') {
			const styleCssPath = path.join(dirName, 'style.css');
			if (fs.existsSync(styleCssPath)) {
				const { themeName, parentTheme } = await getThemeDetails(dirName);
				if (themeName) {
					const finalThemeName = parentTheme
						? `${themeName}_childof_${parentTheme}`
						: themeName;
					uniqueDirs[finalThemeName] = dirName;
					debug(`Added ${finalThemeName}: ${dirName} to uniqueDirs`);
				}
				break;
			}
			dirName = path.dirname(dirName);
		}
	}

	return uniqueDirs;
}

interface ThemeChangesResult {
	hasThemeChanges: boolean;
	changedThemes: Record<string, string>;
}

export async function detectThemeChanges(): Promise<ThemeChangesResult> {
	debug('Detecting theme changes');
	const changedFiles = await getChangedFiles();
	debug(`Changed files: ${JSON.stringify(changedFiles)}`);
	const uniqueDirs = await getUniqueDirs(changedFiles);
	debug(`Unique dirs: ${JSON.stringify(uniqueDirs)}`);

	if (Object.keys(uniqueDirs).length === 0) {
		debug('No theme changes detected');
		return { hasThemeChanges: false, changedThemes: {} };
	}

	debug('Theme changes detected');
	return { hasThemeChanges: true, changedThemes: uniqueDirs };
}
