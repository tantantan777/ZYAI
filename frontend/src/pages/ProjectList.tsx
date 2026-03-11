import { ProTable } from '@ant-design/pro-components';
import { Tag } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import './ProjectList.css';

type ProjectItem = {
  id: string;
  name: string;
  status: string;
  progress: number;
  startDate: string;
  endDate: string;
  manager: string;
};

const statusMap = {
  planning: { text: '规划中', color: 'default' },
  design: { text: '设计阶段', color: 'blue' },
  construction: { text: '施工中', color: 'processing' },
  completed: { text: '已完成', color: 'success' },
};

export default function ProjectList() {
  const columns: ProColumns<ProjectItem>[] = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '项目状态',
      dataIndex: 'status',
      key: 'status',
      render: (_, record) => {
        const status = statusMap[record.status as keyof typeof statusMap];
        return <Tag color={status.color}>{status.text}</Tag>;
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (text) => `${text}%`,
    },
    {
      title: '开始日期',
      dataIndex: 'startDate',
      key: 'startDate',
    },
    {
      title: '预计完成',
      dataIndex: 'endDate',
      key: 'endDate',
    },
    {
      title: '项目经理',
      dataIndex: 'manager',
      key: 'manager',
    },
  ];

  const mockData: ProjectItem[] = [
    {
      id: '1',
      name: '城市综合体A座',
      status: 'construction',
      progress: 65,
      startDate: '2025-01-15',
      endDate: '2026-12-30',
      manager: '张三',
    },
    {
      id: '2',
      name: '住宅小区B区',
      status: 'design',
      progress: 30,
      startDate: '2025-03-01',
      endDate: '2027-06-30',
      manager: '李四',
    },
  ];

  return (
    <div className="project-list-page-root">
      <div className="project-list-page-body">
        <ProTable<ProjectItem>
          columns={columns}
          dataSource={mockData}
          rowKey="id"
          search={false}
          dateFormatter="string"
          headerTitle="项目列表"
          toolBarRender={() => []}
        />
      </div>
    </div>
  );
}
