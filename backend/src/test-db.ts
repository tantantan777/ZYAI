import pool from './config/database';
import { createUsersTable } from './models/user';

async function testDatabase() {
  try {
    console.log('正在测试数据库连接...');

    // 测试连接
    const result = await pool.query('SELECT NOW()');
    console.log('✓ 数据库连接成功:', result.rows[0]);

    // 创建表
    console.log('\n正在创建数据库表...');
    await createUsersTable();
    console.log('✓ 数据库表创建成功');

    // 检查表是否存在
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    console.log('\n当前数据库表:');
    tables.rows.forEach(row => console.log('  -', row.table_name));

    console.log('\n✓ 数据库测试完成');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ 数据库测试失败:', error);
    process.exit(1);
  }
}

testDatabase();
