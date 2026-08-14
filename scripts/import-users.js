const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const importFile = process.argv[2];
if (!importFile) {
  console.error('Dùng: node scripts/import-users.js <tệp-tài-khoản.json>');
  process.exit(1);
}

const usersFile = path.join(__dirname, '..', 'users.json');
const users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, 'utf8')) : [];
const accounts = JSON.parse(fs.readFileSync(importFile, 'utf8'));
let created = 0;

for (const account of accounts) {
  if (!account.username || !account.name || !account.sale || !account.password) continue;
  if (users.some(user => user.username.toLowerCase() === account.username.toLowerCase())) continue;
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = `scrypt$${salt}$${crypto.scryptSync(account.password, salt, 64).toString('hex')}`;
  users.push({
    id: `sale-${crypto.randomUUID()}`,
    name: account.name,
    username: account.username,
    role: 'sale',
    sale: account.sale,
    ...(account.saleAliases?.length ? { saleAliases: account.saleAliases } : {}),
    passwordHash
  });
  created += 1;
}

fs.writeFileSync(usersFile, `${JSON.stringify(users, null, 2)}\n`, { mode: 0o600 });
console.log(`Đã tạo ${created} tài khoản Sale.`);
