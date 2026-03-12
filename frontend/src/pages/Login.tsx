import { useState, useEffect } from 'react';
import { Form, Input, Button, Checkbox, notification } from 'antd';
import { MailOutlined, NumberOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import ServiceTerms from '../components/ServiceTerms';
import PrivacyPolicy from '../components/PrivacyPolicy';
import './Login.css';

type ViewType = 'login' | 'terms' | 'privacy';

export default function Login() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isCodeFilled, setIsCodeFilled] = useState(false);
  const [isAgreementChecked, setIsAgreementChecked] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('login');

  // 组件加载时检查是否有未完成的倒计时
  useEffect(() => {
    const email = form.getFieldValue('email');
    if (email) {
      checkCooldown(email);
    }
  }, []);

  // 检查冷却时间
  const checkCooldown = (email: string) => {
    const cooldownKey = `code_cooldown_${email}`;
    const cooldownEnd = localStorage.getItem(cooldownKey);

    if (cooldownEnd) {
      const remaining = Math.floor((parseInt(cooldownEnd) - Date.now()) / 1000);
      if (remaining > 0) {
        startCountdown(remaining);
      } else {
        localStorage.removeItem(cooldownKey);
      }
    }
  };

  // 开始倒计时
  const startCountdown = (seconds: number) => {
    setCountdown(seconds);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // 验证邮箱格式
  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // 监听表单字段变化
  const handleFieldsChange = () => {
    const email = form.getFieldValue('email');
    const code = form.getFieldValue('code');
    const agreement = form.getFieldValue('agreement');

    // 验证邮箱
    const emailValid = email && validateEmail(email);
    setIsEmailValid(emailValid);

    // 当邮箱改变时，检查该邮箱的冷却时间
    if (emailValid) {
      checkCooldown(email);
    }

    // 验证验证码
    setIsCodeFilled(code && code.length > 0);

    // 验证服务条款
    setIsAgreementChecked(agreement === true);
  };

  const handleSendCode = async () => {
    try {
      const email = form.getFieldValue('email');
      if (!email) {
        notification.warning({
          message: '提示',
          description: '请输入邮箱地址',
          placement: 'topRight',
        });
        return;
      }

      // 验证邮箱格式
      if (!validateEmail(email)) {
        notification.warning({
          message: '提示',
          description: '请输入有效的邮箱地址',
          placement: 'topRight',
        });
        return;
      }

      // 设置发送中状态
      setIsSendingCode(true);

      // 调用发送验证码的API
      const response = await authService.sendCode(email);

      // 发送成功
      setIsSendingCode(false);
      notification.success({
        message: '发送成功',
        description: '验证码已发送到您的邮箱',
        placement: 'topRight',
      });

      // 保存冷却结束时间到 localStorage
      const cooldownTime = response.cooldownTime || 60;
      const cooldownKey = `code_cooldown_${email}`;
      const cooldownEnd = Date.now() + cooldownTime * 1000;
      localStorage.setItem(cooldownKey, cooldownEnd.toString());

      // 开始倒计时
      startCountdown(cooldownTime);
    } catch (error: any) {
      setIsSendingCode(false);

      // 如果是冷却时间错误，显示剩余时间并开始倒计时
      if (error.response?.status === 429) {
        const remainingTime = error.response?.data?.remainingTime;
        if (remainingTime) {
          const email = form.getFieldValue('email');
          const cooldownKey = `code_cooldown_${email}`;
          const cooldownEnd = Date.now() + remainingTime * 1000;
          localStorage.setItem(cooldownKey, cooldownEnd.toString());
          startCountdown(remainingTime);
        }

        notification.warning({
          message: '操作过于频繁',
          description: error.response?.data?.message || '请稍后再试',
          placement: 'topRight',
        });
      } else {
        notification.error({
          message: '发送失败',
          description: error.response?.data?.message || '发送验证码失败，请稍后重试',
          placement: 'topRight',
        });
      }
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      setLoading(true);

      // 调用登录/注册API
      const response = await authService.login({
        email: values.email,
        code: values.code,
        remember: values.remember,
      });

      // 先清除两个存储中的所有数据
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('remember');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('remember');

      // 根据是否勾选"记住我"，决定使用 localStorage 还是 sessionStorage
      const storage = values.remember ? localStorage : sessionStorage;

      storage.setItem('token', response.token);
      storage.setItem('user', JSON.stringify(response.user));
      storage.setItem('remember', values.remember ? 'true' : 'false');

      notification.success({
        message: '登录成功',
        description: '欢迎使用 ZJZAI 建筑项目全生命周期管理平台',
        placement: 'topRight',
      });

      const targetPath =
        response.user.dashboardVisible !== false
          ? '/dashboard'
          : response.user.aiChatVisible !== false
            ? '/ai-chat'
            : response.user.projectsVisible !== false
              ? '/projects'
              : response.user.userQueryVisible !== false
                ? '/user-query'
                : response.user.systemSettingsVisible !== false
                  ? '/system-settings'
                  : '/profile';

      navigate(targetPath);
    } catch (error: any) {
      notification.error({
        message: '登录失败',
        description: error.response?.data?.message || '登录失败，请检查验证码是否正确',
        placement: 'topRight',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        {currentView === 'terms' && <ServiceTerms onBack={() => setCurrentView('login')} />}
        {currentView === 'privacy' && <PrivacyPolicy onBack={() => setCurrentView('login')} />}
        {currentView === 'login' && (
          <div className="brand-info">
          <h1>ZJZAI</h1>
          <p>建筑项目全生命周期管理平台</p>
          <p className="brand-description">
            基于云计算和大数据技术，为建筑行业提供一站式数字化管理解决方案，
            助力企业实现项目管理的智能化、精细化和高效化。
          </p>

          <div className="brand-features">
            <div className="feature-item">
              <div className="feature-icon">🏗️</div>
              <div className="feature-text">
                <h3>全流程管理</h3>
                <p>从规划设计到竣工验收，全程数字化追踪</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">📊</div>
              <div className="feature-text">
                <h3>智能化决策</h3>
                <p>数据驱动，实时分析，科学决策支持</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">👥</div>
              <div className="feature-text">
                <h3>高效协同</h3>
                <p>多方协作，信息共享，提升团队效率</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">💰</div>
              <div className="feature-text">
                <h3>成本控制</h3>
                <p>精准预算管理，实时成本监控，降低项目风险</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">📱</div>
              <div className="feature-text">
                <h3>移动办公</h3>
                <p>随时随地访问，移动端与PC端数据同步</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">🔒</div>
              <div className="feature-text">
                <h3>安全可靠</h3>
                <p>企业级数据加密，多重备份，保障信息安全</p>
              </div>
            </div>
          </div>

          <div className="brand-stats">
            <div className="stat-item">
              <div className="stat-number">10,000+</div>
              <div className="stat-label">服务项目</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">500+</div>
              <div className="stat-label">合作企业</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">99.9%</div>
              <div className="stat-label">系统稳定性</div>
            </div>
          </div>
        </div>
        )}
      </div>

      <div className="login-right">
        <div className="login-box">
          <div className="login-header">
            <h2>ZJZAI建筑项目全生命周期管理平台</h2>
            <p>欢迎使用建筑项目全生命周期管理系统</p>
          </div>

          <Form
            form={form}
            onFinish={handleSubmit}
            onFieldsChange={handleFieldsChange}
            layout="vertical"
            className="login-form"
          >
            <Form.Item
              name="email"
              label="邮箱地址"
              rules={[
                { required: true, message: '请输入邮箱地址' },
                { type: 'email', message: '请输入有效的邮箱地址' }
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="请输入邮箱地址"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="code"
              label="验证码"
              rules={[{ required: true, message: '请输入验证码' }]}
            >
              <div className="code-input-wrapper">
                <Input
                  prefix={<NumberOutlined />}
                  placeholder="请输入验证码"
                  size="large"
                  maxLength={6}
                />
                <Button
                  onClick={handleSendCode}
                  disabled={!isEmailValid || isSendingCode || countdown > 0}
                  className="send-code-btn"
                >
                  {isSendingCode ? '获取中...' : countdown > 0 ? `${countdown}秒后重试` : '获取验证码'}
                </Button>
              </div>
            </Form.Item>

            <Form.Item name="remember" valuePropName="checked">
              <Checkbox>记住我</Checkbox>
            </Form.Item>

            <Form.Item>
              <Button
                type="default"
                htmlType="submit"
                size="large"
                loading={loading}
                disabled={!isEmailValid || !isCodeFilled || !isAgreementChecked}
                block
              >
                登录 / 注册
              </Button>
            </Form.Item>

            <Form.Item
              name="agreement"
              valuePropName="checked"
              rules={[
                {
                  validator: (_, value) =>
                    value ? Promise.resolve() : Promise.reject(new Error('请勾选同意服务条款和隐私政策')),
                },
              ]}
            >
              <Checkbox>
                勾选即同意
                <a
                  href="#"
                  className="link"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentView('terms');
                  }}
                > 服务条款 </a>
                和
                <a
                  href="#"
                  className="link"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentView('privacy');
                  }}
                > 隐私政策</a>
                ，未注册用户自动注册
              </Checkbox>
            </Form.Item>
          </Form>

          <div className="login-footer">
            <p>© 2026 ZJZAI建筑项目全生命周期管理平台 | 版本 v1.0.0</p>
            <p>
              <a href="#" className="footer-link">京ICP备xxxxxxxx号</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
