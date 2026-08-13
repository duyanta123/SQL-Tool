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
  if (profile.kind === 'mssql') {
    const { default: sql } = await import('mssql');
    const windowsAuth = profile.authType === 'windows';
    const config = {
      server: profile.host,
      port: profile.port,
      database: profile.database,
      connectionTimeout: 10000,
      requestTimeout: 20000,
      pool: { max: 1, min: 0, idleTimeoutMillis: 30000 },
      options: { encrypt: profile.encrypt !== false, trustServerCertificate: true },
    };
    if (windowsAuth) {
      config.options.trustedConnection = true;
    } else {
      config.user = profile.username;
      config.password = password;
    }
    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    connections.set(profile.id, { kind: profile.kind, client: pool });
    return pool;
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
  try {
    await connect(profile, password);
    return { ok: true, message: '连接成功' };
  } catch (error) {
    throw new Error(readableDatabaseError(error, profile.kind));
  }
}

async function introspect(profile, password) {
  let entry = connections.get(profile.id);
  if (!entry || entry.kind !== profile.kind) {
    await connect(profile, password);
    entry = connections.get(profile.id);
  }
  let tables;
  try {
    if (profile.kind === 'sqlite') tables = introspectSQLite(entry.client);
    else if (profile.kind === 'mysql') tables = await introspectMySQL(entry.client, profile.database);
    else if (profile.kind === 'mssql') tables = await introspectMSSQL(entry.client, profile.schema);
    else tables = await introspectPostgreSQL(entry.client, profile.schema);
  } catch (error) {
    throw new Error(readableDatabaseError(error, profile.kind));
  }
  return { connectionId: profile.id, fetchedAt: Date.now(), tables };
}

async function disconnect(connectionId) {
  const entry = connections.get(connectionId);
  if (!entry) return;
  connections.delete(connectionId);
  if (entry.kind === 'sqlite') entry.client.close();
  else if (entry.kind === 'mssql') await entry.client.close();
  else await entry.client.end();
}

function introspectSQLite(db) {
  const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const tables = tableRows.map(({ name }) => {
    const escaped = quoteSQLiteIdentifier(name);
    const rawColumns = db.prepare(`PRAGMA table_info(${escaped})`).all();
    const indexRows = db.prepare(`PRAGMA index_list(${escaped})`).all();
    const uniqueColumns = new Set();
    const indexes = [];
    for (const index of indexRows) {
      const columns = db.prepare(`PRAGMA index_xinfo(${quoteSQLiteIdentifier(index.name)})`).all()
        .filter(item => item.key === 1 && item.name != null)
        .sort((a, b) => a.seqno - b.seqno)
        .map(item => item.name);
      if (columns.length === 0) continue;
      indexes.push({ name: index.name, columns, unique: index.unique === 1 });
      if (index.unique === 1 && columns.length === 1) uniqueColumns.add(columns[0]);
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
      kind: 'table',
      columns: rawColumns.map(column => ({
        name: column.name,
        type: column.type || 'unknown',
        nullable: column.notnull === 0 && column.pk === 0,
        isPrimaryKey: column.pk > 0,
        isUnique: column.pk > 0 || uniqueColumns.has(column.name),
        defaultValue: column.dflt_value == null ? null : String(column.dflt_value),
      })),
      foreignKeys,
      indexes,
    };
  });
  const viewRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'view' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const views = viewRows.map(({ name }) => {
    const escaped = quoteSQLiteIdentifier(name);
    const rawColumns = db.prepare(`PRAGMA table_info(${escaped})`).all();
    return {
      id: name,
      name,
      kind: 'view',
      columns: rawColumns.map(column => ({
        name: column.name,
        type: column.type || 'unknown',
        nullable: column.notnull === 0 && column.pk === 0,
        isPrimaryKey: false,
        isUnique: false,
        defaultValue: column.dflt_value == null ? null : String(column.dflt_value),
      })),
      foreignKeys: [],
      indexes: [],
    };
  });
  return [...tables, ...views];
}

async function introspectMySQL(client, database) {
  const [columnRows] = await client.execute(`SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, COLUMN_COMMENT
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [database]);
  const [foreignRows] = await client.execute(`SELECT CONSTRAINT_NAME, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, ORDINAL_POSITION
    FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`, [database]);
  const [tableCommentRows] = await client.execute(`SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`, [database]);
  const [indexRows] = await client.execute(`SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`, [database]);
  const [viewRows] = await client.execute(`SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?`, [database]);

  const tables = assembleServerTables(columnRows, foreignRows, {
    tableId: row => row.TABLE_SCHEMA === database ? row.TABLE_NAME : `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`,
    column: row => ({ name: row.COLUMN_NAME, type: row.COLUMN_TYPE, nullable: row.IS_NULLABLE === 'YES', isPrimaryKey: row.COLUMN_KEY === 'PRI', isUnique: row.COLUMN_KEY === 'PRI' || row.COLUMN_KEY === 'UNI', defaultValue: row.COLUMN_DEFAULT, comment: row.COLUMN_COMMENT || undefined }),
    foreignId: row => row.CONSTRAINT_NAME,
    referencedId: row => row.REFERENCED_TABLE_SCHEMA === database ? row.REFERENCED_TABLE_NAME : `${row.REFERENCED_TABLE_SCHEMA}.${row.REFERENCED_TABLE_NAME}`,
  });

  const commentsByTable = new Map();
  for (const row of tableCommentRows) commentsByTable.set(row.TABLE_NAME, row.TABLE_COMMENT || undefined);
  const indexesByTable = new Map();
  for (const row of indexRows) {
    const list = indexesByTable.get(row.TABLE_NAME) ?? [];
    const existing = list.find(item => item.name === row.INDEX_NAME);
    if (existing) existing.columns.push(row.COLUMN_NAME);
    else list.push({ name: row.INDEX_NAME, columns: [row.COLUMN_NAME], unique: row.NON_UNIQUE === 0 });
    indexesByTable.set(row.TABLE_NAME, list);
  }
  const views = new Set(viewRows.map(row => row.TABLE_NAME));
  for (const table of tables) {
    table.comment = commentsByTable.get(table.name);
    table.indexes = indexesByTable.get(table.name) ?? [];
    if (views.has(table.name)) table.kind = 'view';
  }
  return tables;
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
  const columnComments = await client.query(`SELECT n.nspname AS table_schema, c.relname AS table_name, a.attname AS column_name,
    col_description(c.oid, a.attnum) AS comment
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE c.relkind IN ('r', 'v', 'm', 'p') AND ($1::text IS NULL OR n.nspname = $1)`, [schema || null]);
  const tableComments = await client.query(`SELECT n.nspname AS table_schema, c.relname AS table_name, obj_description(c.oid) AS comment
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'v', 'm') AND ($1::text IS NULL OR n.nspname = $1)`, [schema || null]);
  const indexes = await client.query(`SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE ($1::text IS NULL OR schemaname = $1)`, [schema || null]);
  const views = await client.query(`SELECT table_schema, table_name FROM information_schema.views WHERE ($1::text IS NULL OR table_schema = $1)`, [schema || null]);
  const checks = await client.query(`SELECT tc.constraint_name, tc.table_schema, tc.table_name, ccu.column_name, cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON cc.constraint_schema = tc.constraint_schema AND cc.constraint_name = tc.constraint_name
    LEFT JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_schema = tc.constraint_schema AND ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'CHECK' AND ($1::text IS NULL OR tc.table_schema = $1)`, [schema || null]);

  const tables = assembleServerTables(columns.rows, foreign.rows, {
    tableId: row => `${row.table_schema}.${row.table_name}`,
    column: row => ({ name: row.column_name, type: row.data_type === 'USER-DEFINED' ? row.udt_name : row.data_type, nullable: row.is_nullable === 'YES', isPrimaryKey: row.is_primary, isUnique: row.is_unique, defaultValue: row.column_default }),
    foreignId: row => row.constraint_name,
    referencedId: row => `${row.referenced_table_schema}.${row.referenced_table_name}`,
  });

  const columnCommentMap = new Map();
  for (const row of columnComments.rows) columnCommentMap.set(`${row.table_schema}|${row.table_name}|${row.column_name}`, row.comment || undefined);
  const tableCommentMap = new Map();
  for (const row of tableComments.rows) tableCommentMap.set(`${row.table_schema}|${row.table_name}`, row.comment || undefined);
  const indexMap = new Map();
  for (const row of indexes.rows) {
    const key = `${row.schemaname}|${row.tablename}`;
    const list = indexMap.get(key) ?? [];
    list.push({ name: row.indexname, columns: [], unique: /create unique index/i.test(row.indexdef || '') });
    indexMap.set(key, list);
  }
  const viewKeys = new Set(views.rows.map(row => `${row.table_schema}|${row.table_name}`));
  const checkMap = new Map();
  for (const row of checks.rows) {
    const key = `${row.table_schema}|${row.table_name}`;
    const list = checkMap.get(key) ?? [];
    list.push({ name: row.constraint_name, column: row.column_name || undefined, definition: row.check_clause ?? '' });
    checkMap.set(key, list);
  }
  for (const table of tables) {
    const key = `${table.schema ?? ''}|${table.name}`;
    table.comment = tableCommentMap.get(key);
    for (const column of table.columns) column.comment = columnCommentMap.get(`${key}|${column.name}`);
    table.indexes = indexMap.get(key) ?? [];
    if (viewKeys.has(key)) table.kind = 'view';
    const tableChecks = checkMap.get(key);
    if (tableChecks && tableChecks.length) table.checkConstraints = tableChecks;
  }
  return tables;
}

function assembleServerTables(columnRows, foreignRows, adapter) {
  const tables = new Map();
  for (const row of columnRows) {
    const schema = row.TABLE_SCHEMA ?? row.table_schema;
    const name = row.TABLE_NAME ?? row.table_name;
    const id = adapter.tableId(row);
    if (!tables.has(id)) tables.set(id, { id, schema, name, columns: [], foreignKeys: [], indexes: [] });
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

async function introspectMSSQL(pool, schema) {
  const { default: sql } = await import('mssql');
  const query = async (text, value) => {
    const request = pool.request();
    if (value != null) request.input('p0', sql.NVarChar, value);
    const result = await request.query(text);
    return result.recordset;
  };
  const optionalSchema = '(@p0 IS NULL OR TABLE_SCHEMA = @p0)';
  const columnRows = await query(
    `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION
     FROM INFORMATION_SCHEMA.COLUMNS WHERE ${optionalSchema} ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    schema,
  );
  const foreignRows = await query(
    `SELECT kcu.CONSTRAINT_NAME, kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.ORDINAL_POSITION,
       ccu.TABLE_SCHEMA AS REFERENCED_TABLE_SCHEMA, ccu.TABLE_NAME AS REFERENCED_TABLE_NAME, ccu.COLUMN_NAME AS REFERENCED_COLUMN_NAME
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
     JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
     JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu ON ccu.CONSTRAINT_SCHEMA = rc.UNIQUE_CONSTRAINT_SCHEMA AND ccu.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
     WHERE ${optionalSchema} ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
    schema,
  );
  const keyRows = await query(
    `SELECT tc.TABLE_SCHEMA, tc.TABLE_NAME, kcu.COLUMN_NAME, tc.CONSTRAINT_TYPE
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
     JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     WHERE tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE') AND ${optionalSchema}`,
    schema,
  );

  const tables = assembleServerTables(columnRows, foreignRows, {
    tableId: row => row.TABLE_SCHEMA === schema ? row.TABLE_NAME : `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`,
    column: row => ({ name: row.COLUMN_NAME, type: row.DATA_TYPE, nullable: row.IS_NULLABLE === 'YES', isPrimaryKey: false, isUnique: false, defaultValue: row.COLUMN_DEFAULT }),
    foreignId: row => row.CONSTRAINT_NAME,
    referencedId: row => row.REFERENCED_TABLE_SCHEMA === schema ? row.REFERENCED_TABLE_NAME : `${row.REFERENCED_TABLE_SCHEMA}.${row.REFERENCED_TABLE_NAME}`,
  });

  const keyMap = new Map();
  for (const row of keyRows) {
    keyMap.set(`${row.TABLE_SCHEMA}|${row.TABLE_NAME}|${row.COLUMN_NAME}`, row.CONSTRAINT_TYPE);
  }
  for (const table of tables) {
    for (const column of table.columns) {
      const constraint = keyMap.get(`${table.schema ?? ''}|${table.name}|${column.name}`);
      if (constraint === 'PRIMARY KEY') { column.isPrimaryKey = true; column.isUnique = true; }
      else if (constraint === 'UNIQUE') column.isUnique = true;
    }
  }
  return tables;
}

function readableDatabaseError(error, kind) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (kind === 'sqlite') {
    if (lower.includes('unable to open database file')) return '无法打开数据库文件：请确认路径存在且当前用户有读取权限';
    return message;
  }
  if (lower.includes('econnrefused')) return '连接被拒绝（ECONNREFUSED）：请确认数据库服务已启动、端口正确且服务监听当前地址';
  if (lower.includes('etimedout') || lower.includes('timeout')) return '连接超时：请检查防火墙、VPN、容器端口映射与监听地址';
  if (lower.includes('access denied') || lower.includes('password authentication failed') || lower.includes('login failed') || lower.includes('28p01')) return '认证失败：请检查用户名、密码与数据库权限';
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) return '无法解析主机名：请检查主机地址';
  if (lower.includes('self-signed') || lower.includes('certificate')) return 'TLS 证书校验失败：可尝试开启“跳过证书校验”';
  return message;
}

module.exports = { connect, disconnect, introspect, introspectMySQL, introspectPostgreSQL, introspectSQLite, introspectMSSQL, readableDatabaseError, testConnection };
