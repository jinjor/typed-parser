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
  mapWithRange
} from "../src/index";
import * as util from "util";

const _ = whitespace;

function braced<A>(start: string, end: string, parser: Parser<A>): Parser<A> {
  return seq((_, __, value) => value, symbol(start), _, parser, _, symbol(end));
}

describe("Example", () => {
  it("array", () => {
    type Item = number | { items: Item[] };
    const item: Parser<Item> = oneOf(
      int("[0-9]+"),
      lazy(() => map<Item[], Item>(nestedNumbers, items => ({ items })))
    );
    const nestedNumbers: Parser<Item[]> = braced(
      "[",
      "]",
      sepBy(skipSeq(_, symbol(","), _), item)
    );
    const ast = run(nestedNumbers, "[ 1 , [ 1 , 2 ,  [ ] ] , 3 ]");
    console.log(util.inspect(ast, { colors: true, depth: 10 }));
  });

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
});
