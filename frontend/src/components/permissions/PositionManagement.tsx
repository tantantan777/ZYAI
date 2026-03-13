import { Card, Table, Button, Space, Modal, Form, Input, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { openDeleteDialog } from '../../utils/confirm';
import { feedback as message } from '../../utils/feedback';

interface Position {
  id: number;
  name: string;
  level: string;
  department: string;
  description: string;
  createdAt: string;
}

export default function PositionManagement() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [form] = Form.useForm();

  // 模拟数据
  const [dataSource] = useState<Position[]>([
    {
      id: 1,
      name: '项目经理',
      level: '中级',
      department: '技术部',
      description: '负责项目整体规划和管理',
      createdAt: '2024-01-20',
    },
  ]);

  const columns = [
    {
      title: '职位名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '职位级别',
      dataIndex: 'level',
      key: 'level',
    },
    {
      title: '所属部门',
      dataIndex: 'department',
      key: 'department',
    },
    {
      title: '职位描述',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Position) => (
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
    setEditingPosition(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (record: Position) => {
    setEditingPosition(record);
    form.setFieldsValue(record);
    setIsModalOpen(true);
  };

  const handleDelete = (record: Position) => {
    openDeleteDialog({
      entityLabel: '职位',
      entityName: record.name,
      onOk: () => {
        message.success('职位已删除');
      },
    });
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      console.log('提交数据:', values);
      message.success(editingPosition ? '职位已更新' : '职位已添加');
      setIsModalOpen(false);
    } catch (error) {
      console.error('表单验证失败:', error);
    }
  };

  return (
    <Card
      title="职位管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增职位
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
        title={editingPosition ? '编辑职位' : '新增职位'}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="职位名称"
            name="name"
            rules={[{ required: true, message: '请输入职位名称' }]}
          >
            <Input placeholder="请输入职位名称" />
          </Form.Item>
          <Form.Item
            label="职位级别"
            name="level"
            rules={[{ required: true, message: '请选择职位级别' }]}
          >
            <Select placeholder="请选择职位级别">
              <Select.Option value="初级">初级</Select.Option>
              <Select.Option value="中级">中级</Select.Option>
              <Select.Option value="高级">高级</Select.Option>
              <Select.Option value="专家">专家</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="所属部门"
            name="department"
            rules={[{ required: true, message: '请选择所属部门' }]}
          >
            <Select placeholder="请选择所属部门">
              <Select.Option value="技术部">技术部</Select.Option>
              <Select.Option value="工程部">工程部</Select.Option>
              <Select.Option value="财务部">财务部</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="职位描述"
            name="description"
            rules={[{ required: true, message: '请输入职位描述' }]}
          >
            <Input.TextArea
              placeholder="请输入职位描述"
              rows={4}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
