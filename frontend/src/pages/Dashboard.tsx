import { ProCard, StatisticCard } from '@ant-design/pro-components';
import { ProjectOutlined, CheckCircleOutlined, SyncOutlined, ClockCircleOutlined } from '@ant-design/icons';

export default function Dashboard() {
  return (
    <div style={{ padding: 24 }}>
      <ProCard
        title="项目概览"
        style={{ marginBottom: 24 }}
      >
        <StatisticCard.Group>
          <StatisticCard
            statistic={{
              title: '总项目数',
              value: 28,
              icon: <ProjectOutlined style={{ color: '#1890ff' }} />,
            }}
          />
          <StatisticCard
            statistic={{
              title: '进行中',
              value: 12,
              icon: <SyncOutlined style={{ color: '#52c41a' }} />,
            }}
          />
          <StatisticCard
            statistic={{
              title: '已完成',
              value: 15,
              icon: <CheckCircleOutlined style={{ color: '#faad14' }} />,
            }}
          />
          <StatisticCard
            statistic={{
              title: '待启动',
              value: 1,
              icon: <ClockCircleOutlined style={{ color: '#8c8c8c' }} />,
            }}
          />
        </StatisticCard.Group>
      </ProCard>
    </div>
  );
}
