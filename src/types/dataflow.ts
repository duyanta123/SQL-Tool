export type DFNodeKind =
  | 'source'
  | 'cte-group'
  | 'cte'
  | 'subquery'
  | 'aggregate'
  | 'target'
  | 'literal';

export type DFEdgeKind = 'read' | 'join' | 'pipe' | 'output' | 'write' | 'correlate';

interface DFBaseNodeData {
  kind: DFNodeKind;
  label: string;
  statementId: string;
  detail?: string;
}

export interface DFSourceNodeData extends DFBaseNodeData {
  kind: 'source';
  tableName: string;
  alias?: string;
  columnCount: number;
  /** 该源表被投影/分组实际引用的列（列级血缘填充） */
  outputColumns?: string[];
}

export interface DFCTENodeData extends DFBaseNodeData {
  kind: 'cte';
  cteName: string;
  outputColumns: string[];
}

export interface DFCTEGroupNodeData extends DFBaseNodeData {
  kind: 'cte-group';
  cteCount: number;
}

export interface DFSubqueryNodeData extends DFBaseNodeData {
  kind: 'subquery';
  depth: number;
  sqlPreview: string;
}

export interface DFAggregateNodeData extends DFBaseNodeData {
  kind: 'aggregate';
  groupByColumns: string[];
  aggregateFunctions: string[];
}

export interface DFTargetNodeData extends DFBaseNodeData {
  kind: 'target';
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'CREATE' | 'DELETE' | 'UPSERT';
  targetTable?: string;
  outputColumns: string[];
}

export interface DFLiteralNodeData extends DFBaseNodeData {
  kind: 'literal';
  valuePreview: string;
}

export type DFNodeData =
  | DFSourceNodeData
  | DFCTENodeData
  | DFCTEGroupNodeData
  | DFSubqueryNodeData
  | DFAggregateNodeData
  | DFTargetNodeData
  | DFLiteralNodeData;

export interface DFColumnMapping {
  source: { table: string; column: string };
  target: { column: string };
  expression?: string;
}

export interface DFFlowEdgeData {
  kind: DFEdgeKind;
  label?: string;
  joinType?: string;
  columns?: string[];
  /** 列级血缘：该边两端节点之间的字段流转映射 */
  columnMapping?: DFColumnMapping[];
  /** WHERE/HAVING 中引用该来源的过滤列 */
  filters?: Array<{ table: string; column: string }>;
}

export type DataFlowNode = DFNodeData & { id: string };
export type DataFlowEdge = DFFlowEdgeData & { id: string; source: string; target: string };

export interface DataFlowGraph {
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
}
