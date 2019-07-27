import {
  seq,
  map,
  whitespace,
  end,
  match,
  int,
  symbol,
  oneOf,
  run,
  Parser,
  sepBy,
  skipSeq,
  lazy,
  sepBy1,
  many,
  stringBefore,
  Range,
  mapWithRange,
  float,
  keyword
} from "../src/index";
import * as util from "util";
import { readFileSync } from "fs";
import * as assert from "assert";

const _ = whitespace;

function braced<A>(start: string, end: string, parser: Parser<A>): Parser<A> {
  return seq((_, __, value) => value, symbol(start), _, parser, _, symbol(end));
}

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
      all => all,
      many(oneOf<Item>(variable, stringBefore("{{"))),
      end
    );
    const ast = run(template, " hogehoge {{ aa.bb }} hoge hoge ");
    console.log(util.inspect(ast, { colors: true, depth: 10 }));
  });

  it("JSON", () => {
    const num = float("-?(0|[1-9][0-9]*)(\\.[0-9]+)?");
    const boolValue = (s: string, b: boolean) => map(keyword(s), _ => b);
    const bool = oneOf(boolValue("true", true), boolValue("false", false));
    // TODO: escape
    const str = seq((_, s) => s, symbol('"'), stringBefore('"'), symbol('"'));
    const itemSep = skipSeq(_, symbol(","), _);
    const fieldSep = skipSeq(_, symbol(":"), _);
    const field = seq((k, _, v) => [k, v], str, fieldSep, lazy(() => val));
    function toObject(kvs: [string, unknown][]): object {
      return kvs.reduce((o, [k, v]) => ({ ...o, [k]: v }), {});
    }
    const object = braced("{", "}", map(sepBy(itemSep, field), toObject));
    const array = braced("[", "]", sepBy(itemSep, lazy(() => val)));
    const val: Parser<unknown> = oneOf<unknown>(object, array, num, bool, str);
    const json = seq((_, v) => v, _, val, _, end);

    const source = readFileSync(__dirname + "/../package.json", "utf8");
    const ast = run(json, source);
    console.log(util.inspect(ast, { colors: true, depth: 10 }));

    assert.deepEqual(JSON.parse(source), ast);
  });
});
