export interface ASTNode {
  type?: string;
  [key: string]: any;
}

export interface WalkCallbacks {
  enterSelect?: (node: any, parent: any) => void;
  leaveSelect?: (node: any, parent: any) => void;
  enterJoin?: (node: any, parent: any) => void;
  enterTableExpr?: (node: any, parent: any) => void;
  enterCreate?: (node: any, parent: any) => void;
  enterInsert?: (node: any, parent: any) => void;
  enterUpdate?: (node: any, parent: any) => void;
  enterBinary?: (node: any, parent: any) => void;
}

function isSelect(node: any): boolean {
  return node && (node.type === 'select' || (node.with !== undefined && node.from !== undefined));
}

function isJoin(node: any): boolean {
  return node && node.join && node.db !== undefined;
}

function isTableExpr(node: any): boolean {
  return node && node.expr && node.expr.ast && node.as !== undefined;
}

function isBinary(node: any): boolean {
  return node && node.type === 'binary_expr';
}

function isCreate(node: any): boolean {
  return node && node.type === 'create' && node.keyword === 'table';
}

function isInsert(node: any): boolean {
  return node && node.type === 'insert';
}

function isUpdate(node: any): boolean {
  return node && node.type === 'update';
}

function walkNode(node: any, parent: any, cbs: WalkCallbacks): void {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) {
      walkNode(item, parent, cbs);
    }
    return;
  }

  if (isCreate(node) && cbs.enterCreate) cbs.enterCreate(node, parent);
  if (isInsert(node) && cbs.enterInsert) cbs.enterInsert(node, parent);
  if (isUpdate(node) && cbs.enterUpdate) cbs.enterUpdate(node, parent);

  if (isSelect(node)) {
    if (cbs.enterSelect) cbs.enterSelect(node, parent);
  }

  if (isBinary(node)) {
    if (cbs.enterBinary) cbs.enterBinary(node, parent);
    walkNode(node.left, node, cbs);
    walkNode(node.right, node, cbs);
    return;
  }

  if (node.with) {
    for (const cte of node.with) {
      walkNode(cte.stmt?.ast ?? cte.stmt, node, cbs);
    }
  }

  if (node.from) {
    walkFromArray(node.from, node, cbs);
  }

  if (node.where) {
    walkNode(node.where, node, cbs);
  }

  if (node.columns && Array.isArray(node.columns)) {
    for (const col of node.columns) {
      if (col.expr && col.expr.ast) {
        walkNode(col.expr.ast, node, cbs);
      }
    }
  }

  if (node.set && Array.isArray(node.set)) {
    for (const s of node.set) {
      if (s.value && s.value.ast) {
        walkNode(s.value.ast, node, cbs);
      }
    }
  }

  if (node.values && Array.isArray(node.values)) {
    for (const v of node.values) {
      if (v.ast) walkNode(v.ast, node, cbs);
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item?.ast) walkNode(item.ast, node, cbs);
        }
      }
    }
  }

  if (node.create_definitions && Array.isArray(node.create_definitions)) {
    for (const def of node.create_definitions) {
      walkNode(def, node, cbs);
    }
  }

  if (isSelect(node)) {
    if (cbs.leaveSelect) cbs.leaveSelect(node, parent);
  }
}

function walkFromArray(fromArr: any[], parent: any, cbs: WalkCallbacks): void {
  if (!Array.isArray(fromArr)) return;

  for (const item of fromArr) {
    if (!item) continue;

    if (isJoin(item)) {
      if (cbs.enterJoin) cbs.enterJoin(item, parent);
      if (item.on) walkNode(item.on, item, cbs);
      continue;
    }

    if (isTableExpr(item)) {
      if (cbs.enterTableExpr) cbs.enterTableExpr(item, parent);
      walkNode(item.expr.ast, item, cbs);
      continue;
    }

    if (item.expr && typeof item.expr === 'object') {
      if (item.expr.ast) {
        walkNode(item.expr.ast, item, cbs);
      }
      continue;
    }
  }
}

export function walkAST(ast: any | any[], cbs: WalkCallbacks): void {
  const nodes = Array.isArray(ast) ? ast : [ast];
  for (const node of nodes) {
    walkNode(node, null, cbs);
  }
}
