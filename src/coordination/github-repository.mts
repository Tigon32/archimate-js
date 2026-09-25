export function githubRepositorySlug(remote: string): string {
  const normalized = remote.startsWith('git@github.com:')
    ? `https://github.com/${remote.slice('git@github.com:'.length)}`
    : remote;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('origin must be a GitHub repository URL.');
  }
  if (parsed.hostname.toLowerCase() !== 'github.com') throw new Error('origin must point to github.com.');
  const slug = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  if (!/^[^/]+\/[^/]+$/.test(slug)) throw new Error('origin must identify one GitHub owner and repository.');
  return slug;
}
