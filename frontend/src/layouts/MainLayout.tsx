import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-components';
import {
  CommentOutlined,
  HomeOutlined,
  LogoutOutlined,
  ProjectOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Modal, Popover, Tooltip } from 'antd';
import { disconnectRealtime, ensureRealtimeConnection, type UserProfileUpdatedEvent } from '../services/realtime';
import api from '../utils/api';

type LayoutUser = {
  id?: number;
  email?: string;
  name?: string | null;
  gender?: 'male' | 'female' | 'unknown' | null;
  avatar?: string | null;
  phone?: string | null;
  createdAt?: string;
  unitName?: string | null;
  departmentName?: string | null;
  positionName?: string | null;
  dashboardVisible?: boolean;
  aiChatVisible?: boolean;
  projectsVisible?: boolean;
  userQueryVisible?: boolean;
  systemSettingsVisible?: boolean;
};

function readStoredUser(): LayoutUser | null {
  const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');

  if (!userStr) {
    return null;
  }

  try {
    return JSON.parse(userStr) as LayoutUser;
  } catch {
    return null;
  }
}

function writeStoredUser(user: LayoutUser) {
  if (localStorage.getItem('user')) {
    localStorage.setItem('user', JSON.stringify(user));
    return;
  }

  if (sessionStorage.getItem('user')) {
    sessionStorage.setItem('user', JSON.stringify(user));
  }
}

function formatValue(value?: string | null) {
  const text = value?.trim();
  return text || '-';
}

function formatGender(value?: LayoutUser['gender']) {
  if (value === 'male') {
    return '男';
  }
  if (value === 'female') {
    return '女';
  }
  if (value === 'unknown') {
    return '未知';
  }
  return '-';
}

function formatDate(value?: string) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const matched = value.match(/\d{4}-\d{2}-\d{2}/);
    return matched ? matched[0] : '-';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<LayoutUser | null>(() => readStoredUser());

  const canAccessDashboard = user?.dashboardVisible !== false;
  const canAccessAIChat = user?.aiChatVisible !== false;
  const canAccessProjects = user?.projectsVisible !== false;
  const canAccessUserQuery = user?.userQueryVisible !== false;
  const canAccessSystemSettings = user?.systemSettingsVisible !== false;

  const getFallbackPath = () => {
    if (canAccessDashboard) {
      return '/dashboard';
    }
    if (canAccessAIChat) {
      return '/ai-chat';
    }
    if (canAccessProjects) {
      return '/projects';
    }
    if (canAccessUserQuery) {
      return '/user-query';
    }
    if (canAccessSystemSettings) {
      return '/system-settings';
    }
    return '/profile';
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const response = await api.get('/user/profile');
        const nextUser = {
          ...readStoredUser(),
          ...response.data.user,
        } as LayoutUser;

        setUser(nextUser);
        writeStoredUser(nextUser);
      } catch (error) {
        console.error('加载顶部用户信息失败:', error);
      }
    };

    const handleProfileUpdated = () => {
      void loadProfile();
    };

    void loadProfile();
    window.addEventListener('user-profile-updated', handleProfileUpdated);

    const socket = ensureRealtimeConnection();
    const handleRemoteProfileUpdated = (_payload: UserProfileUpdatedEvent) => {
      void loadProfile();
    };

    socket?.on('user:profile-updated', handleRemoteProfileUpdated);

    return () => {
      window.removeEventListener('user-profile-updated', handleProfileUpdated);
      socket?.off('user:profile-updated', handleRemoteProfileUpdated);
    };
  }, []);

  useEffect(() => {
    const blocked =
      (location.pathname.startsWith('/dashboard') && !canAccessDashboard) ||
      (location.pathname.startsWith('/ai-chat') && !canAccessAIChat) ||
      (location.pathname.startsWith('/projects') && !canAccessProjects) ||
      (location.pathname.startsWith('/user-query') && !canAccessUserQuery) ||
      (location.pathname.startsWith('/system-settings') && !canAccessSystemSettings);

    if (blocked) {
      navigate(getFallbackPath(), { replace: true });
    }
  }, [
    canAccessAIChat,
    canAccessDashboard,
    canAccessProjects,
    canAccessSystemSettings,
    canAccessUserQuery,
    location.pathname,
    navigate,
  ]);

  const profileContent = useMemo(
    () => (
      <div style={{ width: 280 }}>
        <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>个人信息</div>
        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', rowGap: 8, columnGap: 8, fontSize: 13 }}>
          <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>姓名</div>
          <div>{formatValue(user?.name)}</div>
          <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>性别</div>
          <div>{formatGender(user?.gender)}</div>
          <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>手机号</div>
          <div>{formatValue(user?.phone)}</div>
          <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>电子邮箱</div>
          <div style={{ wordBreak: 'break-all' }}>{formatValue(user?.email)}</div>
          <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>单位</div>
          <div>{formatValue(user?.unitName)}</div>
          <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>部门</div>
          <div>{formatValue(user?.departmentName)}</div>
          <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>职位</div>
          <div>{formatValue(user?.positionName)}</div>
          <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>注册日期</div>
          <div>{formatDate(user?.createdAt)}</div>
        </div>
      </div>
    ),
    [user],
  );

  const handleLogout = () => {
    Modal.confirm({
      title: '确认退出',
      content: '确定要退出登录吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        disconnectRealtime();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('remember');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('remember');
        navigate('/login', { replace: true });
      },
    });
  };

  const menuRoutes = [
    ...(canAccessDashboard ? [{ path: '/dashboard', name: '工作台', icon: <HomeOutlined /> }] : []),
    ...(canAccessAIChat ? [{ path: '/ai-chat', name: 'AI对话', icon: <CommentOutlined /> }] : []),
    ...(canAccessProjects ? [{ path: '/projects', name: '项目管理', icon: <ProjectOutlined /> }] : []),
    ...(canAccessUserQuery ? [{ path: '/user-query', name: '用户查询', icon: <TeamOutlined /> }] : []),
    ...(canAccessSystemSettings ? [{ path: '/system-settings', name: '系统配置', icon: <SettingOutlined /> }] : []),
  ];

  return (
    <ProLayout
      title="ZJZAI建筑项目管理平台"
      logo={false}
      layout="mix"
      location={location}
      route={{
        path: '/',
        routes: menuRoutes,
      }}
      menuDataRender={() => menuRoutes as any}
      menuItemRender={(item, dom) => <div onClick={() => navigate(item.path || '/')}>{dom}</div>}
      menuFooterRender={(props) => {
        const collapsed = Boolean((props as { collapsed?: boolean } | undefined)?.collapsed);

        return (
          <div
            style={{
              padding: collapsed ? '12px 8px' : 12,
              borderTop: '1px solid rgba(5, 5, 5, 0.06)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Tooltip title={collapsed ? '个人中心' : undefined} placement="right">
                <Button
                  type="text"
                  icon={<UserOutlined />}
                  onClick={() => navigate('/profile')}
                  block
                  style={collapsed ? { paddingInline: 0, textAlign: 'center' } : undefined}
                >
                  {collapsed ? null : '个人中心'}
                </Button>
              </Tooltip>
              <Tooltip title={collapsed ? '退出登录' : undefined} placement="right">
                <Button
                  type="text"
                  danger
                  icon={<LogoutOutlined />}
                  onClick={handleLogout}
                  block
                  style={collapsed ? { paddingInline: 0, textAlign: 'center' } : undefined}
                >
                  {collapsed ? null : '退出登录'}
                </Button>
              </Tooltip>
            </div>
          </div>
        );
      }}
      avatarProps={{
        src: user?.avatar || undefined,
        icon: <UserOutlined />,
        size: 'default',
        render: () => (
          <Popover trigger="click" placement="bottomRight" content={profileContent}>
            <Avatar
              src={user?.avatar || undefined}
              icon={<UserOutlined />}
              size="default"
              style={{ cursor: 'pointer' }}
            />
          </Popover>
        ),
      }}
    >
      <Outlet />
    </ProLayout>
  );
}
