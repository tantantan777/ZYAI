import { useEffect, useMemo, useState } from 'react';
import { ProCard, StatisticCard } from '@ant-design/pro-components';
import { DollarOutlined, FundProjectionScreenOutlined, ProjectOutlined, ShopOutlined } from '@ant-design/icons';
import { Card, Empty, List, Spin, Statistic, Tag } from 'antd';
import api from '../utils/api';
import { PROJECT_STATUS_OPTIONS, type ProjectStatus } from '../constants/projectStatus';
import { feedback as message } from '../utils/feedback';
import './Dashboard.css';

type DashboardSummary = {
  totalProjects: number;
  totalCost: number;
  unitCount: number;
  averageCost: number;
  statusCounts: Array<{
    status: ProjectStatus;
    count: number;
  }>;
};

const EMPTY_SUMMARY: DashboardSummary = {
  totalProjects: 0,
  totalCost: 0,
  unitCount: 0,
  averageCost: 0,
  statusCounts: PROJECT_STATUS_OPTIONS.map((status) => ({ status, count: 0 })),
};

function formatCostWan(value: number) {
  return `${(value / 10000).toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
  })} 万元`;
}

function getStatusTagColor(status: ProjectStatus) {
  const colorMap: Record<ProjectStatus, string> = {
    前期规划阶段: 'default',
    项目立项阶段: 'blue',
    可研阶段: 'cyan',
    项目批复阶段: 'geekblue',
    勘察设计阶段: 'purple',
    施工图审查阶段: 'magenta',
    招投标阶段: 'volcano',
    报检阶段: 'orange',
    开工准备阶段: 'gold',
    在建阶段: 'processing',
    停工阶段: 'error',
    复工阶段: 'lime',
    竣工阶段: 'success',
    专项验收阶段: 'green',
    竣工备案阶段: 'blue',
    完工交付阶段: 'success',
    '项目取消/终止阶段': 'red',
    项目转让移交阶段: 'purple',
    竣工结算审计阶段: 'gold',
  };

  return colorMap[status] ?? 'default';
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);

  const visibleStatusCounts = useMemo(
    () => summary.statusCounts.filter((item) => Number(item.count) > 0),
    [summary.statusCounts],
  );

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const response = await api.get('/projects/dashboard-summary');
        setSummary({
          ...EMPTY_SUMMARY,
          ...response.data.summary,
          statusCounts:
            response.data.summary?.statusCounts && Array.isArray(response.data.summary.statusCounts)
              ? response.data.summary.statusCounts
              : EMPTY_SUMMARY.statusCounts,
        });
      } catch (error) {
        console.error('加载工作台统计失败', error);
        message.error('工作台统计加载失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    void loadSummary();
  }, []);

  return (
    <div className="dashboard-page-root">
      <div className="dashboard-page-body">
        <Spin spinning={loading}>
          <ProCard title="项目概览" className="dashboard-section-card">
            <StatisticCard.Group direction="row">
              <StatisticCard
                statistic={{
                  title: '总项目数',
                  value: summary.totalProjects,
                  icon: <ProjectOutlined style={{ color: '#1677ff' }} />,
                }}
              />
              <StatisticCard
                statistic={{
                  title: '覆盖单位数',
                  value: summary.unitCount,
                  icon: <ShopOutlined style={{ color: '#13c2c2' }} />,
                }}
              />
              <StatisticCard
                statistic={{
                  title: '总工程造价',
                  value: formatCostWan(summary.totalCost),
                  icon: <DollarOutlined style={{ color: '#fa8c16' }} />,
                }}
              />
              <StatisticCard
                statistic={{
                  title: '平均单项目造价',
                  value: formatCostWan(summary.averageCost),
                  icon: <FundProjectionScreenOutlined style={{ color: '#722ed1' }} />,
                }}
              />
            </StatisticCard.Group>
          </ProCard>

          <ProCard title="项目状态分布" className="dashboard-section-card">
            {visibleStatusCounts.length > 0 ? (
              <List
                grid={{ gutter: 12, xs: 1, sm: 2, md: 3, xl: 4, xxl: 5 }}
                dataSource={visibleStatusCounts}
                renderItem={(item) => (
                  <List.Item>
                    <Card size="small" className="dashboard-status-card">
                      <div className="dashboard-status-card__tag">
                        <Tag color={getStatusTagColor(item.status)}>{item.status}</Tag>
                      </div>
                      <Statistic value={item.count} suffix="个" valueStyle={{ fontSize: 24, fontWeight: 600 }} />
                    </Card>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无项目状态数据" />
            )}
            <div className="dashboard-section-hint">项目可同时处于多个状态，因此状态总数可能大于项目总数。</div>
          </ProCard>
        </Spin>
      </div>
    </div>
  );
}
