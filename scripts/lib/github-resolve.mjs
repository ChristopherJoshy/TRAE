// GitHub avatar → owner profile resolution via the free, keyless, official
// GitHub REST API (60 req/hr unauthenticated). An avatar URL
// avatars.githubusercontent.com/u/<id> maps to exactly one account —
// api.github.com/user/<id> returns its login, profile URL, and avatar URL.
// All data is live API output, never invented.
export async function resolveGithubAvatar(imageUrl) {
  let u;
  try {
    u = new URL(imageUrl);
  } catch {
    return null;
  }
  if (u.hostname.toLowerCase() !== "avatars.githubusercontent.com") return null;
  const m = u.pathname.match(/\/u\/(\d+)/);
  if (!m) return null;
  const id = m[1];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`https://api.github.com/user/${id}`, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "TRACE-pipeline/0.1 (+research prototype)",
        Accept: "application/vnd.github+json",
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = new Error(`GitHub API HTTP ${res.status}.`);
      err.code = res.status === 403 || res.status === 429 ? "rate-limit" : "github-error";
      throw err;
    }
    const j = await res.json();
    if (!j || !j.html_url) return null;
    return {
      id,
      login: j.login ?? null,
      profileUrl: j.html_url,
      avatarUrl: j.avatar_url ?? imageUrl,
      name: j.name ?? null,
      publicRepos: j.public_repos ?? null,
    };
  } finally {
    clearTimeout(t);
  }
}
