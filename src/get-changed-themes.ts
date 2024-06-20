import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function runCommand(command: string): string {
	return execSync(command, { encoding: 'utf-8' }).trim();
}

function getChangedFiles(): string[] {
	runCommand('git fetch origin');
	const changedFiles = runCommand('git diff --name-only HEAD origin/trunk');
	return changedFiles.split('\n').filter((file) => file.trim() !== '');
}

function getThemeDetails(dirName: string): {
	themeName: string;
	parentTheme: string | null;
} {
	const styleCssPath = path.join(dirName, 'style.css');
	const content = fs.readFileSync(styleCssPath, 'utf-8');

	const themeNameMatch = content.match(/Theme Name:\s*(.*)/);
	const parentThemeMatch = content.match(/Template:\s*(.*)/);

	const themeName = themeNameMatch ? themeNameMatch[1].trim() : '';
	const parentTheme = parentThemeMatch ? parentThemeMatch[1].trim() : null;

	return { themeName, parentTheme };
}

function getUniqueDirs(changedFiles: string[]): Record<string, string> {
	const uniqueDirs: Record<string, string> = {};

	for (const file of changedFiles) {
		let dirName = path.dirname(file);
		while (dirName !== '.') {
			const styleCssPath = path.join(dirName, 'style.css');
			if (fs.existsSync(styleCssPath)) {
				const { themeName, parentTheme } = getThemeDetails(dirName);
				const finalThemeName = parentTheme
					? `${themeName}_childof_${parentTheme}`
					: themeName;
				uniqueDirs[finalThemeName] = dirName;
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
	const changedFiles = getChangedFiles();
	const uniqueDirs = getUniqueDirs(changedFiles);

	if (Object.keys(uniqueDirs).length === 0) {
		return { hasThemeChanges: false, changedThemes: {} };
	}

	return { hasThemeChanges: true, changedThemes: uniqueDirs };
}
