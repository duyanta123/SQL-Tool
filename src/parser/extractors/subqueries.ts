export interface SubqueryInfo {
  id: string;
  alias: string;
  depth: number;
  correlated: boolean;
  sqlPreview: string;
  outerTables: string[];
}

let subqueryIdCounter = 0;

export function resetSubqueryIdCounter(): void {
  subqueryIdCounter = 0;
}

export function nextSubqueryId(): string {
  subqueryIdCounter += 1;
  return `subquery_${subqueryIdCounter}`;
}

export function findSubqueries(node: any, depth = 0, outerTables: string[] = []): SubqueryInfo[] {
  const results: SubqueryInfo[] = [];
  if (!node || typeof node !== 'object') return results;

  if (Array.isArray(node)) {
    for (const item of node) {
      results.push(...findSubqueries(item, depth, outerTables));
    }
    return results;
  }

  // Subquery in FROM (TableExpr)
  if (node.expr && node.expr.ast && node.as) {
    const id = nextSubqueryId();
    results.push({
      id,
      alias: node.as,
      depth,
      correlated: false,
      sqlPreview: 'SELECT ...',
      outerTables: [...outerTables],
    });
    results.push(...findSubqueries(node.expr.ast, depth + 1, outerTables));
    return results;
  }

  // Subquery in WHERE / columns (EXISTS, IN, scalar)
  if (node.ast && (node.type === 'expr' || node.type === 'select' || (node.from && node.columns))) {
    const id = nextSubqueryId();
    results.push({
      id,
      alias: id,
      depth,
      correlated: false,
      sqlPreview: 'SELECT ...',
      outerTables: [...outerTables],
    });
    results.push(...findSubqueries(node.ast ?? node, depth + 1, outerTables));
    return results;
  }

  // Recurse into common fields
  for (const key of ['from', 'where', 'columns', 'set', 'values', 'with']) {
    if (node[key]) {
      const val = Array.isArray(node[key]) ? node[key] : [node[key]];
      for (const item of val) {
        if (item?.stmt?.ast) {
          results.push(...findSubqueries(item.stmt.ast, depth, outerTables));
        } else if (item?.ast) {
          results.push(...findSubqueries(item.ast, depth + 1, outerTables));
        } else if (item && typeof item === 'object') {
          results.push(...findSubqueries(item, depth, outerTables));
        }
      }
    }
  }

  return results;
}
