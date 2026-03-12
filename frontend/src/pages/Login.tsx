import { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { Button, Checkbox, DatePicker, Form, Input, Modal, Select, notification } from 'antd';
import { MailOutlined, NumberOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  authService,
  type LoginResponse,
  type RegistrationOrgDepartment,
  type RegistrationOrgPosition,
  type RegistrationOrgUnit,
} from '../services/authService';
import ServiceTerms from '../components/ServiceTerms';
import PrivacyPolicy from '../components/PrivacyPolicy';
import './Login.css';

type ViewType = 'login' | 'terms' | 'privacy';

type LoginFormValues = {
  email: string;
  code: string;
  remember?: boolean;
  agreement?: boolean;
  name?: string;
  gender?: 'male' | 'female';
  phone?: string;
  hireDate?: Dayjs;
  unitId?: number;
  departmentId?: number;
  positionId?: number;
};

const CHINESE_NAME_PATTERN = /^\p{Script=Han}{1,4}$/u;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const registrationFieldNames: Array<keyof LoginFormValues> = [
  'name',
  'gender',
  'phone',
  'hireDate',
  'unitId',
  'departmentId',
  'positionId',
];

const featureItems = [
  {
    icon: '📐',
    title: '全过程管理',
    description: '覆盖立项、设计、施工、验收到运维的项目全周期管理。',
  },
  {
    icon: '📊',
    title: '智能决策',
    description: '基于项目数据沉淀，提供实时分析与辅助决策能力。',
  },
  {
    icon: '🤝',
    title: '高效协同',
    description: '统一项目成员、资料和流程，减少跨部门沟通成本。',
  },
  {
    icon: '💰',
    title: '成本控制',
    description: '围绕预算、合同和执行过程进行动态追踪与预警。',
  },
  {
    icon: '📱',
    title: '移动办公',
    description: '支持移动端与 PC 端协同，便于现场和办公室同步作业。',
  },
  {
    icon: '🛡️',
    title: '安全可靠',
    description: '提供企业级数据安全、备份与权限控制能力。',
  },
] as const;

const statItems = [
  { value: '10,000+', label: '服务项目' },
  { value: '500+', label: '合作企业' },
  { value: '99.9%', label: '系统稳定率' },
] as const;

const getTargetPath = (user: LoginResponse['user']) => {
  if (user.dashboardVisible !== false) {
    return '/dashboard';
  }
  if (user.aiChatVisible !== false) {
    return '/ai-chat';
  }
  if (user.projectsVisible !== false) {
    return '/projects';
  }
  if (user.userQueryVisible !== false) {
    return '/user-query';
  }
  if (user.systemSettingsVisible !== false) {
    return '/system-settings';
  }
  return '/profile';
};

export default function Login() {
  const [form] = Form.useForm<LoginFormValues>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [isCodeFilled, setIsCodeFilled] = useState(false);
  const [isAgreementChecked, setIsAgreementChecked] = useState(false);
  const [registrationModalOpen, setRegistrationModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('login');
  const [isExistingUser, setIsExistingUser] = useState<boolean | null>(null);
  const [sentCodeEmail, setSentCodeEmail] = useState<string | null>(null);
  const [units, setUnits] = useState<RegistrationOrgUnit[]>([]);
  const [departments, setDepartments] = useState<RegistrationOrgDepartment[]>([]);
  const [positions, setPositions] = useState<RegistrationOrgPosition[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number | undefined>();
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | undefined>();

  const isNewUser = isExistingUser === false;

  const currentDepartments = useMemo(
    () => departments.filter((item) => item.unitId === selectedUnitId),
    [departments, selectedUnitId],
  );

  const currentPositions = useMemo(
    () => positions.filter((item) => item.departmentId === selectedDepartmentId),
    [positions, selectedDepartmentId],
  );

  const validateEmail = (email?: string) => {
    if (!email) {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const restoreCooldown = (email: string) => {
    const cooldownKey = `code_cooldown_${email}`;
    const cooldownEnd = localStorage.getItem(cooldownKey);

    if (!cooldownEnd) {
      return;
    }

    const remaining = Math.floor((parseInt(cooldownEnd, 10) - Date.now()) / 1000);
    if (remaining > 0) {
      setCountdown(remaining);
      setSentCodeEmail(email);
      return;
    }

    localStorage.removeItem(cooldownKey);
  };

  const setCooldownForEmail = (email: string, seconds: number) => {
    const cooldownKey = `code_cooldown_${email}`;
    const cooldownEnd = Date.now() + seconds * 1000;
    localStorage.setItem(cooldownKey, cooldownEnd.toString());
    setCountdown(seconds);
    setSentCodeEmail(email);
  };

  const resetRegistrationFields = () => {
    setSelectedUnitId(undefined);
    setSelectedDepartmentId(undefined);
    form.setFieldsValue({
      name: undefined,
      gender: undefined,
      phone: undefined,
      hireDate: undefined,
      unitId: undefined,
      departmentId: undefined,
      positionId: undefined,
    });
    form.setFields(
      registrationFieldNames.map((name) => ({
        name,
        errors: [],
      })),
    );
  };

  const openRegistrationModal = () => {
    form.setFields(
      registrationFieldNames.map((name) => ({
        name,
        errors: [],
      })),
    );
    setRegistrationModalOpen(true);
  };

  const loadRegistrationOrgStructure = async () => {
    try {
      const response = await authService.getRegistrationOrgStructure();
      setUnits(response.units ?? []);
      setDepartments(response.departments ?? []);
      setPositions(response.positions ?? []);
    } catch (error) {
      console.error('加载注册组织结构失败', error);
      notification.error({
        message: '加载失败',
        description: '无法获取单位、部门和职位数据，请稍后重试。',
        placement: 'topRight',
      });
    }
  };

  useEffect(() => {
    void loadRegistrationOrgStructure();

    const initialValues = form.getFieldsValue();
    setIsEmailValid(validateEmail(initialValues.email));
    setIsCodeFilled(Boolean(initialValues.code?.trim()));
    setIsAgreementChecked(initialValues.agreement === true);

    if (initialValues.email) {
      restoreCooldown(initialValues.email);
    }
  }, [form]);

  useEffect(() => {
    if (countdown <= 0 || !sentCodeEmail) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((previous) => Math.max(previous - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown, sentCodeEmail]);

  const handleValuesChange = (changedValues: Partial<LoginFormValues>, allValues: LoginFormValues) => {
    const emailValid = validateEmail(allValues.email);
    setIsEmailValid(emailValid);
    setIsCodeFilled(Boolean(allValues.code?.trim()));
    setIsAgreementChecked(allValues.agreement === true);

    if ('email' in changedValues) {
      setIsExistingUser(null);
      setSentCodeEmail(null);
      setCountdown(0);
      setRegistrationModalOpen(false);
      resetRegistrationFields();
    }

    if (emailValid) {
      restoreCooldown(allValues.email);
    }
  };

  const handleSendCode = async () => {
    const email = form.getFieldValue('email');

    if (!email) {
      notification.warning({
        message: '提示',
        description: '请输入邮箱地址。',
        placement: 'topRight',
      });
      return;
    }

    if (!validateEmail(email)) {
      notification.warning({
        message: '提示',
        description: '请输入有效的邮箱地址。',
        placement: 'topRight',
      });
      return;
    }

    try {
      setIsSendingCode(true);
      const response = await authService.sendCode(email);

      setIsExistingUser(response.isExistingUser);
      setCooldownForEmail(email, response.cooldownTime || 60);
      setRegistrationModalOpen(false);

      if (response.isExistingUser) {
        resetRegistrationFields();
      }

      notification.success({
        message: '发送成功',
        description: response.isExistingUser
          ? '验证码已发送，请直接登录。'
          : '验证码已发送，新用户请点击“登录/注册”后完善注册资料。',
        placement: 'topRight',
      });
    } catch (error: any) {
      if (error.response?.status === 429) {
        const remainingTime = error.response?.data?.remainingTime;
        const existingUser = error.response?.data?.isExistingUser;

        if (typeof existingUser === 'boolean') {
          setIsExistingUser(existingUser);
        }

        if (email && remainingTime) {
          setCooldownForEmail(email, remainingTime);
        }

        notification.warning({
          message: '操作过于频繁',
          description: error.response?.data?.message || '请稍后再试。',
          placement: 'topRight',
        });
        return;
      }

      notification.error({
        message: '发送失败',
        description: error.response?.data?.message || '发送验证码失败，请稍后重试。',
        placement: 'topRight',
      });
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleUnitChange = (value?: number) => {
    setSelectedUnitId(value);
    setSelectedDepartmentId(undefined);
    form.setFieldsValue({
      unitId: value,
      departmentId: undefined,
      positionId: undefined,
    });
  };

  const handleDepartmentChange = (value?: number) => {
    setSelectedDepartmentId(value);
    form.setFieldsValue({
      departmentId: value,
      positionId: undefined,
    });
  };

  const handleRegistrationModalOk = async () => {
    try {
      await form.validateFields(registrationFieldNames);
    } catch {
      return;
    }

    const success = await submitLogin(form.getFieldsValue(true));
    if (success) {
      setRegistrationModalOpen(false);
    }
  };

  const submitLogin = async (values: LoginFormValues) => {
    try {
      setLoading(true);

      const response = await authService.login({
        email: values.email,
        code: values.code,
        remember: values.remember,
        name: values.name?.trim(),
        gender: values.gender,
        phone: values.phone?.trim(),
        hireDate: values.hireDate ? values.hireDate.format('YYYY-MM-DD') : undefined,
        positionId: values.positionId,
      });

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('remember');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('remember');

      const storage = values.remember ? localStorage : sessionStorage;
      storage.setItem('token', response.token);
      storage.setItem('user', JSON.stringify(response.user));
      storage.setItem('remember', values.remember ? 'true' : 'false');

      notification.success({
        message: '登录成功',
        description: '欢迎使用 ZJZAI 建筑项目全生命周期管理平台。',
        placement: 'topRight',
      });

      navigate(getTargetPath(response.user));
      return true;
    } catch (error: any) {
      notification.error({
        message: '登录失败',
        description: error.response?.data?.message || '登录失败，请检查验证码或补全注册资料。',
        placement: 'topRight',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleLoginClick = async () => {
    try {
      await form.validateFields(['email', 'code', 'agreement']);
    } catch {
      return;
    }

    if (isNewUser) {
      openRegistrationModal();
      return;
    }

    await submitLogin(form.getFieldsValue(true));
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
              基于云计算和数据能力，为建筑行业提供统一、可追踪、可协同的数字化管理平台。
            </p>

            <div className="brand-features">
              {featureItems.map((item) => (
                <div key={item.title} className="feature-item">
                  <div className="feature-icon">{item.icon}</div>
                  <div className="feature-text">
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="brand-stats">
              {statItems.map((item) => (
                <div key={item.label} className="stat-item">
                  <div className="stat-number">{item.value}</div>
                  <div className="stat-label">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="login-right">
        <div className="login-box">
          <div className="login-header">
            <h2>ZJZAI 建筑项目全生命周期管理平台</h2>
            <p>欢迎登录系统</p>
          </div>

          <Form<LoginFormValues>
            form={form}
            onValuesChange={handleValuesChange}
            layout="vertical"
            className="login-form"
          >
            <Form.Item
              name="email"
              label="邮箱地址"
              rules={[
                { required: true, message: '请输入邮箱地址' },
                { type: 'email', message: '请输入有效的邮箱地址' },
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="请输入邮箱地址"
                size="large"
                onPressEnter={() => void handleLoginClick()}
              />
            </Form.Item>

            <Form.Item name="code" label="验证码" rules={[{ required: true, message: '请输入验证码' }]}>
              <div className="code-input-wrapper">
                <Input
                  prefix={<NumberOutlined />}
                  placeholder="请输入验证码"
                  size="large"
                  maxLength={6}
                  onPressEnter={() => void handleLoginClick()}
                />
                <Button
                  onClick={handleSendCode}
                  disabled={!isEmailValid || isSendingCode || countdown > 0}
                  className="send-code-btn"
                >
                  {isSendingCode ? '发送中...' : countdown > 0 ? `${countdown}秒后重试` : '获取验证码'}
                </Button>
              </div>
            </Form.Item>

            <Form.Item name="remember" valuePropName="checked">
              <Checkbox>记住我</Checkbox>
            </Form.Item>

            <Form.Item>
              <Button
                type="default"
                size="large"
                loading={loading}
                disabled={!isEmailValid || !isCodeFilled || !isAgreementChecked}
                onClick={() => void handleLoginClick()}
                block
              >
                登录/注册
              </Button>
            </Form.Item>

            <Form.Item
              name="agreement"
              valuePropName="checked"
              rules={[
                {
                  validator: async (_rule, value) => {
                    if (!value) {
                      throw new Error('请勾选同意服务条款和隐私政策');
                    }
                  },
                },
              ]}
            >
              <Checkbox>
                勾选即同意
                <a
                  href="#"
                  className="link"
                  onClick={(event) => {
                    event.preventDefault();
                    setCurrentView('terms');
                  }}
                >
                  {' '}
                  服务条款{' '}
                </a>
                和
                <a
                  href="#"
                  className="link"
                  onClick={(event) => {
                    event.preventDefault();
                    setCurrentView('privacy');
                  }}
                >
                  {' '}
                  隐私政策
                </a>
                ，未注册用户将自动完成注册。
              </Checkbox>
            </Form.Item>

            <Modal
              title="完善注册资料"
              open={registrationModalOpen}
              centered
              onOk={() => void handleRegistrationModalOk()}
              onCancel={() => setRegistrationModalOpen(false)}
              okText="保存资料"
              cancelText="取消"
              confirmLoading={loading}
              destroyOnClose={false}
              forceRender
            >
              <div className="registration-modal-grid">
                <Form.Item
                  name="name"
                  label="姓名"
                  rules={[
                    {
                      validator: async (_rule, value) => {
                        const text = typeof value === 'string' ? value.trim() : '';
                        if (!isNewUser && !text) {
                          return;
                        }
                        if (!text) {
                          throw new Error('请输入姓名');
                        }
                        if (!CHINESE_NAME_PATTERN.test(text)) {
                          throw new Error('姓名仅支持 1-4 位中文');
                        }
                      },
                    },
                  ]}
                >
                  <Input prefix={<UserOutlined />} placeholder="请输入 1-4 位中文姓名" size="large" />
                </Form.Item>

                <Form.Item
                  name="gender"
                  label="性别"
                  rules={[
                    {
                      validator: async (_rule, value) => {
                        if (!isNewUser && !value) {
                          return;
                        }
                        if (value !== 'male' && value !== 'female') {
                          throw new Error('请选择性别');
                        }
                      },
                    },
                  ]}
                >
                  <Select
                    placeholder="请选择性别"
                    size="large"
                    options={[
                      { label: '男', value: 'male' },
                      { label: '女', value: 'female' },
                    ]}
                  />
                </Form.Item>

                <Form.Item
                  name="phone"
                  label="电话号码"
                  rules={[
                    {
                      validator: async (_rule, value) => {
                        const text = typeof value === 'string' ? value.trim() : '';
                        if (!isNewUser && !text) {
                          return;
                        }
                        if (!text) {
                          throw new Error('请输入电话号码');
                        }
                        if (!PHONE_PATTERN.test(text)) {
                          throw new Error('请输入有效的手机号');
                        }
                      },
                    },
                  ]}
                >
                  <Input prefix={<PhoneOutlined />} placeholder="请输入手机号" size="large" />
                </Form.Item>

                <Form.Item
                  name="hireDate"
                  label="入职时间"
                  rules={[
                    {
                      validator: async (_rule, value) => {
                        if (!isNewUser && !value) {
                          return;
                        }
                        if (!dayjs.isDayjs(value)) {
                          throw new Error('请选择入职时间');
                        }
                        if (value.endOf('day').isAfter(dayjs().endOf('day'))) {
                          throw new Error('入职时间不能晚于今天');
                        }
                      },
                    },
                  ]}
                >
                  <DatePicker
                    style={{ width: '100%' }}
                    size="large"
                    placeholder="请选择入职时间"
                    disabledDate={(current) => Boolean(current && current.endOf('day').isAfter(dayjs().endOf('day')))}
                  />
                </Form.Item>

                <Form.Item
                  name="unitId"
                  label="所属单位"
                  rules={[
                    {
                      validator: async (_rule, value) => {
                        if (!isNewUser && !value) {
                          return;
                        }
                        if (!value) {
                          throw new Error('请选择所属单位');
                        }
                      },
                    },
                  ]}
                >
                  <Select
                    placeholder="请选择所属单位"
                    size="large"
                    options={units.map((item) => ({ label: item.name, value: item.id }))}
                    onChange={handleUnitChange}
                    allowClear
                  />
                </Form.Item>

                <Form.Item
                  name="departmentId"
                  label="所属部门"
                  rules={[
                    {
                      validator: async (_rule, value) => {
                        if (!isNewUser && !value) {
                          return;
                        }
                        if (!value) {
                          throw new Error('请选择所属部门');
                        }
                      },
                    },
                  ]}
                >
                  <Select
                    disabled={!selectedUnitId}
                    placeholder="请选择所属部门"
                    size="large"
                    options={currentDepartments.map((item) => ({ label: item.name, value: item.id }))}
                    onChange={handleDepartmentChange}
                    allowClear
                  />
                </Form.Item>

                <Form.Item
                  name="positionId"
                  label="所属职位"
                  rules={[
                    {
                      validator: async (_rule, value) => {
                        if (!isNewUser && !value) {
                          return;
                        }
                        if (!value) {
                          throw new Error('请选择所属职位');
                        }
                      },
                    },
                  ]}
                >
                  <Select
                    disabled={!selectedDepartmentId}
                    placeholder="请选择所属职位"
                    size="large"
                    options={currentPositions.map((item) => ({ label: item.name, value: item.id }))}
                    allowClear
                  />
                </Form.Item>
              </div>
            </Modal>
          </Form>

          <div className="login-footer">
            <p>© 2026 ZJZAI 建筑项目全生命周期管理平台 | 版本 v1.0.0</p>
            <p>
              <a href="#" className="footer-link">
                沪ICP备 xxxxxx 号
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
