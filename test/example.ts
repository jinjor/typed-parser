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
import { json_sample1k } from "./json1k";

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

    compareJSON(__dirname + "/../package.json");
    compareJSON(__dirname + "/../package-lock.json");
    compareJSON("1k sample", json_sample1k);

    function compareJSON(file: string, source?: string) {
      const count = 1000;
      console.log(`comparing ${file} ...`);
      source = source || readFileSync(file, "utf8");
      let ast;
      let ast2;
      const s1 = Date.now();
      for (let i = 0; i < count; i++) {
        ast = run(json, source);
      }
      const e1 = Date.now();
      const s2 = Date.now();
      for (let i = 0; i < count; i++) {
        ast2 = JSON.parse(source);
      }
      const e2 = Date.now();
      console.log(`  typed-parser: ${(e1 - s1) / count}ms`);
      console.log(`  native parser: ${(e2 - s2) / count}ms`);
      assert.deepEqual(ast2, ast);
      console.log();
    }
    function compareJSON2(file: string, source?: string) {
      console.log(`comparing ${file} ...`);
      source = source || readFileSync(file, "utf8");
      let ast;
      let ast2;
      const s1 = Date.now();
      let op1 = 0;
      while (Date.now() - s1 < 1000) {
        ast = run(json, source);
        op1++;
      }
      const s2 = Date.now();
      let op2 = 0;
      while (Date.now() - s2 < 1000) {
        ast2 = JSON.parse(source);
        op2++;
      }
      console.log(`  typed-parser: ${op1}ops/s`);
      console.log(`  native parser: ${op2}ops/s`);
      assert.deepEqual(ast2, ast);
      console.log();
    }
    try {
      const source = readFileSync(__dirname + "/broken.json", "utf8");
      run(json, source);
    } catch (e) {
      console.log((e as ParseError).explain());
      console.log();
    }
  });
});
