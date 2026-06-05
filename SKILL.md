---
name: movie-search-and-download
description: Use when a user asks to search for a movie, TV title, animation, or other media resource through PanSou, then report structured title/resource notes plus concrete cloud-disk links, extraction codes, and optional link-check status.
---

# Movie Search and Resource Links

Use this skill when the user asks to search for a movie/TV/media title or asks for download/resource links. The default upstream is the PanSou instance at `https://so.252035.xyz/`, backed by the `fish2018/pansou` API.

Use `scripts/quark-save.mjs` when the user wants to save a Quark share link into their own Quark cloud drive folder. This workflow transfers the resource into the user's cloud drive only; it does not download files to the local filesystem.

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

Default behavior: return a Markdown table with only the top 20 PanSou-ranked results. Do not show hundreds of raw upstream matches to the user unless they explicitly ask for a larger export. For programmatic JSON output, use `--format json` or `--json`.

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
- `--format markdown|json`

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

## User-Facing Table

When answering a search request, output a Markdown table sorted by PanSou relevance. Include clickable links directly in the table so the user can open and download without digging through JSON.

Use these columns:

| # | 资源 | 网盘 | 链接 | 提取码 | 来源 | 时间 |
|---:|---|---|---|---|---|---|
| 1 | 示例资源 | 夸克网盘 | [打开](https://pan.quark.cn/s/example) | - | plugin:example | 2026-01-01 |

Rules:

- The table is the primary answer. Do not provide only a summary when links are available.
- Use `[打开](url)` for the link cell.
- Use `-` when extraction code, source, or datetime is absent.
- Keep the table to the returned top 20 by default.
- Put a short line above the table: `按 PanSou 相关度排序，返回前 N 条。上游可用结果约 M 条。`

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

## Quark Cloud Save

When the user provides a Quark share URL and a destination Quark folder URL, first preview the share contents:

```bash
node scripts/quark-save.mjs \
  "https://pan.quark.cn/s/bcbd9d24fe5a#/list/share" \
  "https://pan.quark.cn/list#/list/all/e38b48835b404f8092b2a7e5cc054b0d-%E6%9D%A5%E8%87%AA%EF%BC%9A%E5%88%86%E4%BA%AB" \
  --dry-run
```

The preview reads the public share only and does not need a Cookie. Actual saving requires the user's Quark Cookie through an environment variable:

```bash
QUARK_COOKIE='...' node scripts/quark-save.mjs \
  "https://pan.quark.cn/s/bcbd9d24fe5a#/list/share" \
  "https://pan.quark.cn/list#/list/all/e38b48835b404f8092b2a7e5cc054b0d-%E6%9D%A5%E8%87%AA%EF%BC%9A%E5%88%86%E4%BA%AB" \
  --context-name "你的友好邻居蜘蛛侠 第一季" \
  --resource-type series
```

Security rules:

- Treat `QUARK_COOKIE` as a full login credential. Never print it, commit it, or put it in docs.
- Prefer `--cookie-env QUARK_COOKIE`; if the user uses another env var, pass that name with `--cookie-env`.
- Keep the default interactive confirmation. Use `--yes` only when the user explicitly asked for non-interactive execution or has already confirmed the selected rows.

Agent responsibility before saving:

- The Agent must inspect the dry-run table plus the conversation/search context and decide the canonical resource name. Do not rely only on obfuscated share titles.
- If the resource is a series, tell the user it is a series and pass `--resource-type series`.
- If the share title contains separators or evasive characters, correct the resource name from context and pass it with `--context-name`.
- For non-trivial naming, pass an explicit Agent decision plan with `--rename-plan-json`. The script applies this plan after Quark returns the saved top-level fids.

Example Agent rename plan:

```bash
node scripts/quark-save.mjs "$SHARE_URL" "$DEST_URL" \
  --context-name "你的友好邻居蜘蛛侠 第一季" \
  --resource-type series \
  --rename-plan-json '[{"rank":1,"name":"你的友好邻居蜘蛛侠 第一季","reason":"Agent 根据搜索上下文修正规避字符和季名"}]'
```

Useful options:

- `--select all|1,3|2-5`: choose which rows to save.
- `--yes`: skip the confirmation prompt and save the selected rows immediately.
- `--dry-run`: preview only; no Cookie needed and no save happens.
- `--no-rename`: save without post-save rename.
- `--resource-type auto|series|movie|collection`: pass the Agent's resource classification.
- `--rename-plan-json '[{"rank":1,"name":"...","reason":"..."}]'`: pass Agent-decided final names. `rank` refers to the row number in the preview table.

Quark API flow used by the helper:

- `POST /1/clouddrive/share/sharepage/token`: obtain `stoken` for the share URL.
- `GET /1/clouddrive/share/sharepage/detail`: list share rows for user confirmation.
- `POST /1/clouddrive/share/sharepage/save`: save selected `fid_list` + `fid_token_list` to `to_pdir_fid`.
- `GET /1/clouddrive/task`: poll the async save task until completion.
- `POST /1/clouddrive/file/rename`: apply the Agent-approved rename plan to saved top-level files/folders.

## Workflow

1. Search the exact user keyword first.
2. If results are thin or off-target, try 1-3 variants: remove book marks, remove spaces/punctuation, include original English title if the user gave one.
3. Default to `res=all` and `src=all` so the helper can rank by PanSou `results[]` order; use `cloud_types`, `plugins`, `channels`, `include`, or `exclude` only when the user asks or the result set needs narrowing.
4. Report the best ranked candidates with note/title, provider, source, URL, extraction code, and update time when present.
5. If the user asks whether links are valid, rerun with `--check-links` or call `/api/check/links` on the visible links and include each state/summary.
6. If `/api/health` reports `auth_enabled: true`, authenticate first or ask the user for credentials/token.
7. If the user asks to save a Quark result into their own drive, run `scripts/quark-save.mjs --dry-run`, tell the user what resource rows were found and whether the Agent judges it to be a series, then save only after confirmation/Cookie availability. Pass the Agent's canonical name and resource type to the script.
