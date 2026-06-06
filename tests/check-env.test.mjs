import test from "node:test";
import assert from "node:assert/strict";

import {
  maskSecret,
  parseDotEnv,
  validateSkillEnv
} from "../scripts/check-env.mjs";

test("parseDotEnv parses quoted and unquoted values", () => {
  const parsed = parseDotEnv(`
# Movie skill config
QUARK_COOKIE="a=b; c=d"
BAIDU_COOKIE="BDUSS=abc; STOKEN=def"
OPENLIST_TOKEN='openlist-token'
QUARK_DEFAULT_SAVE_URL=https://pan.quark.cn/list#/list/all/fid-%E5%A4%87%E4%BB%BD
BAIDU_DEFAULT_SAVE_PATH=/我的资源/影视
OPENLIST_DEFAULT_COPY_DST_PATH=/影视资源备份/影视
`);

  assert.equal(parsed.QUARK_COOKIE, "a=b; c=d");
  assert.equal(parsed.BAIDU_COOKIE, "BDUSS=abc; STOKEN=def");
  assert.equal(parsed.OPENLIST_TOKEN, "openlist-token");
  assert.equal(parsed.QUARK_DEFAULT_SAVE_URL, "https://pan.quark.cn/list#/list/all/fid-%E5%A4%87%E4%BB%BD");
  assert.equal(parsed.BAIDU_DEFAULT_SAVE_PATH, "/我的资源/影视");
  assert.equal(parsed.OPENLIST_DEFAULT_COPY_DST_PATH, "/影视资源备份/影视");
});

test("validateSkillEnv reports missing required first-use configuration", () => {
  const result = validateSkillEnv({
    QUARK_COOKIE: "cookie",
    OPENLIST_TOKEN: "",
    QUARK_DEFAULT_SAVE_URL: "https://pan.quark.cn/list#/list/all/fid-%E5%A4%87%E4%BB%BD",
    OPENLIST_DEFAULT_COPY_DST_PATH: ""
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.missing.map((item) => item.key),
    ["BAIDU_COOKIE", "OPENLIST_TOKEN", "OPENLIST_BASE_URL", "BAIDU_DEFAULT_SAVE_PATH", "OPENLIST_DEFAULT_COPY_DST_PATH"]
  );
});

test("validateSkillEnv accepts complete configuration and masks secrets", () => {
  const result = validateSkillEnv({
    QUARK_COOKIE: "b-user-id=abc; __uid=uid-value",
    BAIDU_COOKIE: "BDUSS=abc; STOKEN=secret-token",
    OPENLIST_TOKEN: "openlist-da0274ca-4397-token",
    OPENLIST_BASE_URL: "http://192.168.5.22:5244/",
    QUARK_DEFAULT_SAVE_URL: "https://pan.quark.cn/list#/list/all/fid-%E5%A4%87%E4%BB%BD",
    BAIDU_DEFAULT_SAVE_PATH: "/我的资源/影视",
    OPENLIST_DEFAULT_COPY_DST_PATH: "/影视资源备份/影视"
  });

  assert.equal(result.ok, true);
  assert.equal(result.values.OPENLIST_BASE_URL.displayValue, "http://192.168.5.22:5244/");
  assert.equal(result.values.QUARK_COOKIE.secret, true);
  assert.equal(result.values.BAIDU_COOKIE.secret, true);
  assert.match(result.values.QUARK_COOKIE.displayValue, /^b-user-i/);
  assert.match(result.values.BAIDU_COOKIE.displayValue, /^BDUSS=ab/);
  assert.doesNotMatch(result.values.QUARK_COOKIE.displayValue, /uid-value/);
  assert.doesNotMatch(result.values.BAIDU_COOKIE.displayValue, /secret-token/);
});

test("validateSkillEnv validates URL and OpenList path shapes", () => {
  const result = validateSkillEnv({
    QUARK_COOKIE: "cookie",
    BAIDU_COOKIE: "BDUSS=abc; STOKEN=def",
    OPENLIST_TOKEN: "token",
    OPENLIST_BASE_URL: "not-a-url",
    QUARK_DEFAULT_SAVE_URL: "https://example.com/not-quark",
    BAIDU_DEFAULT_SAVE_PATH: "我的资源/影视",
    OPENLIST_DEFAULT_COPY_DST_PATH: "影视资源备份/影视"
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.invalid.map((item) => item.key),
    ["OPENLIST_BASE_URL", "QUARK_DEFAULT_SAVE_URL", "BAIDU_DEFAULT_SAVE_PATH", "OPENLIST_DEFAULT_COPY_DST_PATH"]
  );
});

test("maskSecret only reveals a small prefix and suffix", () => {
  assert.equal(maskSecret("1234567890abcdef"), "12345678...cdef");
  assert.equal(maskSecret("short"), "***");
});
