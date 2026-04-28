function normalizePath(path) {
  const raw = (path || "").trim();
  if (!raw || raw === "." || raw === "./") {
    return "";
  }
  return raw.replace(/^\.\/+/, "").replace(/^\/+|\/+$/g, "");
}

function sanitizeSlug(value, fallback) {
  if (!value) return fallback;
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function inferSlug(path, fallback) {
  const clean = normalizePath(path).split("/").filter(Boolean).pop();
  if (!clean || clean === "." || clean === "..") return fallback;
  return sanitizeSlug(clean, fallback);
}

function getRepoOwner(repo, fallback) {
  return repo?.owner?.login || repo?.owner?.name || repo?.owner?.id || fallback;
}

function getPullRequestHeadRepository(
  pr,
  fallbackRepo,
  fallbackOwner,
  fallbackRepoName,
) {
  const headRepo = pr.head?.repo || fallbackRepo || {};
  const owner = getRepoOwner(headRepo, fallbackOwner);
  const name = headRepo.name || fallbackRepoName;
  const fullName = headRepo.full_name || `${owner}/${name}`;

  return {
    owner,
    name,
    fullName,
    gitUrl: `https://github.com/${fullName}.git`,
  };
}

function buildAutoBlueprint({ pluginPath, themePath, repoGitUrl, ref }) {
  const steps = [];
  const gitDirectoryResource = (path) => ({
    resource: "git:directory",
    url: repoGitUrl,
    ref,
    refType: "commit",
    path: normalizePath(path) || "/",
  });

  if (pluginPath) {
    steps.push({
      step: "installPlugin",
      pluginData: gitDirectoryResource(pluginPath),
      options: {
        activate: true,
      },
    });
  }

  if (themePath) {
    steps.push({
      step: "installTheme",
      themeData: gitDirectoryResource(themePath),
      options: {
        activate: true,
      },
    });
  }

  return JSON.stringify({
    $schema: "https://playground.wordpress.net/blueprint-schema.json",
    preferredVersions: {
      php: "8.2",
      wp: "latest",
    },
    steps,
  });
}

module.exports = {
  buildAutoBlueprint,
  getPullRequestHeadRepository,
  inferSlug,
  normalizePath,
  sanitizeSlug,
};
