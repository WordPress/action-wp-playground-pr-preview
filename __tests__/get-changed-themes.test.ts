import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { debug, getInput } from '@actions/core';
import { detectThemeChanges } from '../src/get-changed-themes';

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('node:path');
jest.mock('@actions/core');
jest.mock('node:readline');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockFsExistsSync = fs.existsSync as jest.MockedFunction<
	typeof fs.existsSync
>;
const mockFsCreateReadStream = fs.createReadStream as jest.MockedFunction<
	typeof fs.createReadStream
>;
const mockPathDirname = path.dirname as jest.MockedFunction<
	typeof path.dirname
>;
const mockPathJoin = path.join as jest.MockedFunction<typeof path.join>;
const mockGetInput = getInput as jest.MockedFunction<typeof getInput>;
const mockDebug = debug as jest.MockedFunction<typeof debug>;

describe('detectThemeChanges', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGetInput.mockImplementation((name: string) => {
			if (name === 'ref') return 'HEAD';
			if (name === 'base-branch') return 'main';
			return '';
		});
		mockPathDirname.mockImplementation((p: string) => p.split('/')[0]);
		mockPathJoin.mockImplementation(
			(dir: string, file: string) => `${dir}/${file}`,
		);
	});

	it('should return no theme changes when no themes are modified', async () => {
		mockExecSync.mockReturnValue('');
		mockFsExistsSync.mockReturnValue(false);

		const result = await detectThemeChanges();

		expect(result).toEqual({ hasThemeChanges: false, changedThemes: {} });
	});

	it('should return theme changes when themes are modified', async () => {
		mockExecSync.mockReturnValue('theme1/style.css\ntheme2/style.css');
		mockFsExistsSync.mockReturnValue(true);

		const mockReadlineInterface: {
			on: jest.Mock;
			close: jest.Mock;
		} = {
			on: jest.fn((event: string, callback: (line: string) => void) => {
				if (event === 'line') {
					callback('Theme Name: MockTheme1');
					callback('Template: MockParent1');
					callback(''); // Add an empty line to separate themes
					callback('Theme Name: MockTheme2');
					callback('Template: MockParent2');
				}
				if (event === 'close') {
					(callback as () => void)();
				}
				return mockReadlineInterface;
			}),
			close: jest.fn(),
		};

		(readline.createInterface as jest.Mock).mockReturnValue(
			mockReadlineInterface,
		);
		mockFsCreateReadStream.mockReturnValue({} as fs.ReadStream);

		const result = await detectThemeChanges();

		expect(result).toEqual({
			hasThemeChanges: true,
			changedThemes: {
				MockTheme1_childof_MockParent1: 'theme1',
				MockTheme2_childof_MockParent1: 'theme2',
			},
		});
	});

	it('should correctly handle templates with no value', async () => {
		mockExecSync.mockReturnValue('theme3/style.css');
		mockFsExistsSync.mockReturnValue(true);

		const mockReadlineInterface: {
			on: jest.Mock;
			close: jest.Mock;
		} = {
			on: jest.fn((event: string, callback: (line: string) => void) => {
				if (event === 'line') {
					callback('Theme Name: Theme3');
					callback('Template:');
					callback('Template:');
				}
				if (event === 'close') {
					(callback as () => void)();
				}
				return mockReadlineInterface;
			}),
			close: jest.fn(),
		};

		(readline.createInterface as jest.Mock).mockReturnValue(
			mockReadlineInterface,
		);
		mockFsCreateReadStream.mockReturnValue({} as fs.ReadStream);

		const result = await detectThemeChanges();

		expect(result).toEqual({
			hasThemeChanges: true,
			changedThemes: {
				Theme3: 'theme3',
			},
		});
	});
});
