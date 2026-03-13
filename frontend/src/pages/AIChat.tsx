import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Grid,
  Input,
  Layout,
  Modal,
  Space,
  Spin,
  Typography,
  Alert,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  MenuOutlined,
  MoreOutlined,
  PlusOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { openActionConfirmDialog, openDeleteDialog } from '../utils/confirm';
import { feedback as message } from '../utils/feedback';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './AIChat.css';

const { Sider, Content } = Layout;
const { TextArea } = Input;
const { Title, Text } = Typography;

const API_BASE_URL = 'http://localhost:3000/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

type ConversationTopic = '项目管理' | '进度跟踪' | '风险分析' | '资料整理';

interface MessageItem {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ConversationItem {
  id: number;
  title: string;
  lastMessage: string;
  updatedAt: string;
  topic: ConversationTopic;
  messages: MessageItem[];
}

function sortConversations(items: ConversationItem[]) {
  return [...items].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function formatConversationTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getHistoryGroupLabel(value: string) {
  const target = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (target.toDateString() === today.toDateString()) {
    return '今天';
  }

  if (target.toDateString() === yesterday.toDateString()) {
    return '昨天';
  }

  return '更早';
}

export default function AIChat() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [respondingConversationId, setRespondingConversationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAIConfig, setHasAIConfig] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAIConfig();
    loadConversations();
  }, []);

  useEffect(() => {
    if (currentConversationId) {
      loadMessages(currentConversationId);
    }
  }, [currentConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, currentConversationId, respondingConversationId]);

  const checkAIConfig = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/ai-config`, {
        headers: getAuthHeaders()
      });
      setHasAIConfig(!!response.data.config);
    } catch (error) {
      console.error('检查AI配置失败:', error);
      setHasAIConfig(false);
    }
  };

  const loadConversations = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/chat/conversations`, {
        headers: getAuthHeaders()
      });

      const loadedConversations = response.data.conversations.map((conv: any) => ({
        id: conv.id,
        title: conv.title,
        lastMessage: conv.last_message || '',
        updatedAt: conv.updated_at,
        topic: conv.topic as ConversationTopic,
        messages: []
      }));

      setConversations(sortConversations(loadedConversations));

      if (loadedConversations.length > 0 && !currentConversationId) {
        setCurrentConversationId(loadedConversations[0].id);
      }
    } catch (error: any) {
      console.error('加载对话列表失败:', error);
      if (error.response?.status !== 401) {
        message.error('对话列表加载失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: number) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/chat/conversations/${conversationId}/messages`,
        { headers: getAuthHeaders() }
      );

      const loadedMessages = response.data.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.created_at
      }));

      setConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId
            ? { ...conv, messages: loadedMessages }
            : conv
        )
      );
    } catch (error: any) {
      console.error('加载消息失败:', error);
      message.error('消息加载失败，请稍后重试');
    }
  };

  const currentConversation = conversations.find(item => item.id === currentConversationId);

  const groupedConversations = ['今天', '昨天', '更早']
    .map((label) => ({
      label,
      items: conversations.filter((item) => getHistoryGroupLabel(item.updatedAt) === label),
    }))
    .filter((group) => group.items.length > 0);

  const handleNewConversation = async () => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/chat/conversations`,
        { title: '新对话', topic: '项目管理' },
        { headers: getAuthHeaders() }
      );

      const newConv: ConversationItem = {
        id: response.data.conversation.id,
        title: response.data.conversation.title,
        lastMessage: '',
        updatedAt: response.data.conversation.updated_at,
        topic: response.data.conversation.topic,
        messages: []
      };

      setConversations(prev => sortConversations([newConv, ...prev]));
      setCurrentConversationId(newConv.id);
      setInputValue('');
      setHistoryDrawerOpen(false);
    } catch (error: any) {
      message.error(error.response?.data?.message || '会话创建失败，请稍后重试');
    }
  };

  const openRenameModal = (conversationId: number) => {
    const target = conversations.find((item) => item.id === conversationId);
    if (!target) {
      return;
    }

    setRenameTargetId(conversationId);
    setRenameValue(target.title);
    setRenameModalOpen(true);
  };

  const handleRenameConversation = async () => {
    if (!renameTargetId || !renameValue.trim()) {
      return;
    }

    try {
      await axios.put(
        `${API_BASE_URL}/chat/conversations/${renameTargetId}`,
        { title: renameValue.trim() },
        { headers: getAuthHeaders() }
      );

      setConversations(prev =>
        prev.map(item =>
          item.id === renameTargetId
            ? { ...item, title: renameValue.trim() }
            : item
        )
      );
      setRenameModalOpen(false);
      setRenameTargetId(null);
      setRenameValue('');
      message.success('会话名称已更新');
    } catch (error: any) {
      message.error(error.response?.data?.message || '会话重命名失败，请稍后重试');
    }
  };

  const handleDeleteConversation = (conversationId: number) => {
    openDeleteDialog({
      entityLabel: '历史对话',
      onOk: async () => {
        try {
          await axios.delete(
            `${API_BASE_URL}/chat/conversations/${conversationId}`,
            { headers: getAuthHeaders() }
          );

          const remaining = conversations.filter(item => item.id !== conversationId);
          setConversations(remaining);

          if (conversationId === currentConversationId) {
            setCurrentConversationId(remaining.length > 0 ? remaining[0].id : null);
          }

          message.success('历史对话已删除');
        } catch (error: any) {
          message.error(error.response?.data?.message || '会话删除失败，请稍后重试');
        }
      },
    });
  };

  const handleSend = async () => {
    const prompt = inputValue.trim();
    if (!prompt || !currentConversation || respondingConversationId !== null) {
      return;
    }

    const targetConversationId = currentConversation.id;
    const tempUserMessage: MessageItem = {
      id: Date.now(),
      role: 'user',
      content: prompt,
      createdAt: new Date().toISOString(),
    };

    setConversations(prev =>
      prev.map(item =>
        item.id === targetConversationId
          ? {
              ...item,
              messages: [...item.messages, tempUserMessage],
              lastMessage: prompt,
              updatedAt: tempUserMessage.createdAt
            }
          : item
      )
    );
    setInputValue('');
    setRespondingConversationId(targetConversationId);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/chat/conversations/${targetConversationId}/messages`,
        { content: prompt },
        { headers: getAuthHeaders() }
      );

      const userMessage: MessageItem = {
        id: response.data.userMessage.id,
        role: 'user',
        content: response.data.userMessage.content,
        createdAt: response.data.userMessage.created_at,
      };

      const assistantMessage: MessageItem = {
        id: response.data.assistantMessage.id,
        role: 'assistant',
        content: response.data.assistantMessage.content,
        createdAt: response.data.assistantMessage.created_at,
      };

      setConversations(prev =>
        prev.map(item =>
          item.id === targetConversationId
            ? {
                ...item,
                messages: [
                  ...item.messages.filter(m => m.id !== tempUserMessage.id),
                  userMessage,
                  assistantMessage
                ],
                updatedAt: assistantMessage.createdAt
              }
            : item
        )
      );
    } catch (error: any) {
      if (error.response?.data?.code === 'NO_AI_CONFIG') {
        setHasAIConfig(false);
        openActionConfirmDialog({
          actionLabel: '前往 AI 配置',
          content: '当前未配置 AI 服务。是否前往系统配置继续设置？',
          okText: '前往配置',
          cancelText: '稍后再说',
          onOk: () => {
            navigate('/system-settings');
          },
        });
      } else {
        message.error(error.response?.data?.message || '消息发送失败，请稍后重试');
      }
      setConversations(prev =>
        prev.map(item =>
          item.id === targetConversationId
            ? {
                ...item,
                messages: item.messages.filter(m => m.id !== tempUserMessage.id)
              }
            : item
        )
      );
    } finally {
      setRespondingConversationId(null);
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const getConversationMenu = (conversationId: number): MenuProps['items'] => [
    {
      key: 'rename',
      icon: <EditOutlined />,
      label: '重命名',
      onClick: () => openRenameModal(conversationId),
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => handleDeleteConversation(conversationId),
    },
  ];

  const historyPanel = (
    <div className="ai-chat-history">
      <div className="ai-chat-history__header">
        <Button type="primary" icon={<PlusOutlined />} block onClick={handleNewConversation}>
          新建对话
        </Button>
      </div>

      <div className="ai-chat-history__body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin />
          </div>
        ) : groupedConversations.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史对话" />
        ) : (
          groupedConversations.map((group) => (
            <div key={group.label} className="ai-chat-history__group">
              <div className="ai-chat-history__group-title">{group.label}</div>
              <div className="ai-chat-history__group-list">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className={`ai-chat-history__item ${
                      item.id === currentConversation?.id ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      setCurrentConversationId(item.id);
                      setHistoryDrawerOpen(false);
                    }}
                  >
                    <div className="ai-chat-history__item-main">
                      <div className="ai-chat-history__item-title">{item.title}</div>
                      <div className="ai-chat-history__item-preview">
                        {item.lastMessage || '暂无消息'}
                      </div>
                      <div className="ai-chat-history__item-time">
                        {formatConversationTime(item.updatedAt)}
                      </div>
                    </div>

                    <Dropdown menu={{ items: getConversationMenu(item.id) }} trigger={['click']}>
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </Dropdown>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!currentConversation) {
    return (
      <div className="ai-chat-page-root">
        <Layout className="ai-chat-layout">
          {!isMobile && (
            <Sider width={300} theme="light" className="ai-chat-layout__sider">
              {historyPanel}
            </Sider>
          )}
          <Content className="ai-chat-layout__content">
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Empty description="请创建新对话开始使用">
                <Button type="primary" icon={<PlusOutlined />} onClick={handleNewConversation}>
                  新建对话
                </Button>
              </Empty>
            </div>
          </Content>
        </Layout>
      </div>
    );
  }

  return (
    <div className="ai-chat-page-root">
      <Layout className="ai-chat-layout">
        {!isMobile && (
          <Sider width={300} theme="light" className="ai-chat-layout__sider">
            {historyPanel}
          </Sider>
        )}

        <Content className="ai-chat-layout__content">
          <div className="ai-chat-main">
            <div className="ai-chat-main__header">
              <div className="ai-chat-main__header-left">
                {isMobile && (
                  <Button
                    type="text"
                    icon={<MenuOutlined />}
                    onClick={() => setHistoryDrawerOpen(true)}
                  />
                )}

                <div>
                  <Title level={4} className="ai-chat-main__title">
                    {currentConversation.title}
                  </Title>
                  <Space size={16} wrap>
                    <Text type="secondary">
                      最近更新：{formatConversationTime(currentConversation.updatedAt)}
                    </Text>
                    <Text type="secondary">
                      消息数：{currentConversation.messages.length}
                    </Text>
                  </Space>
                </div>
              </div>
            </div>

            <div className="ai-chat-main__body">
              {currentConversation.messages.length === 0 ? (
                <div className="ai-chat-main__empty">
                  <Empty description="开始新的对话" />
                </div>
              ) : (
                <div className="ai-chat-message-list">
                  {currentConversation.messages.map((item) => (
                    <div
                      key={item.id}
                      className={`ai-chat-message ${
                        item.role === 'user' ? 'is-user' : 'is-assistant'
                      }`}
                    >
                      <Avatar
                        size={36}
                        icon={item.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                        className="ai-chat-message__avatar"
                      />

                      <div className="ai-chat-message__content">
                        <div className="ai-chat-message__author">
                          {item.role === 'user' ? '我' : 'AI 助理'}
                        </div>
                        <div className="ai-chat-message__bubble">{item.content}</div>
                        <div className="ai-chat-message__time">
                          {formatMessageTime(item.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}

                  {respondingConversationId === currentConversation.id && (
                    <div className="ai-chat-message is-assistant">
                      <Avatar size={36} icon={<RobotOutlined />} className="ai-chat-message__avatar" />
                      <div className="ai-chat-message__content">
                        <div className="ai-chat-message__author">AI 助理</div>
                        <div className="ai-chat-message__bubble ai-chat-message__bubble--loading">
                          <Spin size="small" />
                          <span>正在生成回复...</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="ai-chat-main__footer">
              {!hasAIConfig && (
                <Alert
                  message="需要配置AI服务"
                  description={
                    <span>
                      您还没有配置AI服务，请先前往
                      <Button
                        type="link"
                        size="small"
                        icon={<SettingOutlined />}
                        onClick={() => navigate('/system-settings')}
                        style={{ padding: '0 4px' }}
                      >
                        系统配置
                      </Button>
                      进行配置
                    </span>
                  }
                  type="warning"
                  showIcon
                  closable
                  style={{ marginBottom: 16 }}
                />
              )}
              <div className="ai-chat-composer">
                <TextArea
                  value={inputValue}
                  autoSize={{ minRows: 4, maxRows: 8 }}
                  placeholder="请输入消息内容"
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                />

                <div className="ai-chat-composer__footer">
                  <Text type="secondary">Enter 发送，Shift + Enter 换行</Text>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSend}
                    loading={respondingConversationId === currentConversation.id}
                    disabled={!inputValue.trim() || respondingConversationId !== null}
                  >
                    发送
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Content>
      </Layout>

      <Drawer
        title="历史对话"
        placement="left"
        width={300}
        open={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        {historyPanel}
      </Drawer>

      <Modal
        title="重命名会话"
        open={renameModalOpen}
        okText="保存"
        cancelText="取消"
        onOk={handleRenameConversation}
        onCancel={() => {
          setRenameModalOpen(false);
          setRenameTargetId(null);
          setRenameValue('');
        }}
        okButtonProps={{ disabled: !renameValue.trim() }}
      >
        <Input
          autoFocus
          maxLength={40}
          value={renameValue}
          placeholder="请输入新的会话名称"
          onChange={(event) => setRenameValue(event.target.value)}
        />
      </Modal>
    </div>
  );
}

