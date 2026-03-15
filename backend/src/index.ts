import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import aiConfigRoutes from './routes/aiConfig';
import orgRoutes from './routes/org';
import projectRoutes from './routes/project';
import systemLogRoutes from './routes/systemLog';
import userRoutes from './routes/user';
import { createUsersTable } from './models/user';
import { createAIConfigTable, createConversationsTable, createMessagesTable } from './models/aiConfig';
import { createAuditLogsTable } from './models/auditLog';
import { createOrgStructureTables } from './models/orgStructure';
import { createProjectTables } from './models/project';
import { expressCorsOptions } from './config/cors';
import { presenceService } from './services/presenceService';
import { attachSocketServer } from './services/socketServer';
import { verificationCodeStore } from './services/verificationCodeStore';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors(expressCorsOptions));
app.use(express.json({ limit: '20mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai-config', aiConfigRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/system-logs', systemLogRoutes);
app.use('/api/user', userRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: '万物方圆智能化 Backend is running' });
});

const initDatabase = async () => {
  try {
    await createUsersTable();
    await createAIConfigTable();
    await createConversationsTable();
    await createMessagesTable();
    await createAuditLogsTable();
    await createOrgStructureTables();
    await createProjectTables();
    console.log('Database tables initialized');
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    throw error;
  }
};

attachSocketServer(server);

const bootstrap = async () => {
  await initDatabase();
  await verificationCodeStore.initialize();
  await presenceService.initialize();

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
};

void bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
