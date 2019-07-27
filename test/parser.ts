import {
  end,
  run,
  whitespace,
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
  assertConsumed,
  seq,
  oneOf,
  attempt,
  keyword,
  lazy,
  skipSeq,
  noop,
  many,
  sepBy,
  sepBy1,
  stringBeforeEndOr,
  stringUntil,
  todo,
  mapKeyword
} from "../src/index";
import * as assert from "assert";

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
  if (error === undefined) {
    throw new Error("Unexpectedly succeeded: " + JSON.stringify(value));
  }
  if (!(error instanceof ParseError)) {
    throw new Error("Unexpected error type: " + JSON.stringify(error));
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
  it("match", () => {
    succeed(match("a+"), "a", "a");
    succeed(match("a+"), "aa", "aa");
    succeed(match(".*"), "a\nb", "a\nb");
    fail(match("a+"), " a");
    fail(match("a+"), "");
  });
  it("skip", () => {
    succeed(skip("a"), "a");
    succeed(skip("a"), "");
  });
  it("map", () => {
    succeed(map(match("a"), a => a.toUpperCase()), "a", "A");
    fail(map(match("a"), (_, fail) => fail("")), "a");
    fail(
      map(match("a"), _ => {
        throw "";
      }),
      "a"
    );
  });
  it("mapWithRange", () => {
    succeed(mapWithRange(match("a"), a => a.toUpperCase()), "a", "A");
    succeed(mapWithRange(match("a"), (_, r) => r), "a", {
      start: { row: 1, column: 1 },
      end: { row: 1, column: 1 }
    });
    succeed(mapWithRange(match(".*"), (s, r) => [s, r]), "ab\ncd", [
      "ab\ncd",
      {
        start: { row: 1, column: 1 },
        end: { row: 2, column: 2 }
      }
    ]);
    fail(mapWithRange(match("a"), (_, __, fail) => fail("")), "a");
    fail(
      mapWithRange(match("a"), _ => {
        throw "";
      }),
      "a"
    );
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
  it("assertConsumed", () => {
    succeed(assertConsumed(match("a")), "aa", "a");
    succeed(assertConsumed(match("a+")), "aa", "aa");
    fail(assertConsumed(match("a+")), "");
    fail(assertConsumed(match("a*")), "");
  });
  it("seq", () => {
    succeed(seq(a => a, match("a")), "ab", "a");
    fail(seq(a => a, match("a"), end), "ab", 1);
  });
  it("skipSeq", () => {
    succeed(
      seq((_, a) => a, skipSeq(symbol("!"), symbol("?")), match("a")),
      "!?a",
      "a"
    );
    succeed(
      seq((_, a) => a, skipSeq(symbol("!"), symbol("?")), symbol("!")),
      "!a"
    );
  });
  it("oneOf", () => {
    succeed(oneOf(match("a"), match("b")), "a", "a");
    succeed(oneOf(match("a"), match("b")), "b", "b");
    fail(oneOf(match("a"), match("b")), "c");
    fail(oneOf(seq(a => a, match("a"), match("a")), match("ab")), "ab", 1);
  });
  it("attempt", () => {
    const atA = seq((_, a) => a, symbol("@"), match("a"));
    succeed(oneOf(attempt(atA), constant("z")), "@b", "z");
    fail(atA, "@b", 1);
    fail(oneOf(atA, constant("z")), "@b", 1);
  });
  it("lazy", () => {
    succeed(lazy(() => constant(1)), "", 1);
    const nums: Parser<number[]> = oneOf(
      map(end, _ => []),
      seq((h, t) => [h, ...t], int("[0-9]"), lazy(() => nums))
    );
    succeed(nums, "123", [1, 2, 3]);
    fail(
      lazy(() => {
        throw "";
      }),
      ""
    );
  });
  it("many", () => {
    succeed(many(int("[0-9]")), "123a", [1, 2, 3]);
    succeed(many(int("[0-9]")), "123", [1, 2, 3]);
    succeed(many(int("[0-9]")), "a1", []);
    succeed(many(int("[0-9]")), "", []);
    succeed(many(match(".*")), "foo", ["foo"]);
    succeed(many(attempt(seq(_ => 0, match("a"), match("b")))), "ac", []);
    fail(many(seq(_ => 0, match("a"), match("b"))), "ac", 1);
  });
  it("sepBy", () => {
    succeed(sepBy(symbol(","), int("[0-9]")), "", []);
    succeed(sepBy(symbol(","), int("[0-9]")), "1", [1]);
    succeed(sepBy(symbol(","), int("[0-9]")), "1,2", [1, 2]);
    fail(sepBy(symbol(","), int("[0-9]")), "1,a", 2);
    fail(sepBy(symbol(","), int("[0-9]")), "1,", 2);
    succeed(sepBy(skipSeq(symbol("!"), symbol("?")), int("[0-9]")), "1!2", [1]);
    succeed(sepBy(skipSeq(symbol("!"), symbol("?")), int("[0-9]")), "1!?2", [
      1,
      2
    ]);
    succeed(
      sepBy(seq(_ => {}, symbol("!"), symbol("?")), int("[0-9]")),
      "1!2",
      [1]
    );
    succeed(sepBy(skipSeq(symbol("!"), symbol("?")), int("[0-9]")), "1!?2", [
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
    fail(sepBy1(symbol(","), int("[0-9]")), "");
    succeed(sepBy1(symbol(","), int("[0-9]")), "1", [1]);
    succeed(sepBy1(symbol(","), int("[0-9]")), "1,2", [1, 2]);
    fail(sepBy1(symbol(","), int("[0-9]")), "1,a", 2);
    fail(sepBy1(symbol(","), int("[0-9]")), "1,", 2);
    succeed(sepBy1(skipSeq(symbol("!"), symbol("?")), int("[0-9]")), "1!2", [
      1
    ]);
    succeed(sepBy1(skipSeq(symbol("!"), symbol("?")), int("[0-9]")), "1!?2", [
      1,
      2
    ]);
    succeed(
      sepBy1(seq(_ => {}, symbol("!"), symbol("?")), int("[0-9]")),
      "1!2",
      [1]
    );
    succeed(sepBy1(skipSeq(symbol("!"), symbol("?")), int("[0-9]")), "1!?2", [
      1,
      2
    ]);
    fail(
      sepBy1(symbol(","), attempt(seq(_ => 0, match("a"), match("b")))),
      "ac",
      1
    );
    fail(sepBy1(symbol(","), seq(_ => 0, match("a"), match("b"))), "ac", 1);
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
  });
  it("mapKeyword", () => {
    succeed(mapKeyword("foo", 1), "foo", 1);
    fail(mapKeyword("foo", 1), " foo");
    fail(mapKeyword("foo", 1), "");
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
