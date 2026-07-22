"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseIJsonBuffer, parseIJsonText } = require("../lib/i-json");

test("strict I-JSON parser rejects duplicate object members before conversion", () => {
  assert.throws(
    () => parseIJsonText('{"operator":"not_empty","operator":"equals"}'),
    /Duplicate object member "operator"/,
  );
  assert.throws(
    () => parseIJsonText('{"operator":"not_empty","oper\\u0061tor":"equals"}'),
    /Duplicate object member "operator"/,
  );
});

test("strict I-JSON parser rejects unpaired surrogates and accepts scalar pairs", () => {
  assert.throws(() => parseIJsonText('{"message":"\\ud800"}'), /unpaired high surrogate/);
  assert.throws(() => parseIJsonText('{"message":"\\udc00"}'), /unpaired low surrogate/);
  assert.deepEqual(parseIJsonText('{"message":"\\ud83d\\ude00"}'), { message: "😀" });
});

test("strict I-JSON parser preserves ordinary object semantics safely", () => {
  const parsed = parseIJsonText('{"__proto__":{"polluted":true},"constructor":"value"}');
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  assert.equal(Object.hasOwn(parsed, "__proto__"), true);
  assert.deepEqual(parsed.__proto__, { polluted: true });
  assert.equal({}.polluted, undefined);
});

test("strict I-JSON buffer adapter rejects malformed UTF-8", () => {
  assert.throws(
    () => parseIJsonBuffer(Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])),
    /Invalid UTF-8 JSON text/,
  );
});

test("strict I-JSON parser enforces binary64 and depth limits", () => {
  assert.throws(() => parseIJsonText("1e400"), /overflows binary64/);
  const tooDeep = `${"[".repeat(256)}0${"]".repeat(256)}`;
  assert.throws(() => parseIJsonText(tooDeep), /exceeds maximum depth 256/);
});
