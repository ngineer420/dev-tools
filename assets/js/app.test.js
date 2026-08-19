// Pure-helper tests for app.js. Run with: node assets/js/app.test.js
// No framework/deps — uses Node's built-in test runner + assert.
//
// The hash and HMAC tests use Node's WebCrypto, which is the same API surface
// the browser code calls, so `crypto.subtle` is exercised for real rather than
// stubbed. Every expected digest below is a published known-answer value.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatJson,
  minifyJson,
  base64Encode,
  base64Decode,
  urlEncode,
  urlDecode,
  detectEpochUnit,
  bytesToUuid,
  uuidV4,
  uuidV7,
  generateUuids,
  utf8Bytes,
  md5,
  md5Bytes,
  toHex,
  subtleDigestHex,
  hashText,
  hashBytes,
  hmacHex,
  compareHashes,
  SHA_ALGORITHMS,
  base64UrlDecode,
  decodeJwt,
  csvToJson,
  jsonToCsv,
  htmlEntityEncode,
  htmlEntityDecode,
  parseCronField,
  parseCron,
  describeCron,
  cronDayMatches,
  nextCronRuns,
  cronFormatList,
  formatCronRun,
  cronTimeZoneList,
  CSS_NAMED_COLORS,
  parseColor,
  parseHexColor,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToHsv,
  hsvToRgb,
  rgbToNamedColor,
  formatHex,
  formatRgb,
  formatHsl,
  formatHsv,
  relativeLuminance,
  contrastRatio,
  flattenOver,
  roundRatio,
  wcagResults,
  rgbToOklch,
  oklchToRgb,
  nudgeLightnessToPass,
  parseInBase,
  formatInBase,
  toTwosComplement,
  fromTwosComplement,
  fitsInWidth,
  signedRange,
  unsignedRange,
  groupDigits,
  padToWidth,
  convertNumberBases,
  textToBytes,
  bytesToText,
  bytesFromDigits,
  textToBinary,
  binaryToText,
  textToHex,
  hexToText,
  baseDigitRange,
} = require("./app.js");

/* ------------------------------- existing tools --------------------------- */

test("JSON formatter round-trips", () => {
  const pretty = formatJson('{"a":1}', 2);
  assert.equal(pretty.ok, true);
  assert.equal(minifyJson(pretty.value).value, '{"a":1}');
});

test("base64 and URL helpers", () => {
  // Encoders return a plain string; decoders can fail, so they return {ok, value}.
  assert.equal(base64Encode("abc"), "YWJj");
  assert.equal(base64Decode("YWJj").value, "abc");
  assert.equal(urlEncode("a b&c"), "a%20b%26c");
  assert.equal(urlDecode("a%20b").value, "a b");
});

test("detectEpochUnit tells seconds from milliseconds", () => {
  assert.equal(detectEpochUnit("1700000000"), "seconds");
  assert.equal(detectEpochUnit("1700000000000"), "milliseconds");
});

/* ----------------------------------- UUID --------------------------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("uuidV4 has the right shape, version and variant", () => {
  for (let i = 0; i < 50; i++) {
    const id = uuidV4();
    assert.match(id, UUID_RE);
    assert.equal(id[14], "4", "version nibble");
    assert.ok("89ab".includes(id[19]), "variant nibble, got " + id[19]);
  }
});

test("uuidV7 has the right shape, version and variant", () => {
  for (let i = 0; i < 50; i++) {
    const id = uuidV7();
    assert.match(id, UUID_RE);
    assert.equal(id[14], "7", "version nibble");
    assert.ok("89ab".includes(id[19]), "variant nibble, got " + id[19]);
  }
});

test("uuidV7 encodes the current time in the leading 48 bits", () => {
  const before = Date.now();
  const id = uuidV7();
  const after = Date.now();
  // First 12 hex characters are unix_ts_ms, big-endian.
  const ts = parseInt(id.replace(/-/g, "").slice(0, 12), 16);
  assert.ok(ts >= before - 2 && ts <= after + 2, `timestamp ${ts} outside [${before}, ${after}]`);
});

test("uuidV7 values sort in creation order across milliseconds", async () => {
  const ids = [];
  for (let i = 0; i < 5; i++) {
    ids.push(uuidV7());
    await new Promise((r) => setTimeout(r, 2));
  }
  assert.deepEqual(ids.slice().sort(), ids, "lexicographic order matches creation order");
});

test("uuidV7 stays ordered within a single millisecond", () => {
  // A bulk generation lands entirely inside one millisecond. Without the
  // rand_a counter these would come back in random order, which is exactly
  // the property v7 is chosen for.
  const ids = generateUuids(1000, "v7");
  assert.equal(ids.length, 1000);
  assert.deepEqual(ids.slice().sort(), ids, "bulk v7 output is already sorted");
  assert.equal(new Set(ids).size, 1000, "no duplicates");
  ids.forEach((id) => assert.equal(id[14], "7"));
});

test("uuidV7 counter overflow rolls into the next millisecond without repeating", () => {
  // More ids than the 12-bit counter can hold, forcing the overflow branch.
  const ids = generateUuids(1000, "v7").concat(generateUuids(1000, "v7"), generateUuids(1000, "v7"));
  assert.equal(new Set(ids).size, ids.length, "still unique across the overflow");
  assert.deepEqual(ids.slice().sort(), ids, "still ordered across the overflow");
});

test("generateUuids honours count, clamping and version", () => {
  assert.equal(generateUuids(10, "v4").length, 10);
  assert.equal(generateUuids(0, "v4").length, 1);
  assert.equal(generateUuids(99999, "v4").length, 1000);
  assert.equal(generateUuids(1, "v7")[0][14], "7");
  assert.equal(generateUuids(1, "v4")[0][14], "4");
  assert.equal(generateUuids(1, "v1")[0][14], "1");
  assert.equal(generateUuids(1, "nonsense")[0][14], "4", "unknown version falls back to v4");
  assert.equal(new Set(generateUuids(200, "v4")).size, 200, "no duplicates");
});

test("bytesToUuid formats the canonical 8-4-4-4-12 grouping", () => {
  const bytes = new Uint8Array([0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255]);
  assert.equal(bytesToUuid(bytes), "00112233-4455-6677-8899-aabbccddeeff");
});

/* ----------------------------------- hashes -------------------------------- */

// Known-answer values from RFC 1321 (MD5) and FIPS 180-4 / NIST (SHA family).
test("MD5 matches published test vectors", () => {
  assert.equal(md5(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5("a"), "0cc175b9c0f1b6a831c399e269772661");
  assert.equal(md5("abc"), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(md5("message digest"), "f96b697d7cb7938d525a2f31aaf161d0");
  assert.equal(md5("abcdefghijklmnopqrstuvwxyz"), "c3fcd3d76192e4007dfb496cca67e13b");
  assert.equal(
    md5("12345678901234567890123456789012345678901234567890123456789012345678901234567890"),
    "57edf4a22be3c955ac49da2e2107b67a"
  );
});

test("MD5 handles multi-byte UTF-8", () => {
  // Expected values cross-checked against node:crypto. "é" is two UTF-8 bytes
  // and "你好" is six, so an implementation that hashes charCodes rather than
  // encoded bytes gets all of these wrong.
  assert.equal(md5("é"), "66ddcd97cfdeabb2f6fb8a999b4bc76f");
  assert.equal(md5("你好"), "7eca689f0d3389d9dea66ae112e5cfd7");
  assert.equal(md5("naïve café"), "8feed1b062e175e77b3769d990f9e527");
});

test("md5Bytes hashes raw bytes independently of text decoding", () => {
  assert.equal(md5Bytes(new Uint8Array([97, 98, 99])), "900150983cd24fb0d6963f7d28e17f72"); // "abc"
  assert.equal(md5Bytes(new Uint8Array([])), "d41d8cd98f00b204e9800998ecf8427e");
  // A byte sequence that is not valid UTF-8 must still hash.
  assert.equal(md5Bytes(new Uint8Array([0xff, 0xfe, 0x00])).length, 32);
});

test("utf8Bytes encodes beyond the BMP", () => {
  assert.deepEqual(utf8Bytes("abc"), [97, 98, 99]);
  assert.deepEqual(utf8Bytes("é"), [0xc3, 0xa9]);
  assert.deepEqual(utf8Bytes("😀"), [0xf0, 0x9f, 0x98, 0x80]);
});

test("SHA digests match published test vectors for 'abc'", async () => {
  assert.equal(await subtleDigestHex("SHA-1", "abc"), "a9993e364706816aba3e25717850c26c9cd0d89d");
  assert.equal(
    await subtleDigestHex("SHA-256", "abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
  assert.equal(
    await subtleDigestHex("SHA-384", "abc"),
    "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed" +
      "8086072ba1e7cc2358baeca134c825a7"
  );
  assert.equal(
    await subtleDigestHex("SHA-512", "abc"),
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
      "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
  );
});

test("hashText returns all five algorithms", async () => {
  const h = await hashText("abc");
  assert.equal(h.md5, "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(h.sha1, "a9993e364706816aba3e25717850c26c9cd0d89d");
  assert.equal(h.sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(h.sha384.length, 96);
  assert.equal(h.sha512.length, 128);
});

test("hashBytes over the bytes of 'abc' equals hashText('abc')", async () => {
  const fromBytes = await hashBytes(new Uint8Array([97, 98, 99]));
  const fromText = await hashText("abc");
  assert.deepEqual(fromBytes, fromText);
});

test("SHA_ALGORITHMS lists exactly what crypto.subtle supports", () => {
  assert.deepEqual(SHA_ALGORITHMS, ["SHA-1", "SHA-256", "SHA-384", "SHA-512"]);
});

test("HMAC matches RFC 4231 / RFC 2202 test vectors", async () => {
  // RFC 2202 test case 1: key = 20 bytes of 0x0b, data = "Hi There".
  const key0b = "\x0b".repeat(20);
  assert.equal(await hmacHex("SHA-1", key0b, "Hi There"), "b617318655057264e28bc0b6fb378c8ef146be00");
  assert.equal(
    await hmacHex("SHA-256", key0b, "Hi There"),
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
  );
  // RFC 4231 test case 2: key = "Jefe", data = "what do ya want for nothing?".
  assert.equal(
    await hmacHex("SHA-256", "Jefe", "what do ya want for nothing?"),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
  );
  assert.equal(
    await hmacHex("SHA-1", "Jefe", "what do ya want for nothing?"),
    "effcdf6ae5eb2fa2d27416d5f184df9c259a7c79"
  );
});

test("compareHashes ignores case and whitespace", () => {
  const A = "900150983CD24FB0D6963F7D28E17F72";
  const b = " 900150983cd24fb0d6963f7d28e17f72 ";
  assert.equal(compareHashes(A, b).ok, true);
  assert.equal(compareHashes(A, b).status, "match");
});

test("compareHashes explains a length mismatch as an algorithm mismatch", () => {
  const r = compareHashes("900150983cd24fb0d6963f7d28e17f72", "a9993e364706816aba3e25717850c26c9cd0d89d");
  assert.equal(r.ok, false);
  assert.equal(r.status, "length");
  assert.match(r.message, /different algorithms/);
});

test("compareHashes reports empty input and plain differences", () => {
  assert.equal(compareHashes("", "abc").status, "empty");
  assert.equal(compareHashes("aaaa", "bbbb").status, "differ");
  assert.equal(compareHashes("zzzz", "bbbb").status, "invalid");
});

/* ------------------------------------ JWT ---------------------------------- */

test("base64UrlDecode handles the URL alphabet and missing padding", () => {
  assert.equal(base64UrlDecode("eyJhIjoxfQ"), '{"a":1}');
});

test("decodeJwt decodes a real token's header and claims", () => {
  // Standard example token from jwt.io (HS256, secret "your-256-bit-secret").
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ." +
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const r = decodeJwt(token);
  assert.equal(r.ok, true);
  assert.equal(r.header.alg, "HS256");
  assert.equal(r.header.typ, "JWT");
  assert.equal(r.payload.sub, "1234567890");
  assert.equal(r.payload.name, "John Doe");
  assert.equal(r.payload.iat, 1516239022);
  assert.equal(r.signature, "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
  assert.ok(r.claimDates.iat.includes("2018"), "iat rendered as a human date");
});

test("decodeJwt flags an expired token and a live one", () => {
  const make = (payload) =>
    "eyJhbGciOiJIUzI1NiJ9." +
    Buffer.from(JSON.stringify(payload)).toString("base64url") +
    ".sig";
  assert.equal(decodeJwt(make({ exp: 1000000000 })).expired, true);
  assert.equal(decodeJwt(make({ exp: Math.floor(Date.now() / 1000) + 3600 })).expired, false);
  assert.equal(decodeJwt(make({ sub: "x" })).expired, null, "no exp claim means unknown, not expired");
});

test("decodeJwt rejects malformed tokens", () => {
  assert.equal(decodeJwt("").ok, false);
  assert.equal(decodeJwt("a.b").ok, false);
  assert.match(decodeJwt("a.b").message, /3 dot-separated parts/);
  assert.equal(decodeJwt("!!!.!!!.!!!").ok, false);
});

/* ------------------------------------ cron --------------------------------- */

// Cron fields are read as UTC wall-clock, so the fixtures and the readback are
// both in UTC. That also makes these assertions independent of the machine's
// own zone, which the local-time versions were not.
const at = (y, m, d, hh, mm) => new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));
const fmt = (dt) =>
  `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")} ` +
  `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`;

test("parseCronField expands wildcards, lists, ranges and steps", () => {
  const minute = { name: "minute", min: 0, max: 59 };
  assert.equal(parseCronField("*", minute).values.length, 60);
  assert.deepEqual(parseCronField("5", minute).values, [5]);
  assert.deepEqual(parseCronField("1,3,5", minute).values, [1, 3, 5]);
  assert.deepEqual(parseCronField("10-13", minute).values, [10, 11, 12, 13]);
  assert.deepEqual(parseCronField("*/15", minute).values, [0, 15, 30, 45]);
  assert.deepEqual(parseCronField("0-20/10", minute).values, [0, 10, 20]);
  assert.deepEqual(parseCronField("50/5", minute).values, [50, 55], "bare value with step runs to the max");
  assert.deepEqual(parseCronField("5,1,5", minute).values, [1, 5], "deduplicated and sorted");
});

test("parseCronField accepts month and day names", () => {
  const month = { name: "month", min: 1, max: 12, label: "month", aliases: { jan: 1, feb: 2, mar: 3, dec: 12 } };
  assert.deepEqual(parseCronField("JAN", month).values, [1]);
  assert.deepEqual(parseCronField("jan-mar", month).values, [1, 2, 3]);
  const dow = { name: "dow", min: 0, max: 7, label: "day of week", aliases: { sun: 0, mon: 1, fri: 5 } };
  assert.deepEqual(parseCronField("MON-FRI", dow).values, [1, 2, 3, 4, 5]);
});

test("parseCronField rejects out-of-range and malformed input", () => {
  const minute = { name: "minute", min: 0, max: 59 };
  assert.equal(parseCronField("60", minute).ok, false);
  assert.equal(parseCronField("*/0", minute).ok, false);
  assert.equal(parseCronField("20-10", minute).ok, false, "inverted range");
  assert.equal(parseCronField("q", minute).ok, false);
  assert.equal(parseCronField("", minute).ok, false);
});

test("parseCron reads the five fields and normalises Sunday", () => {
  const p = parseCron("0 0 * * 1");
  assert.equal(p.ok, true);
  assert.deepEqual(p.values.minute, [0]);
  assert.deepEqual(p.values.hour, [0]);
  assert.deepEqual(p.values.dow, [1]);
  // Day-of-week 7 and 0 are both Sunday.
  assert.deepEqual(parseCron("0 0 * * 7").values.dow, [0]);
  assert.deepEqual(parseCron("0 0 * * 0,7").values.dow, [0]);
});

test("parseCron expands the @ macros", () => {
  assert.equal(parseCron("@daily").expression, "0 0 * * *");
  assert.equal(parseCron("@weekly").expression, "0 0 * * 0");
  assert.equal(parseCron("@hourly").expression, "0 * * * *");
  assert.equal(parseCron("@yearly").expression, "0 0 1 1 *");
  assert.equal(parseCron("@reboot").ok, false, "@reboot has no schedule to predict");
});

test("parseCron reports field-count problems usefully", () => {
  assert.match(parseCron("* * * *").message, /has 5 fields/);
  assert.match(parseCron("0 0 * * * *").message, /6-field/);
  assert.equal(parseCron("").ok, false);
});

test("describeCron renders the documented examples in plain English", () => {
  // The two examples named in the issue.
  assert.equal(describeCron(parseCron("0 0 * * 1")), "At 00:00, only on Monday.");
  assert.equal(describeCron(parseCron("*/5 * * * *")), "Every 5 minutes.");

  assert.equal(describeCron(parseCron("* * * * *")), "Every minute.");
  assert.equal(describeCron(parseCron("0 * * * *")), "Every hour at minute 0.");
  assert.equal(describeCron(parseCron("15,45 * * * *")), "Every hour at minutes 15 and 45.");
  assert.equal(
    describeCron(parseCron("0 9 * * MON-FRI")),
    "At 09:00, only on Monday, Tuesday, Wednesday, Thursday and Friday."
  );
  assert.equal(describeCron(parseCron("30 2 1 * *")), "At 02:30, on day-of-month 1.");
  assert.equal(describeCron(parseCron("0 0 1 1 *")), "At 00:00, on day-of-month 1, in January.");
  assert.equal(describeCron(parseCron("0 */6 * * *")), "At 00:00, 06:00, 12:00 and 18:00.");
});

test("describeCron spells out the day-of-month OR day-of-week rule", () => {
  // When both day fields are restricted, cron fires if EITHER matches.
  const text = describeCron(parseCron("0 0 1 * MON"));
  assert.match(text, /or on Monday/);
  assert.match(text, /matches either/);
});

test("cronFormatList reads as a sentence", () => {
  assert.equal(cronFormatList([1]), "1");
  assert.equal(cronFormatList([1, 2]), "1 and 2");
  assert.equal(cronFormatList([1, 2, 3]), "1, 2 and 3");
});

test("nextCronRuns lists midnight every Monday", () => {
  // 2026-08-11 is a Tuesday, so the next Mondays are the 17th, 24th, 31st...
  const runs = nextCronRuns(parseCron("0 0 * * 1"), at(2026, 8, 11, 9, 17), 5);
  assert.deepEqual(runs.map(fmt), [
    "2026-08-17 00:00",
    "2026-08-24 00:00",
    "2026-08-31 00:00",
    "2026-09-07 00:00",
    "2026-09-14 00:00",
  ]);
  runs.forEach((r) => assert.equal(r.getUTCDay(), 1, "every run is a Monday"));
});

test("nextCronRuns lists every five minutes", () => {
  const runs = nextCronRuns(parseCron("*/5 * * * *"), at(2026, 8, 11, 9, 17), 5);
  assert.deepEqual(runs.map(fmt), [
    "2026-08-11 09:20",
    "2026-08-11 09:25",
    "2026-08-11 09:30",
    "2026-08-11 09:35",
    "2026-08-11 09:40",
  ]);
});

test("nextCronRuns skips weekends for a weekday schedule", () => {
  const runs = nextCronRuns(parseCron("0 9 * * MON-FRI"), at(2026, 8, 14, 12, 0), 4);
  // 2026-08-14 is a Friday; next is Monday the 17th.
  assert.deepEqual(runs.map(fmt), [
    "2026-08-17 09:00",
    "2026-08-18 09:00",
    "2026-08-19 09:00",
    "2026-08-20 09:00",
  ]);
});

test("nextCronRuns handles 29 February", () => {
  const runs = nextCronRuns(parseCron("0 0 29 2 *"), at(2026, 1, 1, 0, 0), 3);
  assert.deepEqual(runs.map(fmt), ["2028-02-29 00:00", "2032-02-29 00:00", "2036-02-29 00:00"]);
});

test("nextCronRuns terminates on a schedule that can never fire", () => {
  // 30 February matches no real date; the search must bound itself.
  const runs = nextCronRuns(parseCron("0 0 30 2 *"), at(2026, 1, 1, 0, 0), 5);
  assert.deepEqual(runs, []);
});

test("nextCronRuns starts strictly after the given moment", () => {
  // At exactly 09:20 the 09:20 run has already fired; the next is 09:25.
  const runs = nextCronRuns(parseCron("*/5 * * * *"), at(2026, 8, 11, 9, 20), 1);
  assert.equal(fmt(runs[0]), "2026-08-11 09:25");
});

test("cronDayMatches ORs the two day fields when both are restricted", () => {
  const p = parseCron("0 0 1 * MON");
  // 2026-09-01 is a Tuesday but is the 1st -> matches on day-of-month.
  assert.equal(cronDayMatches(at(2026, 9, 1, 0, 0), p), true);
  // 2026-09-07 is a Monday but not the 1st -> matches on day-of-week.
  assert.equal(cronDayMatches(at(2026, 9, 7, 0, 0), p), true);
  // 2026-09-08 is a Tuesday and not the 1st -> no match.
  assert.equal(cronDayMatches(at(2026, 9, 8, 0, 0), p), false);
});

test("nextCronRuns reads the fields as UTC, not as the local clock", () => {
  // The motivating bug: `0 3 * * *` on a UTC server fires at 03:00 UTC, which
  // is 21:00 the previous day in Denver (MDT, UTC-6) — not 03:00 in Denver.
  const runs = nextCronRuns(parseCron("0 3 * * *"), at(2026, 8, 11, 9, 17), 1);
  assert.equal(runs[0].toISOString(), "2026-08-12T03:00:00.000Z");
});

test("formatCronRun renders one instant into whichever zone is asked for", () => {
  const when = new Date("2026-08-12T03:00:00.000Z");

  const utc = formatCronRun(when, "UTC");
  assert.equal(utc.time, "03:00");
  assert.equal(utc.abbr, "UTC", "UTC is never relabelled GMT");
  assert.equal(utc.day, "Wed, 12 Aug 2026");

  // Denver is UTC-6 in August, so 03:00 UTC is 21:00 on the *previous* day.
  const denver = formatCronRun(when, "America/Denver");
  assert.equal(denver.time, "21:00");
  assert.equal(denver.day, "Tue, 11 Aug 2026");
  assert.equal(denver.abbr, "MDT", "August is daylight time in Denver");
  assert.notEqual(denver.dateKey, utc.dateKey, "the two zones land on different days");

  // London's abbreviation only exists in en-GB, Denver's only in en-US, so
  // this proves both locales are being consulted.
  assert.equal(formatCronRun(when, "Europe/London").abbr, "BST");
  // No CLDR abbreviation exists for Tokyo; the offset is the honest fallback.
  assert.equal(formatCronRun(when, "Asia/Tokyo").abbr, "GMT+9");

  // Tokyo is UTC+9, so the same instant is noon the same day.
  assert.equal(formatCronRun(when, "Asia/Tokyo").time, "12:00");
  // Kolkata's half-hour offset is a good check that minutes convert too.
  assert.equal(formatCronRun(when, "Asia/Kolkata").time, "08:30");
});

test("formatCronRun renders midnight as 00:00, not 24:00", () => {
  const midnight = new Date("2026-08-17T00:00:00.000Z");
  assert.equal(formatCronRun(midnight, "UTC").time, "00:00");
  assert.equal(formatCronRun(midnight, "UTC").day, "Mon, 17 Aug 2026");
});

test("formatCronRun falls back to UTC rather than throwing on a bad zone", () => {
  const when = new Date("2026-08-12T03:00:00.000Z");
  assert.equal(formatCronRun(when, "Not/AZone").time, "03:00");
  assert.equal(formatCronRun(when, "Not/AZone").zone, "UTC");
});

test("cronTimeZoneList offers the real IANA zones", () => {
  const zones = cronTimeZoneList();
  assert.ok(zones.length > 100, "expected the full IANA list, got " + zones.length);
  assert.ok(zones.includes("America/Denver"));
  assert.ok(zones.includes("Europe/London"));
});

/* ------------------------------ CSV + entities ----------------------------- */

test("CSV converter round-trips", () => {
  const csv = "name,age\nAda,36";
  const json = csvToJson(csv);
  assert.equal(json.ok, true);
  assert.equal(JSON.parse(json.value)[0].name, "Ada");
  // jsonToCsv emits CRLF line endings, as RFC 4180 specifies.
  assert.equal(jsonToCsv(json.value).value.replace(/\r\n/g, "\n").trim(), csv);
});

test("HTML entity encoder round-trips", () => {
  const raw = '<a href="x">&\'</a>';
  assert.equal(htmlEntityDecode(htmlEntityEncode(raw)), raw);
});

/* ------------------------------- colour tools ----------------------------- */

test("hex parsing covers 3, 4, 6 and 8 digits, with and without the hash", () => {
  assert.deepEqual(parseHexColor("#f00"), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseHexColor("3ce688"), { r: 60, g: 230, b: 136, a: 1 });
  assert.deepEqual(parseHexColor("#0f08"), { r: 0, g: 255, b: 0, a: 136 / 255 });
  assert.deepEqual(parseHexColor("#11223344"), { r: 17, g: 34, b: 51, a: 68 / 255 });
  assert.equal(parseHexColor("#12345"), null);
  assert.equal(parseHexColor("nothex"), null);
});

test("HSL conversions match the CSS Color 4 worked values", () => {
  // Primaries: hue at the three 120-degree stops, full saturation, mid lightness.
  assert.equal(formatHsl({ r: 255, g: 0, b: 0 }), "hsl(0, 100%, 50%)");
  assert.equal(formatHsl({ r: 0, g: 255, b: 0 }), "hsl(120, 100%, 50%)");
  assert.equal(formatHsl({ r: 0, g: 0, b: 255 }), "hsl(240, 100%, 50%)");
  // Grey has no hue and no saturation.
  assert.deepEqual(rgbToHsl({ r: 128, g: 128, b: 128 }).s, 0);
  // ...and back again: CSS named "green" is exactly hsl(120, 100%, 25%).
  assert.deepEqual(hslToRgb({ h: 120, s: 100, l: 25 }), { r: 0, g: 128, b: 0 });
  assert.equal(formatHex(parseColor("hsl(120 100% 25%)")), "#008000");
});

test("HSV is value-based where HSL is lightness-based", () => {
  // Pure red: HSL calls it 50% light, HSV calls it 100% value. Both are right.
  assert.equal(formatHsv({ r: 255, g: 0, b: 0 }), "hsv(0, 100%, 100%)");
  assert.equal(formatHsv({ r: 255, g: 255, b: 255 }), "hsv(0, 0%, 100%)");
  assert.deepEqual(hsvToRgb({ h: 210, s: 50, v: 80 }), { r: 102, g: 153, b: 204 });
  assert.deepEqual(rgbToHsv({ r: 102, g: 153, b: 204 }), { h: 210, s: 50, v: 80 });
});

test("CSS named colours resolve both ways", () => {
  assert.equal(Object.keys(CSS_NAMED_COLORS).length, 148);
  assert.equal(formatHex(parseColor("rebeccapurple")), "#663399");
  assert.equal(formatHex(parseColor("  ForestGreen ")), "#228b22");
  assert.equal(rgbToNamedColor({ r: 255, g: 99, b: 71 }), "tomato");
  assert.equal(rgbToNamedColor({ r: 255, g: 99, b: 72 }), null, "near misses are not names");
  // A translucent colour has no CSS name, because a CSS name is opaque.
  assert.equal(rgbToNamedColor({ r: 255, g: 99, b: 71, a: 0.5 }), null);
});

test("parseColor accepts legacy comma and Level 4 space syntax alike", () => {
  const forms = ["#3ce688", "3CE688", "rgb(60, 230, 136)", "rgb(60 230 136)",
                 "hsl(146.9, 77.3%, 56.9%)", "hsv(146.9 73.9% 90.2%)"];
  forms.forEach((f) => {
    const c = parseColor(f);
    assert.equal(c.ok, true, f + " should parse");
    assert.equal(formatHex(c), "#3ce688", f + " should be #3ce688");
  });
  assert.equal(parseColor("rgb(60 230)").ok, false);
  assert.equal(parseColor("chartreusey").ok, false);
});

test("alpha survives a hex -> rgba -> hex round trip", () => {
  assert.equal(formatRgb(parseColor("#11223344")), "rgba(17, 34, 51, 0.267)");
  assert.equal(formatHex(parseColor("rgba(17, 34, 51, 0.267)")), "#11223344");
  assert.equal(formatHsl(parseColor("#ff000080")), "hsla(0, 100%, 50%, 0.502)");
  // Fully opaque never grows a redundant alpha pair.
  assert.equal(formatHex(parseColor("rgba(255, 0, 0, 1)")), "#ff0000");
});

test("relative luminance hits the WCAG 2.1 anchor values", () => {
  // W3C: black is 0, white is 1, by definition of the formula.
  assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
  assert.equal(relativeLuminance({ r: 255, g: 255, b: 255 }), 1);
  // The coefficients are the sRGB primaries' share of luminance.
  assert.equal(roundRatio(relativeLuminance({ r: 0, g: 255, b: 0 })), 0.72);
});

test("contrast ratio matches published known answers", () => {
  const white = { r: 255, g: 255, b: 255 }, black = { r: 0, g: 0, b: 0 };
  // The maximum possible ratio, (1 + 0.05) / (0 + 0.05).
  assert.equal(contrastRatio(white, black), 21);
  // Order cannot matter — the formula is lighter-over-darker.
  assert.equal(contrastRatio(black, white), 21);
  // #767676 is the canonical "darkest grey that still passes AA on white".
  assert.equal(roundRatio(contrastRatio(parseColor("#767676"), white)), 4.54);
  assert.equal(roundRatio(contrastRatio(parseColor("#777777"), white)), 4.48);
  // ...and #949494 is its large-text equivalent at 3:1.
  assert.equal(roundRatio(contrastRatio(parseColor("#949494"), white)), 3.03);
  assert.equal(contrastRatio(white, white), 1);
});

test("wcagResults applies the 4.5 / 7 / 3 thresholds", () => {
  const at454 = wcagResults(4.54);
  const by = {};
  at454.forEach((r) => { by[r.key] = r.pass; });
  assert.deepEqual(by, { normalAA: true, normalAAA: false, largeAA: true, largeAAA: true, uiAA: true });
  const at299 = wcagResults(2.99);
  assert.equal(at299.every((r) => r.pass === false), true);
  // The badge reads the rounded ratio, so the boundary is judged on what is shown.
  assert.equal(wcagResults(4.4951).find((r) => r.key === "normalAA").pass, true);
});

test("a translucent foreground is flattened before it is measured", () => {
  // Half-opacity black over white is mid grey, not black: the ratio has to fall.
  const half = flattenOver({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255 });
  assert.deepEqual(half, { r: 128, g: 128, b: 128, a: 1 });
  assert.equal(roundRatio(contrastRatio(half, { r: 255, g: 255, b: 255 })), 3.95);
});

test("OKLCH round-trips sRGB and keeps hue while lightness moves", () => {
  const rgb = { r: 60, g: 230, b: 136 };
  assert.deepEqual(oklchToRgb(rgbToOklch(rgb)), rgb);
  const before = rgbToOklch(rgb);
  const lighter = rgbToOklch(oklchToRgb({ l: before.l + 0.1, c: before.c, h: before.h }));
  assert.ok(Math.abs(lighter.h - before.h) < 1.5, "hue held within a degree and a half");
  assert.ok(lighter.l > before.l);
});

test("the lightness nudge reaches the target and reports the colour it reached", () => {
  const white = { r: 255, g: 255, b: 255 };
  const fixed = nudgeLightnessToPass(parseColor("#777777"), white, 4.5);
  assert.equal(fixed.ok, true);
  assert.equal(fixed.direction, "darker");
  // The reported ratio is the reported hex's real ratio, not the requested one.
  assert.equal(roundRatio(contrastRatio(parseColor(fixed.hex), white)), fixed.ratio);
  assert.ok(fixed.ratio >= 4.5);

  // Unreachable targets say so rather than returning a colour that fails.
  const impossible = nudgeLightnessToPass(parseColor("#808080"), parseColor("#808080"), 7);
  assert.equal(impossible.ok, false);
  assert.ok(impossible.best < 7);
});

/* ===================== number base converter ===================== */

test("parseInBase reads every base exactly, past Number.MAX_SAFE_INTEGER", () => {
  assert.equal(parseInBase("ff", 16).value, 255n);
  assert.equal(parseInBase("FF", 16).value, 255n);
  assert.equal(parseInBase("0xFF", 16).value, 255n);
  assert.equal(parseInBase("1010", 2).value, 10n);
  assert.equal(parseInBase("0b1010", 2).value, 10n);
  assert.equal(parseInBase("777", 8).value, 511n);
  assert.equal(parseInBase("zz", 36).value, 1295n);

  // The whole reason this is BigInt. Number(9007199254740993) is 9007199254740992.
  assert.equal(parseInBase("9007199254740993", 10).value, 9007199254740993n);
  assert.equal(parseInBase("FFFFFFFFFFFFFFFF", 16).value, 18446744073709551615n);
  assert.equal(parseInBase("ffffffffffffffff", 16).value, 2n ** 64n - 1n);

  // Separators people actually paste, and a sign.
  assert.equal(parseInBase("1_000_000", 10).value, 1000000n);
  assert.equal(parseInBase("1111 0000", 2).value, 240n);
  assert.equal(parseInBase("-42", 10).value, -42n);
  assert.equal(parseInBase("  +42  ", 10).value, 42n);
});

test("a prefix only counts when it agrees with the base being read", () => {
  // 0b11 in hex is 0xB11, not binary 3 — a silent base switch here would be a
  // wrong answer with no error to notice.
  assert.equal(parseInBase("0b11", 16).value, 0xb11n);
  assert.equal(parseInBase("0b11", 2).value, 3n);
  assert.equal(parseInBase("0x10", 16).value, 16n);
});

test("parseInBase names the character it choked on", () => {
  const bad = parseInBase("12G", 16);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /"G" is not a base-16 digit/);
  assert.match(bad.error, /0–9 and a–f/);
  assert.equal(parseInBase("2", 2).ok, false); // in range for a digit, not for base 2
  assert.equal(parseInBase("", 10).ok, false);
  assert.equal(parseInBase("1", 37).ok, false);
  assert.equal(parseInBase("1", 1).ok, false);
  assert.equal(baseDigitRange(8), "0–7");
});

test("formatInBase is the exact inverse of parseInBase in every base", () => {
  for (let base = 2; base <= 36; base++) {
    for (const v of [0n, 1n, 255n, 65535n, 123456789n, 2n ** 64n - 1n, -987654321n]) {
      assert.equal(parseInBase(formatInBase(v, base), base).value, v,
        `base ${base} value ${v}`);
    }
  }
  assert.equal(formatInBase(0n, 16), "0");
  assert.equal(formatInBase(255n, 16), "ff");
  assert.equal(formatInBase(-255n, 16), "-ff");
  assert.equal(formatInBase(2n ** 64n - 1n, 16), "ffffffffffffffff");
  assert.equal(formatInBase(2n ** 64n - 1n, 10), "18446744073709551615");
});

test("two's complement round-trips at every supported width", () => {
  assert.equal(toTwosComplement(-1n, 8), 255n);
  assert.equal(toTwosComplement(-1n, 16), 65535n);
  assert.equal(toTwosComplement(-1n, 32), 4294967295n);
  assert.equal(toTwosComplement(-1n, 64), 18446744073709551615n);

  assert.equal(fromTwosComplement(255n, 8), -1n);
  assert.equal(fromTwosComplement(0xffffffffn, 32), -1n);
  assert.equal(fromTwosComplement(0x80000000n, 32), -2147483648n);
  assert.equal(fromTwosComplement(0x7fffffffn, 32), 2147483647n);
  assert.equal(fromTwosComplement(0xffffffffffffffffn, 64), -1n);
  assert.equal(fromTwosComplement(0x8000000000000000n, 64), -9223372036854775808n);
  assert.equal(fromTwosComplement(0x7fffffffffffffffn, 64), 9223372036854775807n);

  for (const bits of [8, 16, 32, 64]) {
    const { min, max } = signedRange(bits);
    for (const v of [min, min + 1n, -1n, 0n, 1n, max - 1n, max]) {
      assert.equal(fromTwosComplement(toTwosComplement(v, bits), bits), v,
        `${bits}-bit ${v}`);
    }
    assert.equal(unsignedRange(bits).max, 2n ** BigInt(bits) - 1n);
  }
});

test("fitsInWidth knows the boundary in both signednesses", () => {
  assert.equal(fitsInWidth(127n, 8, true), true);
  assert.equal(fitsInWidth(128n, 8, true), false);
  assert.equal(fitsInWidth(-128n, 8, true), true);
  assert.equal(fitsInWidth(-129n, 8, true), false);
  assert.equal(fitsInWidth(255n, 8, false), true);
  assert.equal(fitsInWidth(256n, 8, false), false);
  assert.equal(fitsInWidth(-1n, 8, false), false);
});

test("0xFFFFFFFF is -1 at 32-bit signed and 4294967295 unsigned", () => {
  const signed = convertNumberBases("FFFFFFFF", 16, { bits: 32, signed: true });
  assert.equal(signed.signedDecimal, "-1");
  assert.equal(signed.unsignedDecimal, "4294967295");
  assert.equal(signed.decimal, "-1");
  assert.equal(signed.hex, "ffffffff");
  assert.equal(signed.binary, "1".repeat(32));
  // A pattern that fills the width is a reinterpretation, not an overflow.
  assert.equal(signed.wrapped, false);
  assert.equal(signed.reinterpreted, true);

  const unsigned = convertNumberBases("FFFFFFFF", 16, { bits: 32, signed: false });
  assert.equal(unsigned.decimal, "4294967295");
  assert.equal(unsigned.reinterpreted, false);
});

test("negative input comes back as the register pattern, not a minus sign", () => {
  const r = convertNumberBases("-1", 10, { bits: 8, signed: true });
  assert.equal(r.hex, "ff");
  assert.equal(r.binary, "11111111");
  assert.equal(r.signedDecimal, "-1");
  assert.equal(r.unsignedDecimal, "255");
  assert.equal(r.wrapped, false);

  // -128 is the edge that fits; -129 is the edge that does not.
  assert.equal(convertNumberBases("-128", 10, { bits: 8, signed: true }).hex, "80");
  assert.equal(convertNumberBases("-129", 10, { bits: 8, signed: true }).wrapped, true);
});

test("64-bit values survive with no float precision loss", () => {
  const r = convertNumberBases("18446744073709551615", 10, { bits: 64, signed: false });
  assert.equal(r.hex, "ffffffffffffffff");
  assert.equal(r.decimal, "18446744073709551615");
  assert.equal(r.binary, "1".repeat(64));

  const s = convertNumberBases("9223372036854775807", 10, { bits: 64, signed: true });
  assert.equal(s.hex, "7fffffffffffffff");
  assert.equal(s.signedDecimal, "9223372036854775807");

  // The value one past the top of the signed range wraps to the bottom of it.
  const over = convertNumberBases("9223372036854775808", 10, { bits: 64, signed: true });
  assert.equal(over.signedDecimal, "-9223372036854775808");
  assert.equal(over.reinterpreted, true);

  // And with no width set, nothing is masked at any magnitude.
  const huge = convertNumberBases("340282366920938463463374607431768211455", 10, {});
  assert.equal(huge.hex, "f".repeat(32));
  assert.equal(huge.bits, null);
});

test("fixed widths zero-pad, arbitrary precision does not", () => {
  assert.equal(convertNumberBases("5", 10, { bits: 8 }).binary, "00000101");
  assert.equal(convertNumberBases("5", 10, { bits: 8 }).hex, "05");
  assert.equal(convertNumberBases("5", 10, {}).binary, "101");
  assert.equal(padToWidth("101", 2, 8), "00000101");
  assert.equal(padToWidth("101", 10, 8), "101"); // base 10 does not divide a width
  assert.equal(groupDigits("11110000", 2), "1111 0000");
  assert.equal(groupDigits("deadbeef", 16), "de ad be ef");
  assert.equal(groupDigits("1234567", 10), "1 234 567");
  assert.equal(groupDigits("-1234", 10), "-1 234");
});

test("a custom base rides along with the four standard ones", () => {
  const r = convertNumberBases("255", 10, { customBase: 36 });
  assert.equal(r.custom, "73");
  assert.equal(r.customBase, 36);
  assert.equal(convertNumberBases("255", 10, { customBase: 3 }).custom, "100110");
  assert.equal(convertNumberBases("255", 10, { customBase: 99 }).custom, undefined);
});

test("text and bytes round-trip through UTF-8, multi-byte included", () => {
  assert.deepEqual(textToBytes("Hi"), [0x48, 0x69]);
  assert.equal(bytesToText([0x48, 0x69]), "Hi");
  assert.equal(bytesToText(textToBytes("héllo — 日本 🐇")), "héllo — 日本 🐇");
  assert.deepEqual(textToBytes("€"), [0xe2, 0x82, 0xac]);
  assert.deepEqual(textToBytes("🐇"), [0xf0, 0x9f, 0x90, 0x87]);
});

test("a malformed byte run decodes to U+FFFD rather than to nonsense", () => {
  assert.equal(bytesToText([0xff]), "�");
  assert.equal(bytesToText([0xe2, 0x82]), "��"); // truncated euro sign
  assert.equal(bytesToText([0x80]), "�"); // lone continuation byte
  assert.equal(bytesToText([0xc0, 0x80]), "��"); // over-long encoding of NUL
  // WHATWG's algorithm emits one U+FFFD per byte it has to abandon, so a
  // surrogate encoded as three bytes is three replacements, not one: 0xED
  // fails on its second byte, and 0xA0/0x80 are then read as stray
  // continuation bytes in their own right.
  assert.equal(bytesToText([0xed, 0xa0, 0x80]), "���");
  assert.equal(bytesToText([0x41, 0xff, 0x42]), "A�B");
});

test("text to binary and hex, and back", () => {
  assert.equal(textToBinary("Hi"), "01001000 01101001");
  assert.equal(textToBinary("Hi", { separator: "" }), "0100100001101001");
  assert.deepEqual(binaryToText("01001000 01101001"), { ok: true, value: "Hi" });
  assert.deepEqual(binaryToText("0100100001101001"), { ok: true, value: "Hi" });

  assert.equal(textToHex("Hi"), "48 69");
  assert.equal(textToHex("Hi", { uppercase: true }), "48 69".toUpperCase());
  assert.equal(textToHex("Hi", { separator: "" }), "4869");
  assert.deepEqual(hexToText("48 69"), { ok: true, value: "Hi" });
  assert.deepEqual(hexToText("4869"), { ok: true, value: "Hi" });
  assert.deepEqual(hexToText("0x4869"), { ok: true, value: "Hi" });

  // Multi-byte characters go out and come back as the same string.
  assert.equal(binaryToText(textToBinary("héllo 🐇")).value, "héllo 🐇");
  assert.equal(hexToText(textToHex("héllo 🐇")).value, "héllo 🐇");
});

test("a byte run rejects tokens that are not bytes", () => {
  assert.equal(bytesFromDigits("100000000", 2, 8).ok, true); // unseparated, chunked from the right
  assert.equal(bytesFromDigits("1 0000000", 2, 8).ok, true);
  // Unseparated "999" is a valid odd-length run — 0x9 then 0x99 — because the
  // chunking runs from the right. Separated, "999" is one token and too big.
  assert.deepEqual(bytesFromDigits("999", 16, 2).bytes, [0x9, 0x99]);
  assert.equal(bytesFromDigits("999 00", 16, 2).ok, false);
  assert.match(bytesFromDigits("999 00", 16, 2).error, /not a single byte/);
  assert.equal(bytesFromDigits("zz", 16, 2).ok, false);
  assert.equal(bytesFromDigits("", 16, 2).ok, false);
});
