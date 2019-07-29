import {
  seq,
  map,
  end,
  match,
  symbol,
  oneOf,
  run,
  Parser,
  sepBy,
  lazy,
  sepBy1,
  many,
  stringBefore,
  Range,
  mapWithRange,
  float,
  stringBeforeEndOr,
  constant,
  mapKeyword,
  $1,
  $2,
  _,
  braced,
  withContext,
  ParseError
} from "../src/index";
import * as util from "util";
import { readFileSync } from "fs";
import * as assert from "assert";

describe("Examples", () => {
  it("template", () => {
    type Variable = { name: string[]; range: Range };
    type Item = string | Variable;
    const variableName: Parser<string[]> = sepBy1(symbol("."), match("[a-z]+"));
    const variable: Parser<Variable> = braced(
      "{{",
      "}}",
      mapWithRange(variableName, (name, range) => ({ name, range }))
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
    const bool = oneOf(mapKeyword("true", true), mapKeyword("false", false));
    const escape = seq(
      $2,
      symbol("\\"),
      oneOf(
        mapKeyword('"', '"'),
        mapKeyword("\\", "\\"),
        mapKeyword("/", "/"),
        mapKeyword("b", "\b"),
        mapKeyword("f", "\f"),
        mapKeyword("n", "\n"),
        mapKeyword("r", "\r"),
        mapKeyword("t", "\t")
      )
    );
    const strInner: Parser<string> = seq(
      (s, tail) => s + tail,
      stringBefore('[\\\\"]'),
      oneOf(seq((e, t) => e + t, escape, lazy(() => strInner)), constant(""))
    );
    const str = seq($2, symbol('"'), strInner, symbol('"'), _);
    const itemSep = seq(_ => null, symbol(","), _);
    const fieldSep = seq(_ => null, symbol(":"), _);
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
      braced("{", "}", map(sepBy(itemSep, field), toObject))
    );
    const items = sepBy(itemSep, seq($1, lazy(() => val), _));
    const array = withContext("array", braced("[", "]", items));
    const val: Parser<unknown> = oneOf<unknown>(object, array, str, num, bool);
    const json = seq($2, _, val, _, end);

    compareJSON(__dirname + "/../package.json");
    compareJSON(__dirname + "/../package-lock.json");

    function compareJSON(file: string) {
      console.log(`comparing ${file} ...`);
      const source = readFileSync(file, "utf8");
      const s1 = Date.now();
      const ast = run(json, source);
      const e1 = Date.now();
      const s2 = Date.now();
      const ast2 = JSON.parse(source);
      const e2 = Date.now();
      console.log(`  typed-parser: ${e1 - s1}ms`);
      console.log(`  native parser: ${e2 - s2}ms`);
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
