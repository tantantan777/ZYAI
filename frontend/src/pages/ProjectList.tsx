import { useEffect, useState } from 'react';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import {
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Tag,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { openDeleteDialog } from '../utils/confirm';
import { feedback as message } from '../utils/feedback';
import './ProjectList.css';

type ProjectType = 'complex' | 'residential' | 'industrial' | 'public';

type ProjectItem = {
  id: string;
  name: string;
  projectType: ProjectType;
  manager: string;
  startDate: string;
  expectedCompletionDate: string;
  cost: number;
};

type ProjectFormValues = {
  name: string;
  projectType: ProjectType;
  manager: string;
  startDate: Dayjs;
  expectedCompletionDate: Dayjs;
  costWan: number;
};

type ContextMenuState = {
  x: number;
  y: number;
  record: ProjectItem;
} | null;

const projectTypeMap: Record<ProjectType, { text: string; color: string }> = {
  complex: { text: '综合体', color: 'blue' },
  residential: { text: '住宅', color: 'green' },
  industrial: { text: '工业建筑', color: 'orange' },
  public: { text: '公共建筑', color: 'purple' },
};

const initialProjects: ProjectItem[] = [
  {
    id: '1',
    name: '城市综合体 A 座',
    projectType: 'complex',
    manager: '张三',
    startDate: '2025-01-15',
    expectedCompletionDate: '2026-12-30',
    cost: 280000000,
  },
  {
    id: '2',
    name: '住宅小区 B 区',
    projectType: 'residential',
    manager: '李四',
    startDate: '2025-03-01',
    expectedCompletionDate: '2027-06-30',
    cost: 135000000,
  },
];

function formatCostWan(cost: number) {
  return `${(cost / 10000).toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
  })} 万元`;
}

export default function ProjectList() {
  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [detailProject, setDetailProject] = useState<ProjectItem | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm<ProjectFormValues>();

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [contextMenu]);

  const openEditModal = (record: ProjectItem) => {
    setEditingProject(record);
    editForm.setFieldsValue({
      name: record.name,
      projectType: record.projectType,
      manager: record.manager,
      startDate: dayjs(record.startDate),
      expectedCompletionDate: dayjs(record.expectedCompletionDate),
      costWan: Number((record.cost / 10000).toFixed(2)),
    });
  };

  const handleDelete = (record: ProjectItem) => {
    openDeleteDialog({
      entityLabel: '项目',
      entityName: record.name,
      onOk: () => {
        setProjects((prev) => prev.filter((item) => item.id !== record.id));
        message.success('项目已删除');
      },
    });
  };

  const handleContextMenuAction = (action: 'detail' | 'edit' | 'delete') => {
    if (!contextMenu) {
      return;
    }

    const { record } = contextMenu;
    setContextMenu(null);

    if (action === 'detail') {
      setDetailProject(record);
      return;
    }

    if (action === 'edit') {
      openEditModal(record);
      return;
    }

    handleDelete(record);
  };

  const handleSaveEdit = async () => {
    if (!editingProject) {
      return;
    }

    try {
      setEditSaving(true);
      const values = await editForm.validateFields();

      setProjects((prev) =>
        prev.map((item) =>
          item.id === editingProject.id
            ? {
                ...item,
                name: values.name.trim(),
                projectType: values.projectType,
                manager: values.manager.trim(),
                startDate: values.startDate.format('YYYY-MM-DD'),
                expectedCompletionDate: values.expectedCompletionDate.format('YYYY-MM-DD'),
                cost: Math.round(values.costWan * 10000),
              }
            : item,
        ),
      );

      setEditingProject(null);
      message.success('项目已更新');
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }

      message.error('项目更新失败，请稍后重试');
    } finally {
      setEditSaving(false);
    }
  };

  const columns: ProColumns<ProjectItem>[] = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      align: 'center',
    },
    {
      title: '项目类型',
      dataIndex: 'projectType',
      key: 'projectType',
      align: 'center',
      render: (_, record) => {
        const typeInfo = projectTypeMap[record.projectType];
        return <Tag color={typeInfo.color}>{typeInfo.text}</Tag>;
      },
    },
    {
      title: '项目经理',
      dataIndex: 'manager',
      key: 'manager',
      align: 'center',
    },
    {
      title: '开工日期',
      dataIndex: 'startDate',
      key: 'startDate',
      align: 'center',
    },
    {
      title: '预计竣工日期',
      dataIndex: 'expectedCompletionDate',
      key: 'expectedCompletionDate',
      align: 'center',
    },
    {
      title: '工程造价',
      dataIndex: 'cost',
      key: 'cost',
      align: 'center',
      render: (value) => formatCostWan(Number(value ?? 0)),
    },
  ];

  return (
    <div className="project-list-page-root">
      <div className="project-list-page-body">
        <ProTable<ProjectItem>
          columns={columns}
          dataSource={projects}
          rowKey="id"
          search={false}
          dateFormatter="string"
          headerTitle="项目列表"
          toolBarRender={() => []}
          onRow={(record) => ({
            onContextMenu: (event) => {
              event.preventDefault();
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                record,
              });
            },
          })}
          rowClassName={() => 'project-list-table-row'}
        />
      </div>

      {contextMenu ? (
        <div
          className="project-list-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" onClick={() => handleContextMenuAction('detail')}>
            查看详情
          </button>
          <button type="button" onClick={() => handleContextMenuAction('edit')}>
            编辑项目
          </button>
          <button type="button" className="danger" onClick={() => handleContextMenuAction('delete')}>
            删除项目
          </button>
        </div>
      ) : null}

      <Modal
        centered
        title="项目详情"
        open={Boolean(detailProject)}
        footer={
          <Button onClick={() => setDetailProject(null)}>
            关闭
          </Button>
        }
        onCancel={() => setDetailProject(null)}
      >
        {detailProject ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="项目名称">{detailProject.name}</Descriptions.Item>
            <Descriptions.Item label="项目类型">{projectTypeMap[detailProject.projectType].text}</Descriptions.Item>
            <Descriptions.Item label="项目经理">{detailProject.manager}</Descriptions.Item>
            <Descriptions.Item label="开工日期">{detailProject.startDate}</Descriptions.Item>
            <Descriptions.Item label="预计竣工日期">{detailProject.expectedCompletionDate}</Descriptions.Item>
            <Descriptions.Item label="工程造价">{formatCostWan(detailProject.cost)}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>

      <Modal
        centered
        title="编辑项目"
        open={Boolean(editingProject)}
        okText="保存"
        cancelText="取消"
        confirmLoading={editSaving}
        onOk={() => void handleSaveEdit()}
        onCancel={() => {
          setEditingProject(null);
          editForm.resetFields();
        }}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="请输入项目名称" />
          </Form.Item>
          <Form.Item name="projectType" label="项目类型" rules={[{ required: true, message: '请选择项目类型' }]}>
            <Select
              placeholder="请选择项目类型"
              options={Object.entries(projectTypeMap).map(([value, item]) => ({
                value,
                label: item.text,
              }))}
            />
          </Form.Item>
          <Form.Item name="manager" label="项目经理" rules={[{ required: true, message: '请输入项目经理' }]}>
            <Input placeholder="请输入项目经理" />
          </Form.Item>
          <Form.Item name="startDate" label="开工日期" rules={[{ required: true, message: '请选择开工日期' }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item
            name="expectedCompletionDate"
            label="预计竣工日期"
            rules={[{ required: true, message: '请选择预计竣工日期' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="costWan" label="工程造价（万元）" rules={[{ required: true, message: '请输入工程造价' }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="请输入工程造价（万元）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

