import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { debug, getInput } from '@actions/core';

function runCommand(command: string): string {
	debug(`Running command: ${command}`);
	const result = execSync(command, { encoding: 'utf-8' }).trim();
	debug(`Command result: ${result}`);
	return result;
}

function getChangedFiles(): string[] {
	const ref = getInput('ref', { required: true });
	const baseBranch = getInput('base-branch', { required: true });
	debug(`Getting changed files for ref: ${ref}`);
	// Fetch the base branch
	runCommand(`git fetch origin ${baseBranch}`);
	const changedFiles = runCommand(
		`git diff --name-only ${ref} origin/${baseBranch}`,
	);
	const filesArray = changedFiles
		.split('\n')
		.filter((file) => file.trim() !== '');
	debug(`Changed files: ${filesArray.join(', ')}`);
	return filesArray;
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
	const changedFiles = getChangedFiles();
	const uniqueDirs = await getUniqueDirs(changedFiles);

	if (Object.keys(uniqueDirs).length === 0) {
		debug('No theme changes detected');
		return { hasThemeChanges: false, changedThemes: {} };
	}

	debug('Theme changes detected');
	return { hasThemeChanges: true, changedThemes: uniqueDirs };
}
