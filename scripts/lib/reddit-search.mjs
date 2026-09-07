// Reddit discovery leg via the free, keyless PullPush API
// (api.pullpush.io — Pushshift successor). Text/token search over Reddit
// submissions; every returned post is then image-verified by bytes in the
// pipeline like all other candidates — never trusted on text alone.
function tokensOf({ imageUrl = null, filename = null } = {}) {
  const tokens = [];
  if (imageUrl) {
    try {
      const u = new URL(imageUrl);
      const tail = u.pathname.split("/").filter(Boolean).pop() ?? "";
      for (const t of tail.split(/[^A-Za-z0-9]+/).filter((t) => t.length >= 8).slice(0, 2)) {
        tokens.push(t);
      }
    } catch { /* ignore */ }
  }
  if (filename) {
    const base = filename.replace(/\.[a-z0-9]+$/i, "");
    for (const t of base.split(/[^A-Za-z0-9]+/).filter((t) => t.length >= 6).slice(0, 2)) {
      tokens.push(t);
    }
  }
  return [...new Set(tokens)].slice(0, 3);
}

function unescape(s) {
  return String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

function previewImages(post) {
  const out = [];
  try {
    const imgs = post?.preview?.images ?? [];
    for (const im of imgs) {
      if (im?.source?.url) out.push(unescape(im.source.url));
      for (const r of im?.resolutions ?? []) {
        if (r?.url) out.push(unescape(r.url));
      }
    }
    if (post?.thumbnail && post.thumbnail.startsWith("http")) out.push(post.thumbnail);
    if (post?.url_overridden_by_dest && /\.(jpe?g|png|webp)(\?|#|$)/i.test(post.url_overridden_by_dest)) {
      out.push(post.url_overridden_by_dest);
    }
  } catch { /* ignore malformed preview */ }
  return [...new Set(out)].slice(0, 4);
}

async function pullpushQuery(q) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  const t0 = Date.now();
  try {
    const u = `https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(q)}&size=25&sort=desc`;
    const res = await fetch(u, {
      signal: ctrl.signal,
      headers: { "User-Agent": "TRACE-pipeline/0.1 (+research prototype)" },
    });
    if (!res.ok) {
      const err = new Error(`PullPush HTTP ${res.status}.`);
      err.code = res.status === 429 ? "rate-limit" : "reddit-error";
      throw err;
    }
    const json = await res.json();
    return { posts: json?.data ?? [], latencyMs: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Discover Reddit posts related to the image context. Returns candidates in
 * the pipeline's candidate shape plus a human-readable note.
 */
export async function redditDiscover({ imageUrl = null, filename = null } = {}) {
  const t0 = Date.now();
  const tokens = tokensOf({ imageUrl, filename });
  if (tokens.length === 0) {
    return { candidates: [], latencyMs: 0, note: "reddit pass skipped (no distinctive tokens)" };
  }
  const seen = new Map();
  for (const tok of tokens.slice(0, 2)) {
    let posts = [];
    try {
      ({ posts } = await pullpushQuery(tok));
    } catch (e) {
      return {
        candidates: [...seen.values()],
        latencyMs: Date.now() - t0,
        note: `reddit pass partial (${e.code ?? "error"})`,
      };
    }
    for (const p of posts) {
      const permalink = p?.permalink ? `https://www.reddit.com${p.permalink}` : null;
      if (!permalink || seen.has(permalink)) continue;
      seen.set(permalink, {
        url: permalink,
        title: p?.title ? `${p.title} (r/${p?.subreddit ?? "?"}, u/${p?.author ?? "?"})` : `Reddit post r/${p?.subreddit ?? "?"}`,
        publishedDate: p?.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
        author: p?.author ? `u/${p.author}` : null,
        score: null,
        query: `"${tok}" [reddit]`,
        highlights: [],
        imageLinks: previewImages(p),
      });
    }
  }
  return {
    candidates: [...seen.values()].slice(0, 15),
    latencyMs: Date.now() - t0,
    note: `reddit pass (${tokens.map((t) => `"${t}"`).join(", ")})`,
  };
}
