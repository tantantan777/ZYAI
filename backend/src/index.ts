import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import { createUsersTable } from './models/user';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// 路由
app.use('/api/auth', authRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ZJZAI Backend is running' });
});

// 初始化数据库表
const initDatabase = async () => {
  try {
    await createUsersTable();
    console.log('数据库表初始化成功');
  } catch (error) {
    console.error('数据库表初始化失败:', error);
  }
};

// 启动服务器
app.listen(PORT, async () => {
  await initDatabase();
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
