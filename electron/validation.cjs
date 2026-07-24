const path = require('node:path');

const KINDS = new Set(['sqlite', 'mysql', 'postgresql']);
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function validateConnectionId(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error('连接 ID 无效');
  return value;
}

function validateProfile(raw, { allowMissingFile = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('数据库连接参数无效');
  const id = validateConnectionId(raw.id);
  const kind = typeof raw.kind === 'string' && KINDS.has(raw.kind) ? raw.kind : null;
  if (!kind) throw new Error('不支持的数据库类型');
  const name = cleanText(raw.name, '连接名称', 80);
  const profile = { id, name, kind, rememberPassword: raw.rememberPassword === true };

  if (kind === 'sqlite') {
    if (!allowMissingFile || raw.filePath) {
      if (typeof raw.filePath !== 'string' || !path.isAbsolute(raw.filePath) || raw.filePath.includes('\0')) throw new Error('请选择有效的 SQLite 文件');
      profile.filePath = path.normalize(raw.filePath);
    }
  } else {
    profile.host = cleanText(raw.host, '主机', 255);
    const port = Number(raw.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须在 1 到 65535 之间');
    profile.port = port;
    profile.database = cleanText(raw.database, '数据库名', 128);
    profile.username = cleanText(raw.username, '用户名', 128);
    if (raw.schema != null && raw.schema !== '') profile.schema = cleanText(raw.schema, 'Schema', 128);
  }
  if (raw.password != null) {
    if (typeof raw.password !== 'string' || raw.password.length > 1024) throw new Error('密码格式无效');
    profile.password = raw.password;
  }
  return profile;
}

function cleanText(value, label, maxLength) {
  if (typeof value !== 'string') throw new Error(`${label}不能为空`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || [...normalized].some(character => character.charCodeAt(0) < 32)) throw new Error(`${label}格式无效`);
  return normalized;
}

module.exports = { validateConnectionId, validateProfile };
