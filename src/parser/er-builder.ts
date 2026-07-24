import type { ERColumn, ERGraph, ERGraphEdge, ERGraphNode, JoinCondition } from '@/types/er-diagram';
import type { DatabaseSchemaSnapshot, SchemaTable } from '@/types/database';
import { asNode, getColumnRef, getCtes, getFromItems, getSubquery, identifier, normalizeTableRef, outputColumns, statementType, walkAst, type AstNode, type NormalizedTableRef } from './ast-normalizer';
import { extractDDL, type DDLInfo } from './extractors/ddl';
import { mergeColumnsByPriority } from './extractors/columns';
import { extractEQPairs } from './utils/condition-expr';

interface SchemaEntry extends DDLInfo { ref: NormalizedTableRef }

export function buildERGraph(statements: unknown[], schemaSnapshot?: DatabaseSchemaSnapshot | null): ERGraph {
  const nodes = new Map<string, ERGraphNode>();
  const edges = new Map<string, ERGraphEdge>();
  const schemas = new Map<string, SchemaEntry>();
  const databaseSchemas = createDatabaseSchemaIndex(schemaSnapshot);
  let subqueryCounter = 0;
  let edgeCounter = 0;
  const processedSelects = new WeakSet<object>();

  const ensureTable = (ref: NormalizedTableRef, statementId: string, alias?: string): string => {
    const id = `table::${ref.id}`;
    const schema = schemas.get(ref.id.toLowerCase());
    const databaseSchema = findDatabaseSchema(databaseSchemas, ref);
    const databaseColumns = databaseSchema ? columnsFromDatabaseTable(databaseSchema) : [];
    const existing = nodes.get(id);
    if (!existing) {
      nodes.set(id, {
        id,
        kind: 'table',
        tableName: ref.table,
        displayName: ref.id,
        alias,
        tableType: 'physical',
        columns: mergeColumnsByPriority(schema?.columns, databaseColumns),
        source: schema ? 'ddl' : databaseSchema ? 'database' : 'inferred',
        statementId,
      });
    } else if (existing.kind === 'table' && alias && !existing.alias) {
      existing.alias = alias;
    }
    return id;
  };

  const addInferredColumn = (nodeId: string, name: string) => {
    if (!name || name === '*') return;
    const node = nodes.get(nodeId);
    if (!node || node.columns.some(column => column.name.toLowerCase() === name.toLowerCase())) return;
    node.columns.push({ name, type: 'unknown', source: 'sql-inferred', isPK: false, isFK: false });
  };

  // Pass one: build a schema catalog so later joins can use declared metadata.
  statements.forEach((statement, index) => {
    const node = asNode(statement);
    if (statementType(node) !== 'create' || identifier(node?.keyword).toLowerCase() !== 'table') return;
    const ref = normalizeTableRef(node?.table);
    if (ref) schemas.set(ref.id.toLowerCase(), { ref, ...extractDDL(node) });
    void index;
  });

  schemas.forEach((schema, _key) => ensureTable(schema.ref, 'schema'));

  const addEdge = (edge: Omit<ERGraphEdge, 'id'>) => {
    if (!edge.source || !edge.target || edge.source === edge.target) return;
    const signature = `${edge.source}|${edge.target}|${edge.joinType}|${edge.conditionSQL}`;
    if (edges.has(signature)) return;
    edgeCounter += 1;
    edges.set(signature, { ...edge, id: `er-edge-${edgeCounter}` });
  };

  const processSelect = (select: AstNode, statementId: string, inheritedCtes = new Map<string, string>()) => {
    if (processedSelects.has(select)) return;
    processedSelects.add(select);
    const cteMap = new Map(inheritedCtes);
    const ctes = getCtes(select);

    for (const cte of ctes) {
      const id = `cte::${statementId}::${cte.name.toLowerCase()}`;
      cteMap.set(cte.name.toLowerCase(), id);
      nodes.set(id, {
        id,
        kind: 'cte',
        name: cte.name,
        columns: (cte.columns.length ? cte.columns : outputColumns(cte.statement)).map(column => ({ name: column, type: 'unknown', source: 'sql-inferred', isPK: false, isFK: false })),
        sqlPreview: 'CTE',
        statementId,
      });
    }
    for (const cte of ctes) processSelect(cte.statement, statementId, cteMap);

    const aliases = new Map<string, string>(cteMap);
    const labels = new Map<string, string>();
    const fromItems = getFromItems(select);
    let primaryId: string | null = null;

    for (const item of fromItems) {
      const subquery = getSubquery(item);
      let nodeId: string | null = null;
      const alias = identifier(item.as);
      if (subquery) {
        subqueryCounter += 1;
        nodeId = `subquery::${statementId}::${subqueryCounter}`;
        nodes.set(nodeId, {
          id: nodeId,
          kind: 'subquery',
          name: alias || `子查询 ${subqueryCounter}`,
          columns: outputColumns(subquery).map(column => ({ name: column, type: 'unknown', source: 'sql-inferred', isPK: false, isFK: false })),
          sqlPreview: 'SELECT …',
          statementId,
        });
        processSelect(subquery, statementId, cteMap);
      } else {
        const ref = normalizeTableRef(item);
        if (!ref) continue;
        nodeId = cteMap.get(ref.table.toLowerCase()) ?? ensureTable(ref, statementId, alias || ref.alias);
        aliases.set(ref.table.toLowerCase(), nodeId);
        labels.set(nodeId, ref.id);
      }
      if (!nodeId) continue;
      const key = (alias || normalizeTableRef(item)?.alias || normalizeTableRef(item)?.table || '').toLowerCase();
      if (key) aliases.set(key, nodeId);
      labels.set(nodeId, labels.get(nodeId) ?? (alias || nodeId.replace(/^.*::/, '')));
      if (!item.join && !primaryId) primaryId = nodeId;
    }

    // Only qualified references can be assigned safely. Nested SELECTs are
    // processed in their own alias scope and are deliberately skipped here.
    const inferQualifiedColumns = (root: unknown) => {
      walkAst(root, node => {
        if (statementType(node) === 'select') return false;
        const ref = getColumnRef(node);
        if (!ref?.table) return;
        const tableId = aliases.get(ref.table.toLowerCase());
        if (tableId) addInferredColumn(tableId, ref.column);
      });
    };
    inferQualifiedColumns(select.columns);
    fromItems.forEach(item => inferQualifiedColumns(item.on));
    inferQualifiedColumns(select.where);
    inferQualifiedColumns(select.having);

    for (const item of fromItems) {
      if (!item.join) continue;
      const targetAlias = identifier(item.as) || normalizeTableRef(item)?.table || '';
      const targetId = aliases.get(targetAlias.toLowerCase());
      const pairs = extractEQPairs(item.on);
      const conditions: JoinCondition[] = pairs.map(pair => {
        const left = aliases.get(pair.leftTable.toLowerCase());
        const right = aliases.get(pair.rightTable.toLowerCase());
        return {
          leftTable: left ? labels.get(left) ?? pair.leftTable : pair.leftTable,
          leftColumn: pair.leftColumn,
          rightTable: right ? labels.get(right) ?? pair.rightTable : pair.rightTable,
          rightColumn: pair.rightColumn,
          operator: pair.operator,
        };
      });
      const sourceId = pairs[0] ? aliases.get(pairs[0].leftTable.toLowerCase()) : primaryId;
      const resolvedTarget = pairs[0] ? aliases.get(pairs[0].rightTable.toLowerCase()) : targetId;
      if (!sourceId || !resolvedTarget) continue;
      const joinType = normalizeJoinType(identifier(item.join));
      const conditionSQL = conditions.map(c => `${c.leftTable}.${c.leftColumn} ${c.operator} ${c.rightTable}.${c.rightColumn}`).join(' AND ');
      addEdge({
        source: sourceId,
        target: resolvedTarget,
        kind: 'join',
        joinType,
        cardinality: null,
        conditions,
        sourceColumns: conditions.map(c => c.leftColumn),
        targetColumns: conditions.map(c => c.rightColumn),
        conditionSQL,
        highConfidence: false,
      });
    }

    // Discover scalar/WHERE/HAVING subqueries not represented in FROM.
    for (const field of [select.columns, select.where, select.having]) {
      walkAst(field, node => {
        const nested = asNode(asNode(node.expr)?.ast ?? node.ast);
        if (nested && statementType(nested) === 'select' && !processedSelects.has(nested)) {
          subqueryCounter += 1;
          const id = `subquery::${statementId}::${subqueryCounter}`;
          nodes.set(id, {
            id,
            kind: 'subquery',
            name: `子查询 ${subqueryCounter}`,
            columns: outputColumns(nested).map(column => ({ name: column, type: 'unknown', source: 'sql-inferred', isPK: false, isFK: false })),
            sqlPreview: 'SELECT …',
            statementId,
          });
          processSelect(nested, statementId, cteMap);
          return false;
        }
      });
    }
  };

  statements.forEach((statement, index) => {
    const node = asNode(statement);
    if (!node) return;
    const type = statementType(node);
    const statementId = `stmt-${index + 1}`;
    if (type === 'select') processSelect(node, statementId);
    if (type === 'insert' || type === 'update' || type === 'delete') {
      const target = normalizeTableRef(node.table);
      if (target) ensureTable(target, statementId, target.alias);
      if (type === 'update' && Array.isArray(node.table) && node.table.length > 1) {
        processSelect({ type: 'select', from: node.table, columns: [] }, statementId);
      }
      const select = asNode(node.values);
      if (select && statementType(select) === 'select') processSelect(select, statementId);
      for (const from of getFromItems(node)) {
        const subquery = getSubquery(from);
        if (subquery) processSelect(subquery, statementId);
        else {
          const ref = normalizeTableRef(from);
          if (ref) ensureTable(ref, statementId, ref.alias);
        }
      }
      walkAst([node.where, node.set], child => {
        const nested = asNode(asNode(child.expr)?.ast ?? child.ast);
        if (nested && statementType(nested) === 'select') processSelect(nested, statementId);
      });
    }
    if (type === 'create') {
      const query = asNode(node.query_expr ?? node.as);
      if (query && statementType(query) === 'select') processSelect(query, statementId);
    }
  });

  // Declared foreign keys are the only source of cardinality claims.
  schemas.forEach(schema => {
    const source = ensureTable(schema.ref, 'schema');
    for (const fk of schema.foreignKeys) {
      const targetSchema = schemas.get(fk.refTableId.toLowerCase());
      const targetRef = targetSchema?.ref ?? normalizeTableRef(fk.refTableId);
      if (!targetRef) continue;
      const target = ensureTable(targetRef, 'schema');
      const unique = schema.uniqueKeys.some(key => key.length === fk.columns.length && key.every(column => fk.columns.includes(column)));
      const conditions = fk.columns.map((column, i) => ({
        leftTable: schema.ref.id,
        leftColumn: column,
        rightTable: fk.refTableId,
        rightColumn: fk.refColumns[i] ?? '',
        operator: '=',
      }));
      addEdge({
        source,
        target,
        kind: 'join',
        joinType: 'FK',
        cardinality: unique ? '1:1' : 'N:1',
        cardinalityBasis: unique ? 'unique-foreign-key' : 'foreign-key',
        conditions,
        sourceColumns: fk.columns,
        targetColumns: fk.refColumns,
        conditionSQL: conditions.map(c => `${c.leftTable}.${c.leftColumn} = ${c.rightTable}.${c.rightColumn}`).join(' AND '),
        highConfidence: true,
      });
    }
  });

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function normalizeJoinType(value: string): ERGraphEdge['joinType'] {
  const join = value.toUpperCase();
  if (join.includes('LEFT')) return 'LEFT JOIN';
  if (join.includes('RIGHT')) return 'RIGHT JOIN';
  if (join.includes('CROSS')) return 'CROSS JOIN';
  return 'INNER JOIN';
}

export function placeholderColumn(name: string): ERColumn {
  return { name, type: 'unknown', source: 'sql-inferred', isPK: false, isFK: false };
}

function createDatabaseSchemaIndex(snapshot?: DatabaseSchemaSnapshot | null): Map<string, SchemaTable[]> {
  const index = new Map<string, SchemaTable[]>();
  for (const table of snapshot?.tables ?? []) {
    for (const key of [table.id, table.name, table.schema ? `${table.schema}.${table.name}` : ''].filter(Boolean)) {
      const normalized = key.toLowerCase();
      index.set(normalized, [...(index.get(normalized) ?? []), table]);
    }
  }
  return index;
}

function findDatabaseSchema(index: Map<string, SchemaTable[]>, ref: NormalizedTableRef): SchemaTable | undefined {
  for (const key of [ref.id, ref.schema ? `${ref.schema}.${ref.table}` : '', ref.table].filter(Boolean)) {
    const matches = index.get(key.toLowerCase()) ?? [];
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

function columnsFromDatabaseTable(table: SchemaTable): ERColumn[] {
  return table.columns.map(column => {
    const fk = table.foreignKeys.find(key => key.columns.some(name => name.toLowerCase() === column.name.toLowerCase()));
    const fkIndex = fk?.columns.findIndex(name => name.toLowerCase() === column.name.toLowerCase()) ?? -1;
    return {
      name: column.name,
      type: column.type || 'unknown',
      source: 'database' as const,
      isPK: column.isPrimaryKey,
      isFK: !!fk,
      isUnique: column.isUnique,
      nullable: column.nullable,
      fkRefTable: fk?.referencedTableId,
      fkRefColumn: fkIndex >= 0 ? fk?.referencedColumns[fkIndex] : undefined,
    };
  });
}
