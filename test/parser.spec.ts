import {
  end,
  run,
  whitespace,
  Parser,
  symbol,
  match,
  int,
  map,
  float
} from "../src/index";
import * as assert from "assert";

const _ = whitespace;
function succeed<A>(parser: Parser<A>, source: string, expect?: A): void {
  const value = run(parser, source);
  if (expect !== undefined) {
    assert.deepEqual(
      value,
      expect,
      `Parsed values didn't match: expected = ${expect}, actual = ${value}`
    );
  }
}
function fail<A>(parser: Parser<A>, source: string, offset = 0): void {
  let value;
  let error;
  try {
    value = run(parser, source);
  } catch (e) {
    error = e;
  }
  if (!error) {
    throw new Error("Unexpectedly succeeded: " + JSON.stringify(value));
  }
  if (error.error.context.offset !== offset) {
    throw new Error(
      `Offsets did not match: expected = ${offset}, actual = ${
        error.error.context.offset
      }, source = ${source}`
    );
  }
}

describe("Core", () => {
  it("end", () => {
    succeed(end, "");
    fail(end, " ");
  });
  it("symbol", () => {
    succeed(symbol("!"), "!");
    fail(symbol("!"), " !");
    fail(symbol("!"), "");
  });
  it("match", () => {
    succeed(match("a+"), "a", "a");
    succeed(match("a+"), "aa", "aa");
    fail(match("a+"), " a");
    fail(match("a+"), "");
  });
  it("map", () => {
    succeed(map(match("a"), a => a.toUpperCase()), "a", "A");
    fail(
      map(match("a"), a => {
        throw "";
      }),
      "a"
    );
  });
  it("int", () => {
    succeed(int("[0-9]"), "1", 1);
    fail(int("[1-9]"), "0");
    fail(int("[0-9]"), " 1");
    fail(int("a"), "a");
  });
  it("float", () => {
    succeed(float("[0-9]\\.[0-9]"), "1.1", 1.1);
    fail(float("[1-9]"), "0");
    fail(float("[0-9]"), " 1");
    fail(float("[1-9]"), "0.5");
    fail(float("a"), "a");
  });
});
