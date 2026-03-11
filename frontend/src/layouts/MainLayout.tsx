import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-components';
import {
  CommentOutlined,
  HomeOutlined,
  LogoutOutlined,
  ProjectOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Modal, Space, Tooltip } from 'antd';
import type { MenuProps } from 'antd';

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  const handleLogout = () => {
    Modal.confirm({
      title: '确认退出',
      content: '确定要退出登录吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
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

  const menuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人中心',
      onClick: () => navigate('/profile'),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <ProLayout
      title="ZJZAI建筑项目管理平台"
      logo={false}
      layout="mix"
      location={location}
      route={{
        path: '/',
        routes: [
          { path: '/dashboard', name: '工作台', icon: <HomeOutlined /> },
          { path: '/ai-chat', name: 'AI对话', icon: <CommentOutlined /> },
          { path: '/projects', name: '项目管理', icon: <ProjectOutlined /> },
          { path: '/system-settings', name: '系统配置', icon: <SettingOutlined /> },
        ],
      }}
      menuItemRender={(item, dom) => <div onClick={() => navigate(item.path || '/')}>{dom}</div>}
      menuFooterRender={(props) => {
        const collapsed = Boolean((props as any)?.collapsed);

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
        src: undefined,
        icon: <UserOutlined />,
        size: 'default',
        title: user?.email || '用户',
        render: (_props, dom) => {
          return (
            <Dropdown menu={{ items: menuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>{dom}</Space>
            </Dropdown>
          );
        },
      }}
    >
      <Outlet />
    </ProLayout>
  );
}
