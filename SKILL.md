---
name: movie-search-and-download
description: Use when a user asks to search for a movie, TV title, animation, or other media resource through PanSou, then report structured title/resource notes plus concrete cloud-disk links, extraction codes, and optional link-check status.
---

# Movie Search and Resource Links

Use this skill when the user asks to search for a movie/TV/media title or asks for download/resource links. The default upstream is the PanSou instance at `https://so.252035.xyz/`, backed by the `fish2018/pansou` API.

## Default Endpoint

- Site: `https://so.252035.xyz/`
- API base: `https://so.252035.xyz/api`
- Health/config: `GET /api/health`
- Search: `GET /api/search` or `POST /api/search`
- Link check: `POST /api/check/links`
- Auth endpoints, only if `health.auth_enabled` is true:
  - `POST /api/auth/login`
  - `POST /api/auth/verify`
  - `POST /api/auth/logout`

## Search Parameters

For ordinary user searches, use:

```bash
node scripts/search-rrdynb.mjs "蜘蛛侠"
```

Default behavior: return only the top 20 PanSou-ranked results. Do not show hundreds of raw upstream matches to the user unless they explicitly ask for a larger export.

The helper calls `GET /api/search` with these parameters:

| Parameter | GET type | POST type | Required | Meaning |
| --- | --- | --- | --- | --- |
| `kw` | string | string | yes | Search keyword/title. |
| `channels` | comma string | string[] | no | Telegram channels to search. Omit for server defaults. |
| `plugins` | comma string | string[] | no | Plugin names to search. Omit for all enabled plugins. |
| `conc` | number | number | no | Search concurrency. Omit for server auto setting. |
| `refresh` | `"true"` | boolean | no | Force refresh and bypass cache. |
| `res` | string | string | no | `merge` default, `all`, or `results`. |
| `src` | string | string | no | `all` default, `tg`, or `plugin`. |
| `cloud_types` | comma string | string[] | no | Limit returned disk types. |
| `ext` | JSON string | object | no | Plugin extension parameters, e.g. `{"title_en":"Spider-Man","is_all":true}`. |
| `filter` | JSON string | object | no | Include/exclude filter, e.g. `{"include":["4K"],"exclude":["预告"]}`. |

Supported `cloud_types`: `baidu`, `aliyun`, `quark`, `guangya`, `tianyi`, `uc`, `mobile`, `115`, `pikpak`, `xunlei`, `123`, `magnet`, `ed2k`, `others`.

When `cloud_types` is requested, the helper also filters normalized `results[]` locally, because the public instance may still include other disk types inside ranked result messages.

Useful helper options:

```bash
node scripts/search-rrdynb.mjs "蜘蛛侠" \
  --cloud-types quark,baidu,aliyun,xunlei,magnet,ed2k \
  --res all \
  --src all \
  --max-candidates 20
```

- `--channels tgsearchers4,Aliyun_4K_Movies`
- `--plugins wanou,zhizhen`
- `--include 4K,合集`
- `--exclude 预告,花絮`
- `--refresh`
- `--ext-json '{"title_en":"Spider-Man"}'`
- `--filter-json '{"include":["4K"],"exclude":["预告"]}'`
- `--api-base https://so.252035.xyz/api`

## Search Response

PanSou may return either direct data or a wrapper:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 15,
    "results": [],
    "merged_by_type": {}
  }
}
```

Prefer `data.merged_by_type` for user-facing output because it is already grouped by disk type. Each merged link has:

- `url`: cloud disk, magnet, or ed2k link.
- `password`: extraction code/password.
- `note`: resource note/title.
- `datetime`: resource update time.
- `source`: `tg:<channel>`, `plugin:<name>`, or `unknown`.
- `images`: optional images from Telegram messages.

The helper normalizes this into:

- `candidates[]`: ranked resource rows, each with one `downloadLinks[]` entry.
- `downloadLinks[]`: flat list containing `provider`, `diskType`, `url`, `extractionCode`, `note`, `datetime`, and `source`.
- `availableTotal`: upstream total count, for reference only.
- `returnedCount` / `total`: number of results actually returned to the user, capped by `--max-candidates` and defaulting to 20.
- `providerCounts`: counts by disk type among returned results only.

## Link Check Parameters

Use link checks only when the user asks to verify whether returned links are alive, or when checking results would materially improve the answer:

```bash
node scripts/search-rrdynb.mjs "蜘蛛侠" --check-links --max-candidates 5
```

`POST /api/check/links` body:

| Parameter | Type | Required | Meaning |
| --- | --- | --- | --- |
| `items` | object[] | yes | Links to check. |
| `items[].disk_type` | string | yes | Disk type. |
| `items[].url` | string | yes | Full share URL. |
| `items[].password` | string | no | Extraction code if not already in URL. |
| `view_token` | string | no | View/batch token for frontend-style checks. |
| `proxy_url` | string | no | Per-request proxy. Supports `http://`, `https://`, `socks5://`, `socks5h://`. |
| `proxy` | string | no | Alias for `proxy_url`; `proxy_url` wins if both exist. |

Checkable disk types: `baidu`, `aliyun`, `quark`, `tianyi`, `uc`, `mobile`, `115`, `xunlei`, `123`. Magnet and ed2k are search results, but not link-check targets.

The PanSou project documents `/api/check/links`, and the frontend API panel also references it. If the public `https://so.252035.xyz/api/check/links` instance returns `404`, keep the search results and report that link checking is unavailable on the current public instance instead of treating the whole search as failed.

Check states:

- `ok`: link valid.
- `bad`: link invalid.
- `locked`: extraction code required or wrong.
- `unsupported`: platform not supported by checker.
- `uncertain`: check failed or result uncertain.

## Workflow

1. Search the exact user keyword first.
2. If results are thin or off-target, try 1-3 variants: remove book marks, remove spaces/punctuation, include original English title if the user gave one.
3. Default to `res=all` and `src=all` so the helper can rank by PanSou `results[]` order; use `cloud_types`, `plugins`, `channels`, `include`, or `exclude` only when the user asks or the result set needs narrowing.
4. Report the best ranked candidates with note/title, provider, source, URL, extraction code, and update time when present.
5. If the user asks whether links are valid, rerun with `--check-links` or call `/api/check/links` on the visible links and include each state/summary.
6. If `/api/health` reports `auth_enabled: true`, authenticate first or ask the user for credentials/token.
