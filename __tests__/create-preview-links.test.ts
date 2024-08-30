import { getOctokit } from '@actions/github';
import type { Context } from '@actions/github/lib/context';
import createPreviewLinksComment from '../src/create-preview-links';

jest.mock('@actions/github', () => {
	return {
		getOctokit: jest.fn().mockImplementation(() => {
			return {
				rest: {
					issues: {
						listComments: jest.fn().mockResolvedValue({ data: [] }),
						updateComment: jest.fn().mockResolvedValue({}),
						createComment: jest.fn().mockResolvedValue({}),
					},
				},
			};
		}),
	};
});

jest.mock('@actions/github/lib/context');

const mockGithub = getOctokit('fake-token') as ReturnType<typeof getOctokit>;

const mockContext: Context = {
	repo: {
		owner: 'owner',
		repo: 'repo',
	},
	payload: {
		pull_request: {
			number: 1,
			head: {
				ref: 'branch-name',
			},
		},
	},
} as unknown as Context;

describe('createPreviewLinksComment', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should create a new comment with preview links when no existing comment is found', async () => {
		const changedThemeSlugs: Record<string, string> = {
			theme1: 'dir1',
			theme2_childof_parentTheme: 'dir2',
		};

		await createPreviewLinksComment(mockGithub, mockContext, changedThemeSlugs);

		expect(mockGithub.rest.issues.listComments).toHaveBeenCalledWith({
			issue_number: mockContext.payload?.pull_request?.number,
			owner: mockContext.repo.owner,
			repo: mockContext.repo.repo,
		});

		expect(mockGithub.rest.issues.createComment).toHaveBeenCalledWith({
			issue_number: mockContext.payload?.pull_request?.number,
			owner: mockContext.repo.owner,
			repo: mockContext.repo.repo,
			body: expect.stringContaining('### Preview changes\n'),
		});

		expect(mockGithub.rest.issues.updateComment).not.toHaveBeenCalled();
	});

	it('should update an existing comment with new preview links', async () => {
		const changedThemeSlugs: Record<string, string> = {
			theme1: 'dir1',
			theme2_childof_parentTheme: 'dir2',
		};

		(
			mockGithub.rest.issues.listComments as unknown as jest.Mock
		).mockResolvedValueOnce({
			data: [
				{
					id: 123,
					user: { login: 'github-actions[bot]' },
					body: '### Preview changes',
				},
			],
		});

		await createPreviewLinksComment(mockGithub, mockContext, changedThemeSlugs);

		expect(mockGithub.rest.issues.listComments).toHaveBeenCalledWith({
			issue_number: mockContext.payload?.pull_request?.number,
			owner: mockContext.repo.owner,
			repo: mockContext.repo.repo,
		});

		expect(mockGithub.rest.issues.updateComment).toHaveBeenCalledWith({
			comment_id: 123,
			owner: mockContext.repo.owner,
			repo: mockContext.repo.repo,
			body: expect.stringContaining('### Preview changes\n'),
		});

		expect(mockGithub.rest.issues.createComment).not.toHaveBeenCalled();
	});

	it('should handle themes without parent themes correctly', async () => {
		const changedThemeSlugs: Record<string, string> = { theme1: 'dir1' };

		await createPreviewLinksComment(mockGithub, mockContext, changedThemeSlugs);

		const expectedBody = `
I've detected changes to the following themes in this PR: theme1.

You can preview these changes by following the links below:

- [Preview changes for **theme1**](https://playground.wordpress.net/#{"steps":[{"step":"login","username":"admin","password":"password"},{"step":"installTheme","themeZipFile":{"resource":"url","url":"https://github-proxy.com/proxy.php?action=partial&repo=Automattic/themes&directory=dir1&branch=branch-name"}},{"step":"activateTheme","themeFolderName":"dir1"}]})

I will update this comment with the latest preview links as you push more changes to this PR.
**⚠️ Note:** The preview sites are created using [WordPress Playground](https://wordpress.org/playground/). You can add content, edit settings, and test the themes as you would on a real site, but please note that changes are not saved between sessions.
`;

		expect(mockGithub.rest.issues.createComment).toHaveBeenCalledWith({
			issue_number: mockContext.payload?.pull_request?.number,
			owner: mockContext.repo.owner,
			repo: mockContext.repo.repo,
			body: `### Preview changes\n${expectedBody}`,
		});
	});
});
