import { asArray, asNode, identifier, type AstNode } from '../ast-normalizer';

/**
 * 把 node-sql-parser 的表达式 AST 还原为可读的 SQL 片段。
 * 用于列级血缘中展示复杂表达式（聚合、CASE、函数、窗口函数等），
 * 只覆盖常用节点类型，未知类型返回 undefined。
 */
export type ResolveTable = (alias: string) => string;

export function expressionToSQL(value: unknown, maxLength = 80, resolveTable?: ResolveTable): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const sql = String(value);
    return sql.length > maxLength ? `${sql.slice(0, maxLength - 1)}…` : sql;
  }
  const sql = render(asNode(value), resolveTable);
  if (!sql) return undefined;
  return sql.length > maxLength ? `${sql.slice(0, maxLength - 1)}…` : sql;
}

function render(node: AstNode | null, resolveTable?: ResolveTable): string {
  if (!node) return '';
  const type = identifier(node.type);
  switch (type) {
    case 'column_ref': {
      const table = identifier(node.table);
      const column = identifier(node.column);
      if (!table) return column;
      const resolved = resolveTable ? resolveTable(table) : table;
      return resolved ? `${resolved}.${column}` : column;
    }
    case 'expr_list':
      return `(${asArray(node.value).map(item => render(asNode(item), resolveTable)).filter(Boolean).join(', ')})`;
    case 'star':
      return '*';
    case 'number':
    case 'double':
    case 'int':
      return node.value == null ? '' : String(node.value);
    case 'single_quote_string':
    case 'string':
      return node.value == null ? '' : `'${String(node.value).replaceAll("'", "''")}'`;
    case 'bool':
    case 'boolean':
      return node.value === true ? 'TRUE' : node.value === false ? 'FALSE' : '';
    case 'null':
      return 'NULL';
    case 'aggr_func': {
      const name = identifier(node.name);
      const distinct = identifier(asNode(node.args)?.distinct);
      const argsSql = renderArgs(asNode(node.args), resolveTable);
      return `${name}(${distinct ? `${distinct} ` : ''}${argsSql})`;
    }
    case 'function': {
      const name = functionName(node);
      const argsSql = renderArgs(asNode(node.args), resolveTable);
      return `${name}(${argsSql})`;
    }
    case 'window':
      return 'OVER (...)';
    case 'binary_expr': {
      const op = identifier(node.operator);
      const left = render(asNode(node.left), resolveTable);
      const right = render(asNode(node.right), resolveTable);
      const leftParen = asNode(node.left)?.parentheses === true;
      const rightParen = asNode(node.right)?.parentheses === true;
      return `${leftParen ? `(${left})` : left} ${op} ${rightParen ? `(${right})` : right}`;
    }
    case 'unary_expr':
      return `${identifier(node.operator)}${render(asNode(node.expr), resolveTable)}`;
    case 'case': {
      const expr = asNode(node.expr);
      let sql = 'CASE';
      if (expr) sql += ` ${render(expr, resolveTable)}`;
      for (const arg of asArray(node.args)) {
        const item = asNode(arg);
        const itemType = identifier(item?.type);
        if (itemType === 'when') sql += ` WHEN ${render(asNode(item?.cond), resolveTable)} THEN ${render(asNode(item?.result), resolveTable)}`;
        else if (itemType === 'else') sql += ` ELSE ${render(asNode(item?.result), resolveTable)}`;
      }
      return `${sql} END`;
    }
    case 'cast': {
      const inner = render(asNode(node.expr), resolveTable);
      const targets = asArray(node.target)
        .map(item => identifier(asNode(item)?.dataType ?? item))
        .filter(Boolean)
        .join(' ');
      const target = targets || identifier(node.target_type);
      return `${inner}::${target || '?'}`;
    }
    default: {
      const inner = render(asNode(node.expr), resolveTable);
      if (inner) return inner;
      return node.value != null && typeof node.value !== 'object' ? String(node.value) : '';
    }
  }
}

function renderArgs(args: AstNode | null, resolveTable?: ResolveTable): string {
  if (!args) return '';
  if (identifier(args.type) === 'expr_list') {
    return asArray(args.value).map(item => render(asNode(item), resolveTable)).filter(Boolean).join(', ');
  }
  const expr = asNode(args.expr);
  return expr ? render(expr, resolveTable) : '';
}

function functionName(node: AstNode): string {
  const nameNode = asNode(node.name);
  if (!nameNode) return '';
  const parts = asArray(nameNode.name).map(identifier).join('');
  return parts || identifier(nameNode);
}
