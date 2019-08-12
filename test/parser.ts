import {
  end,
  run,
  Parser,
  symbol,
  match,
  int,
  map,
  float,
  expectString,
  stringBefore,
  mapWithRange,
  ParseError,
  skip,
  constant,
  seq,
  oneOf,
  attempt,
  keyword,
  lazy,
  noop,
  many,
  sepBy,
  sepBy1,
  stringBeforeEndOr,
  stringUntil,
  todo,
  _,
  $2,
  $1,
  $3,
  whitespace,
  braced,
  withContext,
  sepUntil,
  calcPosition,
  $null,
  bracedSep,
  guard,
  sepUntil1,
  manyUntil,
  isParseError,
  matchMap
} from "../src/index";
import * as assert from "assert";

function succeed<A>(parser: Parser<A>, source: string, expect?: A): void {
  try {
    const value = run(parser, source);
    if (expect !== undefined) {
      assert.deepEqual(
        value,
        expect,
        `Parsed values didn't match: expected = ${expect}, actual = ${value}, source = ${source}`
      );
    }
  } catch (e) {
    if (isParseError(e)) {
      throw new Error(e.explain());
    }
    throw e;
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
  if (error === undefined) {
    throw new Error("Unexpectedly succeeded: " + JSON.stringify(value));
  }
  if (!isParseError(error)) {
    throw new Error("Unexpected error type: " + JSON.stringify(error));
  }
  if (error.offset !== offset) {
    throw new Error(
      `Offsets did not match: expected = ${offset}, actual = ${error.offset}, source = ${source}`
    );
  }
  error.explain();
  console.log(error.explain());
}

function failWithNonParseError<A>(parser: Parser<A>, source: string) {
  try {
    run(parser, source);
  } catch (e) {
    assert(!isParseError(e));
  }
}

function throwError<A>(message = "Something is wrong"): () => never {
  return () => {
    throw new Error(message);
  };
}

describe("Core", () => {
  it("position", () => {
    assert.deepEqual(calcPosition("", 0), { row: 1, column: 1 });
    assert.deepEqual(calcPosition(" ", 0), { row: 1, column: 1 });
    assert.deepEqual(calcPosition(" ", 1), { row: 1, column: 2 });
  });
  it("run", () => {
    failWithNonParseError(throwError(), "");
  });
  it("end", () => {
    succeed(end, "");
    fail(end, " ");
  });
  it("match", () => {
    succeed(match("a+"), "a", "a");
    succeed(match("a+"), "aa", "aa");
    succeed(match(".*"), "a\nb", "a\nb");
    fail(match("a+"), " a");
    fail(match("a+"), "");
  });
  it("matchMap", () => {
    succeed(matchMap("a+", $1), "a", "a");
    succeed(matchMap("(a)(b)", (ab, a, b) => [ab, a, b]), "ab", [
      "ab",
      "a",
      "b"
    ]);
    succeed(matchMap(".*", $1), "a\nb", "a\nb");
    fail(matchMap("a+", $1), " a");
    fail(matchMap("a+", $1), "");
  });
  it("skip", () => {
    succeed(skip("a"), "a");
    succeed(skip("a"), "");
  });
  it("map", () => {
    succeed(map(a => a.toUpperCase(), match("a")), "a", "A");
    fail(map(a => a.toUpperCase(), match("a")), "b");
    fail(map((_, fail) => fail(""), match("a")), "a");
    failWithNonParseError(map(throwError(), match("a")), "a");
  });
  it("mapWithRange", () => {
    succeed(mapWithRange(a => a.toUpperCase(), match("a")), "a", "A");
    succeed(mapWithRange((_, r) => r, match("a")), "a", {
      start: { row: 1, column: 1 },
      end: { row: 1, column: 1 }
    });
    succeed(mapWithRange((s, r) => [s, r], match(".*")), "ab\ncd", [
      "ab\ncd",
      {
        start: { row: 1, column: 1 },
        end: { row: 2, column: 2 }
      }
    ]);
    fail(mapWithRange(a => a.toUpperCase(), match("a")), "b");
    fail(mapWithRange((_, __, fail) => fail(""), match("a")), "a");
    failWithNonParseError(mapWithRange(throwError(), match("a")), "a");
  });
  it("expectString", () => {
    succeed(expectString("a"), "a");
    fail(expectString("a+"), "aa");
    fail(expectString("a"), " a");
    fail(expectString("a"), "");
  });
  it("stringBefore", () => {
    succeed(stringBefore("a"), "a", "");
    succeed(stringBefore("a"), "_a", "_");
    succeed(stringBefore("a+"), "aa", "");
    succeed(seq(_ => {}, stringBefore("a"), match("ab")), "ab");
    fail(stringBefore("a"), "b");
    fail(stringBefore("a"), "");
    fail(seq(_ => {}, stringBefore("a"), match("b")), "ab", 0);
  });
  it("stringBeforeEndOr", () => {
    succeed(stringBeforeEndOr("a"), "a", "");
    succeed(stringBeforeEndOr("a"), "", "");
    succeed(stringBeforeEndOr("a"), "__a", "__");
    succeed(stringBeforeEndOr("a"), "__", "__");
    succeed(stringBeforeEndOr("a+"), "whoa", "who");
    succeed(stringBeforeEndOr("a"), "\na", "\n");
    succeed(stringBeforeEndOr("a"), "\nb", "\nb");
  });
  it("stringUntil", () => {
    succeed(stringUntil("a"), "a", "");
    succeed(stringUntil("a"), "_a", "_");
    succeed(stringUntil("a+"), "aa", "");
    succeed(seq(_ => {}, stringUntil("a"), match("b")), "ab");
    fail(stringUntil("a"), "b");
    fail(stringUntil("a"), "");
    fail(seq(_ => {}, stringUntil("a"), match("ab")), "ab", 1);
  });
  it("noop", () => {
    succeed(noop, "");
  });
  it("constant", () => {
    succeed(constant("a"), "", "a");
    succeed(constant(1), "a", 1);
  });
  it("todo", () => {
    let succeeded = false;
    try {
      todo("foo");
      succeeded = true;
    } catch (e) {
      assert(e.message.includes("foo"));
    }
    assert(!succeeded, "todo() Unexpectedly succeed.");
  });
  it("seq", () => {
    succeed(seq($1, match("a"), noop), "ab", "a");
    succeed(seq($2, noop, match("a"), noop), "ab", "a");
    succeed(seq($3, noop, noop, match("a"), noop), "ab", "a");
    fail(seq($1, match("a"), end), "ab", 1);
    fail(seq(throwError(), match("a"), end), "ab", 1);
  });
  it("oneOf", () => {
    succeed(oneOf(match("a"), match("b")), "a", "a");
    succeed(oneOf(match("a"), match("b")), "b", "b");
    fail(oneOf(match("a"), match("b")), "c");
    fail(oneOf(seq($1, match("a"), match("a")), match("ab")), "ab", 1);
    fail(
      oneOf(braced("{", "}", oneOf(braced("{", "}", match("a"))))),
      "{ { 1 } }",
      4
    );
  });
  it("guard", () => {
    succeed(guard(match("a"), match("b")), "a", "a");
    succeed(guard(match("a"), match("b")), "b", "b");
    fail(guard(match("a"), match("b")), "c");
    fail(guard(seq($1, match("a"), match("a")), match("ab")), "ab", 1);
  });
  it("attempt", () => {
    const atA = seq($2, symbol("@"), match("a"));
    succeed(oneOf(attempt(atA), constant("z")), "@b", "z");
    fail(atA, "@b", 1);
    fail(oneOf(atA, constant("z")), "@b", 1);
  });
  it("withContext", () => {
    succeed(withContext("number", float("\\d")), "2", 2);
    fail(withContext("number", float("\\d")), "", 0);
  });
  it("lazy", () => {
    succeed(lazy(() => constant(1)), "", 1);
    const nums: Parser<number[]> = oneOf(
      map(_ => [], end),
      seq((h, t) => [h, ...t], int("\\d"), lazy(() => nums))
    );
    succeed(nums, "123", [1, 2, 3]);
    failWithNonParseError(lazy(() => null), "");
    failWithNonParseError(lazy(throwError()), "");
  });
  it("many", () => {
    succeed(many(int("\\d")), "123a", [1, 2, 3]);
    succeed(many(int("\\d")), "123", [1, 2, 3]);
    succeed(many(int("\\d")), "a1", []);
    succeed(many(int("\\d")), "", []);
    succeed(many(match(".+")), "foo", ["foo"]);
    succeed(many(match(".*")), "foo", ["foo"]);
    succeed(many(attempt(seq(_ => 0, match("a"), match("b")))), "ac", []);
    fail(many(seq(_ => 0, match("a"), match("b"))), "ac", 1);
  });
  it("manyUntil", () => {
    succeed(manyUntil(symbol("]"), int("\\d")), "]", []);
    succeed(manyUntil(symbol("]"), int("\\d")), "123]", [1, 2, 3]);
    fail(manyUntil(symbol("]"), int("\\d")), "123 ]", 3);
    succeed(manyUntil(symbol("]"), int("\\d")), "123]", [1, 2, 3]);
    fail(manyUntil(symbol("]"), int("\\d")), "a1]", 0);
    fail(manyUntil(symbol("]"), int("\\d")), "", 0);
    succeed(manyUntil(symbol(">"), match("[^>]+")), "foo>", ["foo"]);
    succeed(manyUntil(symbol(">"), match("[^>]*")), "foo>", ["foo"]);
    succeed(manyUntil(symbol(">"), match("[^>]+")), ">", []);
    succeed(manyUntil(symbol(">"), match("[^>]*")), ">", []);
    fail(manyUntil(symbol("]"), seq(_ => 0, match("a"), match("b"))), "ac]", 1);
  });
  it("sepBy", () => {
    succeed(sepBy(symbol(","), int("\\d")), "", []);
    succeed(sepBy(symbol(","), int("\\d")), "1", [1]);
    succeed(sepBy(symbol(","), int("\\d")), "1,2", [1, 2]);
    fail(sepBy(symbol(","), int("\\d")), "1,a", 2);
    fail(sepBy(symbol(","), int("\\d")), "1,", 2);
    succeed(sepBy(seq($null, symbol("!"), symbol("?")), int("\\d")), "1!2", [
      1
    ]);
    succeed(sepBy(seq($null, symbol("!"), symbol("?")), int("\\d")), "1!?2", [
      1,
      2
    ]);
    succeed(sepBy(seq($null, symbol("!"), symbol("?")), int("\\d")), "1!2", [
      1
    ]);
    succeed(sepBy(seq($null, symbol("!"), symbol("?")), int("\\d")), "1!?2", [
      1,
      2
    ]);
    succeed(
      sepBy(symbol(","), attempt(seq(_ => 0, match("a"), match("b")))),
      "ac",
      []
    );
    fail(sepBy(symbol(","), seq(_ => 0, match("a"), match("b"))), "ac", 1);
  });
  it("sepBy1", () => {
    fail(sepBy1(symbol(","), int("\\d")), "");
    succeed(sepBy1(symbol(","), int("\\d")), "1", [1]);
    succeed(sepBy1(symbol(","), int("\\d")), "1,2", [1, 2]);
    fail(sepBy1(symbol(","), int("\\d")), "1,a", 2);
    fail(sepBy1(symbol(","), int("\\d")), "1,", 2);
    succeed(sepBy1(seq($null, symbol("!"), symbol("?")), int("\\d")), "1!2", [
      1
    ]);
    succeed(sepBy1(seq($null, symbol("!"), symbol("?")), int("\\d")), "1!?2", [
      1,
      2
    ]);
    succeed(sepBy1(seq($null, symbol("!"), symbol("?")), int("\\d")), "1!2", [
      1
    ]);
    succeed(sepBy1(seq($null, symbol("!"), symbol("?")), int("\\d")), "1!?2", [
      1,
      2
    ]);
    fail(sepBy1(symbol(","), seq(_ => 0, match("a"), match("b"))), "ac", 1);
  });
  it("sepUntil", () => {
    succeed(sepUntil(symbol("]"), symbol(","), int("\\d")), "]", []);
    succeed(sepUntil(symbol("]"), symbol(","), int("\\d")), "1]", [1]);
    succeed(sepUntil(symbol("]"), symbol(","), int("\\d")), "1,2]", [1, 2]);
    succeed(sepUntil(end, symbol(","), int("\\d")), "", []);
    succeed(sepUntil(end, symbol(","), int("\\d")), "1", [1]);
    succeed(sepUntil(end, symbol(","), int("\\d")), "1,2", [1, 2]);
    fail(sepUntil(symbol("]"), symbol(","), int("\\d")), "", 0);
    fail(sepUntil(symbol("]"), symbol(","), int("\\d")), "1", 1);
    fail(sepUntil(symbol("]"), symbol(","), int("\\d")), "1,2", 3);
  });
  it("sepUntil1", () => {
    fail(sepUntil1(symbol("]"), symbol(","), int("\\d")), "]", 0);
    succeed(sepUntil1(symbol("]"), symbol(","), int("\\d")), "1]", [1]);
    succeed(sepUntil1(symbol("]"), symbol(","), int("\\d")), "1,2]", [1, 2]);
    fail(sepUntil1(end, symbol(","), int("\\d")), "", 0);
    succeed(sepUntil1(end, symbol(","), int("\\d")), "1", [1]);
    succeed(sepUntil1(end, symbol(","), int("\\d")), "1,2", [1, 2]);
    fail(sepUntil1(symbol("]"), symbol(","), int("\\d")), "", 0);
    fail(sepUntil1(symbol("]"), symbol(","), int("\\d")), "1", 1);
    fail(sepUntil1(symbol("]"), symbol(","), int("\\d")), "1,2", 3);
  });
  it("symbol", () => {
    succeed(symbol("!"), "!");
    fail(symbol("!"), " !");
    fail(symbol("!"), "");
  });
  it("keyword", () => {
    succeed(keyword("foo"), "foo");
    fail(keyword("foo"), " foo");
    fail(keyword("foo"), "");
    succeed(keyword("foo", 1), "foo", 1);
    fail(keyword("foo", 1), " foo");
    fail(keyword("foo", 1), "");
  });
  it("int", () => {
    succeed(int("\\d"), "1", 1);
    fail(int("[1-9]"), "0");
    fail(int("\\d"), " 1");
    fail(int("a"), "a");
  });
  it("float", () => {
    succeed(float("[0-9]\\.[0-9]"), "1.1", 1.1);
    fail(float("[1-9]"), "0");
    fail(float("\\d"), " 1");
    fail(float("[1-9]"), "0.5");
    fail(float("a"), "a");
  });
  it("whitespace", () => {
    succeed(seq($2, whitespace, int("\\d")), " \t\r\n1", 1);
    succeed(seq($2, _, int("\\d")), " \t\r\n1", 1);
  });
  it("braced", () => {
    succeed(braced("[", "]", int("\\d")), "[1]", 1);
    succeed(braced("[", "]", int("\\d")), "[ 1]", 1);
    succeed(braced("[", "]", int("\\d")), "[1 ]", 1);
    succeed(braced("[", "]", int("\\d")), "[ 1 ]", 1);
    succeed(
      seq((a, b) => [a, b], braced("[[", "]]", int("\\d")), int("\\d")),
      "[[ 1 ]]2",
      [1, 2]
    );
    fail(braced("[", "]", int("\\d")), "[ 11 ]", 3);
    fail(braced("[", "]", int("\\d")), "[ 1 1 ]", 4);
    fail(braced("[", "]", int("\\d")), " 1 ]", 0);
    fail(braced("[", "]", int("\\d")), "[ 1 ", 4);
  });
  it("bracedSep", () => {
    succeed(bracedSep("[", "]", symbol(","), int("\\d")), "[]", []);
    succeed(bracedSep("[", "]", symbol(","), int("\\d")), "[ ]", []);
    succeed(bracedSep("[", "]", symbol(","), int("\\d")), "[1]", [1]);
    succeed(bracedSep("[", "]", symbol(","), int("\\d")), "[ 1]", [1]);
    succeed(bracedSep("[", "]", symbol(","), int("\\d")), "[1 ]", [1]);
    succeed(bracedSep("[", "]", symbol(","), int("\\d")), "[ 1 ]", [1]);
    succeed(bracedSep("[", "]", symbol(","), int("\\d")), "[1,2]", [1, 2]);
    succeed(bracedSep("[", "]", symbol(","), int("\\d")), "[ 1,2]", [1, 2]);
    succeed(bracedSep("[", "]", symbol(","), int("\\d")), "[1,2 ]", [1, 2]);
    succeed(bracedSep("[", "]", symbol(","), int("\\d")), "[ 1,2 ]", [1, 2]);
    fail(bracedSep("[", "]", symbol(","), int("\\d")), "");
    fail(bracedSep("[", "]", symbol(","), int("\\d")), "[", 1);
    fail(bracedSep("[", "]", symbol(","), int("\\d")), "]");
    fail(bracedSep("[", "]", symbol(","), int("\\d")), "[1", 2);
    fail(bracedSep("[", "]", symbol(","), int("\\d")), "[,1]", 1);
    fail(bracedSep("[", "]", symbol(","), int("\\d")), "[1,]", 3);
    fail(bracedSep("[", "]", symbol(","), int("\\d")), "[1 2]", 3);
    fail(bracedSep("[", "]", symbol(","), int("\\d")), "[1,,2]", 3);
  });
});
