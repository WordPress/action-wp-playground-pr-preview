import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { debug, getInput } from '@actions/core';
import { detectThemeChanges } from '../src/get-changed-themes';

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('node:path');
jest.mock('@actions/core');

const mockGetInput = getInput as jest.MockedFunction<typeof getInput>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockFsExistsSync = fs.existsSync as jest.MockedFunction<
	typeof fs.existsSync
>;
const mockFsReadFileSync = fs.readFileSync as jest.MockedFunction<
	typeof fs.readFileSync
>;
const mockDebug = debug as jest.MockedFunction<typeof debug>;

describe('detectThemeChanges', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGetInput.mockImplementation((name: string) => {
			if (name === 'ref') {
				return 'HEAD';
			}
			if (name === 'base-branch') return 'main';
			return '';
		});
	});

	it('should return no theme changes when no themes are modified', () => {
		mockExecSync.mockReturnValue('');
		mockFsExistsSync.mockReturnValue(false);

		const result = detectThemeChanges();

		expect(result).toEqual({ hasThemeChanges: false, changedThemes: {} });

		expect(mockGetInput).toHaveBeenCalledWith('ref', { required: true });
		expect(mockGetInput).toHaveBeenCalledWith('base-branch', {
			required: true,
		});
		expect(mockExecSync).toHaveBeenCalledWith('git fetch origin main', {
			encoding: 'utf-8',
		});
		expect(mockExecSync).toHaveBeenCalledWith(
			'git diff --name-only HEAD origin/main',
			{ encoding: 'utf-8' },
		);
		expect(mockDebug).toHaveBeenCalledWith('No theme changes detected');
	});

	it('should return theme changes when themes are modified', () => {
		mockExecSync.mockReturnValue('theme1/style.css\ntheme2/style.css');
		mockFsExistsSync.mockReturnValue(true);
		mockFsReadFileSync.mockImplementation(
			(filePath: fs.PathOrFileDescriptor) => {
				if (typeof filePath === 'string') {
					if (filePath.includes('theme1')) {
						return 'Theme Name: Theme1';
					}
					if (filePath.includes('theme2')) {
						return 'Theme Name: Theme2\nTemplate: ParentTheme';
					}
				}
				return '';
			},
		);

		const result = detectThemeChanges();

		expect(result).toEqual({
			hasThemeChanges: true,
			changedThemes: {
				Theme1: 'theme1',
				Theme2_childof_ParentTheme: 'theme2',
			},
		});

		expect(mockGetInput).toHaveBeenCalledWith('ref', { required: true });
		expect(mockGetInput).toHaveBeenCalledWith('base-branch', {
			required: true,
		});
		expect(mockExecSync).toHaveBeenCalledWith('git fetch origin main', {
			encoding: 'utf-8',
		});
		expect(mockExecSync).toHaveBeenCalledWith(
			'git diff --name-only HEAD origin/main',
			{ encoding: 'utf-8' },
		);
		expect(mockFsExistsSync).toHaveBeenCalledWith('theme1/style.css');
		expect(mockFsExistsSync).toHaveBeenCalledWith('theme2/style.css');
		expect(mockFsReadFileSync).toHaveBeenCalledWith(
			'theme1/style.css',
			'utf-8',
		);
		expect(mockFsReadFileSync).toHaveBeenCalledWith(
			'theme2/style.css',
			'utf-8',
		);
		expect(mockDebug).toHaveBeenCalledWith('Theme changes detected');
	});

	it('should correctly handle templates with no value', () => {
		mockExecSync.mockReturnValue('theme3/style.css');
		mockFsExistsSync.mockReturnValue(true);
		mockFsReadFileSync.mockReturnValue('Theme Name: Theme3\nTemplate: \n');

		const result = detectThemeChanges();

		expect(result).toEqual({
			hasThemeChanges: true,
			changedThemes: {
				Theme3: 'theme3',
			},
		});

		expect(mockGetInput).toHaveBeenCalledWith('ref', { required: true });
		expect(mockGetInput).toHaveBeenCalledWith('base-branch', {
			required: true,
		});
		expect(mockExecSync).toHaveBeenCalledWith('git fetch origin main', {
			encoding: 'utf-8',
		});
		expect(mockExecSync).toHaveBeenCalledWith(
			'git diff --name-only HEAD origin/main',
			{ encoding: 'utf-8' },
		);
		expect(mockFsExistsSync).toHaveBeenCalledWith('theme3/style.css');
		expect(mockFsReadFileSync).toHaveBeenCalledWith(
			'theme3/style.css',
			'utf-8',
		);
		expect(mockDebug).toHaveBeenCalledWith('Theme changes detected');
	});
});
