export type Cardinality = '1:1' | '1:N' | 'N:1' | 'N:M';
export type CardinalityBasis = 'foreign-key' | 'unique-foreign-key';
export type ColumnSource = 'ddl' | 'database' | 'sql-inferred';

export interface ERColumn {
  name: string;
  type: string;
  source?: ColumnSource;
  isPK: boolean;
  isFK: boolean;
  fkRefTable?: string;
  fkRefColumn?: string;
  nullable?: boolean;
  isUnique?: boolean;
  comment?: string;
}

export interface ERTableNodeData {
  kind: 'table';
  tableName: string;
  displayName: string;
  alias?: string;
  tableType: 'physical' | 'cte' | 'subquery' | 'view';
  columns: ERColumn[];
  source: 'ddl' | 'database' | 'dml' | 'inferred';
  statementId: string;
  comment?: string;
}

export interface ERVirtualNodeData {
  kind: 'cte' | 'subquery';
  name: string;
  columns: ERColumn[];
  sqlPreview: string;
  statementId: string;
}

export type ERNodeData = ERTableNodeData | ERVirtualNodeData;

export interface JoinCondition {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  operator: string;
}

export interface ERJoinEdgeData {
  kind: 'join';
  joinType: 'INNER JOIN' | 'LEFT JOIN' | 'RIGHT JOIN' | 'CROSS JOIN' | 'FK';
  cardinality: Cardinality | null;
  cardinalityBasis?: CardinalityBasis;
  conditions: JoinCondition[];
  sourceColumns: string[];
  targetColumns: string[];
  conditionSQL: string;
  highConfidence?: boolean;
}

export type ERGraphNode = ERNodeData & { id: string };
export type ERGraphEdge = ERJoinEdgeData & { id: string; source: string; target: string };

export interface ERGraph {
  nodes: ERGraphNode[];
  edges: ERGraphEdge[];
}
