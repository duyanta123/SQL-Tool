const fs = require('node:fs/promises');
const path = require('node:path');

function createProfileStore(userDataPath, safeStorage) {
  const filePath = path.join(userDataPath, 'database-profiles.json');

  async function readRecords() {
    try {
      const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
      return Array.isArray(value) ? value : [];
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      throw new Error('无法读取本机数据库连接配置');
    }
  }

  async function writeRecords(records) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(records, null, 2), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, filePath);
  }

  async function listProfiles() {
    return (await readRecords()).map(({ encryptedPassword: _password, ...profile }) => profile);
  }

  async function saveProfile(input) {
    const records = await readRecords();
    const existing = records.find(record => record.id === input.id);
    const { password, ...profile } = input;
    const record = { ...profile };
    if (profile.rememberPassword) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储当前不可用，无法记住密码');
      if (password) record.encryptedPassword = safeStorage.encryptString(password).toString('base64');
      else if (existing?.encryptedPassword) record.encryptedPassword = existing.encryptedPassword;
    }
    const next = records.filter(item => item.id !== input.id);
    next.push(record);
    await writeRecords(next);
    return profile;
  }

  async function passwordFor(id) {
    const record = (await readRecords()).find(item => item.id === id);
    if (!record?.encryptedPassword) return undefined;
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储当前不可用，无法读取已保存密码');
    return safeStorage.decryptString(Buffer.from(record.encryptedPassword, 'base64'));
  }

  return { listProfiles, passwordFor, saveProfile };
}

module.exports = { createProfileStore };
