const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildAutoBlueprint,
  getPullRequestHeadRepository,
  inferSlug,
  normalizePath,
} = require("../src/blueprint");

test("uses the pull request head repository for fork PR previews", () => {
  const repo = {
    name: "base-plugin",
    full_name: "wordpress/base-plugin",
    owner: { login: "wordpress" },
  };
  const pr = {
    head: {
      repo: {
        name: "base-plugin",
        full_name: "contributor/base-plugin",
        owner: { login: "contributor" },
      },
    },
  };

  assert.deepEqual(
    getPullRequestHeadRepository(pr, repo, "wordpress", "base-plugin"),
    {
      owner: "contributor",
      name: "base-plugin",
      fullName: "contributor/base-plugin",
      gitUrl: "https://github.com/contributor/base-plugin.git",
    },
  );
});

test("falls back to the base repository when PR head repo metadata is missing", () => {
  const repo = {
    name: "base-plugin",
    full_name: "wordpress/base-plugin",
    owner: { login: "wordpress" },
  };

  assert.deepEqual(
    getPullRequestHeadRepository(
      { head: {} },
      repo,
      "wordpress",
      "base-plugin",
    ),
    {
      owner: "wordpress",
      name: "base-plugin",
      fullName: "wordpress/base-plugin",
      gitUrl: "https://github.com/wordpress/base-plugin.git",
    },
  );
});

test("builds plugin preview blueprints from the exact PR head commit", () => {
  const blueprint = JSON.parse(
    buildAutoBlueprint({
      pluginPath: ".",
      repoGitUrl: "https://github.com/contributor/plugin.git",
      ref: "1234567890abcdef1234567890abcdef12345678",
    }),
  );

  assert.deepEqual(blueprint.steps, [
    {
      step: "installPlugin",
      pluginData: {
        resource: "git:directory",
        url: "https://github.com/contributor/plugin.git",
        ref: "1234567890abcdef1234567890abcdef12345678",
        refType: "commit",
        path: "/",
      },
      options: {
        activate: true,
      },
    },
  ]);
});

test("builds theme and plugin previews with normalized subdirectory paths", () => {
  const blueprint = JSON.parse(
    buildAutoBlueprint({
      pluginPath: "./plugins/my-plugin/",
      themePath: "/themes/my-theme",
      repoGitUrl: "https://github.com/wordpress/project.git",
      ref: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    }),
  );

  assert.equal(blueprint.steps.length, 2);
  assert.equal(blueprint.steps[0].pluginData.path, "plugins/my-plugin");
  assert.equal(blueprint.steps[1].themeData.path, "themes/my-theme");
  assert.equal(blueprint.steps[0].pluginData.refType, "commit");
  assert.equal(blueprint.steps[1].themeData.refType, "commit");
});

test("normalizes paths and infers slugs consistently", () => {
  assert.equal(normalizePath("."), "");
  assert.equal(normalizePath("./plugins/example/"), "plugins/example");
  assert.equal(inferSlug("./plugins/my-plugin/", "fallback"), "my-plugin");
  assert.equal(inferSlug(".", "fallback"), "fallback");
});
