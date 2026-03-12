import express from 'express';
import {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  updateConversation,
  deleteConversation
} from '../controllers/chatController';
import { authenticateToken, requireAIChatAccess } from '../middleware/auth';

const router = express.Router();

router.get('/conversations', authenticateToken, requireAIChatAccess, getConversations);
router.post('/conversations', authenticateToken, requireAIChatAccess, createConversation);
router.get('/conversations/:conversationId/messages', authenticateToken, requireAIChatAccess, getMessages);
router.post('/conversations/:conversationId/messages', authenticateToken, requireAIChatAccess, sendMessage);
router.put('/conversations/:conversationId', authenticateToken, requireAIChatAccess, updateConversation);
router.delete('/conversations/:conversationId', authenticateToken, requireAIChatAccess, deleteConversation);

export default router;
