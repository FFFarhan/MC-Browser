const DEFAULT_GITHUB_REPOSITORY = 'FFFarhan/MC-Browser';

export function deploymentBase(
  isGitHubActions: boolean,
  githubRepository = DEFAULT_GITHUB_REPOSITORY,
): string {
  if (!isGitHubActions) return '/';

  const [owner, repository, ...unexpectedParts] = githubRepository.split('/');
  if (!owner || !repository || unexpectedParts.length > 0) {
    throw new Error(`Invalid GitHub repository name: ${githubRepository}`);
  }

  if (repository.toLowerCase() === `${owner.toLowerCase()}.github.io`) return '/';
  return `/${repository}/`;
}
