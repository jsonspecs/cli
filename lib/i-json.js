"use strict";

const { TextDecoder } = require("node:util");

const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * Разбирает I-JSON до потери повторяющихся ключей и одиночных суррогатов.
 * Объекты остаются обычными JS-объектами, чтобы не менять authoring API CLI.
 */
function parseIJsonText(text) {
  if (typeof text !== "string") throw new TypeError("JSON text must be a string");
  let at = 0;

  function fail(message) {
    const error = new SyntaxError(`${message} at offset ${at}`);
    error.code = "INVALID_IJSON";
    throw error;
  }

  function space() {
    while (at < text.length && /[\x20\x09\x0a\x0d]/.test(text[at])) at++;
  }

  function string() {
    const start = at++;
    let escaped = false;
    while (at < text.length) {
      const code = text.charCodeAt(at);
      if (!escaped && code === 0x22) {
        at++;
        let value;
        try {
          value = JSON.parse(text.slice(start, at));
        } catch (_) {
          fail("Invalid JSON string");
        }
        assertScalarString(value, fail);
        return value;
      }
      if (!escaped && code < 0x20) fail("Unescaped control character");
      if (!escaped && code === 0x5c) escaped = true;
      else escaped = false;
      at++;
    }
    fail("Unterminated JSON string");
  }

  function number() {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at));
    if (!match) fail("Invalid JSON number");
    at += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail("JSON number overflows binary64");
    return Object.is(value, -0) ? 0 : value;
  }

  function value(depth) {
    if (depth > 256) fail("JSON document exceeds maximum depth 256");
    space();
    const ch = text[at];
    if (ch === '"') return string();
    if (ch === "-" || (ch >= "0" && ch <= "9")) return number();
    if (text.startsWith("true", at)) { at += 4; return true; }
    if (text.startsWith("false", at)) { at += 5; return false; }
    if (text.startsWith("null", at)) { at += 4; return null; }
    if (ch === "[") {
      at++;
      const out = [];
      space();
      if (text[at] === "]") { at++; return out; }
      while (true) {
        out.push(value(depth + 1));
        space();
        if (text[at] === "]") { at++; return out; }
        if (text[at++] !== ",") fail("Expected ',' in array");
      }
    }
    if (ch === "{") {
      at++;
      const out = {};
      const names = new Set();
      space();
      if (text[at] === "}") { at++; return out; }
      while (true) {
        space();
        if (text[at] !== '"') fail("Expected object member name");
        const key = string();
        if (names.has(key)) fail(`Duplicate object member ${JSON.stringify(key)}`);
        names.add(key);
        space();
        if (text[at++] !== ":") fail("Expected ':' after object member name");
        Object.defineProperty(out, key, {
          value: value(depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        });
        space();
        if (text[at] === "}") { at++; return out; }
        if (text[at++] !== ",") fail("Expected ',' in object");
      }
    }
    fail("Unexpected token");
  }

  const result = value(1);
  space();
  if (at !== text.length) fail("Trailing data");
  return result;
}

function parseIJsonBuffer(buffer) {
  if (!ArrayBuffer.isView(buffer)) throw new TypeError("JSON input must be a byte buffer");
  let text;
  try {
    text = utf8Decoder.decode(buffer);
  } catch (error) {
    const syntaxError = new SyntaxError(`Invalid UTF-8 JSON text: ${error.message}`);
    syntaxError.code = "INVALID_IJSON";
    throw syntaxError;
  }
  return parseIJsonText(text);
}

function assertScalarString(value, fail) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail("String contains an unpaired high surrogate");
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail("String contains an unpaired low surrogate");
    }
  }
}

module.exports = { parseIJsonBuffer, parseIJsonText };
