import express from 'express';
import {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  updateConversation,
  deleteConversation
} from '../controllers/chatController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.get('/conversations', authenticateToken, getConversations);
router.post('/conversations', authenticateToken, createConversation);
router.get('/conversations/:conversationId/messages', authenticateToken, getMessages);
router.post('/conversations/:conversationId/messages', authenticateToken, sendMessage);
router.put('/conversations/:conversationId', authenticateToken, updateConversation);
router.delete('/conversations/:conversationId', authenticateToken, deleteConversation);

export default router;
