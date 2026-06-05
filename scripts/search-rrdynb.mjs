#!/usr/bin/env node

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROVIDERS = [
  { name: "阿里网盘", patterns: [/aliyundrive\.com/i, /alipan\.com/i, /阿里网盘|阿里云盘/] },
  { name: "夸克网盘", patterns: [/pan\.quark\.cn/i, /夸克网盘|夸克下载/] },
  { name: "百度网盘", patterns: [/pan\.baidu\.com/i, /百度网盘|百度云盘/] },
  { name: "迅雷云盘", patterns: [/pan\.xunlei\.com/i, /迅雷云盘|迅雷网盘/] },
  { name: "ED2K", patterns: [/^ed2k:/i, /ed2k/i] },
  { name: "磁力链接", patterns: [/^magnet:/i, /磁力/i] }
];

const DEFAULT_WAIT_MS = 8000;
const MAX_DEFAULT_CANDIDATES = 5;

if (isCliEntryPoint()) {
  main().catch((error) => {
    const message = error && error.message ? error.message : String(error);
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
    process.exit(1);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.title) {
    printUsage();
    process.exit(2);
  }

  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
  });

  try {
    const searchAttempts = [];
    let selectedSearch = null;

    for (const query of generateSearchQueries(args.title)) {
      const result = await searchOnce(page, query, args.waitMs, args.maxCandidates);
      searchAttempts.push(result);
      if (result.candidates.length > 0) {
        selectedSearch = result;
        break;
      }
    }

    const candidates = [];
    if (selectedSearch) {
      for (const candidate of selectedSearch.candidates) {
        const detail = await extractDetail(page, candidate.internalDetailUrl, args.waitMs);
        candidates.push({
          rank: candidate.rank,
          name: detail.name || candidate.name,
          releaseOrPremiere: detail.releaseOrPremiere || candidate.searchDate || "页面未标注",
          director: detail.director || "页面未标注",
          aliases: detail.aliases || "",
          matchReason: buildMatchReason(args.title, detail, candidate),
          resourceProviders: detail.resourceProviders,
          downloadLinks: flattenDownloadLinks(detail.resourceProviders)
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          inputTitle: args.title,
          selectedQuery: selectedSearch ? selectedSearch.query : null,
          searchAttempts: searchAttempts.map((attempt) => ({
            query: attempt.query,
            recordCount: attempt.recordCount,
            searchUrl: attempt.searchUrl,
            candidateCount: attempt.candidates.length
          })),
          candidates,
          output: {
            directResourceLinks: "included_when_detected",
            extractionCodes: "included_when_detected"
          }
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

function parseArgs(argv) {
  const parsed = {
    title: "",
    waitMs: DEFAULT_WAIT_MS,
    maxCandidates: MAX_DEFAULT_CANDIDATES
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--wait-ms") {
      parsed.waitMs = Number(argv[++index] || DEFAULT_WAIT_MS);
    } else if (arg === "--max-candidates") {
      parsed.maxCandidates = Number(argv[++index] || MAX_DEFAULT_CANDIDATES);
    } else if (!parsed.title) {
      parsed.title = arg;
    }
  }

  return parsed;
}

function printUsage() {
  console.error("Usage: node scripts/search-rrdynb.mjs <title> [--max-candidates 5] [--wait-ms 8000]");
  console.error("Install dependencies with: npm install && npx playwright install chromium");
}

function loadPlaywright() {
  const localRequire = createRequire(import.meta.url);
  try {
    return localRequire("playwright");
  } catch (localError) {
    const moduleDir = process.env.PLAYWRIGHT_NODE_MODULE_DIR;
    if (moduleDir) {
      const requireFromModuleDir = createRequire(pathToFileURL(path.join(moduleDir, "noop.js")));
      try {
        return requireFromModuleDir("playwright");
      } catch (envError) {
        throw new Error(
          `Playwright not found in PLAYWRIGHT_NODE_MODULE_DIR. Run npm install, or set PLAYWRIGHT_NODE_MODULE_DIR to a node_modules directory containing playwright. Details: ${envError.message}`
        );
      }
    }

    throw new Error(
      `Playwright is required. Run npm install && npx playwright install chromium. Details: ${localError.message}`
    );
  }
}

function generateSearchQueries(input) {
  const stripped = stripBookMarks(input).trim();
  const variants = [
    stripped,
    stripped.replace(/[\s·:：,，.。!！?？_\-\/]+/g, ""),
    stripped.replace(/[与和及&+]/g, ""),
    stripped.replace(/[\s·:：,，.。!！?？_\-\/与和及&+]+/g, "")
  ];

  return Array.from(new Set(variants.filter(Boolean)));
}

function stripBookMarks(value) {
  return value.replace(/^[《「『“"]+|[》」』”"]+$/g, "");
}

async function searchOnce(page, query, waitMs, maxCandidates) {
  const searchUrl = `https://www.rrdynb.com/plus/search.php?keyword=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(waitMs);

  const bodyText = await page.locator("body").innerText({ timeout: 10000 });
  const recordCount = extractRecordCount(bodyText);
  const anchors = await page.locator("a").evaluateAll((nodes) =>
    nodes
      .map((node) => ({
        text: (node.innerText || node.textContent || "").trim(),
        href: node.href
      }))
      .filter((node) => node.text && node.text.includes("《") && /rrdynb\.com\/(movie|dianshiju|dongman|zongyi)\//.test(node.href))
  );

  const limit = recordCount > 0 ? Math.min(recordCount, maxCandidates) : 0;
  const unique = dedupeByHref(anchors).slice(0, limit);
  const candidates = unique.map((item, index) => ({
    rank: index + 1,
    name: extractName(item.text),
    heading: item.text,
    searchDate: extractYearFromHeading(item.text),
    internalDetailUrl: item.href
  }));

  return { query, searchUrl, recordCount, candidates };
}

async function extractDetail(page, url, waitMs) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(Math.min(waitMs, 4000));

  const bodyText = await page.locator("body").innerText({ timeout: 10000 });
  const heading = pick(bodyText, /(《[^\n]+》[^\n]*)/);
  const detailLinkLocator = (await page.locator(".movie-des a").count()) > 0 ? page.locator(".movie-des a") : page.locator("a");
  const links = await detailLinkLocator.evaluateAll((nodes) =>
    nodes.map((node) => {
      const textFromNode = (target) => (target.innerText || target.textContent || "").trim().replace(/\s+/g, " ");
      const lineAroundAnchor = (anchor) => {
        const parent = anchor.parentElement;
        if (!parent) return textFromNode(anchor);

        const parts = [];
        for (let current = anchor.previousSibling; current; current = current.previousSibling) {
          if (current.nodeName === "BR") break;
          parts.unshift(textFromNode(current));
        }
        parts.push(textFromNode(anchor));
        for (let current = anchor.nextSibling; current; current = current.nextSibling) {
          if (current.nodeName === "BR") break;
          parts.push(textFromNode(current));
        }

        return parts.filter(Boolean).join(" ").trim().replace(/\s+/g, " ");
      };

      let context = lineAroundAnchor(node) || textFromNode(node);
      let current = node.parentElement;
      for (let depth = 0; current && depth < 4 && !/提取|密码|口令|资源/.test(context); depth += 1) {
        const parentLine = lineAroundAnchor(current) || textFromNode(current);
        if (parentLine && /资源|提取|密码|口令|网盘|云盘/.test(parentLine)) {
          context = parentLine;
          break;
        }
        current = current.parentElement;
      }

      return {
        text: (node.innerText || node.textContent || "").trim(),
        href: node.href,
        context
      };
    })
  );

  return {
    name: extractName(heading),
    heading,
    director: pick(bodyText, /导演:\s*([^\n]+)/),
    releaseOrPremiere:
      pick(bodyText, /(?:首播|上映日期):\s*([^\n]+)/) || extractYearFromHeading(heading) || pick(bodyText, /发布：([^\n]+)/),
    aliases: pick(bodyText, /又名:\s*([^\n]+)/),
    resourceProviders: extractProviders(links, bodyText)
  };
}

function extractProviders(links, bodyText) {
  const providers = new Map();
  for (const provider of PROVIDERS) {
    const matchingLinks = dedupeByHref(
      links
        .map(normalizeLink)
        .filter((link) => isDirectProviderLink(provider, link))
    );
    const mentionedInText = provider.patterns.some((pattern) => pattern.test(bodyText));
    if (matchingLinks.length > 0 || mentionedInText) {
      const extractionCodes = dedupeStrings([
        ...matchingLinks.map((link) => buildResourceLink(provider.name, link)).flatMap((link) => link.extractionCodes),
        ...extractProviderCodesFromText(provider, bodyText)
      ]);
      const resourceLinks = matchingLinks.map((link) =>
        attachProviderCodesIfNeeded(buildResourceLink(provider.name, link), matchingLinks.length, extractionCodes)
      );

      providers.set(provider.name, {
        provider: provider.name,
        available: true,
        links: resourceLinks,
        extractionCodes,
        linkHidden: false,
        hasExtractionCode: extractionCodes.length > 0,
        note: matchingLinks.length > 0 ? "检测到可点击入口，已输出具体链接" : "页面文字提及，未检测到可点击入口"
      });
    }
  }

  return Array.from(providers.values());
}

function attachProviderCodesIfNeeded(link, providerLinkCount, providerExtractionCodes) {
  if (link.extractionCodes.length > 0 || providerLinkCount !== 1 || providerExtractionCodes.length === 0) {
    return link;
  }

  return {
    ...link,
    extractionCode: providerExtractionCodes[0],
    extractionCodes: providerExtractionCodes
  };
}

function isDirectProviderLink(provider, link) {
  const hrefMatches = provider.patterns.some((pattern) => pattern.test(link.href));
  if (!hrefMatches) return false;
  if (/^(magnet|ed2k):/i.test(link.href)) return true;
  return hasResourceContext(link) || isProviderLabel(provider.name, link.text);
}

function hasResourceContext(link) {
  return /资源|提取码|提取密码|访问码|访问密码|密码|口令/.test(link.context);
}

function isProviderLabel(providerName, text) {
  const aliases = {
    阿里网盘: ["阿里网盘", "阿里云盘"],
    夸克网盘: ["夸克网盘", "夸克下载"],
    百度网盘: ["百度网盘", "百度云盘"],
    迅雷云盘: ["迅雷云盘", "迅雷网盘"],
    ED2K: ["ED2K", "电驴"],
    磁力链接: ["磁力链接", "磁力"]
  };
  return (aliases[providerName] || [providerName]).some((alias) => text === alias);
}

function flattenDownloadLinks(resourceProviders) {
  return resourceProviders.flatMap((provider) =>
    provider.links.map((link) => ({
      provider: provider.provider,
      label: link.label,
      url: link.url,
      extractionCode: link.extractionCode,
      extractionCodes: link.extractionCodes
    }))
  );
}

function buildResourceLink(providerName, link) {
  const url = decodeHtmlEntities(link.href);
  const context = [url, link.text, link.context].filter(Boolean).join("\n");
  const extractionCodes = dedupeStrings([...extractCodesFromUrl(url), ...extractCodesFromText(context)]);

  return {
    label: link.text || providerName,
    url,
    extractionCode: extractionCodes[0] || null,
    extractionCodes
  };
}

function normalizeLink(link) {
  return {
    text: normalizeWhitespace(link.text || ""),
    href: decodeHtmlEntities(link.href || ""),
    context: normalizeWhitespace(link.context || "")
  };
}

function extractProviderCodesFromText(provider, bodyText) {
  const lines = bodyText.split("\n").map((line) => normalizeWhitespace(line));
  const codes = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isProviderLine = provider.patterns.some((pattern) => pattern.test(line));
    if (!isProviderLine) continue;

    codes.push(...extractCodesFromText(line));
    const nextLine = lines[index + 1] || "";
    if (/提取码|提取密码|访问码|访问密码|密码|口令/i.test(line)) {
      codes.push(...extractCodesFromText(nextLine));
    }
  }

  return dedupeStrings(codes);
}

function extractCodesFromUrl(url) {
  try {
    const parsed = new URL(url);
    return ["pwd", "password", "passcode", "extract_code", "extraction_code"]
      .map((name) => parsed.searchParams.get(name))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractCodesFromText(text) {
  const codes = [];
  const regex = /(?:提取码|提取密码|访问码|访问密码|密码|口令)\s*[:：]?\s*([A-Za-z0-9]{1,20})/gi;
  let match = regex.exec(text);
  while (match) {
    codes.push(match[1]);
    match = regex.exec(text);
  }
  return codes;
}

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function dedupeStrings(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function buildMatchReason(inputTitle, detail, candidate) {
  const aliases = detail.aliases || "";
  const name = detail.name || candidate.name || "";
  if (normalizeTitle(name) === normalizeTitle(inputTitle)) {
    return "名称直接匹配";
  }
  if (aliases && normalizeTitle(aliases).includes(normalizeTitle(inputTitle))) {
    return "别名包含用户输入标题";
  }
  if (normalizeTitle(name).includes(normalizeTitle(inputTitle)) || normalizeTitle(inputTitle).includes(normalizeTitle(name))) {
    return "名称高度相似";
  }
  return "搜索结果相关";
}

function normalizeTitle(value) {
  return stripBookMarks(value).replace(/[\s·:：,，.。!！?？_\-\/与和及&+]+/g, "").toLowerCase();
}

function extractRecordCount(bodyText) {
  const match = bodyText.match(/共\d+页\/(\d+)条记录/);
  return match ? Number(match[1]) : 0;
}

function extractName(text) {
  return pick(text || "", /《([^》]+)》/);
}

function extractYearFromHeading(text) {
  return pick(text || "", /[（(]([12]\\d{3})[）)]/);
}

function pick(text, regex) {
  const match = (text || "").match(regex);
  return match ? match[1].trim().replace(/\s+/g, " ") : "";
}

function dedupeByHref(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    result.push(item);
  }
  return result;
}

function isCliEntryPoint() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export { extractProviders, flattenDownloadLinks };
