import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Card, Col, DatePicker, Form, Input, Row, Select, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { SaveOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import api from '../utils/api';
import { logClientAuditAsync } from '../utils/audit';
import {
  ensureRealtimeConnection,
  type OrgStructureUpdatedEvent,
  type UserProfileUpdatedEvent,
} from '../services/realtime';
import { feedback as message } from '../utils/feedback';
import './Profile.css';

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

interface ProfileUser {
  id: number;
  email: string;
  name: string | null;
  gender: 'male' | 'female' | 'unknown' | null;
  hireDate: string | null;
  avatar: string | null;
  phone: string | null;
  createdAt: string;
  lastLogin: string | null;
  unitId: number | null;
  departmentId: number | null;
  positionId: number | null;
}

type ProfileFormValues = {
  userId: number;
  email: string;
  name?: string;
  gender?: 'male' | 'female' | 'unknown';
  hireDate?: Dayjs;
  phone?: string;
  avatar?: string;
};

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

function formatTenure(hireDate?: Dayjs): string {
  if (!hireDate) {
    return '-';
  }

  const start = hireDate.startOf('day');
  const today = dayjs().startOf('day');

  if (start.isAfter(today)) {
    return '0个月';
  }

  const months = today.diff(start, 'month');
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (years <= 0) {
    return `${remainingMonths}个月`;
  }

  if (remainingMonths === 0) {
    return `${years}年`;
  }

  return `${years}年${remainingMonths}个月`;
}

export default function Profile() {
  const [form] = Form.useForm<ProfileFormValues>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [units, setUnits] = useState<OrgUnitItem[]>([]);
  const [departments, setDepartments] = useState<OrgDepartmentItem[]>([]);
  const [positions, setPositions] = useState<OrgPositionItem[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number>(0);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number>(0);
  const [selectedPositionId, setSelectedPositionId] = useState<number>(0);

  const avatarValue = Form.useWatch('avatar', form);
  const hireDateValue = Form.useWatch('hireDate', form);

  const currentUnitName = useMemo(
    () => units.find((item) => item.id === selectedUnitId)?.name ?? '-',
    [selectedUnitId, units],
  );
  const currentDepartmentName = useMemo(
    () => departments.find((item) => item.id === selectedDepartmentId)?.name ?? '-',
    [departments, selectedDepartmentId],
  );
  const currentPositionName = useMemo(
    () => positions.find((item) => item.id === selectedPositionId)?.name ?? '-',
    [positions, selectedPositionId],
  );
  const tenureText = useMemo(() => formatTenure(hireDateValue), [hireDateValue]);

  const applyOrgStructure = (orgData: {
    units?: OrgUnitItem[];
    departments?: OrgDepartmentItem[];
    positions?: OrgPositionItem[];
  }) => {
    setUnits((orgData.units ?? []) as OrgUnitItem[]);
    setDepartments((orgData.departments ?? []) as OrgDepartmentItem[]);
    setPositions((orgData.positions ?? []) as OrgPositionItem[]);
  };

  const loadOrgStructure = async (silent = false) => {
    try {
      const response = await api.get('/org/structure');
      applyOrgStructure(response.data);
    } catch (error) {
      console.error('加载组织结构失败:', error);
      if (!silent) {
        message.error('组织结构加载失败，请稍后重试');
      }
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [profileRes, orgRes] = await Promise.all([api.get('/user/profile'), api.get('/org/structure')]);
      const user = profileRes.data.user as ProfileUser;

      applyOrgStructure(orgRes.data);
      setSelectedUnitId(user.unitId ?? 0);
      setSelectedDepartmentId(user.departmentId ?? 0);
      setSelectedPositionId(user.positionId ?? 0);

      form.setFieldsValue({
        userId: user.id,
        email: user.email,
        name: user.name ?? '',
        gender: user.gender ?? undefined,
        hireDate: user.hireDate ? dayjs(user.hireDate) : undefined,
        phone: user.phone ?? '',
        avatar: user.avatar ?? undefined,
      });
    } catch (error) {
      console.error('加载个人资料失败:', error);
      message.error('个人资料加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    const socket = ensureRealtimeConnection();
    if (!socket) {
      return;
    }

    const handleProfileUpdated = (_payload: UserProfileUpdatedEvent) => {
      window.dispatchEvent(new Event('user-profile-updated'));
      void loadAll();
    };

    const handleOrgStructureUpdated = (_payload: OrgStructureUpdatedEvent) => {
      void loadOrgStructure(true);
    };

    socket.on('user:profile-updated', handleProfileUpdated);
    socket.on('org:structure-updated', handleOrgStructureUpdated);

    return () => {
      socket.off('user:profile-updated', handleProfileUpdated);
      socket.off('org:structure-updated', handleOrgStructureUpdated);
    };
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();

      await api.put('/user/profile', {
        name: values.name,
        gender: values.gender,
        hireDate: values.hireDate ? values.hireDate.format('YYYY-MM-DD') : null,
        phone: values.phone,
        avatar: values.avatar,
      });

      message.success('个人资料已保存');
      logClientAuditAsync({
        actionType: 'edit',
        targetType: '个人资料',
        targetName: values.name || '个人中心',
      });
      window.dispatchEvent(new Event('user-profile-updated'));
      void loadAll();
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      message.error(error.response?.data?.message || '个人资料保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarBeforeUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请上传图片文件');
      return Upload.LIST_IGNORE;
    }

    const maxMb = 0.5;
    if (file.size > maxMb * 1024 * 1024) {
      message.error(`图片过大，请小于 ${maxMb}MB`);
      return Upload.LIST_IGNORE;
    }

    return false;
  };

  const handleAvatarChange = async (fileList: UploadFile[]) => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      return;
    }

    try {
      const dataUrl = await toDataUrl(file);
      form.setFieldValue('avatar', dataUrl);
    } catch (error) {
      console.error('读取头像失败:', error);
      message.error('头像读取失败，请稍后重试');
    }
  };

  const avatarSrc = avatarValue || undefined;

  return (
    <div className="profile-page-root">
      <Card
        className="profile-page-card"
        bordered={false}
        title="个人中心"
        extra={
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            保存
          </Button>
        }
        loading={loading}
      >
        <div className="profile-avatar-block">
          <Avatar size={72} src={avatarSrc} icon={<UserOutlined />} />
          <div className="profile-avatar-actions">
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={handleAvatarBeforeUpload}
              onChange={(info) => void handleAvatarChange(info.fileList)}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>更换头像</Button>
            </Upload>
          </div>
        </div>

        <Form form={form} layout="vertical">
          <Row gutter={24}>
            <Col xs={24} lg={12}>
              <Form.Item label="用户ID" name="userId">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="邮箱" name="email">
                <Input disabled />
              </Form.Item>
            </Col>

            <Col xs={24} lg={12}>
              <Form.Item label="姓名" name="name" rules={[{ max: 50, message: '最多50个字符' }]}>
                <Input placeholder="请输入姓名" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="性别" name="gender">
                <Select
                  placeholder="请选择性别"
                  options={[
                    { label: '未知', value: 'unknown' },
                    { label: '男', value: 'male' },
                    { label: '女', value: 'female' },
                  ]}
                  allowClear
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={12}>
              <Form.Item label="入职时间" name="hireDate">
                <DatePicker
                  placeholder="请选择入职时间"
                  format="YYYY-MM-DD"
                  allowClear
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="工龄">
                <Input value={tenureText} disabled />
              </Form.Item>
            </Col>

            <Col xs={24} lg={12}>
              <Form.Item label="手机号" name="phone" rules={[{ max: 30, message: '最多30个字符' }]}>
                <Input placeholder="请输入手机号" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="单位">
                <Input value={currentUnitName} disabled />
              </Form.Item>
            </Col>

            <Col xs={24} lg={12}>
              <Form.Item label="部门">
                <Input value={currentDepartmentName} disabled />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="职位">
                <Input value={currentPositionName} disabled />
              </Form.Item>
            </Col>

            <Form.Item name="avatar" hidden>
              <Input />
            </Form.Item>
          </Row>
        </Form>
      </Card>
    </div>
  );
}

