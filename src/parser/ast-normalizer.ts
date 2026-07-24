export type AstNode = Record<string, unknown>;

export interface NormalizedTableRef {
  table: string;
  db?: string;
  schema?: string;
  alias?: string;
  id: string;
}

export function asNode(value: unknown): AstNode | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AstNode : null;
}

export function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function identifier(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const node = asNode(value);
  if (!node) return '';
  for (const key of ['value', 'column', 'table', 'name', 'expr']) {
    const result = identifier(node[key]);
    if (result) return result;
  }
  return '';
}

export function normalizeTableRef(value: unknown): NormalizedTableRef | null {
  const first = Array.isArray(value) ? value[0] : value;
  const node = asNode(first);
  if (!node) {
    const table = identifier(first);
    return table ? { table, id: table } : null;
  }

  const nested = asNode(node.table);
  const table = identifier(nested?.table ?? nested?.name ?? node.table ?? node.name);
  if (!table) return null;
  const db = identifier(node.db ?? nested?.db) || undefined;
  const schema = identifier(node.schema ?? nested?.schema) || undefined;
  const alias = identifier(node.as ?? nested?.as) || undefined;
  return { table, db, schema, alias, id: tableId({ table, db, schema }) };
}

export function tableId(ref: Pick<NormalizedTableRef, 'table' | 'db' | 'schema'>): string {
  return [ref.db, ref.schema, ref.table].filter(Boolean).join('.');
}

export function statementType(statement: unknown): string {
  return identifier(asNode(statement)?.type).toLowerCase();
}

export function selectFromStatement(statement: unknown): AstNode | null {
  const node = asNode(statement);
  if (!node) return null;
  if (statementType(node) === 'select') return node;
  const values = asNode(node.values);
  if (statementType(values) === 'select') return values;
  const query = asNode(node.query_expr) ?? asNode(node.as);
  return statementType(query) === 'select' ? query : null;
}

export function getTargetRef(statement: unknown): NormalizedTableRef | null {
  const node = asNode(statement);
  return normalizeTableRef(node?.table ?? node?.into);
}

export function getFromItems(select: unknown): AstNode[] {
  return asArray(asNode(select)?.from).map(asNode).filter((item): item is AstNode => !!item);
}

export function getSubquery(item: unknown): AstNode | null {
  const node = asNode(item);
  if (!node) return null;
  const expr = asNode(node.expr);
  const ast = asNode(expr?.ast ?? node.ast);
  return statementType(ast) === 'select' ? ast : null;
}

export function getCtes(select: unknown): Array<{ name: string; statement: AstNode; columns: string[] }> {
  const result: Array<{ name: string; statement: AstNode; columns: string[] }> = [];
  for (const raw of asArray(asNode(select)?.with)) {
    const cte = asNode(raw);
    if (!cte) continue;
    const name = identifier(cte.name);
    const stmt = asNode(asNode(cte.stmt)?.ast ?? cte.stmt);
    if (!name || !stmt) continue;
    result.push({ name, statement: stmt, columns: asArray(cte.columns).map(identifier).filter(Boolean) });
  }
  return result;
}

export function getColumnRef(value: unknown): { table: string; column: string } | null {
  const node = asNode(value);
  if (!node) return null;
  if (identifier(node.type) !== 'column_ref' && node.column == null) return null;
  const column = identifier(node.column);
  if (!column) return null;
  return { table: identifier(node.table), column };
}

export function walkAst(root: unknown, visitor: (node: AstNode) => boolean | void): void {
  const seen = new Set<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value as object)) return;
    seen.add(value as object);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as AstNode;
    if (visitor(node) === false) return;
    Object.values(node).forEach(visit);
  };
  visit(root);
}

export function outputColumns(select: unknown): string[] {
  return asArray(asNode(select)?.columns).map(raw => {
    if (raw === '*') return '*';
    const column = asNode(raw);
    if (!column) return '';
    const alias = identifier(column.as);
    if (alias) return alias;
    const expr = asNode(column.expr);
    const ref = getColumnRef(expr);
    if (ref) return ref.column;
    const type = identifier(expr?.type);
    return type === 'aggr_func' ? `${identifier(expr?.name)}(...)` : '';
  }).filter(Boolean);
}
