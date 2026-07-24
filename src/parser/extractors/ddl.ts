import type { ERColumn } from '@/types/er-diagram';
import { asArray, asNode, identifier, normalizeTableRef } from '../ast-normalizer';

export interface ForeignKeyInfo {
  columns: string[];
  refTableId: string;
  refColumns: string[];
}

export interface DDLInfo {
  columns: ERColumn[];
  primaryKeys: string[];
  uniqueKeys: string[][];
  foreignKeys: ForeignKeyInfo[];
}

function dataType(definition: unknown): string {
  const node = asNode(definition);
  if (!node) return 'unknown';
  const name = identifier(node.dataType) || 'unknown';
  const length = asArray(node.length).map(item => identifier(asNode(item)?.value ?? item)).filter(Boolean);
  const precision = identifier(node.precision);
  const scale = identifier(node.scale);
  const suffix = length.length ? `(${length.join(',')})` : precision ? `(${precision}${scale ? `,${scale}` : ''})` : '';
  return `${name}${suffix}`.toLowerCase();
}

function columnNames(value: unknown): string[] {
  const node = asNode(value);
  const raw = node?.columns ?? value;
  return asArray(raw).map(item => identifier(asNode(item)?.column ?? asNode(item)?.value ?? item)).filter(Boolean);
}

export function extractDDL(createStmt: unknown): DDLInfo {
  const columns: ERColumn[] = [];
  const primaryKeys: string[] = [];
  const uniqueKeys: string[][] = [];
  const foreignKeys: ForeignKeyInfo[] = [];
  const definitions = asArray(asNode(createStmt)?.create_definitions);

  for (const raw of definitions) {
    const def = asNode(raw);
    if (!def) continue;
    const resource = identifier(def.resource).toLowerCase();
    const constraintType = identifier(def.constraint_type).toLowerCase();

    if (resource === 'column') {
      const name = identifier(asNode(def.column)?.column ?? def.column);
      if (!name) continue;
      const nullableType = identifier(asNode(def.nullable)?.type).toLowerCase();
      const isPK = identifier(def.primary_key).toLowerCase().includes('primary') || identifier(def.unique_or_primary).toLowerCase().includes('primary');
      const isUnique = isPK || identifier(def.unique).toLowerCase() === 'unique';
      const reference = asNode(def.reference_definition ?? asNode(def.definition)?.reference_definition);
      const ref = normalizeTableRef(reference?.table);
      const refColumns = columnNames(reference?.definition ?? reference?.column);
      if (isPK) primaryKeys.push(name);
      if (isUnique) uniqueKeys.push([name]);
      if (ref) foreignKeys.push({ columns: [name], refTableId: ref.id, refColumns });
      columns.push({
        name,
        type: dataType(def.definition ?? def),
        source: 'ddl',
        isPK,
        isFK: !!ref,
        isUnique,
        fkRefTable: ref?.id,
        fkRefColumn: refColumns[0],
        nullable: nullableType !== 'not null',
      });
      continue;
    }

    if (resource !== 'constraint') continue;
    const localColumns = columnNames(def.definition);
    if (constraintType.includes('primary')) {
      localColumns.forEach(column => { if (!primaryKeys.includes(column)) primaryKeys.push(column); });
      uniqueKeys.push(localColumns);
    } else if (constraintType.includes('unique')) {
      uniqueKeys.push(localColumns);
    } else if (constraintType.includes('foreign')) {
      const reference = asNode(def.reference_definition);
      const ref = normalizeTableRef(reference?.table);
      if (ref) foreignKeys.push({ columns: localColumns, refTableId: ref.id, refColumns: columnNames(reference?.definition) });
    }
  }

  for (const column of columns) {
    column.isPK = primaryKeys.includes(column.name);
    column.isUnique = uniqueKeys.some(key => key.length === 1 && key[0] === column.name) || column.isPK;
    const fk = foreignKeys.find(key => key.columns.includes(column.name));
    if (fk) {
      const index = fk.columns.indexOf(column.name);
      column.isFK = true;
      column.fkRefTable = fk.refTableId;
      column.fkRefColumn = fk.refColumns[index];
    }
  }
  return { columns, primaryKeys, uniqueKeys: uniqueKeys.filter(key => key.length > 0), foreignKeys };
}
