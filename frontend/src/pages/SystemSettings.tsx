import { useState, useEffect } from 'react';
import { Card, Tabs, Form, Input, Select, Button, message, Space, InputNumber, Row, Col, Empty, Modal, Tooltip, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { SaveOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../utils/api';
import './SystemSettings.css';

const { TabPane } = Tabs;

interface AIConfigForm {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  openaiOrganization?: string;
  openaiProject?: string;
  anthropicVersion?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

const PROVIDER_OPTIONS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic (Claude)', value: 'anthropic' },
];

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
};

interface OrgUnitItem {
  id: number;
  name: string;
}

interface OrgDepartmentItem {
  id: number;
  unitId: number;
  name: string;
}

interface OrgPositionItem {
  id: number;
  departmentId: number;
  name: string;
}

interface OrgPersonItem {
  id: number;
  positionId: number;
  name: string;
  email?: string;
  phone?: string;
}

interface RegisteredUserItem {
  id: number;
  email: string;
  name: string | null;
  gender: 'male' | 'female' | 'unknown' | null;
  phone: string | null;
  unitName: string | null;
  departmentName: string | null;
  positionName: string | null;
  createdAt: string;
  lastLogin: string | null;
  isOnline: boolean;
}

function formatToDayStart(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  if (!match) {
    return '-';
  }

  return `${match[0]} 00:00:00`;
}

export default function SystemSettings() {
  const [form] = Form.useForm<AIConfigForm>();
  const [saveLoading, setSaveLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('openai');

  const [units, setUnits] = useState<OrgUnitItem[]>([]);
  const [departments, setDepartments] = useState<OrgDepartmentItem[]>([]);
  const [positions, setPositions] = useState<OrgPositionItem[]>([]);
  const [people, setPeople] = useState<OrgPersonItem[]>([]);

  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUserItem[]>([]);
  const [registeredUsersLoading, setRegisteredUsersLoading] = useState(false);

  const [selectedUnitId, setSelectedUnitId] = useState<number>(0);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number>(0);
  const [selectedPositionId, setSelectedPositionId] = useState<number>(0);

  const [addUnitModalOpen, setAddUnitModalOpen] = useState(false);
  const [addDepartmentModalOpen, setAddDepartmentModalOpen] = useState(false);
  const [addPositionModalOpen, setAddPositionModalOpen] = useState(false);
  const [addUnitName, setAddUnitName] = useState('');
  const [addDepartmentName, setAddDepartmentName] = useState('');
  const [addPositionName, setAddPositionName] = useState('');

  useEffect(() => {
    void loadAIConfig();
    void loadOrgStructure();
  }, []);

  const loadAIConfig = async () => {
    try {
      const response = await api.get('/ai-config');

      if (response.data.config) {
        setSelectedProvider(response.data.config.provider);
        form.setFieldsValue({
          provider: response.data.config.provider,
          model: response.data.config.model,
          baseUrl: response.data.config.base_url || '',
          openaiOrganization: response.data.config.openai_organization || '',
          openaiProject: response.data.config.openai_project || '',
          anthropicVersion: response.data.config.anthropic_version || '',
          temperature: response.data.config.temperature ?? 0.7,
          maxTokens: response.data.config.max_tokens ?? 2000,
          topP: response.data.config.top_p ?? 1,
          topK: response.data.config.top_k ?? undefined,
          timeoutMs: response.data.config.timeout_ms ?? 60000,
          maxRetries: response.data.config.max_retries ?? 2,
          apiKey: ''
        });
      } else {
        setSelectedProvider('openai');
        form.setFieldsValue({
          provider: 'openai',
          model: MODEL_SUGGESTIONS.openai[0],
          baseUrl: '',
          temperature: 0.7,
          maxTokens: 2000,
          topP: 1,
          timeoutMs: 60000,
          maxRetries: 2,
          apiKey: '',
        });
      }
    } catch (error) {
      console.error('加载AI配置失败:', error);
    }
  };

  const loadOrgStructure = async () => {
    try {
      const response = await api.get('/org/structure');
      const nextUnits = (response.data.units ?? []) as OrgUnitItem[];
      const nextDepartments = (response.data.departments ?? []) as OrgDepartmentItem[];
      const nextPositions = (response.data.positions ?? []) as OrgPositionItem[];

      setUnits(nextUnits);
      setDepartments(nextDepartments);
      setPositions(nextPositions);

      const nextSelectedUnitId = nextUnits.some((item) => item.id === selectedUnitId)
        ? selectedUnitId
        : (nextUnits[0]?.id ?? 0);

      const nextSelectedDepartmentId = nextDepartments.some(
        (item) => item.id === selectedDepartmentId && item.unitId === nextSelectedUnitId
      )
        ? selectedDepartmentId
        : (nextDepartments.find((item) => item.unitId === nextSelectedUnitId)?.id ?? 0);

      const nextSelectedPositionId = nextPositions.some(
        (item) => item.id === selectedPositionId && item.departmentId === nextSelectedDepartmentId
      )
        ? selectedPositionId
        : (nextPositions.find((item) => item.departmentId === nextSelectedDepartmentId)?.id ?? 0);

      setSelectedUnitId(nextSelectedUnitId);
      setSelectedDepartmentId(nextSelectedDepartmentId);
      setSelectedPositionId(nextSelectedPositionId);
    } catch (error) {
      console.error('加载单位配置失败:', error);
      message.error('加载单位配置失败');
    }
  };

  const loadPositionPeople = async (positionId: number) => {
    try {
      const response = await api.get(`/org/positions/${positionId}/people`);
      setPeople((response.data.people ?? []) as OrgPersonItem[]);
    } catch (error) {
      console.error('加载人员失败:', error);
      setPeople([]);
    }
  };

  const loadRegisteredUsers = async () => {
    setRegisteredUsersLoading(true);
    try {
      const response = await api.get('/user/list');
      setRegisteredUsers((response.data.users ?? []) as RegisteredUserItem[]);
    } catch (error) {
      console.error('加载注册用户失败:', error);
      message.error('加载注册用户失败');
      setRegisteredUsers([]);
    } finally {
      setRegisteredUsersLoading(false);
    }
  };
  const handleSave = async (values: AIConfigForm) => {
    setSaveLoading(true);
    try {
      await api.post('/ai-config', values);

      message.success('AI配置保存成功');
    } catch (error: any) {
      message.error(error.response?.data?.message || '保存失败');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleProviderChange = (value: string) => {
    setSelectedProvider(value);
    const suggestions = MODEL_SUGGESTIONS[value];
    if (suggestions && suggestions.length > 0) {
      form.setFieldValue('model', suggestions[0]);
    }

    if (value === 'openai') {
      form.setFieldsValue({
        anthropicVersion: undefined,
        topK: undefined,
      });
    }

    if (value === 'anthropic') {
      form.setFieldsValue({
        openaiOrganization: undefined,
        openaiProject: undefined,
      });
    }
  };

  const baseUrlPlaceholder =
    selectedProvider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';


  const registeredUserColumns: TableProps<RegisteredUserItem>['columns'] = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 72,
      align: 'center',
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '性别',
      dataIndex: 'gender',
      width: 90,
      align: 'center',
      render: (value) => {
        if (!value) {
          return '-';
        }
        const label = value === 'male' ? '男' : value === 'female' ? '女' : '未知';
        const color = value === 'male' ? 'blue' : value === 'female' ? 'magenta' : 'default';
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      ellipsis: true,
    },
    {
      title: '单位',
      dataIndex: 'unitName',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '部门',
      dataIndex: 'departmentName',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '职位',
      dataIndex: 'positionName',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value) => formatToDayStart(value),
    },
    {
      title: '最后登录',
      dataIndex: 'lastLogin',
      width: 180,
      render: (value) => formatToDayStart(value),
    },
    {
      title: '在线状态',
      dataIndex: 'isOnline',
      width: 110,
      align: 'center',
      render: (_value, record) => {
        if (!record.lastLogin) {
          return <Tag>未登录</Tag>;
        }

        return record.isOnline ? <Tag color="success">在线</Tag> : <Tag>离线</Tag>;
      },
    },
  ];

  const currentDepartments = departments.filter((item) => item.unitId === selectedUnitId);
  const currentPositions = positions.filter((item) => item.departmentId === selectedDepartmentId);
  const currentPeople = people.filter((item) => item.positionId === selectedPositionId);

  useEffect(() => {
    const isValid = departments.some(
      (dept) => dept.id === selectedDepartmentId && dept.unitId === selectedUnitId
    );
    if (isValid) {
      return;
    }
    const firstDepartment = departments.find((dept) => dept.unitId === selectedUnitId);
    setSelectedDepartmentId(firstDepartment?.id ?? 0);
  }, [selectedUnitId, departments, selectedDepartmentId]);

  useEffect(() => {
    const isValid = positions.some(
      (pos) => pos.id === selectedPositionId && pos.departmentId === selectedDepartmentId
    );
    if (isValid) {
      return;
    }
    const firstPosition = positions.find((pos) => pos.departmentId === selectedDepartmentId);
    setSelectedPositionId(firstPosition?.id ?? 0);
  }, [selectedDepartmentId, positions, selectedPositionId]);

  useEffect(() => {
    if (!selectedPositionId) {
      setPeople([]);
      return;
    }
    void loadPositionPeople(selectedPositionId);
  }, [selectedPositionId]);

  const openAddUnitModal = () => {
    setAddUnitName('');
    setAddUnitModalOpen(true);
  };

  const openAddDepartmentModal = () => {
    if (!selectedUnitId) {
      message.warning('请先选择单位');
      return;
    }
    setAddDepartmentName('');
    setAddDepartmentModalOpen(true);
  };

  const openAddPositionModal = () => {
    if (!selectedDepartmentId) {
      message.warning('请先选择部门');
      return;
    }
    setAddPositionName('');
    setAddPositionModalOpen(true);
  };

  const handleAddUnit = async () => {
    const name = addUnitName.trim();
    if (!name) {
      message.error('请输入单位名称');
      return;
    }

    try {
      const response = await api.post('/org/units', { name });
      const next = response.data.unit as OrgUnitItem;
      setUnits((prev) => [...prev, next]);
      setSelectedUnitId(next.id);
      setSelectedDepartmentId(0);
      setSelectedPositionId(0);
      setAddUnitName('');
      setAddUnitModalOpen(false);
      message.success('单位添加成功');
    } catch (error: any) {
      message.error(error.response?.data?.message || '添加单位失败');
    }
  };

  const handleAddDepartment = async () => {
    const name = addDepartmentName.trim();
    if (!name) {
      message.error('请输入部门名称');
      return;
    }

    if (!selectedUnitId) {
      message.error('请先选择单位');
      return;
    }

    try {
      const response = await api.post('/org/departments', { unitId: selectedUnitId, name });
      const next = response.data.department as OrgDepartmentItem;
      setDepartments((prev) => [...prev, next]);
      setSelectedDepartmentId(next.id);
      setSelectedPositionId(0);
      setAddDepartmentName('');
      setAddDepartmentModalOpen(false);
      message.success('部门添加成功');
    } catch (error: any) {
      message.error(error.response?.data?.message || '添加部门失败');
    }
  };

  const handleAddPosition = async () => {
    const name = addPositionName.trim();
    if (!name) {
      message.error('请输入职位名称');
      return;
    }

    if (!selectedDepartmentId) {
      message.error('请先选择部门');
      return;
    }

    try {
      const response = await api.post('/org/positions', { departmentId: selectedDepartmentId, name });
      const next = response.data.position as OrgPositionItem;
      setPositions((prev) => [...prev, next]);
      setSelectedPositionId(next.id);
      setAddPositionName('');
      setAddPositionModalOpen(false);
      message.success('职位添加成功');
    } catch (error: any) {
      message.error(error.response?.data?.message || '添加职位失败');
    }
  };

  return (
    <div className="system-settings-page-root">
      <Card className="system-settings-card" bordered={false}>
        <Tabs
          defaultActiveKey="ai"
          onChange={(key) => {
            if (key === 'users') {
              void loadRegisteredUsers();
            }
          }}
        >
          <TabPane tab="AI配置" key="ai">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              initialValues={{
                provider: 'openai',
                temperature: 0.7,
                maxTokens: 2000,
                topP: 1,
                timeoutMs: 60000,
                maxRetries: 2,
              }}
              style={{ maxWidth: 1200, margin: '0 auto' }}
            >
              <Row gutter={24}>
                <Col xs={24} lg={12}>
                  <Form.Item
                    label="API服务商"
                    name="provider"
                    rules={[{ required: true, message: '请选择API服务商' }]}
                    extra="选择 OpenAI 或 Claude。不同服务商支持的参数略有差异。"
                  >
                    <Select
                      placeholder="请选择API服务商"
                      options={PROVIDER_OPTIONS}
                      onChange={handleProviderChange}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="模型"
                    name="model"
                    rules={[{ required: true, message: '请输入模型名称' }]}
                    extra={
                      selectedProvider === 'anthropic'
                        ? '填写模型 ID，例如 claude-3-5-sonnet-20241022。'
                        : '填写模型 ID，例如 gpt-4o。'
                    }
                  >
                    <Input placeholder="请输入模型名称" />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="API Key"
                    name="apiKey"
                    rules={[{ required: true, message: '请输入API Key' }]}
                    extra={
                      selectedProvider === 'anthropic'
                        ? '用于服务端调用 Claude。常见以 sk-ant- 开头。'
                        : '用于服务端调用 OpenAI。常见以 sk- 或 sk-proj- 开头。'
                    }
                  >
                    <Input.Password placeholder="请输入API Key" />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="API Base URL（可选）"
                    name="baseUrl"
                    extra={
                      selectedProvider === 'anthropic'
                        ? '留空使用官方默认：https://api.anthropic.com。'
                        : '留空使用官方默认：https://api.openai.com/v1（OpenAI 兼容网关通常以 /v1 结尾）。'
                    }
                  >
                    <Input placeholder={baseUrlPlaceholder} />
                  </Form.Item>
                </Col>

                {selectedProvider === 'openai' && (
                  <>
                    <Col xs={24} lg={12}>
                      <Form.Item
                        label="OpenAI Organization（可选）"
                        name="openaiOrganization"
                        preserve={false}
                        extra="仅在账号需要指定 Organization 时填写，例如 org_xxx。"
                      >
                        <Input placeholder="例如: org_..." />
                      </Form.Item>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Form.Item
                        label="OpenAI Project（可选）"
                        name="openaiProject"
                        preserve={false}
                        extra="仅在需要指定 Project 归属/计费时填写，例如 proj_xxx。"
                      >
                        <Input placeholder="例如: proj_..." />
                      </Form.Item>
                    </Col>
                  </>
                )}

                {selectedProvider === 'anthropic' && (
                  <>
                    <Col xs={24} lg={12}>
                      <Form.Item
                        label="Anthropic-Version（可选）"
                        name="anthropicVersion"
                        preserve={false}
                        extra="HTTP Header：anthropic-version。留空则使用 SDK 默认版本。"
                      >
                        <Input placeholder="例如: 2023-06-01" />
                      </Form.Item>
                    </Col>

                    <Col xs={24} lg={12}>
                      <Form.Item
                        label="Top K（可选）"
                        name="topK"
                        preserve={false}
                        extra="仅 Claude 支持。留空使用默认；一般无需配置。"
                      >
                        <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="例如: 40" />
                      </Form.Item>
                    </Col>
                  </>
                )}

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="Temperature（可选）"
                    name="temperature"
                    extra="采样温度，越大越发散。常用 0 到 1。"
                  >
                    <InputNumber
                      min={0}
                      max={2}
                      step={0.1}
                      precision={2}
                      style={{ width: '100%' }}
                      placeholder="0.7"
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="Top P（可选）"
                    name="topP"
                    extra="核采样参数。1 表示不限制；一般只需与 Temperature 二选一微调。"
                  >
                    <InputNumber
                      min={0}
                      max={1}
                      step={0.01}
                      precision={3}
                      style={{ width: '100%' }}
                      placeholder="1"
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="Max Tokens（可选）"
                    name="maxTokens"
                    extra="限制单次回复最大 token 数，过大可能增加费用/延迟。"
                  >
                    <InputNumber min={1} step={100} style={{ width: '100%' }} placeholder="2000" />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="Timeout (ms)（可选）"
                    name="timeoutMs"
                    extra="单次请求超时（毫秒）。网络较慢时可适当调大。"
                  >
                    <InputNumber min={1} step={1000} style={{ width: '100%' }} placeholder="60000" />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="Max Retries（可选）"
                    name="maxRetries"
                    extra="请求失败时自动重试次数（网络错误/5xx 等）。"
                  >
                    <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="2" />
                  </Form.Item>
                </Col>

                <Col span={24}>
                  <Form.Item>
                    <Space>
                      <Button
                        type="primary"
                        htmlType="submit"
                        icon={<SaveOutlined />}
                        loading={saveLoading}
                      >
                        保存配置
                      </Button>
                      <Button onClick={() => form.resetFields()}>
                        重置
                      </Button>
                    </Space>
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </TabPane>

          <TabPane tab="单位配置" key="org">
            <div className="system-settings-org-root">
              <Row gutter={[16, 16]} className="system-settings-org-grid">
                <Col xs={24} sm={12} lg={6} className="system-settings-org-col">
                  <Card
                    size="small"
                    title="单位"
                    className="system-settings-org-card"
                    extra={
                      <Tooltip title="新增单位">
                        <Button
                          type="text"
                          size="small"
                          shape="circle"
                          icon={<PlusOutlined />}
                          aria-label="新增单位"
                          onClick={openAddUnitModal}
                        />
                      </Tooltip>
                    }
                  >
                    {units.length === 0 ? (
                      <Empty description="暂无单位" />
                    ) : (
                      <div className="system-settings-org-list">
                        {units.map((item) => (
                          <div
                            key={item.id}
                            className={`system-settings-org-list__item ${
                              item.id === selectedUnitId ? 'is-active' : ''
                            }`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedUnitId(item.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                setSelectedUnitId(item.id);
                              }
                            }}
                          >
                            <div className="system-settings-org-list__title">{item.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </Col>

                <Col xs={24} sm={12} lg={6} className="system-settings-org-col">
                  <Card
                    size="small"
                    title="部门"
                    className="system-settings-org-card"
                    extra={
                      <Tooltip title="新增部门">
                        <span>
                          <Button
                            type="text"
                            size="small"
                            shape="circle"
                            icon={<PlusOutlined />}
                            aria-label="新增部门"
                            onClick={openAddDepartmentModal}
                            disabled={!selectedUnitId}
                          />
                        </span>
                      </Tooltip>
                    }
                  >
                    {currentDepartments.length === 0 ? (
                      <Empty description="暂无部门" />
                    ) : (
                      <div className="system-settings-org-list">
                        {currentDepartments.map((item) => (
                          <div
                            key={item.id}
                            className={`system-settings-org-list__item ${
                              item.id === selectedDepartmentId ? 'is-active' : ''
                            }`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedDepartmentId(item.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                setSelectedDepartmentId(item.id);
                              }
                            }}
                          >
                            <div className="system-settings-org-list__title">{item.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </Col>

                <Col xs={24} sm={12} lg={6} className="system-settings-org-col">
                  <Card
                    size="small"
                    title="职位"
                    className="system-settings-org-card"
                    extra={
                      <Tooltip title="新增职位">
                        <span>
                          <Button
                            type="text"
                            size="small"
                            shape="circle"
                            icon={<PlusOutlined />}
                            aria-label="新增职位"
                            onClick={openAddPositionModal}
                            disabled={!selectedDepartmentId}
                          />
                        </span>
                      </Tooltip>
                    }
                  >
                    {currentPositions.length === 0 ? (
                      <Empty description="暂无职位" />
                    ) : (
                      <div className="system-settings-org-list">
                        {currentPositions.map((item) => (
                          <div
                            key={item.id}
                            className={`system-settings-org-list__item ${
                              item.id === selectedPositionId ? 'is-active' : ''
                            }`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedPositionId(item.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                setSelectedPositionId(item.id);
                              }
                            }}
                          >
                            <div className="system-settings-org-list__title">{item.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </Col>

                <Col xs={24} sm={12} lg={6} className="system-settings-org-col">
                  <Card size="small" title="人员" className="system-settings-org-card">
                    {currentPeople.length === 0 ? (
                      <Empty description="暂无人员" />
                    ) : (
                      <div className="system-settings-org-list">
                        {currentPeople.map((item) => {
                          const details = [
                            item.email && item.email !== item.name ? item.email : null,
                            item.phone ?? null,
                          ]
                            .filter(Boolean)
                            .join(' · ');

                          return (
                            <div key={item.id} className="system-settings-org-list__item is-readonly">
                              <div className="system-settings-org-list__title">{item.name}</div>
                              {details && <div className="system-settings-org-list__sub">{details}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </Col>
              </Row>
            </div>

            <Modal
              title="新增单位"
              open={addUnitModalOpen}
              okText="保存"
              cancelText="取消"
              onOk={handleAddUnit}
              onCancel={() => setAddUnitModalOpen(false)}
              okButtonProps={{ disabled: !addUnitName.trim() }}
            >
              <Form layout="vertical">
                <Form.Item label="单位名称" required>
                  <Input
                    autoFocus
                    value={addUnitName}
                    placeholder="请输入单位名称"
                    onChange={(event) => setAddUnitName(event.target.value)}
                    onPressEnter={handleAddUnit}
                  />
                </Form.Item>
              </Form>
            </Modal>

            <Modal
              title="新增部门"
              open={addDepartmentModalOpen}
              okText="保存"
              cancelText="取消"
              onOk={handleAddDepartment}
              onCancel={() => setAddDepartmentModalOpen(false)}
              okButtonProps={{ disabled: !addDepartmentName.trim() }}
            >
              <Form layout="vertical">
                <Form.Item label="部门名称" required>
                  <Input
                    autoFocus
                    value={addDepartmentName}
                    placeholder="请输入部门名称"
                    onChange={(event) => setAddDepartmentName(event.target.value)}
                    onPressEnter={handleAddDepartment}
                  />
                </Form.Item>
              </Form>
            </Modal>

            <Modal
              title="新增职位"
              open={addPositionModalOpen}
              okText="保存"
              cancelText="取消"
              onOk={handleAddPosition}
              onCancel={() => setAddPositionModalOpen(false)}
              okButtonProps={{ disabled: !addPositionName.trim() }}
            >
              <Form layout="vertical">
                <Form.Item label="职位名称" required>
                  <Input
                    autoFocus
                    value={addPositionName}
                    placeholder="请输入职位名称"
                    onChange={(event) => setAddPositionName(event.target.value)}
                    onPressEnter={handleAddPosition}
                  />
                </Form.Item>
              </Form>
            </Modal>
          </TabPane>

          <TabPane tab="用户配置" key="users">
            <div style={{ padding: '16px 16px 24px' }}>
              <Space style={{ marginBottom: 12 }}>
                <Button onClick={() => void loadRegisteredUsers()} loading={registeredUsersLoading}>
                  刷新
                </Button>
                <span style={{ color: 'rgba(0, 0, 0, 0.45)' }}>共 {registeredUsers.length} 个用户</span>
              </Space>

              <Table<RegisteredUserItem>
                rowKey="id"
                className="system-settings-user-table"
                loading={registeredUsersLoading}
                dataSource={registeredUsers}
                columns={registeredUserColumns}
                pagination={{ pageSize: 10, showSizeChanger: true }}
                scroll={{ x: 1500 }}
              />
            </div>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
}
