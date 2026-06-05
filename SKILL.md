---
name: movie-search-and-download
description: Use when a user asks to search for a movie or TV title, disambiguate search results on rrdy/rrdynb-style pages, and report structured title metadata plus resource-provider download links and extraction codes.
---

# Movie Search and Resource Availability

Use this skill to search a user-provided movie or TV title, identify the correct work, and return structured candidates with title metadata. The workflow is browser-first because the target pages can delay rendering or show verification.

## Output Boundary

- Output download URLs, extraction codes, magnet links, ED2K links, and other direct access links when the page exposes them.
- Identify the correct work, summarize metadata, and report which resource providers appear on the page, such as Baidu, Quark, Aliyun, or Xunlei.

## Workflow

1. Analyze the title the user gave. Generate 2-5 search variants:
   - Original title.
   - Title without book marks or whitespace.
   - Title with Chinese connectors removed, such as `与`, `和`, `及`.
   - Common alias if visible from search results.
2. Open the search page with a browser tool:
   `https://www.rrdynb.com/plus/search.php?keyword=<encoded keyword>`
3. Wait 6-10 seconds for verification, cache delay, or DOM updates.
4. Extract result cards into this shape:

```json
{
  "name": "",
  "releaseOrPremiere": "",
  "director": "",
  "aliases": "",
  "matchReason": "",
  "resourceProviders": []
}
```

5. If the search page lacks director or release time, open each candidate detail page internally and extract:
   - `导演:`
   - `首播:` or `上映日期:`
   - `又名:`
6. Ask the user to choose among candidates. Include name, release/premiere date, director, and a short match reason.
7. After the user chooses, inspect the detail page internally and report provider availability plus the concrete download links and extraction codes detected on the page.

## Script

Run the helper script when browser automation with Playwright is available:

```bash
node scripts/search-rrdynb.mjs "旺达与幻视"
```

If Playwright is not installed:

```bash
npm install
npx playwright install chromium
```

The script outputs JSON. `resourceProviders[].links` contains provider-specific URLs and extraction codes, and `downloadLinks` gives a flattened list for easy display to the user.
