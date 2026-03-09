import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-components';
import { HomeOutlined, ProjectOutlined, TeamOutlined, FileTextOutlined, BarChartOutlined, UserOutlined, LogoutOutlined, SafetyOutlined, CommentOutlined } from '@ant-design/icons';
import { Dropdown, Space, Modal } from 'antd';
import type { MenuProps } from 'antd';

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // 从 localStorage 或 sessionStorage 获取用户信息
  const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  // 退出登录
  const handleLogout = () => {
    Modal.confirm({
      title: '确认退出',
      content: '确定要退出登录吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        // 清除所有存储的信息
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('remember');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('remember');

        // 跳转到登录页
        navigate('/login', { replace: true });
      },
    });
  };

  // 头像下拉菜单
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
          {
            path: '/dashboard',
            name: '工作台',
            icon: <HomeOutlined />,
          },
          {
            path: '/ai-chat',
            name: 'AI对话',
            icon: <CommentOutlined />,
          },
          {
            path: '/projects',
            name: '项目管理',
            icon: <ProjectOutlined />,
          },
          {
            path: '/permissions',
            name: '用户权限',
            icon: <SafetyOutlined />,
          },
          {
            path: '/team',
            name: '团队管理',
            icon: <TeamOutlined />,
          },
          {
            path: '/documents',
            name: '文档管理',
            icon: <FileTextOutlined />,
          },
          {
            path: '/reports',
            name: '报表分析',
            icon: <BarChartOutlined />,
          },
        ],
      }}
      menuItemRender={(item, dom) => (
        <div onClick={() => navigate(item.path || '/')}>
          {dom}
        </div>
      )}
      avatarProps={{
        src: undefined,
        icon: <UserOutlined />,
        size: 'default',
        title: user?.email || '用户',
        render: (_props, dom) => {
          return (
            <Dropdown menu={{ items: menuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                {dom}
              </Space>
            </Dropdown>
          );
        },
      }}
    >
      <Outlet />
    </ProLayout>
  );
}
