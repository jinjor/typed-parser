class Err {
  public offset: number;
  public position: Position;
  constructor(public source: string, context: Context, public message: string) {
    this.offset = context.offset;
    this.position = calcPosition(source, context.offset);
  }
}

function calcPosition(source: string, offset: number): Position {
  const sub = source.slice(0, offset + 1);
  const lines = sub.split("\n");
  const row = lines.length;
  const column = lines[lines.length - 1].length;
  return { row, column };
}

export type Position = {
  row: number;
  column: number;
};

export type Range = {
  start: Position;
  end: Position;
};

class OneOfError extends Err {
  constructor(
    source: string,
    context: Context,
    message: string,
    public errors: Err[]
  ) {
    super(source, context, message);
  }
}

export class ParseError extends Error {
  constructor(public error: Err) {
    super(error.message + "\n" + JSON.stringify(error, null, 2));
  }
}

export class Context {
  public error: Err = null;
  constructor(public offset = 0) {}
  consume(amount: number): void {
    this.offset += amount;
  }
}

class ChildContext extends Context {
  constructor(private parent: Context) {
    super(parent.offset);
  }
  commit(): void {
    this.parent.offset = this.offset;
  }
}

export type Parser<A> = (source: string, context: Context) => A;

export function run<A>(parser: Parser<A>, source: string): A {
  try {
    const context = new Context();
    const value = parser(source, context);
    if (context.error) {
      throw new ParseError(context.error);
    }
    return value;
  } catch (e) {
    throw new ParseError(e);
  }
}

export function seq<A extends Array<any>, B>(
  map: (...args: { [I in keyof A]: A[I] }) => B,
  ...parsers: { [I in keyof A]: Parser<A[I]> }
): Parser<B> {
  return (source, context) => {
    const values: any = [];
    for (let i = 0; i < parsers.length; i++) {
      const parser = parsers[i];
      const value = parser(source, context);
      if (context.error) {
        return null;
      }
      values[i] = value;
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

export function skipSeq(...parsers: Parser<unknown>[]): Parser<void> {
  return oneOf(attempt(seq(() => {}, ...parsers)), noop);
}

export function map<A, B>(
  p: Parser<A>,
  f: (
    a: A,
    fail: (message: string) => never,
    source: string,
    context: Context
  ) => B
): Parser<B> {
  return (source, context) => {
    const childContext = new ChildContext(context);
    const a = p(source, childContext);
    if (childContext.error) {
      context.error = childContext.error;
      return null;
    }
    try {
      const value = f(
        a,
        message => {
          throw new Err(source, context, message);
        },
        source,
        context
      );
      childContext.commit();
      return value;
    } catch (e) {
      if (e instanceof Err) {
        throw e;
      } else {
        throw new Err(source, context, e.message);
      }
    }
  };
}

export function mapWithRange<A, B>(
  parser: Parser<A>,
  f: (value: A, range: Range, fail: (message: string) => never) => B
): Parser<B> {
  return (source, context) => {
    const childContext = new ChildContext(context);
    const start = calcPosition(source, childContext.offset);
    const a = parser(source, childContext);
    if (childContext.error) {
      context.error = childContext.error;
      return null;
    }
    const end = calcPosition(source, childContext.offset - 1);
    try {
      const value = f(a, { start, end }, message => {
        throw new Err(source, context, message);
      });
      childContext.commit();
      return value;
    } catch (e) {
      if (e instanceof Err) {
        throw e;
      } else {
        throw new Err(source, context, e.message);
      }
    }
  };
}

export const end: Parser<void> = (source, context) => {
  if (source.length !== context.offset) {
    throw new Err(source, context, `Not the end of source`);
  }
};

export function oneOf<A>(...parsers: Parser<A>[]): Parser<A> {
  return (source, context) => {
    const errors = [];
    for (const p of parsers) {
      const originalOffset = context.offset;
      try {
        const value = p(source, context);
        if (!context.error) {
          return value;
        }
        if (originalOffset === context.offset) {
          errors.push(context.error);
          context.error = null;
        } else {
          return null;
        }
      } catch (e) {
        if (e instanceof Err && originalOffset === context.offset) {
          errors.push(e);
        } else {
          throw e;
        }
      }
    }
    context.error = new OneOfError(
      source,
      context,
      `Did not match any of ${parsers.length} parsers`,
      errors
    );
    return null;
    // throw new OneOfError(
    //   source,
    //   context,
    //   `Did not match any of ${parsers.length} parsers`,
    //   errors
    // );
  };
}

export function attempt<A>(parser: Parser<A>): Parser<A> {
  return (source, context) => {
    const childContext = new ChildContext(context);
    const a = parser(source, childContext);
    if (childContext.error) {
      context.error = childContext.error;
      return null;
    }
    childContext.commit();
    return a;
  };
}

export function lazy<A>(getParser: () => Parser<A>): Parser<A> {
  return (source, context) => {
    let parser;
    try {
      parser = getParser();
    } catch (e) {
      throw new Err(source, context, e.message);
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
      context.error = new Err(
        source,
        context,
        `Did not match "${regexString}"`
      );
      return null;
      // throw new Err(source, context, `Did not match "${regexString}"`);
    }
  };
}

export function skip(regexString: string): Parser<void> {
  const regexp = new RegExp(regexString, "smy");
  return (source, context) => {
    regexp.lastIndex = context.offset;
    const result = regexp.exec(source);
    if (result) {
      const s = result[0];
      context.consume(s.length);
    }
  };
}

export function expectString(s: string, name = "string"): Parser<void> {
  return (source, context) => {
    if (source.startsWith(s, context.offset)) {
      context.consume(s.length);
    } else {
      context.error = new Err(source, context, `Could not find ${name} "${s}"`);
      // throw new Err(source, context, `Could not find ${name} "${s}"`);
    }
  };
}

export function stringBefore(regexString: string): Parser<string> {
  const regexp = new RegExp(regexString, "g");
  return (source, context) => {
    regexp.lastIndex = context.offset;
    const result = regexp.exec(source);
    if (!result) {
      context.error = new Err(
        source,
        context,
        `Did not match "${regexString}"`
      );
      return null;
      // throw new Err(source, context, `Did not match "${regexString}"`);
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
      context.error = new Err(
        source,
        context,
        `Did not match "${regexString}"`
      );
      return null;
      // throw new Err(source, context, `Did not match "${regexString}"`);
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

export const noop: Parser<void> = _ => {};

export function constant<T>(t: T): Parser<T> {
  return () => t;
}

export function todo<A>(name: string): Parser<A> {
  throw new Error(`Parser "${name}" is not implemented yet.`);
}

export function assertConsumed<A>(parser: Parser<A>): Parser<A> {
  return (source, context) => {
    const originalOffset = context.offset;
    const a = parser(source, context);
    if (context.error) {
      return null;
    }
    if (context.offset === originalOffset) {
      context.error = new Err(source, context, "No string consumed");
      return null;
      // throw new Err(source, context, "No string consumed");
    }
    return a;
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

export function symbol(s: string): Parser<void> {
  return expectString(s, "symbol");
}

export function keyword(s: string): Parser<void> {
  return expectString(s, "keyword");
}

export function mapKeyword<A>(s: string, value: A): Parser<A> {
  return map(expectString(s, "keyword"), _ => value);
}

export function int(regexString: string): Parser<number> {
  return map(match(regexString), (s, fail, source, context) => {
    const n = parseInt(s);
    if (isNaN(n)) {
      context.error = new Err(source, context, `${s} is not an integer`);
      return null;
      // fail(`${s} is not an integer`);
    }
    return n;
  });
}

export function float(regexString: string): Parser<number> {
  return map(match(regexString), (s, fail, source, context) => {
    const n = parseFloat(s);
    if (isNaN(n)) {
      context.error = new Err(source, context, `${s} is not a float`);
      return null;
      // fail(`${s} is not a float`);
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
