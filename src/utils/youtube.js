const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Pulls the 11-character video ID out of anything an instructor might paste: a watch, live, embed or
 * shorts link, a youtu.be link, or the bare ID. Returns null when it isn't a YouTube video.
 */
export const parseYouTubeId = (input) => {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  if (ID_PATTERN.test(value)) return value;

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  let id = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, kind, second] = url.pathname.split("/");
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (["live", "embed", "shorts", "v"].includes(kind)) id = second;
  }
  return id && ID_PATTERN.test(id) ? id : null;
};

/** What the frontend needs to show a class that streams on YouTube. */
export const streamDetails = (videoId) => {
  if (!videoId) return { provider: "youtube", configured: false, videoId: null, embedUrl: null, watchUrl: null };
  return {
    provider: "youtube",
    configured: true,
    videoId,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
};
