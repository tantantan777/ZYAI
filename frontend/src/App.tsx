import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import ProjectList from './pages/ProjectList';
import Permissions from './pages/Permissions';
import Profile from './pages/Profile';
import AIChat from './pages/AIChat';
import Login from './pages/Login';
import { authService } from './services/authService';
import './App.css';

function ProtectedRoutes() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      // 先从 localStorage 读取，如果没有再从 sessionStorage 读取
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const remember = localStorage.getItem('remember') || sessionStorage.getItem('remember');

      // 如果没有token，跳转到登录页
      if (!token) {
        setIsAuthenticated(false);
        setIsChecking(false);
        navigate('/login', { replace: true });
        return;
      }

      // 如果勾选了记住我，验证token是否有效
      if (remember === 'true') {
        try {
          await authService.verify();
          // token有效，允许访问
          setIsAuthenticated(true);
          setIsChecking(false);
        } catch (error) {
          // token无效，清除本地存储并跳转到登录页
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('remember');
          sessionStorage.removeItem('token');
          sessionStorage.removeItem('user');
          sessionStorage.removeItem('remember');
          setIsAuthenticated(false);
          setIsChecking(false);
          navigate('/login', { replace: true });
        }
      } else {
        // 没有勾选记住我，但有token，允许访问（本次会话有效）
        setIsAuthenticated(true);
        setIsChecking(false);
      }
    };

    checkAuth();
  }, []); // 只在组件首次挂载时执行

  if (isChecking) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>加载中...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="ai-chat" element={<AIChat />} />
        <Route path="projects" element={<ProjectList />} />
        <Route path="permissions" element={<Permissions />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
