import { Card, Descriptions, Button, Space, message } from 'antd';
import { UserOutlined, MailOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { authService } from '../services/authService';

interface UserInfo {
  id: number;
  email: string;
  created_at: string;
  last_login: string;
}

export default function Profile() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserInfo();
  }, []);

  const fetchUserInfo = async () => {
    try {
      setLoading(true);
      const response = await authService.verify();
      setUserInfo(response.user);
    } catch (error) {
      message.error('获取用户信息失败');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <UserOutlined />
            <span>个人中心</span>
          </Space>
        }
        loading={loading}
      >
        <Descriptions column={1} bordered>
          <Descriptions.Item label={<Space><UserOutlined />用户ID</Space>}>
            {userInfo?.id}
          </Descriptions.Item>
          <Descriptions.Item label={<Space><MailOutlined />邮箱地址</Space>}>
            {userInfo?.email}
          </Descriptions.Item>
          <Descriptions.Item label={<Space><ClockCircleOutlined />注册时间</Space>}>
            {userInfo?.created_at ? formatDate(userInfo.created_at) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={<Space><ClockCircleOutlined />最后登录</Space>}>
            {userInfo?.last_login ? formatDate(userInfo.last_login) : '-'}
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: '24px' }}>
          <Space>
            <Button type="primary" onClick={fetchUserInfo}>
              刷新信息
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
}
