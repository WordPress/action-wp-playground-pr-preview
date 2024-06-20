import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { detectThemeChanges } from '../src/get-changed-themes';

jest.mock('child_process', () => ({
	execSync: jest.fn(),
}));

jest.mock('fs', () => ({
	existsSync: jest.fn(),
	readFileSync: jest.fn(),
}));

jest.mock('path', () => ({
	...jest.requireActual('path'),
	join: jest.fn((...args) => args.join('/')),
	dirname: jest.requireActual('path').dirname,
}));

describe('detectThemeChanges', () => {
	it('should return no theme changes when no themes are modified', () => {
		(execSync as jest.Mock).mockReturnValue('');
		(fs.existsSync as jest.Mock).mockReturnValue(false);

		const result = detectThemeChanges();

		expect(result).toEqual({ hasThemeChanges: false, changedThemes: {} });
	});

	it('should return theme changes when themes are modified', () => {
		(execSync as jest.Mock).mockReturnValue(
			'theme1/style.css\ntheme2/style.css',
		);
		(fs.existsSync as jest.Mock).mockImplementation((filePath: string) =>
			filePath.endsWith('style.css'),
		);
		(fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
			if (filePath.includes('theme1')) {
				return 'Theme Name: Theme1';
			}
			if (filePath.includes('theme2')) {
				return 'Theme Name: Theme2\nTemplate: ParentTheme';
			}
			return '';
		});

		const result = detectThemeChanges();

		expect(result).toEqual({
			hasThemeChanges: true,
			changedThemes: {
				Theme1: 'theme1',
				Theme2_childof_ParentTheme: 'theme2',
			},
		});
	});
});
