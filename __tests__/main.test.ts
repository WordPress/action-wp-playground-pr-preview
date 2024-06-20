import { getInput, setFailed } from '@actions/core';
import { exec } from '@actions/exec';
import { context, getOctokit } from '@actions/github';
import createPreviewLinksComment from '../src/create-preview-links';
import { detectThemeChanges } from '../src/get-changed-themes';
import { run } from '../src/main';

jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('@actions/github');
jest.mock('../src/create-preview-links');
jest.mock('../src/get-changed-themes');

const mockGetInput = getInput as jest.MockedFunction<typeof getInput>;
const mockSetFailed = setFailed as jest.MockedFunction<typeof setFailed>;
const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockGetOctokit = getOctokit as jest.MockedFunction<typeof getOctokit>;
const mockDetectThemeChanges = detectThemeChanges as jest.MockedFunction<
	typeof detectThemeChanges
>;
const mockCreatePreviewLinksComment =
	createPreviewLinksComment as jest.MockedFunction<
		typeof createPreviewLinksComment
	>;

const mockOctokit = {
	rest: {
		issues: {
			listComments: jest.fn(),
			updateComment: jest.fn(),
			createComment: jest.fn(),
		},
	},
	request: jest.fn(),
	graphql: jest.fn(),
	log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
	hook: { before: jest.fn(), error: jest.fn(), wrap: jest.fn() },
	auth: jest.fn(),
} as unknown as ReturnType<typeof getOctokit>;

describe('run', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGetInput.mockReturnValue('fake-token');
		mockGetOctokit.mockReturnValue(mockOctokit);

		// Use Object.defineProperty to set read-only properties
		Object.defineProperty(context, 'repo', {
			value: { owner: 'fake-org', repo: 'fake-repo' },
			writable: true,
		});
		Object.defineProperty(context, 'eventName', {
			value: 'pull_request_target',
			writable: true,
		});
	});

	it('should clone the repository and create a comment when themes have changed', async () => {
		mockDetectThemeChanges.mockReturnValue({
			hasThemeChanges: true,
			changedThemes: { theme1: 'dir1', theme2_childof_parentTheme: 'dir2' },
		});

		await run();

		expect(mockCreatePreviewLinksComment).toHaveBeenCalledWith(
			mockOctokit,
			context,
			'theme1,theme2_childof_parentTheme',
		);
	});

	it('should not create a comment when there are no theme changes', async () => {
		mockDetectThemeChanges.mockReturnValue({
			hasThemeChanges: false,
			changedThemes: {},
		});

		await run();

		expect(mockCreatePreviewLinksComment).not.toHaveBeenCalled();
	});

	it('should handle errors correctly', async () => {
		const error = new Error('Something went wrong');
		mockGetInput.mockImplementation(() => {
			throw error;
		});

		await run();

		expect(mockSetFailed).toHaveBeenCalledWith('Something went wrong');
	});

	it('should exit early if event is not pull_request_target', async () => {
		Object.defineProperty(context, 'eventName', {
			value: 'push',
			writable: true,
		});

		await run();

		expect(mockExec).not.toHaveBeenCalled();
		expect(mockCreatePreviewLinksComment).not.toHaveBeenCalled();
	});
});
