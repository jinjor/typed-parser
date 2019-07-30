export type Position = {
  row: number;
  column: number;
};

export type Range = {
  start: Position;
  end: Position;
};

export class ParseError extends Error {
  private positions = new WeakMap<Context, Position>();
  private initialPositions = new WeakMap<Context, Position>();
  constructor(message: string, private source: string, private error: Err) {
    super(message);
  }
  get offset(): number {
    return this.error.context.offset;
  }
  get position(): Position {
    return this.getPosition(this.error.context);
  }
  private getPosition(context: Context): Position {
    if (!this.positions.has(context)) {
      this.positions.set(context, calcPosition(this.source, context.offset));
    }
    return this.positions.get(context);
  }
  private getInitialPosition(context: Context): Position {
    if (!this.initialPositions.has(context)) {
      this.initialPositions.set(
        context,
        calcPosition(this.source, context.initialOffset)
      );
    }
    return this.initialPositions.get(context);
  }
  explain(): string {
    let text = "";
    const startPos = this.getInitialPosition(this.error.context);
    const errorPos = this.position;
    const lines = this.source.split("\n").slice(startPos.row - 1, errorPos.row);
    text += `${this.message} (${errorPos.row}:${errorPos.column})\n`;
    if (this.error instanceof OneOfError) {
      for (const e of this.error.errors) {
        text += `  - ${e.message}\n`;
      }
    }
    text += "\n";
    for (let r = startPos.row; r <= errorPos.row; r++) {
      const line = lines[r - startPos.row];
      text += `${String(r).padStart(5)}| ${line}\n`;
    }
    text += `${" ".repeat(6 + errorPos.column)}^\n`;
    let context = this.error.context;
    const stack = [];
    while (context) {
      if (context.name) {
        const { row, column } = this.getInitialPosition(context);
        stack.push(`    at ${context.name} (${row}:${column}) `);
      }
      context = context.parent;
    }
    if (stack.length) {
      text += "\n";
      text += "Context:\n";
      for (const s of stack) {
        text += `${s}\n`;
      }
    }
    return text;
  }
}

export function calcPosition(source: string, offset: number): Position {
  const sub = (source + " ").slice(0, offset + 1);
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
}

class TopContext implements Context {
  parent: Context = null;
  initialOffset: number = 0;
  offset: number = 0;
  name: string = null;
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
}

export type Parser<A> = (source: string, context: Context) => A | Err;

export function run<A>(parser: Parser<A>, source: string): A {
  const context = new TopContext();
  const result = parser(source, context);
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

export function $null(..._: unknown[]): null {
  return null;
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

export function map<A, B>(
  parser: Parser<A>,
  f: (a: A, toError: (message: string) => Err) => B | Err
): Parser<B> {
  return (source, context) => {
    const originalOffset = context.offset;
    const result = parser(source, context);
    if (result instanceof Err) {
      return result;
    }
    const result2 = f(result, function toError(message) {
      context.offset = originalOffset;
      return new Err(context, message);
    });
    if (result2 instanceof Err) {
      return result2;
    }
    return result2;
  };
}

export function mapWithRange<A, B>(
  parser: Parser<A>,
  f: (value: A, range: Range, toError: (message: string) => Err) => B
): Parser<B> {
  return (source, context) => {
    const originalOffset = context.offset;
    const start = calcPosition(source, context.offset);
    const result = parser(source, context);
    if (result instanceof Err) {
      return result;
    }
    const end = calcPosition(source, context.offset - 1);
    const result2 = f(result, { start, end }, function toError(message) {
      context.offset = originalOffset;
      return new Err(context, message);
    });
    if (result2 instanceof Err) {
      return result2;
    }
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
    const originalOffset = context.offset;
    for (const parser of parsers) {
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
      `None of ${parsers.length} parsers was successful`,
      errors
    );
  };
}

export function attempt<A>(parser: Parser<A>): Parser<A> {
  return (source, context) => {
    const originalOffset = context.offset;
    const result = parser(source, context);
    if (result instanceof Err) {
      context.offset = originalOffset;
      return result;
    }
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
      context.offset += s.length;
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
      context.offset += s.length;
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
    context.offset += s.length;
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
    context.offset += s.length + result[0].length;
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
    context.offset += s.length;
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

function sepUntilTail<A>(
  end: Parser<unknown>,
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return seq($1, many(nextItem(separator, itemParser)), map(end, _ => []));
}

export function sepUntil<A>(
  end: Parser<unknown>,
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return oneOf(
    map(end, _ => []),
    seq(
      (head, tail) => {
        return [head, ...tail];
      },
      itemParser,
      sepUntilTail(end, separator, itemParser)
    )
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
  return seq($3, symbol(start), _, parser, _, symbol(end));
}

export function bracedSep<A>(
  start: string,
  end: string,
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return seq(
    $3,
    symbol(start),
    _,
    sepUntil(symbol(end), separator, itemParser)
  );
}
