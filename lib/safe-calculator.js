'use strict';

function evaluateCalc(input) {
  const expression = String(input ?? '').trim();
  if (!expression || expression.length > 120) {
    throw new Error('Invalid calculator expression');
  }

  const tokens = [];
  const tokenPattern = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([()+\-*/]))/y;
  let position = 0;
  while (position < expression.length) {
    tokenPattern.lastIndex = position;
    const match = tokenPattern.exec(expression);
    if (!match) throw new Error('Invalid calculator expression');
    tokens.push(match[1] !== undefined ? Number(match[1]) : match[2]);
    if (tokens.length > 100) throw new Error('Calculator expression is too complex');
    position = tokenPattern.lastIndex;
  }

  let cursor = 0;
  let nesting = 0;
  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];
  const assertFinite = (value) => {
    if (!Number.isFinite(value)) throw new Error('Invalid calculator result');
    return value;
  };

  function parsePrimary() {
    const token = consume();
    if (typeof token === 'number') return assertFinite(token);
    if (token === '(') {
      nesting += 1;
      if (nesting > 32) throw new Error('Calculator expression is too deeply nested');
      const value = parseExpression();
      if (consume() !== ')') throw new Error('Invalid calculator expression');
      nesting -= 1;
      return value;
    }
    throw new Error('Invalid calculator expression');
  }

  function parseUnary() {
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    if (peek() === '-') {
      consume();
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parseTerm() {
    let value = parseUnary();
    while (peek() === '*' || peek() === '/') {
      const operator = consume();
      const right = parseUnary();
      value = assertFinite(operator === '*' ? value * right : value / right);
    }
    return value;
  }

  function parseExpression() {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const operator = consume();
      const right = parseTerm();
      value = assertFinite(operator === '+' ? value + right : value - right);
    }
    return value;
  }

  const result = parseExpression();
  if (cursor !== tokens.length) throw new Error('Invalid calculator expression');
  return Number(result.toFixed(12));
}

module.exports = evaluateCalc;
