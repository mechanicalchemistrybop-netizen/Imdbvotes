// IMDb Votes - Stremio metadata addon (no dependencies, needs Node 18+)
// Takes Cinemeta's meta and prepends "IMDb 8.8/10 (2.9M votes)" to the description.
//
// Run:  OMDB_API_KEY=yourkey node index.js
// Free OMDb key: https://www.omdbapi.com/apikey.aspx

const http = require("http");

const PORT = process.env.PORT || 7000;
const OMDB_KEY = process.env.OMDB_API_KEY;
const CINEMETA = "https://v3-cinemeta.strem.io";

const manifest = {
  id: "community.imdb.votes",
  version: "1.0.0",
  name: "IMDb Votes",
  description: "Shows IMDb rating with vote count on the movie/series details page.",
  resources: ["meta"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
};

const cache = new Map(); // imdbId -> { text, expires }
const TTL = 12 * 60 * 60 * 1000;

function formatVotes(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

async function getRatingText(id) {
  const hit = cache.get(id);
  if (hit && hit.expires > Date.now()) return hit.text;

  const res = await fetch(`https://www.omdbapi.com/?i=${id}&apikey=${OMDB_KEY}`);
  const d = await res.json();
  let text = null;
  if (d && d.imdbRating && d.imdbRating !== "N/A") {
    const votes = parseInt(String(d.imdbVotes || "0").replace(/,/g, ""), 10);
    text = `⭐ IMDb ${d.imdbRating}/10` + (votes ? ` (${formatVotes(votes)} votes)` : "");
  }
  cache.set(id, { text, expires: Date.now() + TTL });
  return text;
}

async function getMeta(type, id) {
  const res = await fetch(`${CINEMETA}/meta/${type}/${id}.json`);
  if (!res.ok) return null;
  const { meta } = await res.json();
  if (!meta) return null;

  try {
    const text = OMDB_KEY ? await getRatingText(id.split(":")[0]) : null;
    if (text) meta.description = `${text}\n\n${meta.description || ""}`.trim();
  } catch (e) {
    console.error("rating lookup failed:", e.message);
  }
  return meta;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  const path = decodeURIComponent(req.url.split("?")[0]);

  if (path === "/manifest.json") return res.end(JSON.stringify(manifest));

  const m = path.match(/^\/meta\/(movie|series)\/(.+)\.json$/);
  if (m) {
    try {
      const meta = await getMeta(m[1], m[2]);
      return res.end(JSON.stringify({ meta }));
    } catch (e) {
      console.error(e);
      return res.end(JSON.stringify({ meta: null }));
    }
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`Addon running: http://127.0.0.1:${PORT}/manifest.json`);
  if (!OMDB_KEY) console.warn("Warning: OMDB_API_KEY not set, no ratings will be added.");
});
