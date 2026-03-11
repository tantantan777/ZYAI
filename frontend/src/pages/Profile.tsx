import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Row,
  Select,
  Space,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd';
import { ReloadOutlined, SaveOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import api from '../utils/api';
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
  unitId?: number;
  departmentId?: number;
  positionId?: number;
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
  const now = dayjs().startOf('day');

  if (start.isAfter(now)) {
    return '0个月';
  }

  const months = now.diff(start, 'month');
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

  const currentDepartments = useMemo(
    () => departments.filter((item) => item.unitId === selectedUnitId),
    [departments, selectedUnitId]
  );
  const currentPositions = useMemo(
    () => positions.filter((item) => item.departmentId === selectedDepartmentId),
    [positions, selectedDepartmentId]
  );
  const tenureText = useMemo(() => formatTenure(hireDateValue), [hireDateValue]);

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    const isValid = currentDepartments.some((item) => item.id === selectedDepartmentId);
    if (isValid) {
      return;
    }
    setSelectedDepartmentId(currentDepartments[0]?.id ?? 0);
  }, [currentDepartments, selectedDepartmentId]);

  useEffect(() => {
    const isValid = currentPositions.some((item) => item.id === selectedPositionId);
    if (isValid) {
      return;
    }
    setSelectedPositionId(currentPositions[0]?.id ?? 0);
  }, [currentPositions, selectedPositionId]);

  useEffect(() => {
    form.setFieldValue('unitId', selectedUnitId || undefined);
  }, [form, selectedUnitId]);

  useEffect(() => {
    form.setFieldValue('departmentId', selectedDepartmentId || undefined);
  }, [form, selectedDepartmentId]);

  useEffect(() => {
    form.setFieldValue('positionId', selectedPositionId || undefined);
  }, [form, selectedPositionId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [profileRes, orgRes] = await Promise.all([
        api.get('/user/profile'),
        api.get('/org/structure'),
      ]);

      const user = profileRes.data.user as ProfileUser;
      const nextUnits = (orgRes.data.units ?? []) as OrgUnitItem[];
      const nextDepartments = (orgRes.data.departments ?? []) as OrgDepartmentItem[];
      const nextPositions = (orgRes.data.positions ?? []) as OrgPositionItem[];

      setUnits(nextUnits);
      setDepartments(nextDepartments);
      setPositions(nextPositions);

      const nextSelectedUnitId = user.unitId ?? 0;
      const nextSelectedDepartmentId = user.departmentId ?? 0;
      const nextSelectedPositionId = user.positionId ?? 0;

      setSelectedUnitId(nextSelectedUnitId);
      setSelectedDepartmentId(nextSelectedDepartmentId);
      setSelectedPositionId(nextSelectedPositionId);

      form.setFieldsValue({
        userId: user.id,
        email: user.email,
        name: user.name ?? '',
        gender: user.gender ?? undefined,
        hireDate: user.hireDate ? dayjs(user.hireDate) : undefined,
        phone: user.phone ?? '',
        avatar: user.avatar ?? undefined,
        unitId: nextSelectedUnitId || undefined,
        departmentId: nextSelectedDepartmentId || undefined,
        positionId: nextSelectedPositionId || undefined,
      });
    } catch (error) {
      console.error('加载个人资料失败:', error);
      message.error('加载个人资料失败');
    } finally {
      setLoading(false);
    }
  };

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
        positionId: values.positionId ?? null,
      });

      message.success('保存成功');
      void loadAll();
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      message.error(error.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUnitChange = (value?: number) => {
    setSelectedUnitId(value ?? 0);
    setSelectedDepartmentId(0);
    setSelectedPositionId(0);
  };

  const handleDepartmentChange = (value?: number) => {
    setSelectedDepartmentId(value ?? 0);
    setSelectedPositionId(0);
  };

  const handleAvatarBeforeUpload = (file: File) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
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
      message.error('读取头像失败');
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
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void loadAll()} disabled={loading || saving}>
              刷新
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
              保存
            </Button>
          </Space>
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
            <Button onClick={() => form.setFieldValue('avatar', undefined)} disabled={!avatarSrc}>
              移除头像
            </Button>
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
              <Form.Item label="姓名" name="name" rules={[{ max: 50, message: '最多 50 个字符' }]}>
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
              <Form.Item label="手机号" name="phone" rules={[{ max: 30, message: '最多 30 个字符' }]}>
                <Input placeholder="请输入手机号" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="单位" name="unitId">
                <Select
                  placeholder="请选择单位"
                  options={units.map((item) => ({ label: item.name, value: item.id }))}
                  value={selectedUnitId || undefined}
                  onChange={handleUnitChange}
                  allowClear
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={12}>
              <Form.Item label="部门" name="departmentId">
                <Select
                  placeholder="请选择部门"
                  options={currentDepartments.map((item) => ({ label: item.name, value: item.id }))}
                  value={selectedDepartmentId || undefined}
                  onChange={handleDepartmentChange}
                  disabled={!selectedUnitId}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="职位" name="positionId">
                <Select
                  placeholder="请选择职位"
                  options={currentPositions.map((item) => ({ label: item.name, value: item.id }))}
                  value={selectedPositionId || undefined}
                  onChange={(value) => setSelectedPositionId(value ?? 0)}
                  disabled={!selectedDepartmentId}
                  allowClear
                />
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
