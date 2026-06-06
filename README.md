# Movie Search and Download Skill

Codex skill for searching movie and TV resources through PanSou, returning ranked cloud-disk links, and helping users save Quark or Baidu share links into their own cloud drives. It also documents an OpenList/NAS copy flow for backing saved resources up to mounted storage.

## Features

- Search PanSou and return the top ranked resource links as Markdown or JSON.
- Preserve concrete download links, extraction codes, provider names, source notes, and timestamps.
- Preview Quark and Baidu share contents before saving.
- Save Quark shares to a configured Quark folder.
- Save Baidu shares to a configured Baidu path or Baidu folder URL.
- Let the Agent classify resources as movie, series, or collection before saving.
- Verify saved resources through OpenList and copy them to an SMB/NAS-backed OpenList path.

## Requirements

- Node.js 20 or newer.
- A configured `.env` file for operations that need account or OpenList access.
- PanSou API access through the default public endpoint or a custom endpoint.

Search-only usage does not require cookies or OpenList credentials.

## Setup

Copy the example environment file and fill in real values:

```bash
cp .env.example .env
npm run check-env
```

Configuration guide:

https://guantou.site/archives/N2CmhISt

Never commit `.env`. It contains full account credentials.

## Configuration

| Key | Purpose |
| --- | --- |
| `QUARK_COOKIE` | Quark web Cookie used to save Quark share links. |
| `BAIDU_COOKIE` | Baidu Netdisk web Cookie used to save Baidu share links. |
| `OPENLIST_TOKEN` | Fixed OpenList API token for list, get, copy, and task APIs. |
| `OPENLIST_BASE_URL` | OpenList base URL, for example `http://127.0.0.1:5244`. |
| `QUARK_DEFAULT_SAVE_URL` | Default Quark destination folder URL. |
| `BAIDU_DEFAULT_SAVE_PATH` | Default Baidu destination path or folder URL. |
| `OPENLIST_DEFAULT_COPY_DST_PATH` | Default OpenList path backed by SMB/NAS storage. |

## Usage

Search resources:

```bash
npm run search -- "蜘蛛侠"
```

Preview a Quark share:

```bash
npm run quark-save -- "$QUARK_SHARE_URL" "$QUARK_DEFAULT_SAVE_URL" --dry-run
```

Preview a Baidu share:

```bash
npm run baidu-save -- "$BAIDU_SHARE_URL" "$BAIDU_DEFAULT_SAVE_PATH" --dry-run
```

Save after review:

```bash
npm run baidu-save -- "$BAIDU_SHARE_URL" "$BAIDU_DEFAULT_SAVE_PATH" \
  --context-name "资源名" \
  --resource-type collection \
  --yes
```

Run tests:

```bash
npm test
```

## Safety Notes

- Treat cookies and OpenList tokens as full credentials.
- Print only masked secrets.
- Do not place real cookies, tokens, private links, or private OpenList paths in commits.
- When a save target is unclear, run the relevant script with `--dry-run` first.
- For NAS backups, use OpenList paths, not local OS paths.

## Repository Layout

```text
agents/              Agent metadata
scripts/             CLI helpers for search, env checks, Quark save, and Baidu save
tests/               Node test suite
SKILL.md             Main skill instructions
.env.example         Safe configuration template
```

## Open Source Status

This repository does not currently include a license file. Choose and add a license before publishing as an open-source project. This is practical engineering guidance, not legal advice.
