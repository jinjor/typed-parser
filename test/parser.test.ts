import "jest";
import {
  seq,
  map,
  whitespace,
  keyword,
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
  skip,
  many,
  stringBefore,
  Position,
  Range,
  mapWithRange
} from "../src/index";
import * as util from "util";

const _ = whitespace;

function braced<A>(start: string, end: string, parser: Parser<A>): Parser<A> {
  return seq((_, __, value) => value, symbol(start), _, parser, _, symbol(end));
}

test("object", () => {
  class Person {
    constructor(public age: number, public name: string) {}
  }
  const person: Parser<Person> = braced(
    "{",
    "}",
    oneOf(
      map(int("[0-9]+"), age => new Person(age, "")),
      map(match("[a-zA-Z]+"), name => new Person(0, name))
    )
  );
  const all: Parser<Person> = seq((_, person) => person, _, person, _, end);
  const ast = run(all, " { hoge } ");
  console.log(util.inspect(ast, { colors: true, depth: 10 }));
});

test("array", () => {
  const p: Parser<number[]> = braced(
    "[",
    "]",
    sepBy(skipSeq(_, symbol(","), _), int("[0-9]+"))
  );
  const ast = run(p, "[ 1 , 2 , 3 ]");
  console.log(util.inspect(ast, { colors: true, depth: 10 }));
});

test("recursive", () => {
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

test("template", () => {
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
