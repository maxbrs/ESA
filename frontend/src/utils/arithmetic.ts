/**
 * Minimal, self-contained arithmetic expression parser.
 * Supports: + − * / ( )  and unary minus.
 * No external dependencies — cannot execute arbitrary code.
 *
 * Grammar (operator precedence via layered rules):
 *   expr   → term   (('+' | '−') term)*
 *   term   → factor (('*' | '/') factor)*
 *   factor → '-' factor | '+' factor | '(' expr ')' | number
 *   number → digit+ ('.' digit+)?
 */

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op';  ch: string }
  | { kind: 'eof' }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (/\s/.test(ch)) { i++; continue }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i
      while (j < input.length && /[0-9.]/.test(input[j])) j++
      const raw = input.slice(i, j)
      const n = parseFloat(raw)
      if (isNaN(n)) throw new Error(`Invalid number: ${raw}`)
      tokens.push({ kind: 'num', value: n })
      i = j
      continue
    }

    if ('+-*/()'.includes(ch)) {
      tokens.push({ kind: 'op', ch })
      i++
      continue
    }

    throw new Error(`Unexpected character: "${ch}"`)
  }
  tokens.push({ kind: 'eof' })
  return tokens
}

// Mutable position cursor passed by reference throughout the parse.
type Pos = { i: number }

function peek(tokens: Token[], pos: Pos): Token { return tokens[pos.i] }
function consume(tokens: Token[], pos: Pos): Token { return tokens[pos.i++] }

function parseExpr(tokens: Token[], pos: Pos): number {
  let left = parseTerm(tokens, pos)
  for (;;) {
    const t = peek(tokens, pos)
    if (t.kind !== 'op' || (t.ch !== '+' && t.ch !== '-')) break
    consume(tokens, pos)
    const right = parseTerm(tokens, pos)
    left = t.ch === '+' ? left + right : left - right
  }
  return left
}

function parseTerm(tokens: Token[], pos: Pos): number {
  let left = parseFactor(tokens, pos)
  for (;;) {
    const t = peek(tokens, pos)
    if (t.kind !== 'op' || (t.ch !== '*' && t.ch !== '/')) break
    consume(tokens, pos)
    const right = parseFactor(tokens, pos)
    left = t.ch === '*' ? left * right : left / right
  }
  return left
}

function parseFactor(tokens: Token[], pos: Pos): number {
  const t = peek(tokens, pos)

  // Unary minus / plus
  if (t.kind === 'op' && (t.ch === '-' || t.ch === '+')) {
    consume(tokens, pos)
    const val = parseFactor(tokens, pos)
    return t.ch === '-' ? -val : val
  }

  // Parenthesised sub-expression
  if (t.kind === 'op' && t.ch === '(') {
    consume(tokens, pos)
    const val = parseExpr(tokens, pos)
    const closing = peek(tokens, pos)
    if (closing.kind !== 'op' || closing.ch !== ')')
      throw new Error('Missing closing parenthesis')
    consume(tokens, pos)
    return val
  }

  // Number literal
  if (t.kind === 'num') {
    consume(tokens, pos)
    return t.value
  }

  throw new Error(`Unexpected token at position ${pos.i}`)
}

/**
 * Normalise an expression string so it can be parsed regardless of how the
 * number was formatted (e.g. copy-pasted from the app's nb-NO locale output).
 *
 * Handles:
 *   • Unicode minus sign  −  (U+2212)  → ASCII  -
 *   • nb-NO thousands separators: regular space, narrow no-break (U+202F),
 *     and no-break space (U+00A0) between digits  → removed
 *   • nb-NO decimal comma  ,  between digits  → ASCII dot  .
 */
function normalizeExpr(raw: string): string {
  return raw
    .replace(/\u2212/g, '-')                           // Unicode minus → ASCII minus
    .replace(/(\d)[\u0020\u00A0\u202F]+(\d)/g, '$1$2') // thousands-sep spaces → gone
    .replace(/(\d),(\d)/g, '$1.$2')                    // decimal comma → dot
}

/**
 * Evaluate a plain arithmetic string. Throws on any syntax error.
 * Returns a finite number or throws if the result is ±Infinity / NaN
 * (e.g. division by zero).
 *
 * Accepts nb-NO formatted numbers directly (e.g. "1 234,56 + 789,00").
 */
export function evaluateArithmetic(expr: string): number {
  const trimmed = normalizeExpr(expr.trim())

  const tokens = tokenize(trimmed)
  const pos: Pos = { i: 0 }
  const result = parseExpr(tokens, pos)

  if (peek(tokens, pos).kind !== 'eof')
    throw new Error('Unexpected characters after expression')
  if (!isFinite(result))
    throw new Error('Result is not a finite number (e.g. division by zero)')

  return result
}
