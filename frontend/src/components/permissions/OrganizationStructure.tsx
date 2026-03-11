import { Tabs, Card, Table, Button, Space, Tag } from 'antd';
import type { TabsProps } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface Organization {
  id: number;
  type: string;
  name: string;
  address: string;
  contact: string;
  phone: string;
}

interface Department {
  id: number;
  organizationId: number;
  name: string;
  manager: string;
  phone: string;
}

interface Position {
  id: number;
  departmentId: number;
  name: string;
  level: string;
}

interface User {
  id: number;
  positionId: number;
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive';
}

export default function OrganizationStructure() {
  const [selectedOrgId, setSelectedOrgId] = useState<number>(1);
  const [selectedDeptId, setSelectedDeptId] = useState<number>(1);

  // 模拟数据
  const [organizations] = useState<Organization[]>([
    { id: 1, type: '总公司', name: '建筑集团总公司', address: '北京市朝阳区建国路88号', contact: '张三', phone: '010-12345678' },
    { id: 2, type: '分公司', name: '华东分公司', address: '上海市浦东新区', contact: '李四', phone: '021-87654321' },
  ]);

  const [departments] = useState<Department[]>([
    { id: 1, organizationId: 1, name: '技术部', manager: '王五', phone: '010-11111111' },
    { id: 2, organizationId: 1, name: '工程部', manager: '赵六', phone: '010-22222222' },
    { id: 3, organizationId: 2, name: '市场部', manager: '孙七', phone: '021-33333333' },
  ]);

  const [positions] = useState<Position[]>([
    { id: 1, departmentId: 1, name: '项目经理', level: '中级' },
    { id: 2, departmentId: 1, name: '高级工程师', level: '高级' },
    { id: 3, departmentId: 2, name: '施工员', level: '初级' },
  ]);

  const [users] = useState<User[]>([
    { id: 1, positionId: 1, name: '张明', email: 'zhangming@example.com', phone: '13800138001', status: 'active' },
    { id: 2, positionId: 1, name: '李华', email: 'lihua@example.com', phone: '13800138002', status: 'active' },
    { id: 3, positionId: 2, name: '王强', email: 'wangqiang@example.com', phone: '13800138003', status: 'active' },
  ]);

  // 获取当前单位的部门
  const currentDepartments = departments.filter(d => d.organizationId === selectedOrgId);

  // 获取当前部门的职位
  const currentPositions = positions.filter(p => p.departmentId === selectedDeptId);

  // 单位Tabs
  const orgItems: TabsProps['items'] = organizations.map(org => ({
    key: org.id.toString(),
    label: org.name,
  }));

  // 部门Tabs
  const deptItems: TabsProps['items'] = currentDepartments.map(dept => ({
    key: dept.id.toString(),
    label: dept.name,
  }));

  // 人员列表列
  const userColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    { title: '手机号', dataIndex: 'phone', key: 'phone' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>
          {status === 'active' ? '在职' : '离职'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="组织架构管理"
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />}>新增单位</Button>
            <Button icon={<PlusOutlined />}>新增部门</Button>
          </Space>
        }
      >
        {/* 单位级别 Tabs */}
        <Tabs
          activeKey={selectedOrgId.toString()}
          items={orgItems}
          onChange={(key) => {
            setSelectedOrgId(Number(key));
            // 切换单位时，默认选中该单位的第一个部门
            const firstDept = departments.find(d => d.organizationId === Number(key));
            if (firstDept) {
              setSelectedDeptId(firstDept.id);
            }
          }}
        />

        {/* 部门级别 Tabs */}
        {currentDepartments.length > 0 && (
          <Tabs
            activeKey={selectedDeptId.toString()}
            items={deptItems}
            onChange={(key) => setSelectedDeptId(Number(key))}
            style={{ marginTop: 16 }}
          />
        )}

        {/* 职位和人员列表 */}
        <div style={{ marginTop: 24 }}>
          {currentPositions.map(position => {
            const positionUsers = users.filter(u => u.positionId === position.id);
            return (
              <Card
                key={position.id}
                title={`${position.name} (${position.level})`}
                extra={
                  <Space>
                    <Button type="link" size="small" icon={<PlusOutlined />}>添加人员</Button>
                    <Button type="link" size="small" icon={<EditOutlined />}>编辑职位</Button>
                    <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除职位</Button>
                  </Space>
                }
                style={{ marginBottom: 16 }}
                size="small"
              >
                <Table
                  dataSource={positionUsers}
                  columns={userColumns}
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
              </Card>
            );
          })}

          {currentPositions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
              暂无职位数据
              <div style={{ marginTop: 16 }}>
                <Button type="primary" icon={<PlusOutlined />}>新增职位</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
