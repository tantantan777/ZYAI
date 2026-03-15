import { useEffect, useMemo, useState } from 'react';
import { Avatar, Card, Input, Select, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import api from '../utils/api';
import {
  ensureRealtimeConnection,
  type OrgStructureUpdatedEvent,
  type PresenceUserEvent,
  type UserDirectoryUpdatedEvent,
} from '../services/realtime';
import { feedback as message } from '../utils/feedback';
import './SystemSettings.css';

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

interface RegisteredUserItem {
  id: number;
  email: string;
  name: string | null;
  avatar: string | null;
  gender: 'male' | 'female' | 'unknown' | null;
  phone: string | null;
  unitName: string | null;
  departmentName: string | null;
  positionName: string | null;
  hireDate: string | null;
  createdAt: string;
  lastLogin: string | null;
  isOnline: boolean;
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '-';
}

export default function UserDirectory() {
  const [units, setUnits] = useState<OrgUnitItem[]>([]);
  const [departments, setDepartments] = useState<OrgDepartmentItem[]>([]);
  const [positions, setPositions] = useState<OrgPositionItem[]>([]);
  const [users, setUsers] = useState<RegisteredUserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userSearchKeyword, setUserSearchKeyword] = useState('');
  const [userFilterUnitName, setUserFilterUnitName] = useState<string>();
  const [userFilterDepartmentName, setUserFilterDepartmentName] = useState<string>();
  const [userFilterPositionName, setUserFilterPositionName] = useState<string>();

  const loadOrgStructure = async (silent = false) => {
    try {
      const response = await api.get('/org/structure');
      setUnits((response.data.units ?? []) as OrgUnitItem[]);
      setDepartments((response.data.departments ?? []) as OrgDepartmentItem[]);
      setPositions((response.data.positions ?? []) as OrgPositionItem[]);
    } catch (error) {
      console.error('加载组织结构失败:', error);
      if (!silent) {
        message.error('组织结构加载失败，请稍后重试');
      }
    }
  };

  const loadUsers = async (silent = false) => {
    setLoading(true);
    try {
      const response = await api.get('/user/list');
      setUsers((response.data.users ?? []) as RegisteredUserItem[]);
    } catch (error) {
      console.error('加载用户列表失败:', error);
      if (!silent) {
        message.error('用户列表加载失败，请稍后重试');
      }
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadOrgStructure(), loadUsers()]);
  }, []);

  const unitNameById = useMemo(() => new Map(units.map((item) => [item.id, item.name])), [units]);
  const departmentNameById = useMemo(
    () => new Map(departments.map((item) => [item.id, item.name])),
    [departments],
  );

  const userFilterDepartmentOptions = useMemo(() => {
    return departments
      .filter((item) => {
        if (!userFilterUnitName) {
          return true;
        }

        return unitNameById.get(item.unitId) === userFilterUnitName;
      })
      .map((item) => ({
        label: item.name,
        value: item.name,
      }));
  }, [departments, unitNameById, userFilterUnitName]);

  const userFilterPositionOptions = useMemo(() => {
    return positions
      .filter((item) => {
        const departmentName = departmentNameById.get(item.departmentId);
        if (!departmentName) {
          return false;
        }

        if (userFilterDepartmentName) {
          return departmentName === userFilterDepartmentName;
        }

        if (userFilterUnitName) {
          const department = departments.find((departmentItem) => departmentItem.id === item.departmentId);
          if (!department) {
            return false;
          }

          return unitNameById.get(department.unitId) === userFilterUnitName;
        }

        return true;
      })
      .map((item) => ({
        label: item.name,
        value: item.name,
      }));
  }, [departmentNameById, departments, positions, unitNameById, userFilterDepartmentName, userFilterUnitName]);

  useEffect(() => {
    if (!userFilterDepartmentName) {
      setUserFilterPositionName(undefined);
      return;
    }

    const isValid = userFilterDepartmentOptions.some((item) => item.value === userFilterDepartmentName);
    if (!isValid) {
      setUserFilterDepartmentName(undefined);
      setUserFilterPositionName(undefined);
    }
  }, [userFilterDepartmentName, userFilterDepartmentOptions]);

  useEffect(() => {
    if (!userFilterPositionName) {
      return;
    }

    const isValid = userFilterPositionOptions.some((item) => item.value === userFilterPositionName);
    if (!isValid) {
      setUserFilterPositionName(undefined);
    }
  }, [userFilterPositionName, userFilterPositionOptions]);

  const filteredUsers = useMemo(() => {
    const keyword = userSearchKeyword.trim().toLowerCase();
    const collator = new Intl.Collator('zh-CN-u-co-pinyin', {
      sensitivity: 'base',
      numeric: true,
    });

    return users
      .filter((item) => {
        if (userFilterUnitName && item.unitName !== userFilterUnitName) {
          return false;
        }

        if (userFilterDepartmentName && item.departmentName !== userFilterDepartmentName) {
          return false;
        }

        if (userFilterPositionName && item.positionName !== userFilterPositionName) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        return [item.name, item.unitName, item.departmentName, item.positionName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      })
      .sort((left, right) => {
        const leftName = left.name?.trim() || left.email;
        const rightName = right.name?.trim() || right.email;
        const byName = collator.compare(leftName, rightName);

        if (byName !== 0) {
          return byName;
        }

        return left.id - right.id;
      });
  }, [userFilterDepartmentName, userFilterPositionName, userFilterUnitName, userSearchKeyword, users]);

  useEffect(() => {
    const socket = ensureRealtimeConnection();
    if (!socket) {
      return;
    }

    const handlePresenceUser = (payload: PresenceUserEvent) => {
      setUsers((prev) =>
        prev.map((item) =>
          item.id === payload.userId
            ? {
                ...item,
                isOnline: payload.isOnline,
              }
            : item,
        ),
      );
    };

    const handleUserDirectoryUpdated = (_payload: UserDirectoryUpdatedEvent) => {
      void loadUsers(true);
    };

    const handleOrgStructureUpdated = (_payload: OrgStructureUpdatedEvent) => {
      void Promise.all([loadOrgStructure(true), loadUsers(true)]);
    };

    socket.on('presence:user', handlePresenceUser);
    socket.on('user:directory-updated', handleUserDirectoryUpdated);
    socket.on('org:structure-updated', handleOrgStructureUpdated);

    return () => {
      socket.off('presence:user', handlePresenceUser);
      socket.off('user:directory-updated', handleUserDirectoryUpdated);
      socket.off('org:structure-updated', handleOrgStructureUpdated);
    };
  }, []);

  const columns: TableProps<RegisteredUserItem>['columns'] = [
    {
      title: '头像',
      dataIndex: 'avatar',
      width: 72,
      align: 'center',
      render: (value, record) => <Avatar src={value || undefined} icon={<UserOutlined />} alt={record.name || record.email} />,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: 96,
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '性别',
      dataIndex: 'gender',
      width: 68,
      align: 'center',
      render: (value) => {
        if (!value) {
          return '-';
        }

        return value === 'male' ? '男' : value === 'female' ? '女' : '未知';
      },
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 132,
      render: (value) => value || '-',
    },
    { title: '邮箱', dataIndex: 'email', width: 220, ellipsis: true },
    {
      title: '单位',
      dataIndex: 'unitName',
      width: 220,
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '部门',
      dataIndex: 'departmentName',
      width: 170,
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '职位',
      dataIndex: 'positionName',
      width: 112,
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: '入职时间',
      dataIndex: 'hireDate',
      width: 126,
      render: (value) => formatDateOnly(value),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      width: 126,
      render: (value) => formatDateOnly(value),
    },
    {
      title: '在线状态',
      dataIndex: 'isOnline',
      width: 96,
      align: 'center',
      render: (_value, record) => {
        if (!record.lastLogin) {
          return <Tag>未登录</Tag>;
        }

        return record.isOnline ? <Tag color="success">在线</Tag> : <Tag>离线</Tag>;
      },
    },
  ];

  return (
    <div className="system-settings-page-root">
      <Card className="system-settings-card" bordered={false} title="用户查询">
        <div style={{ padding: '16px 16px 24px' }}>
          <div className="system-settings-user-toolbar">
            <Input.Search
              allowClear
              placeholder="搜索姓名、单位、部门、职位"
              value={userSearchKeyword}
              onChange={(event) => setUserSearchKeyword(event.target.value)}
              className="system-settings-user-toolbar__search"
            />
            <Select
              allowClear
              placeholder="筛选单位"
              value={userFilterUnitName}
              onChange={(value) => {
                setUserFilterUnitName(value);
                setUserFilterDepartmentName(undefined);
                setUserFilterPositionName(undefined);
              }}
              options={units.map((item) => ({ label: item.name, value: item.name }))}
              className="system-settings-user-toolbar__select"
            />
            <Select
              allowClear
              placeholder="筛选部门"
              value={userFilterDepartmentName}
              onChange={(value) => {
                setUserFilterDepartmentName(value);
                setUserFilterPositionName(undefined);
              }}
              options={userFilterDepartmentOptions}
              className="system-settings-user-toolbar__select"
            />
            <Select
              allowClear
              placeholder="筛选职位"
              value={userFilterPositionName}
              onChange={(value) => setUserFilterPositionName(value)}
              options={userFilterPositionOptions}
              className="system-settings-user-toolbar__select"
            />
          </div>

          <div style={{ marginBottom: 12, color: 'rgba(0, 0, 0, 0.45)' }}>共 {filteredUsers.length} 个用户</div>

          <Table<RegisteredUserItem>
            rowKey="id"
            className="system-settings-user-table"
            loading={loading}
            dataSource={filteredUsers}
            columns={columns}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 1500 }}
          />
        </div>
      </Card>
    </div>
  );
}
