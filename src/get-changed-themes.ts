import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

function getThemeDetails(dirName: string): {
	themeName: string;
	parentTheme: string | null;
} {
	debug(`Getting theme details for directory: ${dirName}`);
	const styleCssPath = path.join(dirName, 'style.css');
	debug(`Reading ${styleCssPath}`);
	const content = fs.readFileSync(styleCssPath, 'utf-8');

	const themeNameMatch = content.match(/^Theme Name:\s*(.+)$/m);
	const parentThemeMatch = content.match(/^Template:\s*(.+)$/m);

	const themeName = themeNameMatch ? themeNameMatch[1].trim() : '';
	const parentTheme =
		parentThemeMatch && parentThemeMatch[1].trim() !== ''
			? parentThemeMatch[1].trim()
			: null;
	console.log('themeName', themeName);
	console.log('parentTheme', parentTheme);

	debug(`Found themeName: ${themeName}, parentTheme: ${parentTheme}`);
	return { themeName, parentTheme };
}

function getUniqueDirs(changedFiles: string[]): Record<string, string> {
	debug('Getting unique directories from changed files');
	const uniqueDirs: Record<string, string> = {};

	for (const file of changedFiles) {
		let dirName = path.dirname(file);
		while (dirName !== '.') {
			const styleCssPath = path.join(dirName, 'style.css');
			if (fs.existsSync(styleCssPath)) {
				const { themeName, parentTheme } = getThemeDetails(dirName);
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

export function detectThemeChanges(): ThemeChangesResult {
	debug('Detecting theme changes');
	const changedFiles = getChangedFiles();
	const uniqueDirs = getUniqueDirs(changedFiles);

	if (Object.keys(uniqueDirs).length === 0) {
		debug('No theme changes detected');
		return { hasThemeChanges: false, changedThemes: {} };
	}

	debug('Theme changes detected');
	return { hasThemeChanges: true, changedThemes: uniqueDirs };
}
