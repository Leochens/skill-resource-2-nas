import test from "node:test";
import assert from "node:assert/strict";

import { extractProviders, flattenDownloadLinks } from "../scripts/search-rrdynb.mjs";

test("extractProviders outputs download links and extraction codes", () => {
  const links = [
    { text: "夸克网盘", href: "https://pan.quark.cn/s/quark-id", context: "资源：夸克网盘" },
    {
      text: "迅雷云盘",
      href: "https://pan.xunlei.com/s/xunlei-id?pwd=fapv#",
      context: "资源：迅雷云盘 提取码："
    },
    {
      text: "百度网盘",
      href: "https://pan.baidu.com/s/baidu-id",
      context: "资源：百度网盘 提取码：6666"
    }
  ];
  const bodyText = [
    "资源：夸克网盘",
    "资源：迅雷云盘 提取码：",
    "资源：百度网盘 提取码：6666"
  ].join("\n");

  const providers = extractProviders(links, bodyText);
  const downloadLinks = flattenDownloadLinks(providers);

  assert.deepEqual(
    downloadLinks.map((link) => ({
      provider: link.provider,
      label: link.label,
      url: link.url,
      extractionCode: link.extractionCode
    })),
    [
      {
        provider: "夸克网盘",
        label: "夸克网盘",
        url: "https://pan.quark.cn/s/quark-id",
        extractionCode: null
      },
      {
        provider: "百度网盘",
        label: "百度网盘",
        url: "https://pan.baidu.com/s/baidu-id",
        extractionCode: "6666"
      },
      {
        provider: "迅雷云盘",
        label: "迅雷云盘",
        url: "https://pan.xunlei.com/s/xunlei-id?pwd=fapv#",
        extractionCode: "fapv"
      }
    ]
  );
  assert.deepEqual(providers.find((provider) => provider.provider === "百度网盘").extractionCodes, ["6666"]);
});

test("extractProviders assigns provider-level extraction code to the only matching link", () => {
  const providers = extractProviders(
    [{ text: "百度网盘", href: "https://pan.baidu.com/s/baidu-id", context: "百度网盘" }],
    "资源：百度网盘 提取码：8888"
  );

  const downloadLinks = flattenDownloadLinks(providers);

  assert.deepEqual(downloadLinks, [
    {
      provider: "百度网盘",
      label: "百度网盘",
      url: "https://pan.baidu.com/s/baidu-id",
      extractionCode: "8888",
      extractionCodes: ["8888"]
    }
  ]);
});

test("extractProviders ignores internal recommendation links that only mention provider names", () => {
  const providers = extractProviders(
    [
      {
        text: "《示例影片》百度云网盘夸克下载.阿里云盘.中字.(2026)",
        href: "https://www.rrdynb.com/movie/2026/0001/1.html",
        context: "《示例影片》百度云网盘夸克下载.阿里云盘.中字.(2026)"
      },
      {
        text: "夸克网盘",
        href: "https://pan.quark.cn/s/resource-id",
        context: "资源：夸克网盘"
      }
    ],
    "资源：夸克网盘"
  );

  assert.deepEqual(flattenDownloadLinks(providers), [
    {
      provider: "夸克网盘",
      label: "夸克网盘",
      url: "https://pan.quark.cn/s/resource-id",
      extractionCode: null,
      extractionCodes: []
    }
  ]);
});
