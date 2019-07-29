export type Position = {
  row: number;
  column: number;
};

export type Range = {
  start: Position;
  end: Position;
};

export class ParseError extends Error {
  private _position: Position;
  constructor(message: string, private source: string, private error: Err) {
    super(message);
  }
  get offset(): number {
    return this.error.context.offset;
  }
  get position(): Position {
    if (!this._position) {
      this._position = calcPosition(this.source, this.offset);
    }
    return this._position;
  }
  explain(): void {
    let contexts = [this.error.context];
    while (contexts[0].parent) {
      contexts.unshift(contexts[0].parent);
    }
    const startPos = calcPosition(
      this.source,
      this.error.context.initialOffset
    );
    const errorPos = calcPosition(this.source, this.error.context.offset);
    const lines = this.source.split("\n").slice(startPos.row - 1, errorPos.row);
    console.log(`${this.message} (${errorPos.row}:${errorPos.column})`);
    console.log();
    for (let r = startPos.row; r <= errorPos.row; r++) {
      const line = lines[r - startPos.row];
      console.log(`${String(r).padStart(5)}| ${line}`);
    }
    console.log(`${" ".repeat(6 + errorPos.column)}^`);
    console.log();
    const namedContexts = contexts.filter(c => c.name);
    if (namedContexts.length) {
      console.log("Context:");
      for (let i = namedContexts.length - 1; i >= 0; i--) {
        const context = namedContexts[i];
        if (!context.name) {
          continue;
        }
        const { row, column } = calcPosition(
          this.source,
          context.initialOffset
        );
        console.log(`    at ${context.name} (${row}:${column}) `);
      }
    }
  }
}

function calcPosition(source: string, offset: number): Position {
  const sub = source.slice(0, offset + 1);
  const lines = sub.split("\n");
  const row = lines.length;
  const column = lines[lines.length - 1].length;
  return { row, column };
}

class Err {
  constructor(public context: Context, public message: string) {}
}

class OneOfError extends Err {
  constructor(context: Context, message: string, public errors: Err[]) {
    super(context, message);
  }
}

export interface Context {
  initialOffset: number;
  offset: number;
  name: string;
  parent: Context;
  consume(amount: number): void;
}

class TopContext implements Context {
  parent: Context = null;
  initialOffset: number = 0;
  offset: number = 0;
  name: string = null;
  consume(amount: number): void {
    this.offset += amount;
  }
}

class ChildContext implements Context {
  initialOffset: number;
  constructor(public parent: Context, public name: string) {
    this.initialOffset = parent.offset;
  }
  get offset(): number {
    return this.parent.offset;
  }
  set offset(offset: number) {
    this.parent.offset = offset;
  }
  consume(amount: number): void {
    this.parent.consume(amount);
  }
}

class ProtevtiveContext implements Context {
  initialOffset: number;
  offset: number;
  name: string = null;
  constructor(public parent: Context) {
    this.initialOffset = parent.offset;
    this.offset = parent.offset;
  }
  commit(): void {
    this.parent.offset = this.offset;
  }
  consume(amount: number): void {
    this.offset += amount;
  }
}

export type Parser<A> = (source: string, context: Context) => A | Err;

export function run<A>(parser: Parser<A>, source: string): A {
  const context = new TopContext();
  let result: A | Err;
  try {
    result = parser(source, context);
  } catch (e) {
    result = new Err(context, e.message);
  }
  if (result instanceof Err) {
    const message = result.message;
    throw new ParseError(message, source, result);
  }
  return result;
}

export function seq<A extends Array<any>, B>(
  map: (...args: { [I in keyof A]: A[I] }) => B,
  ...parsers: { [I in keyof A]: Parser<A[I]> }
): Parser<B> {
  return (source, context) => {
    const values: any = [];
    for (let i = 0; i < parsers.length; i++) {
      const parser = parsers[i];
      const result = parser(source, context);
      if (result instanceof Err) {
        return result;
      }
      values[i] = result;
    }
    return map(...values);
  };
}

export function $1<A>(a: A): A {
  return a;
}

export function $2<A>(_1: any, a: A): A {
  return a;
}

export function $3<A>(_1: any, _2: any, a: A): A {
  return a;
}

export function skipSeq(...parsers: Parser<unknown>[]): Parser<null> {
  return oneOf(attempt(seq(() => null, ...parsers)), noop);
}

export function map<A, B>(
  parser: Parser<A>,
  f: (a: A, toError: (message: string) => Err) => B | Err
): Parser<B> {
  return (source, context) => {
    const childContext = new ProtevtiveContext(context);
    const result = parser(source, childContext);
    if (result instanceof Err) {
      return result;
    }
    let result2;
    try {
      result2 = f(result, function toError(message) {
        return new Err(context, message);
      });
    } catch (e) {
      result2 = new Err(context, e.message);
    }
    if (result2 instanceof Err) {
      return result2;
    }
    childContext.commit();
    return result2;
  };
}

export function mapWithRange<A, B>(
  parser: Parser<A>,
  f: (value: A, range: Range, toError: (message: string) => Err) => B
): Parser<B> {
  return (source, context) => {
    const childContext = new ProtevtiveContext(context);
    const start = calcPosition(source, childContext.offset);
    const result = parser(source, childContext);
    if (result instanceof Err) {
      return result;
    }
    const end = calcPosition(source, childContext.offset - 1);
    let result2;
    try {
      result2 = f(result, { start, end }, function toError(message) {
        return new Err(context, message);
      });
    } catch (e) {
      result2 = new Err(context, e.message);
    }
    if (result2 instanceof Err) {
      return result2;
    }
    childContext.commit();
    return result2;
  };
}

export const end: Parser<null> = (source, context) => {
  if (source.length !== context.offset) {
    return new Err(context, `Not the end of source`);
  }
  return null;
};

export function oneOf<A>(...parsers: Parser<A>[]): Parser<A> {
  return (source, context) => {
    const errors = [];
    for (const parser of parsers) {
      const originalOffset = context.offset;
      const result = parser(source, context);
      if (!(result instanceof Err)) {
        return result;
      }
      if (originalOffset === context.offset) {
        errors.push(result);
      } else {
        return result;
      }
    }
    return new OneOfError(
      context,
      `Did not match any of ${parsers.length} parsers`,
      errors
    );
  };
}

export function attempt<A>(parser: Parser<A>): Parser<A> {
  return (source, context) => {
    const childContext = new ProtevtiveContext(context);
    const result = parser(source, childContext);
    if (result instanceof Err) {
      return result;
    }
    childContext.commit();
    return result;
  };
}

export function withContext<A>(name: string, parser: Parser<A>): Parser<A> {
  return (source, context) => {
    const childContext = new ChildContext(context, name);
    return parser(source, childContext);
  };
}

export function lazy<A>(getParser: () => Parser<A>): Parser<A> {
  return (source, context) => {
    let parser = getParser();
    if (!parser) {
      throw new Error("Could not get parser");
    }
    return parser(source, context);
  };
}

export function match(regexString: string): Parser<string> {
  const regexp = new RegExp(regexString, "smy");
  return (source, context) => {
    regexp.lastIndex = context.offset;
    const result = regexp.exec(source);
    if (result) {
      const s = result[0];
      context.consume(s.length);
      return s;
    } else {
      return new Err(context, `Did not match "${regexString}"`);
    }
  };
}

export function skip(regexString: string): Parser<null> {
  const regexp = new RegExp(regexString, "smy");
  return (source, context) => {
    regexp.lastIndex = context.offset;
    if (regexp.test(source)) {
      context.offset = regexp.lastIndex;
    }
    return null;
  };
}

export function expectString(s: string, name = "string"): Parser<null> {
  return (source, context) => {
    if (source.startsWith(s, context.offset)) {
      context.consume(s.length);
      return null;
    } else {
      return new Err(context, `Could not find ${name} "${s}"`);
    }
  };
}

export function stringBefore(regexString: string): Parser<string> {
  const regexp = new RegExp(regexString, "g");
  return (source, context) => {
    regexp.lastIndex = context.offset;
    const result = regexp.exec(source);
    if (!result) {
      return new Err(context, `Did not match "${regexString}"`);
    }
    const s = source.slice(context.offset, result.index);
    context.consume(s.length);
    return s;
  };
}
export function stringUntil(regexString: string): Parser<string> {
  const regexp = new RegExp(regexString, "g");
  return (source, context) => {
    regexp.lastIndex = context.offset;
    const result = regexp.exec(source);
    if (!result) {
      return new Err(context, `Did not match "${regexString}"`);
    }
    const s = source.slice(context.offset, result.index);
    context.consume(s.length + result[0].length);
    return s;
  };
}
export function stringBeforeEndOr(regexString: string): Parser<string> {
  const regexp = new RegExp(regexString, "g");
  return (source, context) => {
    regexp.lastIndex = context.offset;
    const result = regexp.exec(source);
    let index;
    if (result) {
      index = result.index;
    } else {
      index = source.length;
    }
    const s = source.slice(context.offset, index);
    context.consume(s.length);
    return s;
  };
}

export const noop: Parser<null> = (source: string, context: Context) => null;

export function constant<T>(t: T): Parser<T> {
  return () => t;
}

export function todo<A>(name: string): Parser<A> {
  throw new Error(`Parser "${name}" is not implemented yet.`);
}

export function assertConsumed<A>(parser: Parser<A>): Parser<A> {
  return (source, context) => {
    const originalOffset = context.offset;
    const result = parser(source, context);
    if (result instanceof Err) {
      return result;
    }
    if (context.offset === originalOffset) {
      return new Err(context, "No string consumed");
    }
    return result;
  };
}

export function many<A>(itemParser: Parser<A>): Parser<A[]> {
  return oneOf(
    seq(
      (head, tail) => {
        return [head, ...tail];
      },
      assertConsumed(itemParser),
      lazy(() => many(itemParser))
    ),
    constant([])
  );
}

function nextItem<A>(
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A> {
  return seq($2, attempt(separator), itemParser);
}

export function sepBy<A>(
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return oneOf(
    seq(
      (head, tail) => {
        return [head, ...tail];
      },
      itemParser,
      many(nextItem(separator, itemParser))
    ),
    constant([])
  );
}

export function sepBy1<A>(
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return seq(
    (head, tail) => {
      return [head, ...tail];
    },
    itemParser,
    many(nextItem(separator, itemParser))
  );
}

export function symbol(s: string): Parser<null> {
  return expectString(s, "symbol");
}

export function keyword(s: string): Parser<null> {
  return expectString(s, "keyword");
}

export function mapKeyword<A>(s: string, value: A): Parser<A> {
  return map(expectString(s, "keyword"), _ => value);
}

export function int(regexString: string): Parser<number> {
  return map(match(regexString), (s, toError) => {
    const n = parseInt(s);
    if (isNaN(n)) {
      return toError(`${s} is not an integer`);
    }
    return n;
  });
}

export function float(regexString: string): Parser<number> {
  return map(match(regexString), (s, toError) => {
    const n = parseFloat(s);
    if (isNaN(n)) {
      return toError(`${s} is not a float`);
    }
    return n;
  });
}

export const whitespace = skip("\\s*");

export const _ = whitespace;

export function braced<A>(
  start: string,
  end: string,
  parser: Parser<A>
): Parser<A> {
  return seq((_, __, value) => value, symbol(start), _, parser, _, symbol(end));
}
