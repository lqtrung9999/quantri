const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).reduce((list, value, index, all) => value.startsWith('--') ? [...list, [value.slice(2), all[index + 1]]] : list, []));
const roles = ['admin', 'accountant', 'sale', 'warehouse_cn', 'customs_declaration', 'manager', 'truck_planner'];
const required = ['username', 'name', 'role', 'password'];
if (required.some(key => !args[key]) || !roles.includes(args.role) || (args.role === 'sale' && !args.sale)) {
  console.error('Dùng: npm run add-user -- --username <tên> --name "Họ tên" --role admin|accountant|sale|warehouse_cn|customs_declaration|manager|truck_planner --password "Mật khẩu" [--sale "Tên Sale đúng như Google Sheet"]');
  process.exit(1);
}
const file = path.join(__dirname, 'users.json');
const users = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
if (users.some(user => user.username.toLowerCase() === args.username.toLowerCase())) {
  console.error('Tên đăng nhập đã tồn tại.');
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString('hex');
const passwordHash = `scrypt$${salt}$${crypto.scryptSync(args.password, salt, 64).toString('hex')}`;
const saleAliases = String(args['sale-aliases'] || '').split('|').map(value => value.trim()).filter(Boolean);
users.push({ id: `${args.role}-${crypto.randomUUID()}`, name: args.name, username: args.username, role: args.role, ...(args.role === 'sale' ? { sale: args.sale, ...(saleAliases.length ? { saleAliases } : {}) } : {}), passwordHash });
fs.writeFileSync(file, `${JSON.stringify(users, null, 2)}\n`);
console.log(`Đã tạo tài khoản ${args.username} (${args.role}).`);
