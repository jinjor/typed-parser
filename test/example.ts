import {
  seq,
  map,
  end,
  match,
  symbol,
  oneOf,
  run,
  Parser,
  lazy,
  sepBy1,
  many,
  stringBefore,
  Range,
  mapWithRange,
  float,
  stringBeforeEndOr,
  constant,
  $1,
  $2,
  _,
  braced,
  withContext,
  ParseError,
  bracedSep,
  $null,
  keyword
} from "../src/index";
import * as util from "util";
import { readFileSync } from "fs";
import * as assert from "assert";

describe("Examples", function() {
  this.timeout(50000);
  it("template", () => {
    type Variable = { name: string[]; range: Range };
    type Item = string | Variable;
    const variableName: Parser<string[]> = sepBy1(symbol("."), match("[a-z]+"));
    const variable: Parser<Variable> = braced(
      "{{",
      "}}",
      mapWithRange((name, range) => ({ name, range }), variableName)
    );
    const template: Parser<Item[]> = seq(
      $1,
      many(oneOf<Item>(variable, stringBeforeEndOr("{{"))),
      end
    );
    const ast = run(template, "blabla {{ foo.bar.baz }} blabla...");
    console.log(util.inspect(ast, { colors: true, depth: 10 }));
  });

  it("JSON", () => {
    const num = float("-?(0|[1-9][0-9]*)(\\.[0-9]+)?");
    const bool = oneOf(keyword("true", true), keyword("false", false));
    const _null = keyword("null", null);
    const escape = seq(
      $2,
      symbol("\\"),
      oneOf(
        keyword('"', '"'),
        keyword("\\", "\\"),
        keyword("/", "/"),
        keyword("b", "\b"),
        keyword("f", "\f"),
        keyword("n", "\n"),
        keyword("r", "\r"),
        keyword("t", "\t")
      )
    );
    const strInner: Parser<string> = seq(
      (s, tail) => s + tail,
      stringBefore('[\\\\"]'),
      oneOf(seq((e, t) => e + t, escape, lazy(() => strInner)), constant(""))
    );
    const str = seq($2, symbol('"'), strInner, symbol('"'), _);
    const itemSep = seq($null, symbol(","), _);
    const fieldSep = seq($null, symbol(":"), _);
    const field = seq((k, _, v) => [k, v], str, fieldSep, lazy(() => val), _);
    function toObject(kvs: [string, unknown][]): object {
      const obj: any = {};
      for (let [k, v] of kvs) {
        obj[k] = v;
      }
      return obj;
    }
    const object = withContext(
      "object",
      map(toObject, bracedSep("{", "}", itemSep, field))
    );
    const array = withContext(
      "array",
      bracedSep("[", "]", itemSep, lazy(() => val))
    );
    const val: Parser<unknown> = withContext(
      "value",
      oneOf<unknown>(object, array, str, num, bool, _null)
    );
    const json = seq($2, _, val, _, end);

    compareTime(__dirname + "/../package.json");
    compareTime(__dirname + "/../package-lock.json");
    compareTime(__dirname + "/1k.json");

    try {
      const source = readFileSync(__dirname + "/broken.json", "utf8");
      run(json, source);
    } catch (e) {
      console.log((e as ParseError).explain());
      console.log();
    }

    function measureTime(count: number, f: () => void): number {
      const start = Date.now();
      for (let i = 0; i < count; i++) {
        f();
      }
      return Date.now() - start;
    }
    function measureOps(f: () => void): number {
      const start = Date.now();
      let ops = 0;
      while (Date.now() - start < 1000) {
        f();
        ops++;
      }
      return ops;
    }
    function compareTime(file: string) {
      const count = 1000;
      console.log(`comparing ${file} ...`);
      const source = readFileSync(file, "utf8");
      let value1;
      let value2;
      const time1 = measureTime(count, () => {
        value1 = run(json, source);
      });
      const time2 = measureTime(count, () => {
        value2 = JSON.parse(source);
      });
      console.log(`  typed-parser: ${time1 / count}ms`);
      console.log(`  native parser: ${time2 / count}ms`);
      assert.deepEqual(value2, value1);
      console.log();
    }
    function compareOps(file: string) {
      console.log(`comparing ${file} ...`);
      const source = readFileSync(file, "utf8");
      let value1;
      let value2;
      const ops1 = measureOps(() => {
        value1 = run(json, source);
      });
      const ops2 = measureOps(() => {
        value2 = JSON.parse(source);
      });
      console.log(`  typed-parser: ${ops1}ops/s`);
      console.log(`  native parser: ${ops2}ops/s`);
      assert.deepEqual(value2, value1);
      console.log();
    }
  });
});
