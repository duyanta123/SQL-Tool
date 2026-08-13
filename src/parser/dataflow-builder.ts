import type { DataFlowEdge, DataFlowGraph, DataFlowNode, DFColumnMapping, DFEdgeKind } from '@/types/dataflow';
import { asArray, asNode, getColumnRef, getCtes, getFromItems, getSubquery, identifier, normalizeTableRef, outputColumnName, outputColumns, statementType, walkAst, type AstNode } from './ast-normalizer';
import { expressionToSQL } from './utils/expression-sql';

interface Context {
  nodes: Map<string, DataFlowNode>;
  edges: Map<string, DataFlowEdge>;
  counter: number;
  processed: WeakMap<object, string>;
}

export function buildDataFlowGraph(statements: unknown[]): DataFlowGraph {
  const ctx: Context = { nodes: new Map(), edges: new Map(), counter: 0, processed: new WeakMap() };
  statements.forEach((raw, index) => {
    const statement = asNode(raw);
    if (!statement) return;
    const id = `stmt-${index + 1}`;
    switch (statementType(statement)) {
      case 'select': processSelect(statement, ctx, id, new Map()); break;
      case 'insert': processInsert(statement, ctx, id); break;
      case 'update': processUpdate(statement, ctx, id); break;
      case 'delete': processDelete(statement, ctx, id); break;
      case 'create': processCreate(statement, ctx, id); break;
    }
  });
  return { nodes: [...ctx.nodes.values()], edges: [...ctx.edges.values()] };
}

function nextId(ctx: Context, prefix: string): string {
  ctx.counter += 1;
  return `${prefix}::${ctx.counter}`;
}

function addNode(ctx: Context, node: DataFlowNode): string {
  if (!ctx.nodes.has(node.id)) ctx.nodes.set(node.id, node);
  return node.id;
}

function addEdge(ctx: Context, source: string, target: string, kind: DFEdgeKind, label?: string, joinType?: string): DataFlowEdge | null {
  if (!source || !target || source === target) return null;
  const signature = `${source}|${target}|${kind}|${label ?? ''}`;
  const existing = ctx.edges.get(signature);
  if (existing) return existing;
  const edge: DataFlowEdge = { id: `df-edge::${ctx.edges.size + 1}`, source, target, kind, label, joinType };
  ctx.edges.set(signature, edge);
  return edge;
}

function sourceNode(ctx: Context, statementId: string, tableName: string, alias?: string): string {
  return addNode(ctx, {
    id: `${statementId}::source::${tableName}::${alias ?? ''}`,
    kind: 'source', label: tableName, statementId, tableName, alias, columnCount: 0,
  });
}

function targetNode(ctx: Context, statementId: string, operation: 'INSERT' | 'UPDATE' | 'CREATE' | 'DELETE' | 'UPSERT', tableName: string, columns: string[] = []): string {
  return addNode(ctx, {
    id: `${statementId}::target::${operation.toLowerCase()}::${tableName}`,
    kind: 'target', label: `${operation} ${tableName}`, statementId, operation, targetTable: tableName, outputColumns: columns,
  });
}

function processSelect(select: AstNode, ctx: Context, statementId: string, inheritedCtes: Map<string, string>): string {
  const previous = ctx.processed.get(select);
  if (previous) return previous;
  const cteMap = new Map(inheritedCtes);
  const ctes = getCtes(select);
  let cteGroupId: string | null = null;
  if (ctes.length) {
    cteGroupId = addNode(ctx, {
      id: nextId(ctx, `${statementId}::cte-group`), kind: 'cte-group', label: 'CTE', statementId, cteCount: ctes.length,
    });
    for (const cte of ctes) {
      const id = addNode(ctx, {
        id: `${statementId}::cte::${cte.name.toLowerCase()}`,
        kind: 'cte', label: cte.name, statementId, cteName: cte.name,
        outputColumns: cte.columns.length ? cte.columns : outputColumns(cte.statement), detail: 'CTE',
      });
      cteMap.set(cte.name.toLowerCase(), id);
      addEdge(ctx, cteGroupId, id, 'pipe', '定义');
    }
    for (const cte of ctes) {
      const output = processSelect(cte.statement, ctx, statementId, cteMap);
      const cteId = cteMap.get(cte.name.toLowerCase());
      if (cteId) addEdge(ctx, output, cteId, 'pipe', 'CTE');
    }
  }

  const sources: Array<{ id: string; join?: string }> = [];
  const outerAliases = new Set<string>();
  const aliasToSource = new Map<string, string>();
  for (const item of getFromItems(select)) {
    const alias = identifier(item.as);
    const nested = getSubquery(item);
    if (nested) {
      const output = processSelect(nested, ctx, statementId, cteMap);
      const subqueryId = addNode(ctx, {
        id: nextId(ctx, `${statementId}::subquery`), kind: 'subquery', label: alias || '子查询', statementId,
        depth: 1, sqlPreview: 'SELECT …', detail: alias || undefined,
      });
      addEdge(ctx, output, subqueryId, 'pipe', 'SUBQUERY');
      sources.push({ id: subqueryId, join: identifier(item.join) || undefined });
      if (alias) {
        outerAliases.add(alias.toLowerCase());
        aliasToSource.set(alias.toLowerCase(), subqueryId);
      }
      continue;
    }
    const ref = normalizeTableRef(item);
    if (!ref) continue;
    const cte = cteMap.get(ref.table.toLowerCase());
    const id = cte ?? sourceNode(ctx, statementId, ref.id, alias || ref.alias);
    sources.push({ id, join: identifier(item.join) || undefined });
    const key = (alias || ref.alias || ref.table).toLowerCase();
    outerAliases.add(key);
    aliasToSource.set(key, id);
    aliasToSource.set(ref.table.toLowerCase(), id);
  }

  const groups = asArray(asNode(select.groupby)?.columns ?? select.groupby);
  const aggregates: string[] = [];
  walkAst(select.columns, node => {
    if (identifier(node.type) === 'aggr_func') aggregates.push(identifier(node.name));
  });
  const filterText = filterDetail(select);
  let outputId: string;
  if (groups.length || aggregates.length) {
    const groupColumns = groups.map(item => getColumnRef(asNode(item)?.expr ?? item)?.column ?? identifier(asNode(item)?.column ?? item)).filter(Boolean);
    outputId = addNode(ctx, {
      id: nextId(ctx, `${statementId}::aggregate`), kind: 'aggregate',
      label: aggregates.length ? aggregates.join(', ') : 'GROUP BY', statementId,
      groupByColumns: groupColumns, aggregateFunctions: aggregates,
      detail: [groupColumns.length ? `GROUP BY ${groupColumns.join(', ')}` : '', filterText].filter(Boolean).join(' · ') || undefined,
    });
  } else {
    outputId = addNode(ctx, {
      id: nextId(ctx, `${statementId}::result`), kind: 'target', label: '查询结果', statementId,
      operation: 'SELECT', outputColumns: outputColumns(select), detail: filterText || undefined,
    });
  }
  ctx.processed.set(select, outputId);

  const mappingsBySource = resolveColumnMappings(select, aliasToSource, sources, ctx);
  const filterRefsBySource = collectFilterRefs(select, aliasToSource);
  for (const source of sources) {
    const edge = addEdge(ctx, source.id, outputId, source.join ? 'join' : 'read', source.join ? normalizeJoinLabel(source.join) : undefined, source.join);
    if (!edge) continue;
    const filterColumns = filterRefsBySource.get(source.id);
    if (filterColumns && filterColumns.length) edge.filters = filterColumns;
    const columnMappings = mappingsBySource.get(source.id);
    if (!columnMappings || columnMappings.length === 0) continue;
    edge.columnMapping = columnMappings;
    const sourceNode = ctx.nodes.get(source.id);
    if (sourceNode?.kind === 'source') {
      sourceNode.outputColumns = [...new Set(columnMappings.map(mapping => mapping.source.column).filter(Boolean))];
    }
  }
  for (const field of [select.columns, select.where, select.having]) {
    walkAst(field, node => {
      const nested = asNode(asNode(node.expr)?.ast ?? node.ast);
      if (!nested || statementType(nested) !== 'select' || ctx.processed.has(nested)) return;
      const nestedOutput = processSelect(nested, ctx, statementId, cteMap);
      const correlated = containsOuterReference(nested, outerAliases);
      addEdge(ctx, nestedOutput, outputId, correlated ? 'correlate' : 'pipe', correlated ? '相关子查询' : '子查询');
      return false;
    });
  }

  // UNION / UNION ALL 链：后续分支的输出汇入本结果（递归 CTE 的自引用常位于后续分支）
  let unionPrev = select;
  let unionArm = asNode(unionPrev._next);
  while (unionArm && statementType(unionArm) === 'select') {
    const setOp = identifier(unionPrev.set_op).toUpperCase() || 'UNION';
    const armOutput = processSelect(unionArm, ctx, statementId, cteMap);
    if (armOutput) addEdge(ctx, armOutput, outputId, 'pipe', setOp);
    unionPrev = unionArm;
    unionArm = asNode(unionArm._next);
  }
  return outputId;
}

function processInsert(statement: AstNode, ctx: Context, statementId: string): void {
  const ref = normalizeTableRef(statement.table);
  if (!ref) return;
  const upsert = asNode(statement.on_duplicate_update) != null || asNode(statement.conflict) != null;
  const operation = upsert ? 'UPSERT' : 'INSERT';
  const target = targetNode(ctx, statementId, operation, ref.id, asArray(statement.columns).map(identifier).filter(Boolean));
  const select = asNode(statement.values);
  if (select && statementType(select) === 'select') {
    addEdge(ctx, processSelect(select, ctx, statementId, new Map()), target, 'write', operation);
    return;
  }
  const literal = addNode(ctx, {
    id: `${statementId}::literal::${ref.id}`, kind: 'literal', label: 'VALUES', statementId,
    valuePreview: previewValues(statement.values),
  });
  addEdge(ctx, literal, target, 'write', operation);
}

function processUpdate(statement: AstNode, ctx: Context, statementId: string): void {
  const ref = normalizeTableRef(statement.table);
  if (!ref) return;
  const target = targetNode(ctx, statementId, 'UPDATE', ref.id);
  addEdge(ctx, sourceNode(ctx, statementId, ref.id, ref.alias), target, 'read');
  for (const item of asArray(statement.table).slice(1)) {
    const dependency = normalizeTableRef(item);
    if (dependency) addEdge(ctx, sourceNode(ctx, statementId, dependency.id, dependency.alias), target, 'join', normalizeJoinLabel(identifier(asNode(item)?.join) || 'JOIN'));
  }
  connectDependencies(statement, ctx, statementId, target, new Map(), ref.id);
}

function processDelete(statement: AstNode, ctx: Context, statementId: string): void {
  const ref = normalizeTableRef(statement.table ?? statement.from);
  if (!ref) return;
  const target = targetNode(ctx, statementId, 'DELETE', ref.id);
  addEdge(ctx, sourceNode(ctx, statementId, ref.id, ref.alias), target, 'read');
  connectDependencies(statement, ctx, statementId, target, new Map(), ref.id);
}

function processCreate(statement: AstNode, ctx: Context, statementId: string): void {
  const keyword = identifier(statement.keyword).toLowerCase();
  if (keyword !== 'table' && keyword !== 'view') return;
  const ref = normalizeTableRef(statement);
  if (!ref) return;
  const target = targetNode(ctx, statementId, 'CREATE', ref.id);
  const query = asNode(statement.query_expr ?? statement.as ?? statement.select);
  if (query && statementType(query) === 'select') {
    addEdge(ctx, processSelect(query, ctx, statementId, new Map()), target, 'write', keyword === 'view' ? 'VIEW' : 'CTAS');
  }
}

function connectDependencies(statement: AstNode, ctx: Context, statementId: string, target: string, ctes: Map<string, string>, targetTableId?: string): void {
  for (const item of getFromItems(statement)) {
    const nested = getSubquery(item);
    if (nested) addEdge(ctx, processSelect(nested, ctx, statementId, ctes), target, 'join', 'FROM');
    else {
      const ref = normalizeTableRef(item);
      if (ref && ref.id !== targetTableId) addEdge(ctx, sourceNode(ctx, statementId, ref.id, ref.alias), target, 'join', 'FROM');
    }
  }
  walkAst([statement.where, statement.set], node => {
    const nested = asNode(asNode(node.expr)?.ast ?? node.ast);
    if (nested && statementType(nested) === 'select') addEdge(ctx, processSelect(nested, ctx, statementId, ctes), target, 'correlate', '子查询');
  });
}

function containsOuterReference(select: AstNode, aliases: Set<string>): boolean {
  let found = false;
  walkAst(select, node => {
    const ref = getColumnRef(node);
    if (ref?.table && aliases.has(ref.table.toLowerCase())) { found = true; return false; }
  });
  return found;
}

function previewValues(value: unknown): string {
  const values: string[] = [];
  walkAst(value, node => {
    if (node.value != null && typeof node.value !== 'object') values.push(String(node.value));
  });
  return values.slice(0, 6).join(', ') || 'VALUES';
}

function normalizeJoinLabel(join: string): string {
  return join.toUpperCase().replace(/\s+JOIN$/, '') || 'JOIN';
}

/** WHERE/HAVING 的可读文本（截断），用于结果节点的 detail */
function filterDetail(select: AstNode): string {
  const where = select.where ? expressionToSQL(select.where, 60) : undefined;
  const having = select.having ? expressionToSQL(select.having, 60) : undefined;
  if (where && having) return `WHERE ${where} · HAVING ${having}`;
  if (where) return `WHERE ${where}`;
  if (having) return `HAVING ${having}`;
  return '';
}

/** 收集 WHERE/HAVING 中引用各来源的过滤列（仅限限定引用，不猜测归属） */
function collectFilterRefs(select: AstNode, aliasToSource: Map<string, string>): Map<string, Array<{ table: string; column: string }>> {
  const bySource = new Map<string, Array<{ table: string; column: string }>>();
  const seen = new Set<string>();
  for (const field of [select.where, select.having]) {
    walkAst(field, node => {
      const ref = getColumnRef(node);
      if (!ref?.table) return;
      const sourceId = aliasToSource.get(ref.table.toLowerCase());
      if (!sourceId) return;
      const key = `${sourceId}|${ref.table}|${ref.column}`;
      if (seen.has(key)) return;
      seen.add(key);
      const list = bySource.get(sourceId) ?? [];
      list.push({ table: ref.table, column: ref.column });
      bySource.set(sourceId, list);
    });
  }
  return bySource;
}

/**
 * 解析一条 SELECT 的列级血缘：把投影列与 GROUP BY 列中出现的字段引用，
 * 归属到各自的来源节点（表/别名/CTE/子查询），挂到对应的 read/join 边上。
 * 未限定且无法唯一归属的引用被跳过（不猜测）。
 */
function resolveColumnMappings(
  select: AstNode,
  aliasToSource: Map<string, string>,
  sources: Array<{ id: string; join?: string }>,
  ctx: Context,
): Map<string, DFColumnMapping[]> {
  const bySource = new Map<string, DFColumnMapping[]>();
  const seen = new Set<string>();
  const singleSourceId = sources.length === 1 ? sources[0]?.id : undefined;

  const add = (sourceId: string | undefined, mapping: DFColumnMapping) => {
    if (!sourceId) return;
    const key = [sourceId, mapping.target.column, mapping.source.table, mapping.source.column, mapping.expression ?? ''].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const list = bySource.get(sourceId) ?? [];
    list.push(mapping);
    bySource.set(sourceId, list);
  };

  const sourceLabel = (sourceId: string): string => ctx.nodes.get(sourceId)?.label ?? '';

  for (const raw of asArray(select.columns)) {
    if (raw === '*') continue;
    const column = asNode(raw);
    if (!column) continue;
    const targetName = outputColumnName(raw);
    if (!targetName) continue;
    const expr = asNode(column.expr) ?? column;
    const refs: Array<{ table: string; column: string }> = [];
    walkAst(expr, node => {
      const ref = getColumnRef(node);
      if (ref) refs.push(ref);
    });
    const complex = identifier(expr.type) !== 'column_ref';
    const expression = complex ? expressionToSQL(expr) : undefined;
    if (refs.length === 0) {
      if (singleSourceId && complex) {
        add(singleSourceId, { source: { table: sourceLabel(singleSourceId), column: '' }, target: { column: targetName }, expression });
      }
      continue;
    }
    const qualified = refs.filter(ref => ref.table);
    if (qualified.length === 0) {
      // 未限定字段：只有单一来源且只有一个引用时才归属，否则视为歧义跳过
      const only = refs[0];
      if (singleSourceId && refs.length === 1 && only) {
        add(singleSourceId, { source: { table: sourceLabel(singleSourceId), column: only.column }, target: { column: targetName }, expression });
      }
      continue;
    }
    for (const ref of qualified) {
      const sourceId = aliasToSource.get(ref.table.toLowerCase());
      add(sourceId, { source: { table: ref.table, column: ref.column }, target: { column: targetName }, expression });
    }
  }

  for (const item of asArray(asNode(select.groupby)?.columns ?? select.groupby)) {
    const ref = getColumnRef(asNode(item)?.expr ?? item);
    if (!ref) continue;
    if (ref.table) {
      add(aliasToSource.get(ref.table.toLowerCase()), { source: { table: ref.table, column: ref.column }, target: { column: ref.column } });
    } else if (singleSourceId) {
      add(singleSourceId, { source: { table: sourceLabel(singleSourceId), column: ref.column }, target: { column: ref.column } });
    }
  }

  return bySource;
}
