import { Card, Table, Button, Space, Modal, Form, Input, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { openDeleteDialog } from '../../utils/confirm';
import { feedback as message } from '../../utils/feedback';

interface Department {
  id: number;
  organization: string;
  name: string;
  manager: string;
  phone: string;
  createdAt: string;
}

export default function DepartmentManagement() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [form] = Form.useForm();

  // 模拟数据
  const [dataSource] = useState<Department[]>([
    {
      id: 1,
      organization: '建筑集团总公司',
      name: '技术部',
      manager: '李四',
      phone: '010-87654321',
      createdAt: '2024-01-15',
    },
  ]);

  const columns = [
    {
      title: '所属公司',
      dataIndex: 'organization',
      key: 'organization',
    },
    {
      title: '部门名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '部门负责人',
      dataIndex: 'manager',
      key: 'manager',
    },
    {
      title: '负责人联系电话',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Department) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const handleAdd = () => {
    setEditingDept(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (record: Department) => {
    setEditingDept(record);
    form.setFieldsValue(record);
    setIsModalOpen(true);
  };

  const handleDelete = (record: Department) => {
    openDeleteDialog({
      entityLabel: '部门',
      entityName: record.name,
      onOk: () => {
        message.success('部门已删除');
      },
    });
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      console.log('提交数据:', values);
      message.success(editingDept ? '部门已更新' : '部门已添加');
      setIsModalOpen(false);
    } catch (error) {
      console.error('表单验证失败:', error);
    }
  };

  return (
    <Card
      title="部门管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增部门
        </Button>
      }
    >
      <Table
        dataSource={dataSource}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingDept ? '编辑部门' : '新增部门'}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="所属公司"
            name="organization"
            rules={[{ required: true, message: '请选择所属公司' }]}
          >
            <Select placeholder="请选择所属公司">
              <Select.Option value="建筑集团总公司">建筑集团总公司</Select.Option>
              <Select.Option value="分公司">分公司</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="部门名称"
            name="name"
            rules={[{ required: true, message: '请输入部门名称' }]}
          >
            <Input placeholder="请输入部门名称" />
          </Form.Item>
          <Form.Item
            label="部门负责人"
            name="manager"
            rules={[{ required: true, message: '请输入部门负责人' }]}
          >
            <Input placeholder="请输入部门负责人" />
          </Form.Item>
          <Form.Item
            label="负责人联系电话"
            name="phone"
            rules={[{ required: true, message: '请输入负责人联系电话' }]}
          >
            <Input placeholder="请输入负责人联系电话" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
