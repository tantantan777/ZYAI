import { Card, Table, Button, Space, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface Organization {
  id: number;
  type: string;
  name: string;
  address: string;
  contact: string;
  phone: string;
  createdAt: string;
}

export default function OrganizationManagement() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [form] = Form.useForm();

  // 模拟数据
  const [dataSource] = useState<Organization[]>([
    {
      id: 1,
      type: '总公司',
      name: '建筑集团总公司',
      address: '北京市朝阳区建国路88号',
      contact: '张三',
      phone: '010-12345678',
      createdAt: '2024-01-01',
    },
  ]);

  const columns = [
    {
      title: '单位类型',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: '单位名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '单位地址',
      dataIndex: 'address',
      key: 'address',
    },
    {
      title: '单位负责人',
      dataIndex: 'contact',
      key: 'contact',
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
      render: (_: any, record: Organization) => (
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
    setEditingOrg(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (record: Organization) => {
    setEditingOrg(record);
    form.setFieldsValue(record);
    setIsModalOpen(true);
  };

  const handleDelete = (record: Organization) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除单位"${record.name}"吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        message.success('删除成功');
      },
    });
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      console.log('提交数据:', values);
      message.success(editingOrg ? '修改成功' : '添加成功');
      setIsModalOpen(false);
    } catch (error) {
      console.error('表单验证失败:', error);
    }
  };

  return (
    <Card
      title="单位管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增单位
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
        title={editingOrg ? '编辑单位' : '新增单位'}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="单位类型"
            name="type"
            rules={[{ required: true, message: '请选择单位类型' }]}
          >
            <Select placeholder="请选择单位类型">
              <Select.Option value="总公司">总公司</Select.Option>
              <Select.Option value="分公司">分公司</Select.Option>
              <Select.Option value="项目部">项目部</Select.Option>
              <Select.Option value="子公司">子公司</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="单位名称"
            name="name"
            rules={[{ required: true, message: '请输入单位名称' }]}
          >
            <Input placeholder="请输入单位名称" />
          </Form.Item>
          <Form.Item
            label="单位地址"
            name="address"
            rules={[{ required: true, message: '请输入单位地址' }]}
          >
            <Input placeholder="请输入单位地址" />
          </Form.Item>
          <Form.Item
            label="单位负责人"
            name="contact"
            rules={[{ required: true, message: '请输入单位负责人' }]}
          >
            <Input placeholder="请输入单位负责人" />
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
