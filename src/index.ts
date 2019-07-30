export type Position = {
  row: number;
  column: number;
};

export type Range = {
  start: Position;
  end: Position;
};

export class ParseError extends Error {
  private positions = new Map<number, Position>();
  constructor(private source: string, private error: Err) {
    super(error.message);
  }
  get offset(): number {
    return this.error.offset;
  }
  get position(): Position {
    return this.getPosition(this.offset);
  }
  private getPosition(offset: number): Position {
    if (!this.positions.has(offset)) {
      this.positions.set(offset, calcPosition(this.source, offset));
    }
    return this.positions.get(offset);
  }
  explain(): string {
    let text = "";
    const startPos = this.getPosition(this.error.scope.offset);
    const errorPos = this.position;
    const lines = this.source.split("\n").slice(startPos.row - 1, errorPos.row);
    text += `${this.message} (${errorPos.row}:${errorPos.column})\n`;
    function appendSubMessages(error: Err, indent: number): void {
      if (error instanceof OneOfErr) {
        for (const e of error.errors) {
          const contextString = "";
          text += `${" ".repeat(indent)}- ${e.message}${contextString}\n`;
          appendSubMessages(e, indent + 2);
        }
      }
    }
    appendSubMessages(this.error, 2);
    text += "\n";
    for (let r = startPos.row; r <= errorPos.row; r++) {
      const line = lines[r - startPos.row];
      text += `${String(r).padStart(5)}| ${line}\n`;
    }
    text += `${" ".repeat(6 + errorPos.column)}^\n`;
    text += "Context:\n";
    let scope = this.error.scope;
    while (scope && scope.name !== null) {
      const { row, column } = this.getPosition(scope.offset);
      text += `    at ${scope.name} (${row}:${column}) \n`;
      scope = scope.parent;
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
  public scope: Scope;
  public offset: number;
  constructor(context: Context, public message: string) {
    this.scope = context.scope;
    this.offset = context.offset;
  }
}

class OneOfErr extends Err {
  constructor(context: Context, message: string, public errors: Err[]) {
    super(context, message);
  }
}

class Scope {
  constructor(
    public offset: number,
    public name: string,
    public parent?: Scope
  ) {}
}

class Context {
  offset: number = 0;
  scope: Scope = new Scope(0, null);
}

export type Parser<A> = (source: string, context: Context) => A | Err;

export function run<A>(parser: Parser<A>, source: string): A {
  const context = new Context();
  const result = parser(source, context);
  if (result instanceof Err) {
    throw new ParseError(source, result);
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
    return new OneOfErr(
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
    context.scope = new Scope(context.offset, name, context.scope);
    const result = parser(source, context);
    context.scope = context.scope.parent;
    return result;
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
        // tail.unshift(head);
        // return tail;
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
        // tail.unshift(head);
        // return tail;
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
      // return [head, ...tail];
      tail.unshift(head);
      return tail;
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
  // return oneOf(
  //   seq(
  //     (head, tail) => {
  //       tail.unshift(head);
  //       return tail;
  //     },
  //     nextItem(separator, itemParser),
  //     lazy(() => sepUntilTail(end, separator, itemParser))
  //   ),
  //   map(end, _ => [])
  // );
  const itemParser2 = assertConsumed(itemParser);
  return (source, context) => {
    const items = [];
    while (true) {
      const result = separator(source, context);
      if (result instanceof Err) {
        const result = end(source, context);
        if (result instanceof Err) {
          return result;
        }
        break;
      }
      const result2 = itemParser2(source, context);
      if (result2 instanceof Err) {
        return result2;
      }
      items.push(result2);
    }
    return items;
  };
}

export function sepUntil1<A>(
  end: Parser<unknown>,
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return seq(
    (head, tail) => {
      tail.unshift(head);
      return tail;
    },
    itemParser,
    sepUntilTail(end, separator, itemParser)
  );
}

export function sepUntil<A>(
  end: Parser<unknown>,
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return oneOf(map(end, _ => []), sepUntil1(end, separator, itemParser));
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
    sepUntil(seq($null, _, symbol(end)), separator, itemParser)
  );
}
