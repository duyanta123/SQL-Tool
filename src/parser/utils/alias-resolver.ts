export interface AliasMap {
  [alias: string]: {
    table: string;
    db?: string;
    schema?: string;
    kind: 'physical' | 'cte' | 'subquery';
  };
}

export function tableIdFromRef(ref: { db?: string; schema?: string; table?: string; } | string): string {
  if (typeof ref === 'string') return ref;
  const parts: string[] = [];
  if (ref.db) parts.push(ref.db);
  if (ref.schema) parts.push(ref.schema);
  if (ref.table) parts.push(ref.table);
  return parts.join('.');
}

export function tableDisplayName(ref: { db?: string; schema?: string; table?: string }): string {
  return tableIdFromRef(ref);
}

export class AliasResolver {
  private maps: AliasMap[] = [];

  pushScope(): void {
    this.maps.push({});
  }

  popScope(): void {
    this.maps.pop();
  }

  currentScope(): AliasMap {
    return this.maps[this.maps.length - 1] ?? {};
  }

  registerAlias(
    alias: string | undefined,
    tableName: string,
    db: string | undefined,
    schema: string | undefined,
    kind: 'physical' | 'cte' | 'subquery' = 'physical'
  ): void {
    if (!alias) return;
    const scope = this.currentScope();
    scope[alias.toLowerCase()] = { table: tableName, db, schema, kind };
  }

  registerTable(
    ref: { table?: string; db?: string; schema?: string; as?: string | null },
    kind: 'physical' | 'cte' | 'subquery' = 'physical'
  ): string {
    const tableName = ref.table ?? '';
    const alias = ref.as || undefined;
    if (alias) {
      this.registerAlias(alias, tableName, ref.db, ref.schema, kind);
    }
    return tableIdFromRef({ table: tableName, db: ref.db, schema: ref.schema });
  }

  resolve(aliasOrTable: string): { table: string; db?: string; schema?: string; kind: string } {
    const key = aliasOrTable.toLowerCase();
    for (let i = this.maps.length - 1; i >= 0; i--) {
      if (this.maps[i][key]) return this.maps[i][key];
    }
    return { table: aliasOrTable, kind: 'physical' };
  }
}
