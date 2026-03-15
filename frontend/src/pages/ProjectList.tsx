import { useEffect, useMemo, useState } from 'react';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Table,
  Tag,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import api from '../utils/api';
import { PROJECT_STATUS_OPTIONS, type ProjectStatus } from '../constants/projectStatus';
import { logClientAuditAsync } from '../utils/audit';
import { openDeleteDialog } from '../utils/confirm';
import {
  ensureRealtimeConnection,
  type OrgStructureUpdatedEvent,
  type UserProfileUpdatedEvent,
} from '../services/realtime';
import ResettableTabs from '../components/ResettableTabs';
import { feedback as message } from '../utils/feedback';
import './ProjectList.css';

type PlatformOption = {
  id: number;
  name: string;
};

type ProjectUnitInfo = {
  unitId: number | null;
  unitName: string;
  unitNatureId: number | null;
  unitNatureName: string;
  website?: string;
  introduction?: string;
  members: Array<{
    departmentName?: string | null;
    positionName?: string | null;
    personName: string;
  }>;
};

type ProjectItem = {
  id: number;
  name: string;
  manager?: string | null;
  projectStatuses: ProjectStatus[];
  coverImage?: string;
  constructionAddress?: string | null;
  projectCode?: string | null;
  projectTypeId: number | null;
  projectTypeName?: string;
  constructionNatureId: number | null;
  constructionNatureName?: string;
  constructionScale?: string | null;
  cost?: number | null;
  plannedStartDate?: string | null;
  plannedCompletionDate?: string | null;
  actualStartDate?: string | null;
  actualCompletionDate?: string | null;
  units: ProjectUnitInfo[];
};

type ProjectFormValues = {
  name: string;
  manager?: string;
  projectStatuses?: ProjectStatus[];
  constructionAddress?: string;
  projectCode?: string;
  projectTypeId?: number;
  constructionNatureId?: number;
  constructionScale?: string;
  costWan?: number;
  plannedStartDate?: Dayjs;
  plannedCompletionDate?: Dayjs;
  actualStartDate?: Dayjs;
  actualCompletionDate?: Dayjs;
};

type ProjectPayload = {
  name: string;
  manager: string | null;
  projectStatuses: ProjectStatus[];
  coverImage: string | null;
  constructionAddress: string | null;
  projectCode: string | null;
  projectTypeId: number | null;
  constructionNatureId: number | null;
  constructionScale: string | null;
  cost: number | null;
  plannedStartDate: string | null;
  plannedCompletionDate: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
};

type ContextMenuState = {
  x: number;
  y: number;
  record: ProjectItem;
} | null;

type ProjectAccessState = {
  projectsVisible?: boolean;
  projectCreateAllowed?: boolean;
  projectEditAllowed?: boolean;
  projectDeleteAllowed?: boolean;
};

const DATE_FORMAT = 'YYYY-MM-DD';
const EMPTY_TEXT = '-';
const UNASSIGNED_UNIT_NATURE_NAME = '未配置';

function readStoredProjectAccess(): ProjectAccessState | null {
  const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ProjectAccessState;
    return {
      projectsVisible: parsed.projectsVisible,
      projectCreateAllowed: parsed.projectCreateAllowed,
      projectEditAllowed: parsed.projectEditAllowed,
      projectDeleteAllowed: parsed.projectDeleteAllowed,
    };
  } catch {
    return null;
  }
}

function writeStoredProjectAccess(nextAccess: ProjectAccessState) {
  const update = (storage: Storage) => {
    const raw = storage.getItem('user');
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      storage.setItem('user', JSON.stringify({ ...parsed, ...nextAccess }));
    } catch {
      storage.removeItem('user');
    }
  };

  update(localStorage);
  update(sessionStorage);
}

function formatCostWan(cost?: number | null) {
  if (typeof cost !== 'number' || Number.isNaN(cost)) {
    return EMPTY_TEXT;
  }

  return `${(cost / 10000).toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
  })} 万元`;
}

function normalizeText(value?: string | null) {
  const next = typeof value === 'string' ? value.trim() : '';
  return next || EMPTY_TEXT;
}

function formatDate(value?: string | null) {
  if (!value) {
    return EMPTY_TEXT;
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format(DATE_FORMAT) : EMPTY_TEXT;
}

function calculateDurationDays(start?: string | Dayjs | null, end?: string | Dayjs | null) {
  if (!start || !end) {
    return null;
  }

  const startDate = dayjs.isDayjs(start) ? start.startOf('day') : dayjs(start).startOf('day');
  const endDate = dayjs.isDayjs(end) ? end.startOf('day') : dayjs(end).startOf('day');

  if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) {
    return null;
  }

  return endDate.diff(startDate, 'day') + 1;
}

function buildCoverFileList(coverImage?: string): UploadFile[] {
  if (!coverImage) {
    return [];
  }

  return [
    {
      uid: 'cover-image',
      name: '项目照片',
      status: 'done',
      url: coverImage,
    },
  ];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

function resolveOptionId(options: PlatformOption[], optionId: number | null, optionName?: string) {
  if (optionId && options.some((item) => item.id === optionId)) {
    return optionId;
  }

  if (optionName) {
    return options.find((item) => item.name === optionName)?.id;
  }

  return undefined;
}

function validateEndDate(
  start: Dayjs | undefined,
  end: Dayjs | undefined,
  endLabel: string,
  startLabel: string,
  required: boolean,
) {
  if (!end) {
    return required ? Promise.reject(new Error(`请选择${endLabel}`)) : Promise.resolve();
  }

  if (!start) {
    return Promise.resolve();
  }

  if (end.endOf('day').isBefore(start.startOf('day'))) {
    return Promise.reject(new Error(`${endLabel}不能早于${startLabel}`));
  }

  return Promise.resolve();
}

function buildProjectPayload(values: ProjectFormValues, coverImage: string | undefined): ProjectPayload {
  return {
    name: values.name.trim(),
    manager: values.manager?.trim() || null,
    projectStatuses: values.projectStatuses ?? [],
    coverImage: coverImage || null,
    constructionAddress: values.constructionAddress?.trim() || null,
    projectCode: values.projectCode?.trim() || null,
    projectTypeId: values.projectTypeId ?? null,
    constructionNatureId: values.constructionNatureId ?? null,
    constructionScale: values.constructionScale?.trim() || null,
    cost: typeof values.costWan === 'number' ? (Math.round(values.costWan * 100) / 100) * 10000 : null,
    plannedStartDate: values.plannedStartDate?.format(DATE_FORMAT) ?? null,
    plannedCompletionDate: values.plannedCompletionDate?.format(DATE_FORMAT) ?? null,
    actualStartDate: values.actualStartDate?.format(DATE_FORMAT) ?? null,
    actualCompletionDate: values.actualCompletionDate?.format(DATE_FORMAT) ?? null,
  };
}

function buildProjectFormValues(
  record: ProjectItem,
  projectTypes: PlatformOption[],
  constructionNatures: PlatformOption[],
): ProjectFormValues {
  return {
    name: record.name,
    manager: record.manager ?? undefined,
    projectStatuses: record.projectStatuses ?? [],
    constructionAddress: record.constructionAddress ?? undefined,
    projectCode: record.projectCode ?? undefined,
    projectTypeId: resolveOptionId(projectTypes, record.projectTypeId, record.projectTypeName),
    constructionNatureId: resolveOptionId(
      constructionNatures,
      record.constructionNatureId,
      record.constructionNatureName,
    ),
    constructionScale: record.constructionScale ?? undefined,
    costWan: typeof record.cost === 'number' ? Number((record.cost / 10000).toFixed(2)) : undefined,
    plannedStartDate: record.plannedStartDate ? dayjs(record.plannedStartDate) : undefined,
    plannedCompletionDate: record.plannedCompletionDate ? dayjs(record.plannedCompletionDate) : undefined,
    actualStartDate: record.actualStartDate ? dayjs(record.actualStartDate) : undefined,
    actualCompletionDate: record.actualCompletionDate ? dayjs(record.actualCompletionDate) : undefined,
  };
}

function buildEmptyProjectFormValues(): ProjectFormValues {
  return {
    name: '',
    manager: '',
    projectStatuses: [],
    constructionAddress: '',
    projectCode: '',
    projectTypeId: undefined,
    constructionNatureId: undefined,
    constructionScale: '',
    costWan: undefined,
    plannedStartDate: undefined,
    plannedCompletionDate: undefined,
    actualStartDate: undefined,
    actualCompletionDate: undefined,
  };
}

function getStatusTagColor(status: ProjectStatus) {
  const colorMap: Record<ProjectStatus, string> = {
    '前期规划阶段': 'default',
    '项目立项阶段': 'blue',
    '可研阶段': 'cyan',
    '项目批复阶段': 'geekblue',
    '勘察设计阶段': 'purple',
    '施工图审查阶段': 'magenta',
    '招投标阶段': 'volcano',
    '报检阶段': 'orange',
    '开工准备阶段': 'gold',
    '在建阶段': 'processing',
    '停工阶段': 'error',
    '复工阶段': 'lime',
    '竣工阶段': 'success',
    '专项验收阶段': 'green',
    '竣工备案阶段': 'blue',
    '完工交付阶段': 'success',
    '项目取消/终止阶段': 'red',
    '项目转让移交阶段': 'purple',
    '竣工结算审计阶段': 'gold',
  };

  return colorMap[status] ?? 'default';
}

export default function ProjectList() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectAccess, setProjectAccess] = useState<ProjectAccessState>(() => readStoredProjectAccess() ?? {});
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [detailProject, setDetailProject] = useState<ProjectItem | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [editMode, setEditMode] = useState<'create' | 'edit' | null>(null);
  const [detailTabKey, setDetailTabKey] = useState('basic');
  const [editTabKey, setEditTabKey] = useState('photo');
  const [editSaving, setEditSaving] = useState(false);
  const [coverFileList, setCoverFileList] = useState<UploadFile[]>([]);
  const [unitNatures, setUnitNatures] = useState<PlatformOption[]>([]);
  const [projectTypes, setProjectTypes] = useState<PlatformOption[]>([]);
  const [constructionNatures, setConstructionNatures] = useState<PlatformOption[]>([]);
  const [editForm] = Form.useForm<ProjectFormValues>();

  const plannedStartDate = Form.useWatch('plannedStartDate', editForm);
  const plannedCompletionDate = Form.useWatch('plannedCompletionDate', editForm);
  const actualStartDate = Form.useWatch('actualStartDate', editForm);
  const actualCompletionDate = Form.useWatch('actualCompletionDate', editForm);

  const plannedDurationDays = useMemo(
    () => calculateDurationDays(plannedStartDate, plannedCompletionDate),
    [plannedStartDate, plannedCompletionDate],
  );
  const actualDurationDays = useMemo(
    () => calculateDurationDays(actualStartDate, actualCompletionDate),
    [actualStartDate, actualCompletionDate],
  );
  const canCreateProject = projectAccess.projectsVisible !== false && projectAccess.projectCreateAllowed !== false;
  const canEditProject = projectAccess.projectsVisible !== false && projectAccess.projectEditAllowed !== false;
  const canDeleteProject = projectAccess.projectsVisible !== false && projectAccess.projectDeleteAllowed !== false;

  const loadProjectAccess = async (silent = false) => {
    const storedAccess = readStoredProjectAccess();
    if (storedAccess) {
      setProjectAccess(storedAccess);
    }

    try {
      const response = await api.get('/user/profile');
      const nextAccess: ProjectAccessState = {
        projectsVisible: response.data.user?.projectsVisible,
        projectCreateAllowed: response.data.user?.projectCreateAllowed,
        projectEditAllowed: response.data.user?.projectEditAllowed,
        projectDeleteAllowed: response.data.user?.projectDeleteAllowed,
      };
      setProjectAccess(nextAccess);
      writeStoredProjectAccess(nextAccess);
    } catch (error) {
      console.error('加载项目权限失败:', error);
      if (!silent) {
        message.error('项目权限加载失败，请稍后重试');
      }
    }
  };

  const loadProjects = async (silent = false) => {
    setLoading(true);
    try {
      const response = await api.get('/projects');
      setProjects((response.data.projects ?? []) as ProjectItem[]);
    } catch (error) {
      console.error('加载项目列表失败:', error);
      if (!silent) {
        message.error('项目列表加载失败，请稍后重试');
      }
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const loadOrgStructure = async (silent = false) => {
    try {
      const response = await api.get('/org/structure');
      setUnitNatures((response.data.unitNatures ?? []) as PlatformOption[]);
      setProjectTypes((response.data.projectTypes ?? []) as PlatformOption[]);
      setConstructionNatures((response.data.constructionNatures ?? []) as PlatformOption[]);
    } catch (error) {
      console.error('加载项目配置失败:', error);
      if (!silent) {
        message.error('项目配置加载失败，请稍后重试');
      }
    }
  };

  useEffect(() => {
    void Promise.all([loadProjectAccess(), loadOrgStructure(), loadProjects()]);
  }, []);

  useEffect(() => {
    const socket = ensureRealtimeConnection();
    if (!socket) {
      return;
    }

    const handleOrgStructureUpdated = (payload: OrgStructureUpdatedEvent) => {
      if (
        payload.entityType === 'unitNature' ||
        payload.entityType === 'unit' ||
        payload.entityType === 'projectType' ||
        payload.entityType === 'constructionNature'
      ) {
        void loadOrgStructure(true);
      }
    };

    socket.on('org:structure-updated', handleOrgStructureUpdated);
    const handleProfileUpdated = (_payload: UserProfileUpdatedEvent) => {
      void loadProjectAccess(true);
    };

    socket.on('user:profile-updated', handleProfileUpdated);
    return () => {
      socket.off('org:structure-updated', handleOrgStructureUpdated);
      socket.off('user:profile-updated', handleProfileUpdated);
    };
  }, []);

  useEffect(() => {
    const handleLocalProfileUpdated = () => {
      void loadProjectAccess(true);
    };

    window.addEventListener('user-profile-updated', handleLocalProfileUpdated);
    return () => {
      window.removeEventListener('user-profile-updated', handleLocalProfileUpdated);
    };
  }, []);

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

  useEffect(() => {
    if (detailProject) {
      setDetailTabKey('basic');
    }
  }, [detailProject]);

  useEffect(() => {
    if (editMode) {
      setEditTabKey('photo');
    }
  }, [editMode]);

  useEffect(() => {
    if (!editMode) {
      return;
    }

    if (editMode === 'create') {
      editForm.setFieldsValue(buildEmptyProjectFormValues());
      return;
    }

    if (!editingProject) {
      return;
    }

    editForm.setFieldsValue(
      buildProjectFormValues(editingProject, projectTypes, constructionNatures),
    );
  }, [editMode, editingProject, projectTypes, constructionNatures, editForm]);

  const getUnitNatureName = (unitNatureId: number | null, fallbackName?: string) => {
    if (unitNatureId == null) {
      return fallbackName || UNASSIGNED_UNIT_NATURE_NAME;
    }

    return unitNatures.find((item) => item.id === unitNatureId)?.name ?? fallbackName ?? UNASSIGNED_UNIT_NATURE_NAME;
  };

  const getProjectTypeName = (record: ProjectItem) =>
    projectTypes.find((item) => item.id === record.projectTypeId)?.name ?? record.projectTypeName ?? EMPTY_TEXT;

  const getConstructionNatureName = (record: ProjectItem) =>
    constructionNatures.find((item) => item.id === record.constructionNatureId)?.name ??
    record.constructionNatureName ??
    EMPTY_TEXT;

  const openCreateModal = () => {
    if (!canCreateProject) {
      message.warning('你没有新增项目的权限，请联系管理员。');
      return;
    }

    setEditMode('create');
    setEditingProject(null);
    setCoverFileList([]);
    editForm.resetFields();
  };

  const openEditModal = (record: ProjectItem) => {
    if (!canEditProject) {
      message.warning('你没有编辑项目的权限，请联系管理员。');
      return;
    }

    setEditMode('edit');
    setEditingProject(record);
    setCoverFileList(buildCoverFileList(record.coverImage));
  };

  const handleDelete = (record: ProjectItem) => {
    if (!canDeleteProject) {
      message.warning('你没有删除项目的权限，请联系管理员。');
      return;
    }

    openDeleteDialog({
      entityLabel: '项目',
      entityName: record.name,
      content: '删除后将同时删除项目照片、基本信息和单位信息，且不可恢复。是否继续？',
      onOk: async () => {
        await api.delete(`/projects/${record.id}`);
        setProjects((prev) => prev.filter((item) => item.id !== record.id));
        setDetailProject((prev) => (prev?.id === record.id ? null : prev));
        if (editingProject?.id === record.id) {
          setEditMode(null);
          setEditingProject(null);
          setCoverFileList([]);
          editForm.resetFields();
        }
        message.success('项目已删除');
        logClientAuditAsync({
          actionType: 'delete',
          targetType: '项目',
          targetName: record.name,
        });
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

  const handleCloseEditModal = () => {
    setEditMode(null);
    setEditingProject(null);
    setCoverFileList([]);
    editForm.resetFields();
  };

  const handleSaveEdit = async () => {
    if (!editMode) {
      return;
    }
    if (editMode === 'edit' && !editingProject) {
      return;
    }
    if (editMode === 'create' && !canCreateProject) {
      message.warning('你没有新增项目的权限，请联系管理员。');
      return;
    }
    if (editMode === 'edit' && !canEditProject) {
      message.warning('你没有编辑项目的权限，请联系管理员。');
      return;
    }

    const currentEditingProject = editingProject;

    try {
      setEditSaving(true);
      const values = await editForm.validateFields();

      const nextCoverImage = coverFileList[0]?.originFileObj
        ? await readFileAsDataUrl(coverFileList[0].originFileObj as File)
        : coverFileList[0]?.url;

      const payload = buildProjectPayload(values, nextCoverImage);
      let response;
      if (editMode === 'create') {
        response = await api.post('/projects', payload);
      } else {
        response = await api.put(`/projects/${currentEditingProject!.id}`, payload);
      }
      const nextProject = response.data.project as ProjectItem;

      if (editMode === 'create') {
        setProjects((prev) => [nextProject, ...prev]);
      } else {
        setProjects((prev) => prev.map((item) => (item.id === nextProject.id ? nextProject : item)));
        setDetailProject((prev) => (prev?.id === nextProject.id ? nextProject : prev));
      }

      handleCloseEditModal();
      message.success(editMode === 'create' ? '项目已创建' : '项目已更新');
      logClientAuditAsync({
        actionType: editMode === 'create' ? 'add' : 'edit',
        targetType: '项目',
        targetName: nextProject.name,
      });
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }

      console.error('项目更新失败:', error);
      message.error(error.response?.data?.message || (editMode === 'create' ? '项目创建失败，请稍后重试' : '项目更新失败，请稍后重试'));
    } finally {
      setEditSaving(false);
    }
  };

  const detailUnitTabs = useMemo(() => {
    if (!detailProject) {
      return [];
    }

    const groups = new Map<string, ProjectUnitInfo[]>();
    for (const item of detailProject.units) {
      const unitNatureName =
        getUnitNatureName(item.unitNatureId, item.unitNatureName) || UNASSIGNED_UNIT_NATURE_NAME;
      const currentGroup = groups.get(unitNatureName) ?? [];
      currentGroup.push(item);
      groups.set(unitNatureName, currentGroup);
    }

    return Array.from(groups.entries()).map(([unitNatureName, items]) => ({
      key: `unit-${unitNatureName}`,
      label: unitNatureName,
      children: (
        <div className="project-list-unit-tab">
          {items.map((item, index) => (
            <Card
              key={`${unitNatureName}-${item.unitId ?? item.unitName}-${index}`}
              size="small"
              title={item.unitName || EMPTY_TEXT}
              className="project-list-unit-card"
            >
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="挂载单位">{item.unitName || EMPTY_TEXT}</Descriptions.Item>
              </Descriptions>
              <Table
                size="small"
                pagination={false}
                className="project-list-unit-members-table"
                rowKey={(member, memberIndex) =>
                  `${item.unitId ?? item.unitName}-${member.departmentName ?? 'none'}-${member.positionName ?? 'none'}-${member.personName}-${memberIndex ?? 0}`
                }
                locale={{ emptyText: '当前单位暂无部门、职位或人员信息' }}
                dataSource={item.members ?? []}
                columns={[
                  {
                    title: '部门',
                    dataIndex: 'departmentName',
                    key: 'departmentName',
                    align: 'center',
                    render: (value: string | null | undefined) => normalizeText(value),
                  },
                  {
                    title: '职位',
                    dataIndex: 'positionName',
                    key: 'positionName',
                    align: 'center',
                    render: (value: string | null | undefined) => normalizeText(value),
                  },
                  {
                    title: '姓名',
                    dataIndex: 'personName',
                    key: 'personName',
                    align: 'center',
                    render: (value: string) => normalizeText(value),
                  },
                ]}
              />
            </Card>
          ))}
        </div>
      ),
    }));
  }, [detailProject, unitNatures]);

  const columns: ProColumns<ProjectItem>[] = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      align: 'center',
      width: 220,
      ellipsis: true,
    },
    {
      title: '项目类型',
      dataIndex: 'projectTypeId',
      key: 'projectTypeId',
      align: 'center',
      width: 160,
      render: (_, record) => {
        const label = getProjectTypeName(record);
        return label === EMPTY_TEXT ? EMPTY_TEXT : <Tag color="blue">{label}</Tag>;
      },
    },
    {
      title: '建设性质',
      dataIndex: 'constructionNatureId',
      key: 'constructionNatureId',
      align: 'center',
      width: 160,
      render: (_, record) => {
        const label = getConstructionNatureName(record);
        return label === EMPTY_TEXT ? EMPTY_TEXT : <Tag color="geekblue">{label}</Tag>;
      },
    },
    {
      title: '项目状态',
      dataIndex: 'projectStatuses',
      key: 'projectStatuses',
      align: 'center',
      width: 280,
      render: (_, record) => {
        if (!record.projectStatuses || record.projectStatuses.length === 0) {
          return EMPTY_TEXT;
        }

        return (
          <div className="project-list-status-tags project-list-status-tags--center">
            {record.projectStatuses.map((status) => (
              <Tag key={status} color={getStatusTagColor(status)}>
                {status}
              </Tag>
            ))}
          </div>
        );
      },
    },
    {
      title: '工程造价（万元）',
      dataIndex: 'cost',
      key: 'cost',
      align: 'center',
      width: 180,
      render: (value) => formatCostWan(value == null ? null : Number(value)),
    },
    {
      title: '项目经理',
      dataIndex: 'manager',
      key: 'manager',
      align: 'center',
      width: 140,
      ellipsis: true,
      render: (_, record) => normalizeText(record.manager),
    },
  ];

  return (
    <div className="project-list-page-root">
      <div className="project-list-page-body">
        <ProTable<ProjectItem>
          columns={columns}
          dataSource={projects}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1140 }}
          search={false}
          dateFormatter="string"
          headerTitle="项目列表"
          toolBarRender={() =>
            canCreateProject
              ? [
                  <Button key="create" type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                    新增项目
                  </Button>,
                ]
              : []
          }
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
          {canEditProject ? (
            <button type="button" onClick={() => handleContextMenuAction('edit')}>
              编辑项目
            </button>
          ) : null}
          {canDeleteProject ? (
            <button type="button" className="danger" onClick={() => handleContextMenuAction('delete')}>
              删除项目
            </button>
          ) : null}
        </div>
      ) : null}

      <Modal
        centered
        width={1000}
        title="项目详情"
        open={Boolean(detailProject)}
        footer={<Button onClick={() => setDetailProject(null)}>关闭</Button>}
        onCancel={() => setDetailProject(null)}
      >
        {detailProject ? (
          <ResettableTabs
            initialActiveKey="basic"
            resetToken={detailProject.id}
            activeKey={detailTabKey}
            onChange={setDetailTabKey}
            items={[
              {
                key: 'basic',
                label: '基本信息',
                children: (
                  <div className="project-list-detail-basic">
                    <div className="project-list-detail-cover">
                      {detailProject.coverImage ? (
                        <Image
                          src={detailProject.coverImage}
                          alt={detailProject.name}
                          className="project-list-detail-cover__image"
                        />
                      ) : (
                        <Empty description="暂无项目照片" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                      )}
                    </div>
                    <Descriptions column={2} size="small" bordered className="project-list-detail-descriptions">
                      <Descriptions.Item label="项目名称">{detailProject.name}</Descriptions.Item>
                      <Descriptions.Item label="项目经理">{normalizeText(detailProject.manager)}</Descriptions.Item>
                      <Descriptions.Item label="项目状态" span={2}>
                        {detailProject.projectStatuses.length > 0 ? (
                          <div className="project-list-status-tags">
                            {detailProject.projectStatuses.map((status) => (
                              <Tag key={status} color={getStatusTagColor(status)}>
                                {status}
                              </Tag>
                            ))}
                          </div>
                        ) : (
                          EMPTY_TEXT
                        )}
                      </Descriptions.Item>
                      <Descriptions.Item label="建设地址">{normalizeText(detailProject.constructionAddress)}</Descriptions.Item>
                      <Descriptions.Item label="项目编号">{normalizeText(detailProject.projectCode)}</Descriptions.Item>
                      <Descriptions.Item label="项目类型">{getProjectTypeName(detailProject)}</Descriptions.Item>
                      <Descriptions.Item label="建设性质">{getConstructionNatureName(detailProject)}</Descriptions.Item>
                      <Descriptions.Item label="建设规模">{normalizeText(detailProject.constructionScale)}</Descriptions.Item>
                      <Descriptions.Item label="工程造价">{formatCostWan(detailProject.cost)}</Descriptions.Item>
                      <Descriptions.Item label="计划开工日期">{formatDate(detailProject.plannedStartDate)}</Descriptions.Item>
                      <Descriptions.Item label="计划竣工日期">{formatDate(detailProject.plannedCompletionDate)}</Descriptions.Item>
                      <Descriptions.Item label="实际开工日期">{formatDate(detailProject.actualStartDate)}</Descriptions.Item>
                      <Descriptions.Item label="实际竣工日期">{formatDate(detailProject.actualCompletionDate)}</Descriptions.Item>
                      <Descriptions.Item label="计划建设工期">
                        {calculateDurationDays(detailProject.plannedStartDate, detailProject.plannedCompletionDate) ?? EMPTY_TEXT}
                      </Descriptions.Item>
                      <Descriptions.Item label="实际建设工期">
                        {calculateDurationDays(detailProject.actualStartDate, detailProject.actualCompletionDate) ?? EMPTY_TEXT}
                      </Descriptions.Item>
                    </Descriptions>
                  </div>
                ),
              },
              ...detailUnitTabs,
            ]}
          />
        ) : null}
      </Modal>

      <Modal
        centered
        width={1100}
        title={editMode === 'create' ? '新增项目' : '编辑项目'}
        open={Boolean(editMode)}
        forceRender
        okText="保存"
        cancelText="取消"
        confirmLoading={editSaving}
        onOk={() => void handleSaveEdit()}
        onCancel={handleCloseEditModal}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <ResettableTabs
            initialActiveKey="photo"
            resetToken={editMode === 'create' ? 'create' : editingProject?.id ?? 'edit'}
            activeKey={editTabKey}
            onChange={setEditTabKey}
            items={[
              {
                key: 'photo',
                label: '照片',
                children: (
                  <div className="project-list-edit-photo">
                    <Upload
                      accept="image/*"
                      listType="picture-card"
                      maxCount={1}
                      beforeUpload={() => false}
                      fileList={coverFileList}
                      onChange={({ fileList }) => setCoverFileList(fileList.slice(-1))}
                    >
                      {coverFileList.length >= 1 ? null : (
                        <div>
                          <PlusOutlined />
                          <div style={{ marginTop: 8 }}>上传照片</div>
                        </div>
                      )}
                    </Upload>
                    <div className="project-list-edit-photo__tip">最多上传 1 张项目照片。</div>
                  </div>
                ),
              },
              {
                key: 'basic',
                label: '基本信息',
                children: (
                  <div className="project-list-edit-section">
                    <div className="project-list-edit-grid">
                      <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
                        <Input placeholder="请输入项目名称" />
                      </Form.Item>
                      <Form.Item name="manager" label="项目经理">
                        <Input placeholder="请输入项目经理" />
                      </Form.Item>
                      <Form.Item name="projectStatuses" label="项目状态">
                        <Select
                          mode="multiple"
                          placeholder="请选择项目状态"
                          options={PROJECT_STATUS_OPTIONS.map((item) => ({ label: item, value: item }))}
                          optionFilterProp="label"
                        />
                      </Form.Item>
                      <Form.Item name="constructionAddress" label="建设地址" className="project-list-edit-grid__full">
                        <Input placeholder="请输入建设地址" />
                      </Form.Item>
                      <Form.Item name="projectCode" label="项目编号">
                        <Input placeholder="请输入项目编号" />
                      </Form.Item>
                      <Form.Item name="projectTypeId" label="项目类型">
                        <Select placeholder="请选择项目类型" options={projectTypes.map((item) => ({ label: item.name, value: item.id }))} />
                      </Form.Item>
                      <Form.Item name="constructionNatureId" label="建设性质">
                        <Select placeholder="请选择建设性质" options={constructionNatures.map((item) => ({ label: item.name, value: item.id }))} />
                      </Form.Item>
                      <Form.Item name="costWan" label="工程造价（万元）">
                        <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="请输入工程造价（万元）" />
                      </Form.Item>
                      <Form.Item name="constructionScale" label="建设规模" className="project-list-edit-grid__full">
                        <Input.TextArea rows={3} placeholder="请输入建设规模" />
                      </Form.Item>
                      <Form.Item name="plannedStartDate" label="计划开工日期">
                        <DatePicker style={{ width: '100%' }} format={DATE_FORMAT} />
                      </Form.Item>
                      <Form.Item name="plannedCompletionDate" label="计划竣工日期" rules={[{ validator: async (_, value) => validateEndDate(plannedStartDate, value, '计划竣工日期', '计划开工日期', false) }]}>
                        <DatePicker style={{ width: '100%' }} format={DATE_FORMAT} />
                      </Form.Item>
                      <Form.Item name="actualStartDate" label="实际开工日期">
                        <DatePicker style={{ width: '100%' }} format={DATE_FORMAT} allowClear />
                      </Form.Item>
                      <Form.Item name="actualCompletionDate" label="实际竣工日期" rules={[{ validator: async (_, value) => validateEndDate(actualStartDate, value, '实际竣工日期', '实际开工日期', false) }]}>
                        <DatePicker style={{ width: '100%' }} format={DATE_FORMAT} allowClear />
                      </Form.Item>
                      <Form.Item label="计划建设工期（天）">
                        <Input value={plannedDurationDays ?? ''} placeholder="自动计算" readOnly />
                      </Form.Item>
                      <Form.Item label="实际建设工期（天）">
                        <Input value={actualDurationDays ?? ''} placeholder="自动计算" readOnly />
                      </Form.Item>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </div>
  );
}
