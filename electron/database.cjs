const connections = new Map();

async function connect(profile, password) {
  await disconnect(profile.id);
  if (profile.kind === 'sqlite') {
    const module = await import('better-sqlite3');
    const db = new module.default(profile.filePath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    connections.set(profile.id, { kind: profile.kind, client: db });
    return db;
  }
  if (profile.kind === 'mysql') {
    const mysql = await import('mysql2/promise');
    const client = await mysql.createConnection({
      host: profile.host, port: profile.port, database: profile.database,
      user: profile.username, password, connectTimeout: 10000, multipleStatements: false,
    });
    connections.set(profile.id, { kind: profile.kind, client });
    return client;
  }
  const { Client } = await import('pg');
  const client = new Client({
    host: profile.host, port: profile.port, database: profile.database,
    user: profile.username, password, connectionTimeoutMillis: 10000,
  });
  await client.connect();
  connections.set(profile.id, { kind: profile.kind, client });
  return client;
}

async function testConnection(profile, password) {
  await connect(profile, password);
  return { ok: true, message: '连接成功' };
}

async function introspect(profile, password) {
  let entry = connections.get(profile.id);
  if (!entry || entry.kind !== profile.kind) {
    await connect(profile, password);
    entry = connections.get(profile.id);
  }
  let tables;
  if (profile.kind === 'sqlite') tables = introspectSQLite(entry.client);
  else if (profile.kind === 'mysql') tables = await introspectMySQL(entry.client, profile.database);
  else tables = await introspectPostgreSQL(entry.client, profile.schema);
  return { connectionId: profile.id, fetchedAt: Date.now(), tables };
}

async function disconnect(connectionId) {
  const entry = connections.get(connectionId);
  if (!entry) return;
  connections.delete(connectionId);
  if (entry.kind === 'sqlite') entry.client.close();
  else await entry.client.end();
}

function introspectSQLite(db) {
  const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return tableRows.map(({ name }) => {
    const escaped = quoteSQLiteIdentifier(name);
    const rawColumns = db.prepare(`PRAGMA table_info(${escaped})`).all();
    const indexRows = db.prepare(`PRAGMA index_list(${escaped})`).all();
    const uniqueColumns = new Set();
    for (const index of indexRows.filter(item => item.unique)) {
      const columns = db.prepare(`PRAGMA index_info(${quoteSQLiteIdentifier(index.name)})`).all().map(item => item.name);
      if (columns.length === 1) uniqueColumns.add(columns[0]);
    }
    const foreignRows = db.prepare(`PRAGMA foreign_key_list(${escaped})`).all();
    const foreignKeys = groupRows(foreignRows, row => String(row.id), (id, rows) => ({
      id: `fk-${id}`,
      columns: rows.sort((a, b) => a.seq - b.seq).map(row => row.from),
      referencedTableId: rows[0].table,
      referencedColumns: rows.sort((a, b) => a.seq - b.seq).map(row => row.to),
    }));
    return {
      id: name,
      name,
      columns: rawColumns.map(column => ({
        name: column.name,
        type: column.type || 'unknown',
        nullable: column.notnull === 0 && column.pk === 0,
        isPrimaryKey: column.pk > 0,
        isUnique: column.pk > 0 || uniqueColumns.has(column.name),
        defaultValue: column.dflt_value == null ? null : String(column.dflt_value),
      })),
      foreignKeys,
    };
  });
}

async function introspectMySQL(client, database) {
  const [columnRows] = await client.execute(`SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [database]);
  const [foreignRows] = await client.execute(`SELECT CONSTRAINT_NAME, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, ORDINAL_POSITION
    FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`, [database]);
  return assembleServerTables(columnRows, foreignRows, {
    tableId: row => row.TABLE_SCHEMA === database ? row.TABLE_NAME : `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`,
    column: row => ({ name: row.COLUMN_NAME, type: row.COLUMN_TYPE, nullable: row.IS_NULLABLE === 'YES', isPrimaryKey: row.COLUMN_KEY === 'PRI', isUnique: row.COLUMN_KEY === 'PRI' || row.COLUMN_KEY === 'UNI', defaultValue: row.COLUMN_DEFAULT }),
    foreignId: row => row.CONSTRAINT_NAME,
    referencedId: row => row.REFERENCED_TABLE_SCHEMA === database ? row.REFERENCED_TABLE_NAME : `${row.REFERENCED_TABLE_SCHEMA}.${row.REFERENCED_TABLE_NAME}`,
  });
}

async function introspectPostgreSQL(client, schema) {
  const columns = await client.query(`SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default,
    COALESCE(bool_or(tc.constraint_type = 'PRIMARY KEY'), false) AS is_primary,
    COALESCE(bool_or(tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')), false) AS is_unique
    FROM information_schema.columns c
    LEFT JOIN information_schema.key_column_usage kcu ON kcu.table_schema = c.table_schema AND kcu.table_name = c.table_name AND kcu.column_name = c.column_name
    LEFT JOIN information_schema.table_constraints tc ON tc.constraint_schema = kcu.constraint_schema AND tc.constraint_name = kcu.constraint_name
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema') AND ($1::text IS NULL OR c.table_schema = $1)
    GROUP BY c.table_schema, c.table_name, c.ordinal_position, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default
    ORDER BY c.table_schema, c.table_name, c.ordinal_position`, [schema || null]);
  const foreign = await client.query(`SELECT tc.constraint_name, kcu.table_schema, kcu.table_name, kcu.column_name,
    ccu.table_schema AS referenced_table_schema, ccu.table_name AS referenced_table_name, ccu.column_name AS referenced_column_name, kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_schema = tc.constraint_schema AND kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_schema = tc.constraint_schema AND ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ($1::text IS NULL OR kcu.table_schema = $1)
    ORDER BY kcu.table_schema, kcu.table_name, tc.constraint_name, kcu.ordinal_position`, [schema || null]);
  return assembleServerTables(columns.rows, foreign.rows, {
    tableId: row => `${row.table_schema}.${row.table_name}`,
    column: row => ({ name: row.column_name, type: row.data_type === 'USER-DEFINED' ? row.udt_name : row.data_type, nullable: row.is_nullable === 'YES', isPrimaryKey: row.is_primary, isUnique: row.is_unique, defaultValue: row.column_default }),
    foreignId: row => row.constraint_name,
    referencedId: row => `${row.referenced_table_schema}.${row.referenced_table_name}`,
  });
}

function assembleServerTables(columnRows, foreignRows, adapter) {
  const tables = new Map();
  for (const row of columnRows) {
    const schema = row.TABLE_SCHEMA ?? row.table_schema;
    const name = row.TABLE_NAME ?? row.table_name;
    const id = adapter.tableId(row);
    if (!tables.has(id)) tables.set(id, { id, schema, name, columns: [], foreignKeys: [] });
    tables.get(id).columns.push(adapter.column(row));
  }
  const grouped = groupRows(foreignRows, row => `${adapter.tableId(row)}::${adapter.foreignId(row)}`, (_id, rows) => ({
    id: adapter.foreignId(rows[0]),
    tableId: adapter.tableId(rows[0]),
    columns: rows.map(row => row.COLUMN_NAME ?? row.column_name),
    referencedTableId: adapter.referencedId(rows[0]),
    referencedColumns: rows.map(row => row.REFERENCED_COLUMN_NAME ?? row.referenced_column_name),
  }));
  for (const foreignKey of grouped) {
    const table = tables.get(foreignKey.tableId);
    if (table) table.foreignKeys.push({ id: foreignKey.id, columns: foreignKey.columns, referencedTableId: foreignKey.referencedTableId, referencedColumns: foreignKey.referencedColumns });
  }
  return [...tables.values()];
}

function groupRows(rows, keyFor, project) {
  const groups = new Map();
  for (const row of rows) groups.set(keyFor(row), [...(groups.get(keyFor(row)) ?? []), row]);
  return [...groups].map(([key, values]) => project(key, values));
}

function quoteSQLiteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

module.exports = { connect, disconnect, introspect, introspectMySQL, introspectPostgreSQL, introspectSQLite, testConnection };
