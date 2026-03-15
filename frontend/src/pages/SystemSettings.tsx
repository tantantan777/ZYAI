import { useEffect, useMemo, useState } from 'react';
import { Card, Tabs, Form, Input, Select, Button, Space, InputNumber, Row, Col, Empty, Modal, Tooltip, Dropdown, Switch, Table, Tag } from 'antd';
import type { MenuProps } from 'antd';
import { SaveOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../utils/api';
import { logClientAuditAsync } from '../utils/audit';
import { openActionConfirmDialog, openDeleteDialog } from '../utils/confirm';
import ResettableTabs from '../components/ResettableTabs';
import {
  ensureRealtimeConnection,
  type OrgStructureUpdatedEvent,
  type UserDirectoryUpdatedEvent,
} from '../services/realtime';
import { feedback as message } from '../utils/feedback';
import './SystemSettings.css';

const { TabPane } = Tabs;
const UNASSIGNED_UNIT_NATURE_ID = -1;
const UNASSIGNED_UNIT_NATURE_NAME = '未配置';

interface AIConfigForm {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  openaiOrganization?: string;
  openaiProject?: string;
  anthropicVersion?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

const PROVIDER_OPTIONS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic (Claude)', value: 'anthropic' },
];

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
};

type ProjectSummaryItem = {
  id: number;
  name: string;
  manager?: string | null;
  projectTypeName?: string | null;
  constructionNatureName?: string | null;
};

type BusinessDomainItem = {
  id: number;
  code: string;
  name: string;
};

type PositionBusinessPermissionItem = {
  businessDomainId: number;
  code: string;
  name: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUpload: boolean;
};

interface SystemLogItem {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  unitName?: string | null;
  departmentName?: string | null;
  positionName?: string | null;
  actionType: 'add' | 'edit' | 'delete';
  targetType: string;
  targetName: string;
  detail?: string | null;
  createdAt: string;
}

const actionTypeLabelMap: Record<SystemLogItem['actionType'], string> = {
  add: '添加',
  edit: '编辑',
  delete: '删除',
};

const actionTypeColorMap: Record<SystemLogItem['actionType'], string> = {
  add: 'success',
  edit: 'processing',
  delete: 'error',
};

function formatLogTimestamp(value?: string) {
  if (!value) {
    return '-';
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : '-';
}

interface OrgUnitItem {
  id: number;
  unitNatureId: number | null;
  name: string;
}

interface OrgUnitNatureItem {
  id: number;
  name: string;
  orgEnabled?: boolean;
}

interface ProjectTypeItem {
  id: number;
  name: string;
}

interface ConstructionNatureItem {
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

interface OrgPersonItem {
  id: number;
  positionId: number | null;
  name: string;
  email?: string;
  phone?: string;
  isSystemAdmin?: boolean;
}

type OrgContextType =
  | 'unitNature'
  | 'projectType'
  | 'constructionNature'
  | 'unit'
  | 'department'
  | 'position'
  | 'person';

type RenameTarget = {
  type: OrgContextType;
  id: number;
  name: string;
  positionId?: number | null;
  scope?: 'platform' | 'org';
};

type MovePersonTarget = {
  id: number;
  name: string;
  positionId: number | null;
};

type UnitProjectTarget = {
  id: number;
  name: string;
};

type DepartmentBusinessTarget = {
  id: number;
  name: string;
};

type PositionBusinessTarget = {
  id: number;
  name: string;
};

type PersonSystemAdminTarget = {
  id: number;
  name: string;
  isSystemAdmin: boolean;
};

export default function SystemSettings() {
  const [form] = Form.useForm<AIConfigForm>();
  const [saveLoading, setSaveLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('openai');
  const [activeTabKey, setActiveTabKey] = useState('platform');

  const [unitNatures, setUnitNatures] = useState<OrgUnitNatureItem[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectTypeItem[]>([]);
  const [constructionNatures, setConstructionNatures] = useState<ConstructionNatureItem[]>([]);
  const [businessDomains, setBusinessDomains] = useState<BusinessDomainItem[]>([]);
  const [units, setUnits] = useState<OrgUnitItem[]>([]);
  const [departments, setDepartments] = useState<OrgDepartmentItem[]>([]);
  const [positions, setPositions] = useState<OrgPositionItem[]>([]);
  const [people, setPeople] = useState<OrgPersonItem[]>([]);
  const [projects, setProjects] = useState<ProjectSummaryItem[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLogItem[]>([]);
  const [systemLogsLoading, setSystemLogsLoading] = useState(false);

  const [selectedUnitNatureId, setSelectedUnitNatureId] = useState<number>(UNASSIGNED_UNIT_NATURE_ID);
  const [selectedUnitId, setSelectedUnitId] = useState<number>(0);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number>(0);
  const [selectedPositionId, setSelectedPositionId] = useState<number>(0);

  const [addUnitNatureModalOpen, setAddUnitNatureModalOpen] = useState(false);
  const [addProjectTypeModalOpen, setAddProjectTypeModalOpen] = useState(false);
  const [addConstructionNatureModalOpen, setAddConstructionNatureModalOpen] = useState(false);
  const [selectOrgUnitNatureModalOpen, setSelectOrgUnitNatureModalOpen] = useState(false);
  const [addUnitModalOpen, setAddUnitModalOpen] = useState(false);
  const [addDepartmentModalOpen, setAddDepartmentModalOpen] = useState(false);
  const [addPositionModalOpen, setAddPositionModalOpen] = useState(false);
  const [addUnitNatureName, setAddUnitNatureName] = useState('');
  const [addProjectTypeName, setAddProjectTypeName] = useState('');
  const [addConstructionNatureName, setAddConstructionNatureName] = useState('');
  const [selectOrgUnitNatureIds, setSelectOrgUnitNatureIds] = useState<number[]>([]);
  const [addUnitName, setAddUnitName] = useState('');
  const [addDepartmentName, setAddDepartmentName] = useState('');
  const [addPositionName, setAddPositionName] = useState('');
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MovePersonTarget | null>(null);
  const [moveUnitId, setMoveUnitId] = useState<number>(0);
  const [moveDepartmentId, setMoveDepartmentId] = useState<number>(0);
  const [movePositionId, setMovePositionId] = useState<number>(0);
  const [moveSubmitting, setMoveSubmitting] = useState(false);
  const [unitProjectTarget, setUnitProjectTarget] = useState<UnitProjectTarget | null>(null);
  const [unitProjectIds, setUnitProjectIds] = useState<number[]>([]);
  const [unitProjectLoading, setUnitProjectLoading] = useState(false);
  const [unitProjectSubmitting, setUnitProjectSubmitting] = useState(false);
  const [departmentBusinessTarget, setDepartmentBusinessTarget] = useState<DepartmentBusinessTarget | null>(null);
  const [departmentBusinessDomainIds, setDepartmentBusinessDomainIds] = useState<number[]>([]);
  const [departmentBusinessLoading, setDepartmentBusinessLoading] = useState(false);
  const [departmentBusinessSubmitting, setDepartmentBusinessSubmitting] = useState(false);
  const [positionBusinessTarget, setPositionBusinessTarget] = useState<PositionBusinessTarget | null>(null);
  const [positionBusinessPermissions, setPositionBusinessPermissions] = useState<PositionBusinessPermissionItem[]>([]);
  const [positionBusinessLoading, setPositionBusinessLoading] = useState(false);
  const [positionBusinessSubmitting, setPositionBusinessSubmitting] = useState(false);
  const [systemAdminTarget, setSystemAdminTarget] = useState<PersonSystemAdminTarget | null>(null);
  const [systemAdminValue, setSystemAdminValue] = useState(false);
  const [systemAdminSubmitting, setSystemAdminSubmitting] = useState(false);

  const getUnitContextMenuProps = (target: RenameTarget): { menu: MenuProps; trigger: ['contextMenu'] } => ({
    trigger: ['contextMenu'],
    menu: {
      items: [
        { key: 'rename', label: '重命名' },
        { key: 'project-assignment', label: '项目分配' },
        { key: 'delete', label: '删除', danger: true },
      ],
      onClick: ({ key }) => {
        if (key === 'rename') {
          openRenameModal(target);
          return;
        }

        if (key === 'project-assignment') {
          void openUnitProjectModal({ id: target.id, name: target.name });
          return;
        }

        if (key === 'delete') {
          handleDelete(target);
        }
      },
    },
  });

  const getDepartmentContextMenuProps = (target: RenameTarget): { menu: MenuProps; trigger: ['contextMenu'] } => ({
    trigger: ['contextMenu'],
    menu: {
      items: [
        { key: 'rename', label: '重命名' },
        { key: 'business-scope', label: '业务范围' },
        { key: 'delete', label: '删除', danger: true },
      ],
      onClick: ({ key }) => {
        if (key === 'rename') {
          openRenameModal(target);
          return;
        }

        if (key === 'business-scope') {
          void openDepartmentBusinessModal({ id: target.id, name: target.name });
          return;
        }

        if (key === 'delete') {
          handleDelete(target);
        }
      },
    },
  });

  const getPositionContextMenuProps = (target: RenameTarget): { menu: MenuProps; trigger: ['contextMenu'] } => ({
    trigger: ['contextMenu'],
    menu: {
      items: [
        { key: 'rename', label: '重命名' },
        { key: 'business-permission', label: '业务权限' },
        { key: 'delete', label: '删除', danger: true },
      ],
      onClick: ({ key }) => {
        if (key === 'rename') {
          openRenameModal(target);
          return;
        }

        if (key === 'business-permission') {
          void openPositionBusinessModal({ id: target.id, name: target.name });
          return;
        }

        if (key === 'delete') {
          handleDelete(target);
        }
      },
    },
  });

  const getPersonContextMenuProps = (
    target: MovePersonTarget & { isSystemAdmin?: boolean },
  ): { menu: MenuProps; trigger: ['contextMenu'] } => ({
    trigger: ['contextMenu'],
    menu: {
      items: [
        { key: 'move', label: '移动' },
        { key: 'system-admin', label: '系统管理员' },
        ...(target.positionId ? [{ key: 'delete', label: '移除', danger: true }] : []),
      ],
      onClick: ({ key }) => {
        if (key === 'move') {
          openMoveModal({
            id: target.id,
            name: target.name,
            positionId: target.positionId ?? null,
          });
          return;
        }

        if (key === 'system-admin') {
          openSystemAdminModal({
            id: target.id,
            name: target.name,
            isSystemAdmin: target.isSystemAdmin === true,
          });
          return;
        }

        if (key === 'delete') {
          handleDelete({
            type: 'person',
            id: target.id,
            name: target.name,
            positionId: target.positionId ?? null,
          });
        }
      },
    },
  });

  const getUnitNatureContextMenuProps = (
    target: RenameTarget,
  ): { menu: MenuProps; trigger: ['contextMenu'] } => ({
    trigger: ['contextMenu'],
    menu: {
      items: [
        { key: 'rename', label: '重命名' },
        { key: 'delete', label: '删除', danger: true },
      ],
      onClick: ({ key }) => {
        if (key === 'rename') {
          openRenameModal(target);
          return;
        }

        if (key === 'delete') {
          handleDelete(target);
        }
      },
    },
  });

  const getOrgUnitNatureContextMenuProps = (
    target: RenameTarget,
  ): { menu: MenuProps; trigger: ['contextMenu'] } => ({
    trigger: ['contextMenu'],
    menu: {
      items: [{ key: 'delete', label: '删除', danger: true }],
      onClick: ({ key }) => {
        if (key === 'delete') {
          handleDelete(target);
        }
      },
    },
  });

  useEffect(() => {
    void loadAIConfig();
    void loadOrgStructure();
  }, []);

  useEffect(() => {
    if (activeTabKey === 'logs') {
      void loadSystemLogs();
    }
  }, [activeTabKey]);

  const loadAIConfig = async () => {
    try {
      const response = await api.get('/ai-config');

      if (response.data.config) {
        setSelectedProvider(response.data.config.provider);
        form.setFieldsValue({
          provider: response.data.config.provider,
          model: response.data.config.model,
          baseUrl: response.data.config.base_url || '',
          openaiOrganization: response.data.config.openai_organization || '',
          openaiProject: response.data.config.openai_project || '',
          anthropicVersion: response.data.config.anthropic_version || '',
          temperature: response.data.config.temperature ?? 0.7,
          maxTokens: response.data.config.max_tokens ?? 2000,
          topP: response.data.config.top_p ?? 1,
          topK: response.data.config.top_k ?? undefined,
          timeoutMs: response.data.config.timeout_ms ?? 60000,
          maxRetries: response.data.config.max_retries ?? 2,
          apiKey: ''
        });
      } else {
        setSelectedProvider('openai');
        form.setFieldsValue({
          provider: 'openai',
          model: MODEL_SUGGESTIONS.openai[0],
          baseUrl: '',
          temperature: 0.7,
          maxTokens: 2000,
          topP: 1,
          timeoutMs: 60000,
          maxRetries: 2,
          apiKey: '',
        });
      }
    } catch (error) {
      console.error('加载AI配置失败:', error);
    }
  };

  const loadOrgStructure = async () => {
    try {
      const response = await api.get('/org/structure');
      const nextUnitNatures = (response.data.unitNatures ?? []) as OrgUnitNatureItem[];
      const nextProjectTypes = (response.data.projectTypes ?? []) as ProjectTypeItem[];
      const nextConstructionNatures = (response.data.constructionNatures ?? []) as ConstructionNatureItem[];
      const nextBusinessDomains = (response.data.businessDomains ?? []) as BusinessDomainItem[];
      const nextUnits = (response.data.units ?? []) as OrgUnitItem[];
      const nextDepartments = (response.data.departments ?? []) as OrgDepartmentItem[];
      const nextPositions = (response.data.positions ?? []) as OrgPositionItem[];

      setUnitNatures(nextUnitNatures);
      setProjectTypes(nextProjectTypes);
      setConstructionNatures(nextConstructionNatures);
      setBusinessDomains(nextBusinessDomains);
      setUnits(nextUnits);
      setDepartments(nextDepartments);
      setPositions(nextPositions);

      const nextEnabledUnitNatures = nextUnitNatures.filter((item) => item.orgEnabled);
      const nextSelectedUnitNatureId =
        selectedUnitNatureId === UNASSIGNED_UNIT_NATURE_ID
          ? UNASSIGNED_UNIT_NATURE_ID
          : nextEnabledUnitNatures.some((item) => item.id === selectedUnitNatureId)
            ? selectedUnitNatureId
            : (nextEnabledUnitNatures[0]?.id ?? UNASSIGNED_UNIT_NATURE_ID);

      const nextCurrentUnits =
        nextSelectedUnitNatureId === UNASSIGNED_UNIT_NATURE_ID
          ? nextUnits.filter((item) => item.unitNatureId == null)
          : nextUnits.filter((item) => item.unitNatureId === nextSelectedUnitNatureId);

      const nextSelectedUnitId =
        nextSelectedUnitNatureId === UNASSIGNED_UNIT_NATURE_ID
          ? nextCurrentUnits.some((item) => item.id === selectedUnitId)
            ? selectedUnitId
            : 0
          : nextCurrentUnits.some((item) => item.id === selectedUnitId)
            ? selectedUnitId
            : (nextCurrentUnits[0]?.id ?? 0);

      const nextSelectedDepartmentId =
        !nextSelectedUnitId
          ? 0
          : nextDepartments.some(
              (item) => item.id === selectedDepartmentId && item.unitId === nextSelectedUnitId
            )
            ? selectedDepartmentId
            : (nextDepartments.find((item) => item.unitId === nextSelectedUnitId)?.id ?? 0);

      const nextSelectedPositionId =
        !nextSelectedUnitId
          ? 0
          : nextPositions.some(
              (item) => item.id === selectedPositionId && item.departmentId === nextSelectedDepartmentId
            )
            ? selectedPositionId
            : (nextPositions.find((item) => item.departmentId === nextSelectedDepartmentId)?.id ?? 0);

      setSelectedUnitNatureId(nextSelectedUnitNatureId);
      setSelectedUnitId(nextSelectedUnitId);
      setSelectedDepartmentId(nextSelectedDepartmentId);
      setSelectedPositionId(nextSelectedPositionId);
    } catch (error) {
      console.error('加载单位配置失败:', error);
      message.error('加载单位配置失败');
    }
  };

  const loadSystemLogs = async () => {
    try {
      setSystemLogsLoading(true);
      const response = await api.get('/system-logs', {
        params: { limit: 200 },
      });
      setSystemLogs((response.data.logs ?? []) as SystemLogItem[]);
    } catch (error) {
      console.error('加载系统日志失败:', error);
      message.error('加载系统日志失败，请稍后重试');
    } finally {
      setSystemLogsLoading(false);
    }
  };

  const loadPositionPeople = async (positionId: number) => {
    try {
      const response = await api.get(`/org/positions/${positionId}/people`);
      setPeople((response.data.people ?? []) as OrgPersonItem[]);
    } catch (error) {
      console.error('加载人员失败:', error);
      setPeople([]);
    }
  };

  const loadUnassignedPeople = async () => {
    try {
      const response = await api.get('/org/unassigned-people');
      setPeople((response.data.people ?? []) as OrgPersonItem[]);
    } catch (error) {
      console.error('加载未配置人员失败:', error);
      setPeople([]);
    }
  };

  const handleSave = async (values: AIConfigForm) => {
    setSaveLoading(true);
    try {
      await api.post('/ai-config', values);

      message.success('AI配置已保存');
    } catch (error: any) {
      message.error(error.response?.data?.message || 'AI配置保存失败，请稍后重试');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleProviderChange = (value: string) => {
    setSelectedProvider(value);
    const suggestions = MODEL_SUGGESTIONS[value];
    if (suggestions && suggestions.length > 0) {
      form.setFieldValue('model', suggestions[0]);
    }

    if (value === 'openai') {
      form.setFieldsValue({
        anthropicVersion: undefined,
        topK: undefined,
      });
    }

    if (value === 'anthropic') {
      form.setFieldsValue({
        openaiOrganization: undefined,
        openaiProject: undefined,
      });
    }
  };

  const baseUrlPlaceholder =
    selectedProvider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';
  const displayedUnitNatures = useMemo(
    () => [
      {
        id: UNASSIGNED_UNIT_NATURE_ID,
        name: UNASSIGNED_UNIT_NATURE_NAME,
      },
      ...unitNatures.filter((item) => item.orgEnabled),
    ],
    [unitNatures],
  );
  const availableOrgUnitNatures = useMemo(
    () => unitNatures.filter((item) => item.orgEnabled),
    [unitNatures],
  );
  const currentUnits =
    selectedUnitNatureId === UNASSIGNED_UNIT_NATURE_ID
      ? units.filter((item) => item.unitNatureId == null)
      : units.filter((item) => item.unitNatureId === selectedUnitNatureId);
  const currentDepartments =
    !selectedUnitId
      ? []
      : departments.filter((item) => item.unitId === selectedUnitId);
  const currentPositions =
    !selectedUnitId
      ? []
      : positions.filter((item) => item.departmentId === selectedDepartmentId);
  const currentPeople = people;
  const currentUnitNatureName =
    selectedUnitNatureId === UNASSIGNED_UNIT_NATURE_ID
      ? UNASSIGNED_UNIT_NATURE_NAME
      : displayedUnitNatures.find((item) => item.id === selectedUnitNatureId)?.name ?? '-';
  const currentUnitName = currentUnits.find((item) => item.id === selectedUnitId)?.name ?? '-';
  const currentDepartmentName = currentDepartments.find((item) => item.id === selectedDepartmentId)?.name ?? '-';
  const moveDepartments = moveUnitId ? departments.filter((item) => item.unitId === moveUnitId) : [];
  const movePositions = moveDepartmentId ? positions.filter((item) => item.departmentId === moveDepartmentId) : [];

  const orgTypeLabelMap: Record<OrgContextType, string> = {
    unitNature: '单位性质',
    projectType: '项目类型',
    constructionNature: '建设性质',
    unit: '单位',
    department: '部门',
    position: '职位',
    person: '人员',
  };

  const logSystemAction = (
    actionType: 'add' | 'edit' | 'delete',
    targetType: string,
    targetName: string,
    detail?: string,
  ) => {
    logClientAuditAsync({
      actionType,
      targetType,
      targetName,
      detail,
    });
  };

  const openRenameModal = (target: RenameTarget) => {
    setRenameTarget(target);
    setRenameValue(target.name);
  };

  const closeRenameModal = () => {
    setRenameTarget(null);
    setRenameValue('');
    setRenameSubmitting(false);
  };

  const openMoveModal = (target: MovePersonTarget) => {
    const currentPosition = target.positionId ? positions.find((item) => item.id === target.positionId) : undefined;
    const currentDepartment = currentPosition
      ? departments.find((item) => item.id === currentPosition.departmentId)
      : undefined;

    setMoveTarget(target);
    setMoveUnitId(currentDepartment?.unitId ?? 0);
    setMoveDepartmentId(currentPosition?.departmentId ?? 0);
    setMovePositionId(currentPosition?.id ?? 0);
    setMoveSubmitting(false);
  };

  const closeMoveModal = () => {
    setMoveTarget(null);
    setMoveUnitId(0);
    setMoveDepartmentId(0);
    setMovePositionId(0);
    setMoveSubmitting(false);
  };

  const openUnitProjectModal = async (target: UnitProjectTarget) => {
    setUnitProjectTarget(target);
    setUnitProjectLoading(true);
    setUnitProjectSubmitting(false);

    try {
      const [assignmentResponse, projectResponse] = await Promise.all([
        api.get(`/org/units/${target.id}/project-assignments`),
        api.get('/projects'),
      ]);

      setUnitProjectIds((assignmentResponse.data.projectIds ?? []) as number[]);
      setProjects((projectResponse.data.projects ?? []) as ProjectSummaryItem[]);
    } catch (error: any) {
      setUnitProjectTarget(null);
      message.error(error.response?.data?.message || '加载单位项目分配失败，请稍后重试');
    } finally {
      setUnitProjectLoading(false);
    }
  };

  const closeUnitProjectModal = () => {
    setUnitProjectTarget(null);
    setUnitProjectIds([]);
    setUnitProjectLoading(false);
    setUnitProjectSubmitting(false);
  };

  const openDepartmentBusinessModal = async (target: DepartmentBusinessTarget) => {
    setDepartmentBusinessTarget(target);
    setDepartmentBusinessLoading(true);
    setDepartmentBusinessSubmitting(false);

    try {
      const response = await api.get(`/org/departments/${target.id}/business-domains`);
      setDepartmentBusinessDomainIds((response.data.businessDomainIds ?? []) as number[]);
    } catch (error: any) {
      setDepartmentBusinessTarget(null);
      message.error(error.response?.data?.message || '加载部门业务范围失败，请稍后重试');
    } finally {
      setDepartmentBusinessLoading(false);
    }
  };

  const closeDepartmentBusinessModal = () => {
    setDepartmentBusinessTarget(null);
    setDepartmentBusinessDomainIds([]);
    setDepartmentBusinessLoading(false);
    setDepartmentBusinessSubmitting(false);
  };

  const openPositionBusinessModal = async (target: PositionBusinessTarget) => {
    setPositionBusinessTarget(target);
    setPositionBusinessLoading(true);
    setPositionBusinessSubmitting(false);

    try {
      const response = await api.get(`/org/positions/${target.id}/business-permissions`);
      setPositionBusinessPermissions((response.data.permissions ?? []) as PositionBusinessPermissionItem[]);
    } catch (error: any) {
      setPositionBusinessTarget(null);
      message.error(error.response?.data?.message || '加载职位业务权限失败，请稍后重试');
    } finally {
      setPositionBusinessLoading(false);
    }
  };

  const closePositionBusinessModal = () => {
    setPositionBusinessTarget(null);
    setPositionBusinessPermissions([]);
    setPositionBusinessLoading(false);
    setPositionBusinessSubmitting(false);
  };

  const openSystemAdminModal = (target: PersonSystemAdminTarget) => {
    setSystemAdminTarget(target);
    setSystemAdminValue(target.isSystemAdmin);
    setSystemAdminSubmitting(false);
  };

  const closeSystemAdminModal = () => {
    setSystemAdminTarget(null);
    setSystemAdminValue(false);
    setSystemAdminSubmitting(false);
  };

  const handleRename = async () => {
    if (!renameTarget) {
      return;
    }

    const name = renameValue.trim();
    if (!name) {
      message.error(`请输入${orgTypeLabelMap[renameTarget.type]}名称`);
      return;
    }

    setRenameSubmitting(true);
    try {
      if (renameTarget.type === 'unitNature') {
        await api.put(`/org/unit-natures/${renameTarget.id}`, { name });
        await loadOrgStructure();
      } else if (renameTarget.type === 'projectType') {
        await api.put(`/org/project-types/${renameTarget.id}`, { name });
        await loadOrgStructure();
      } else if (renameTarget.type === 'constructionNature') {
        await api.put(`/org/construction-natures/${renameTarget.id}`, { name });
        await loadOrgStructure();
      } else if (renameTarget.type === 'unit') {
        await api.put(`/org/units/${renameTarget.id}`, { name });
        await loadOrgStructure();
      } else if (renameTarget.type === 'department') {
        await api.put(`/org/departments/${renameTarget.id}`, { name });
        await loadOrgStructure();
      } else if (renameTarget.type === 'position') {
        await api.put(`/org/positions/${renameTarget.id}`, { name });
        await loadOrgStructure();
      } else {
        await api.put(`/org/people/${renameTarget.id}`, { name });
        if (selectedPositionId) {
          await loadPositionPeople(selectedPositionId);
        }
      }

      message.success(`${orgTypeLabelMap[renameTarget.type]}已重命名`);
      logSystemAction('edit', orgTypeLabelMap[renameTarget.type], name, `原名称：${renameTarget.name}`);
      closeRenameModal();
    } catch (error: any) {
      message.error(error.response?.data?.message || `${orgTypeLabelMap[renameTarget.type]}重命名失败，请稍后重试`);
      setRenameSubmitting(false);
    }
  };

  const handleSaveUnitProjectAssignments = async () => {
    if (!unitProjectTarget) {
      return;
    }

    setUnitProjectSubmitting(true);
    try {
      await api.put(`/org/units/${unitProjectTarget.id}/project-assignments`, { projectIds: unitProjectIds });
      message.success('单位项目分配已更新');
      logSystemAction(
        'edit',
        '单位项目分配',
        unitProjectTarget.name,
        `已分配 ${unitProjectIds.length} 个项目`,
      );
      closeUnitProjectModal();
    } catch (error: any) {
      message.error(error.response?.data?.message || '单位项目分配更新失败，请稍后重试');
      setUnitProjectSubmitting(false);
    }
  };

  const handleSaveDepartmentBusinessDomains = async () => {
    if (!departmentBusinessTarget) {
      return;
    }

    setDepartmentBusinessSubmitting(true);
    try {
      await api.put(`/org/departments/${departmentBusinessTarget.id}/business-domains`, {
        businessDomainIds: departmentBusinessDomainIds,
      });
      message.success('部门业务范围已更新');
      logSystemAction(
        'edit',
        '部门业务范围',
        departmentBusinessTarget.name,
        `已选择 ${departmentBusinessDomainIds.length} 个业务范围`,
      );
      closeDepartmentBusinessModal();
    } catch (error: any) {
      message.error(error.response?.data?.message || '部门业务范围更新失败，请稍后重试');
      setDepartmentBusinessSubmitting(false);
    }
  };

  const handlePositionPermissionChange = (
    businessDomainId: number,
    field: 'canView' | 'canCreate' | 'canEdit' | 'canDelete' | 'canUpload',
    checked: boolean,
  ) => {
    setPositionBusinessPermissions((prev) =>
      prev.map((item) => {
        if (item.businessDomainId !== businessDomainId) {
          return item;
        }

        if (field === 'canView') {
          return checked
            ? { ...item, canView: true }
            : {
                ...item,
                canView: false,
                canCreate: false,
                canEdit: false,
                canDelete: false,
                canUpload: false,
              };
        }

        return {
          ...item,
          canView: checked ? true : item.canView,
          [field]: checked,
        };
      }),
    );
  };

  const handleSavePositionBusinessPermissions = async () => {
    if (!positionBusinessTarget) {
      return;
    }

    setPositionBusinessSubmitting(true);
    try {
      await api.put(`/org/positions/${positionBusinessTarget.id}/business-permissions`, {
        permissions: positionBusinessPermissions,
      });
      message.success('职位业务权限已更新');
      logSystemAction('edit', '职位业务权限', positionBusinessTarget.name);
      closePositionBusinessModal();
    } catch (error: any) {
      message.error(error.response?.data?.message || '职位业务权限更新失败，请稍后重试');
      setPositionBusinessSubmitting(false);
    }
  };

  const handleSaveSystemAdmin = async () => {
    if (!systemAdminTarget) {
      return;
    }

    setSystemAdminSubmitting(true);
    try {
      await api.put(`/org/people/${systemAdminTarget.id}/system-admin`, { isSystemAdmin: systemAdminValue });
      setPeople((prev) =>
        prev.map((item) =>
          item.id === systemAdminTarget.id
            ? {
                ...item,
                isSystemAdmin: systemAdminValue,
              }
            : item,
        ),
      );
      message.success('系统管理员设置已更新');
      logSystemAction(
        'edit',
        '系统管理员',
        systemAdminTarget.name,
        systemAdminValue ? '已授予系统管理员权限' : '已移除系统管理员权限',
      );
      closeSystemAdminModal();
    } catch (error: any) {
      message.error(error.response?.data?.message || '系统管理员设置更新失败，请稍后重试');
      setSystemAdminSubmitting(false);
    }
  };

  const handleMovePerson = async () => {
    if (!moveTarget) {
      return;
    }

    if (!moveUnitId) {
      message.error('请选择目标单位');
      return;
    }

    if (!moveDepartmentId) {
      message.error('请选择目标部门');
      return;
    }

    if (!movePositionId) {
      message.error('请选择目标职位');
      return;
    }

    setMoveSubmitting(true);
    try {
      await api.put(`/org/people/${moveTarget.id}/move`, { positionId: movePositionId });

      if (selectedUnitNatureId === UNASSIGNED_UNIT_NATURE_ID && !selectedUnitId) {
        await loadUnassignedPeople();
      } else if (selectedPositionId) {
        await loadPositionPeople(selectedPositionId);
      }

      message.success('人员已移动');
      logSystemAction('edit', '人员', moveTarget.name, '已调整所属单位、部门和职位');
      closeMoveModal();
    } catch (error: any) {
      message.error(error.response?.data?.message || '人员移动失败，请稍后重试');
      setMoveSubmitting(false);
    }
  };

  const handleDelete = (target: RenameTarget) => {
    const onOk = async () => {
      try {
        if (target.type === 'unitNature') {
          if (target.scope === 'org') {
            await api.delete(`/org/unit-natures/${target.id}/activate`);
          } else {
            await api.delete(`/org/unit-natures/${target.id}`);
          }
          await loadOrgStructure();
        } else if (target.type === 'projectType') {
          await api.delete(`/org/project-types/${target.id}`);
          await loadOrgStructure();
        } else if (target.type === 'constructionNature') {
          await api.delete(`/org/construction-natures/${target.id}`);
          await loadOrgStructure();
        } else if (target.type === 'unit') {
          await api.delete(`/org/units/${target.id}`);
          await loadOrgStructure();
        } else if (target.type === 'department') {
          await api.delete(`/org/departments/${target.id}`);
          await loadOrgStructure();
        } else if (target.type === 'position') {
          await api.delete(`/org/positions/${target.id}`);
          await loadOrgStructure();
        } else if (target.positionId) {
          await api.delete(`/org/positions/${target.positionId}/people/${target.id}`);
          await loadPositionPeople(target.positionId);
        }

        message.success(`${orgTypeLabelMap[target.type]}已删除`);
        logSystemAction('delete', orgTypeLabelMap[target.type], target.name);
      } catch (error: any) {
        message.error(error.response?.data?.message || `${orgTypeLabelMap[target.type]}删除失败，请稍后重试`);
        throw error;
      }
    };

    if (target.type === 'person') {
      openActionConfirmDialog({
        actionLabel: '移除人员',
        content: '移除后不会删除账号，但会清空其单位、部门和职位。是否继续？',
        okText: '确认移除',
        okButtonProps: { danger: true },
        onOk,
      });
      return;
    }

    if (target.type === 'unitNature') {
      openActionConfirmDialog({
        actionLabel: '删除单位性质',
        content:
          target.scope === 'org'
            ? '删除后会从单位管理和权限配置中移除此单位性质，并同时删除该单位性质下的单位、部门、职位，清空相关人员的组织信息。平台配置中的单位性质会保留。是否继续？'
            : '删除后会同时删除该单位性质下的单位、部门、职位，并清空相关人员的组织信息。是否继续？',
        okText: '确认删除',
        okButtonProps: { danger: true },
        onOk,
      });
      return;
    }

    openDeleteDialog({
      entityLabel: orgTypeLabelMap[target.type],
      entityName: target.name,
      onOk,
    });
  };

  const getUnitNatureContextMenu = (target: RenameTarget): { menu: MenuProps; trigger: ['contextMenu'] } =>
    getUnitNatureContextMenuProps(target);

  useEffect(() => {
    const isValidNature =
      selectedUnitNatureId === UNASSIGNED_UNIT_NATURE_ID ||
      unitNatures.some((item) => item.id === selectedUnitNatureId && item.orgEnabled);
    if (isValidNature) {
      return;
    }

    setSelectedUnitNatureId(unitNatures.find((item) => item.orgEnabled)?.id ?? UNASSIGNED_UNIT_NATURE_ID);
  }, [selectedUnitNatureId, unitNatures]);

  useEffect(() => {
    const visibleUnitIds = new Set(currentUnits.map((item) => item.id));
    const isValid = selectedUnitId > 0 && visibleUnitIds.has(selectedUnitId);
    if (isValid) {
      return;
    }

    if (selectedUnitNatureId === UNASSIGNED_UNIT_NATURE_ID) {
      if (selectedUnitId !== 0) {
        setSelectedUnitId(0);
      }
      return;
    }

    setSelectedUnitId(currentUnits[0]?.id ?? 0);
  }, [currentUnits, selectedUnitId, selectedUnitNatureId]);

  useEffect(() => {
    if (!selectedUnitId) {
      if (selectedDepartmentId !== 0) {
        setSelectedDepartmentId(0);
      }
      return;
    }

    const isValid = departments.some(
      (dept) => dept.id === selectedDepartmentId && dept.unitId === selectedUnitId
    );
    if (isValid) {
      return;
    }
    const firstDepartment = departments.find((dept) => dept.unitId === selectedUnitId);
    setSelectedDepartmentId(firstDepartment?.id ?? 0);
  }, [selectedUnitId, departments, selectedDepartmentId]);

  useEffect(() => {
    if (!selectedDepartmentId) {
      if (selectedPositionId !== 0) {
        setSelectedPositionId(0);
      }
      return;
    }

    const isValid = positions.some(
      (pos) => pos.id === selectedPositionId && pos.departmentId === selectedDepartmentId
    );
    if (isValid) {
      return;
    }
    const firstPosition = positions.find((pos) => pos.departmentId === selectedDepartmentId);
    setSelectedPositionId(firstPosition?.id ?? 0);
  }, [selectedDepartmentId, positions, selectedPositionId]);

  useEffect(() => {
    if (!moveTarget) {
      return;
    }

    if (!moveUnitId) {
      if (moveDepartmentId !== 0) {
        setMoveDepartmentId(0);
      }
      if (movePositionId !== 0) {
        setMovePositionId(0);
      }
      return;
    }

    const isValid = departments.some((item) => item.id === moveDepartmentId && item.unitId === moveUnitId);
    if (isValid) {
      return;
    }

    const firstDepartment = departments.find((item) => item.unitId === moveUnitId);
    setMoveDepartmentId(firstDepartment?.id ?? 0);
  }, [departments, moveDepartmentId, movePositionId, moveTarget, moveUnitId]);

  useEffect(() => {
    if (!moveTarget) {
      return;
    }

    if (!moveDepartmentId) {
      if (movePositionId !== 0) {
        setMovePositionId(0);
      }
      return;
    }

    const isValid = positions.some((item) => item.id === movePositionId && item.departmentId === moveDepartmentId);
    if (isValid) {
      return;
    }

    const firstPosition = positions.find((item) => item.departmentId === moveDepartmentId);
    setMovePositionId(firstPosition?.id ?? 0);
  }, [moveDepartmentId, movePositionId, moveTarget, positions]);

  useEffect(() => {
    if (selectedUnitNatureId === UNASSIGNED_UNIT_NATURE_ID && !selectedUnitId) {
      void loadUnassignedPeople();
      return;
    }

    if (!selectedPositionId) {
      setPeople([]);
      return;
    }
    void loadPositionPeople(selectedPositionId);
  }, [selectedPositionId, selectedUnitId, selectedUnitNatureId]);

  useEffect(() => {
    const socket = ensureRealtimeConnection();
    if (!socket) {
      return;
    }

    const handleUserDirectoryUpdated = (_payload: UserDirectoryUpdatedEvent) => {
      if (selectedUnitNatureId === UNASSIGNED_UNIT_NATURE_ID && !selectedUnitId) {
        void loadUnassignedPeople();
        return;
      }

      if (selectedPositionId) {
        void loadPositionPeople(selectedPositionId);
      }
    };

    const handleOrgStructureUpdated = (_payload: OrgStructureUpdatedEvent) => {
      void loadOrgStructure();
    };

    socket.on('user:directory-updated', handleUserDirectoryUpdated);
    socket.on('org:structure-updated', handleOrgStructureUpdated);

    return () => {
      socket.off('user:directory-updated', handleUserDirectoryUpdated);
      socket.off('org:structure-updated', handleOrgStructureUpdated);
    };
  }, [selectedPositionId, selectedUnitId, selectedUnitNatureId]);

  const openAddUnitNatureModal = () => {
    setAddUnitNatureName('');
    setAddUnitNatureModalOpen(true);
  };

  const openAddProjectTypeModal = () => {
    setAddProjectTypeName('');
    setAddProjectTypeModalOpen(true);
  };

  const openAddConstructionNatureModal = () => {
    setAddConstructionNatureName('');
    setAddConstructionNatureModalOpen(true);
  };

  const openSelectOrgUnitNatureModal = () => {
    if (unitNatures.length === 0) {
      message.warning('请先在平台配置中添加单位性质');
      return;
    }

    setSelectOrgUnitNatureIds([]);
    setSelectOrgUnitNatureModalOpen(true);
  };

  const openAddUnitModal = () => {
    if (availableOrgUnitNatures.length === 0) {
      message.warning('请先通过单位性质列的 + 添加单位性质');
      return;
    }

    if (selectedUnitNatureId <= 0 || !availableOrgUnitNatures.some((item) => item.id === selectedUnitNatureId)) {
      message.warning('请先在单位性质列中选择一个单位性质');
      return;
    }

    setAddUnitName('');
    setAddUnitModalOpen(true);
  };

  const openAddDepartmentModal = () => {
    if (!selectedUnitId) {
      message.warning('请先选择单位');
      return;
    }
    setAddDepartmentName('');
    setAddDepartmentModalOpen(true);
  };

  const openAddPositionModal = () => {
    if (!selectedDepartmentId) {
      message.warning('请先选择部门');
      return;
    }
    setAddPositionName('');
    setAddPositionModalOpen(true);
  };

  const handleToggleOrgUnitNatureSelection = (unitNatureId: number, alreadyEnabled: boolean) => {
    if (alreadyEnabled) {
      return;
    }

    setSelectOrgUnitNatureIds((prev) =>
      prev.includes(unitNatureId) ? prev.filter((item) => item !== unitNatureId) : [...prev, unitNatureId],
    );
  };

  const handleSelectOrgUnitNature = async () => {
    if (selectOrgUnitNatureIds.length === 0) {
      message.error('请选择单位性质');
      return;
    }

    try {
      await api.post('/org/unit-natures/activate', { unitNatureIds: selectOrgUnitNatureIds });
      const nextSelectedId = selectOrgUnitNatureIds[0];
      setSelectedUnitNatureId(nextSelectedId);
      setSelectOrgUnitNatureModalOpen(false);
      setSelectOrgUnitNatureIds([]);
      await loadOrgStructure();
      message.success('单位性质已添加');
      logSystemAction(
        'add',
        '单位性质',
        unitNatures
          .filter((item) => selectOrgUnitNatureIds.includes(item.id))
          .map((item) => item.name)
          .join('、'),
        '已添加到单位管理和权限配置',
      );
    } catch (error: any) {
      message.error(error.response?.data?.message || '单位性质添加失败，请稍后重试');
    }
  };

  const handleAddUnitNature = async () => {
    const name = addUnitNatureName.trim();
    if (!name) {
      message.error('请输入单位性质名称');
      return;
    }

    try {
      const response = await api.post('/org/unit-natures', { name });
      const next = response.data.unitNature as OrgUnitNatureItem;
      setUnitNatures((prev) => [...prev, next]);
      setSelectedUnitNatureId(next.id);
      setAddUnitNatureName('');
      setAddUnitNatureModalOpen(false);
      message.success('单位性质已添加');
      logSystemAction('add', '单位性质', next.name);
    } catch (error: any) {
      message.error(error.response?.data?.message || '单位性质添加失败，请稍后重试');
    }
  };

  const handleAddProjectType = async () => {
    const name = addProjectTypeName.trim();
    if (!name) {
      message.error('请输入项目类型名称');
      return;
    }

    try {
      const response = await api.post('/org/project-types', { name });
      const next = response.data.projectType as ProjectTypeItem;
      setProjectTypes((prev) => [...prev, next]);
      setAddProjectTypeName('');
      setAddProjectTypeModalOpen(false);
      message.success('项目类型已添加');
      logSystemAction('add', '项目类型', next.name);
    } catch (error: any) {
      message.error(error.response?.data?.message || '项目类型添加失败，请稍后重试');
    }
  };

  const handleAddConstructionNature = async () => {
    const name = addConstructionNatureName.trim();
    if (!name) {
      message.error('请输入建设性质名称');
      return;
    }

    try {
      const response = await api.post('/org/construction-natures', { name });
      const next = response.data.constructionNature as ConstructionNatureItem;
      setConstructionNatures((prev) => [...prev, next]);
      setAddConstructionNatureName('');
      setAddConstructionNatureModalOpen(false);
      message.success('建设性质已添加');
      logSystemAction('add', '建设性质', next.name);
    } catch (error: any) {
      message.error(error.response?.data?.message || '建设性质添加失败，请稍后重试');
    }
  };

  const handleAddUnit = async () => {
    const name = addUnitName.trim();
    if (!name) {
      message.error('请输入单位名称');
      return;
    }

    if (selectedUnitNatureId <= 0 || !availableOrgUnitNatures.some((item) => item.id === selectedUnitNatureId)) {
      message.error('请先选择单位性质');
      return;
    }

    try {
      const response = await api.post('/org/units', { name, unitNatureId: selectedUnitNatureId });
      const next = response.data.unit as OrgUnitItem;
      setUnits((prev) => [...prev, next]);
      setSelectedUnitNatureId(next.unitNatureId ?? UNASSIGNED_UNIT_NATURE_ID);
      setSelectedUnitId(next.id);
      setSelectedDepartmentId(0);
      setSelectedPositionId(0);
      setAddUnitName('');
      setAddUnitModalOpen(false);
      message.success('单位已添加');
      logSystemAction('add', '单位', next.name, `单位性质：${currentUnitNatureName}`);
    } catch (error: any) {
      message.error(error.response?.data?.message || '单位添加失败，请稍后重试');
    }
  };

  const handleAddDepartment = async () => {
    const name = addDepartmentName.trim();
    if (!name) {
      message.error('请输入部门名称');
      return;
    }

    if (selectedUnitId <= 0) {
      message.error('请先选择单位');
      return;
    }

    try {
      const response = await api.post('/org/departments', { unitId: selectedUnitId, name });
      const next = response.data.department as OrgDepartmentItem;
      setDepartments((prev) => [...prev, next]);
      setSelectedDepartmentId(next.id);
      setSelectedPositionId(0);
      setAddDepartmentName('');
      setAddDepartmentModalOpen(false);
      message.success('部门已添加');
      logSystemAction('add', '部门', next.name, `所属单位：${currentUnitName}`);
    } catch (error: any) {
      message.error(error.response?.data?.message || '部门添加失败，请稍后重试');
    }
  };

  const handleAddPosition = async () => {
    const name = addPositionName.trim();
    if (!name) {
      message.error('请输入职位名称');
      return;
    }

    if (!selectedDepartmentId) {
      message.error('请先选择部门');
      return;
    }

    try {
      const response = await api.post('/org/positions', { departmentId: selectedDepartmentId, name });
      const next = response.data.position as OrgPositionItem;
      setPositions((prev) => [...prev, next]);
      setSelectedPositionId(next.id);
      setAddPositionName('');
      setAddPositionModalOpen(false);
      message.success('职位已添加');
      logSystemAction('add', '职位', next.name, `所属部门：${currentDepartmentName}`);
    } catch (error: any) {
      message.error(error.response?.data?.message || '职位添加失败，请稍后重试');
    }
  };

  const systemLogColumns = [
    {
      title: '时间戳',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (value: string) => formatLogTimestamp(value),
    },
    {
      title: '单位',
      dataIndex: 'unitName',
      key: 'unitName',
      width: 180,
      render: (value: string | null | undefined) => value || '-',
    },
    {
      title: '部门',
      dataIndex: 'departmentName',
      key: 'departmentName',
      width: 170,
      render: (value: string | null | undefined) => value || '-',
    },
    {
      title: '职位',
      dataIndex: 'positionName',
      key: 'positionName',
      width: 170,
      render: (value: string | null | undefined) => value || '-',
    },
    {
      title: '姓名',
      dataIndex: 'userName',
      key: 'userName',
      width: 120,
      render: (value: string | null | undefined) => value || '-',
    },
      {
        title: '动作',
        dataIndex: 'actionType',
        key: 'actionType',
      width: 90,
      render: (value: SystemLogItem['actionType']) => (
        <Tag color={actionTypeColorMap[value]}>{actionTypeLabelMap[value] || value}</Tag>
      ),
    },
    {
      title: '对象类型',
      dataIndex: 'targetType',
      key: 'targetType',
      width: 120,
    },
    {
      title: '对象名称',
      dataIndex: 'targetName',
      key: 'targetName',
      width: 240,
      ellipsis: true,
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      width: 320,
      ellipsis: true,
      render: (value: string | null | undefined) => value || '-',
    },
  ];

  return (
    <div className="system-settings-page-root">
      <Card className="system-settings-card" bordered={false}>
        <ResettableTabs
          initialActiveKey="platform"
          resetToken="system-settings-root"
          activeKey={activeTabKey}
          onChange={(key) => {
            setActiveTabKey(key);
          }}
        >
          <TabPane tab="平台配置" key="platform">
            <div className="system-settings-platform-root">
              <div className="system-settings-platform-grid">
                <Card
                  size="small"
                  title={
                    <span>
                      单位性质
                      <span className="system-settings-org-card__count">{`${unitNatures.length}个`}</span>
                    </span>
                  }
                  className="system-settings-org-card"
                  extra={
                    <Tooltip title="新增单位性质">
                      <Button
                        type="text"
                        size="small"
                        shape="circle"
                        icon={<PlusOutlined />}
                        aria-label="新增单位性质"
                        onClick={openAddUnitNatureModal}
                      />
                    </Tooltip>
                  }
                >
                  {unitNatures.length === 0 ? (
                    <Empty description="暂无单位性质" />
                  ) : (
                    <div className="system-settings-org-list">
                      {unitNatures.map((item) => (
                        <Dropdown
                          key={item.id}
                          {...getUnitNatureContextMenu({
                            type: 'unitNature',
                            id: item.id,
                            name: item.name,
                          })}
                        >
                          <div className="system-settings-org-list__item is-readonly">
                            <div className="system-settings-org-list__title">{item.name}</div>
                          </div>
                        </Dropdown>
                      ))}
                    </div>
                  )}
                </Card>

                <Card
                  size="small"
                  title={
                    <span>
                      项目类型
                      <span className="system-settings-org-card__count">{`${projectTypes.length}个`}</span>
                    </span>
                  }
                  className="system-settings-org-card"
                  extra={
                    <Tooltip title="新增项目类型">
                      <Button
                        type="text"
                        size="small"
                        shape="circle"
                        icon={<PlusOutlined />}
                        aria-label="新增项目类型"
                        onClick={openAddProjectTypeModal}
                      />
                    </Tooltip>
                  }
                >
                  {projectTypes.length === 0 ? (
                    <Empty description="暂无项目类型" />
                  ) : (
                    <div className="system-settings-org-list">
                      {projectTypes.map((item) => (
                        <Dropdown
                          key={item.id}
                          {...getUnitNatureContextMenu({
                            type: 'projectType',
                            id: item.id,
                            name: item.name,
                          })}
                        >
                          <div className="system-settings-org-list__item is-readonly">
                            <div className="system-settings-org-list__title">{item.name}</div>
                          </div>
                        </Dropdown>
                      ))}
                    </div>
                  )}
                </Card>

                <Card
                  size="small"
                  title={
                    <span>
                      建设性质
                      <span className="system-settings-org-card__count">{`${constructionNatures.length}个`}</span>
                    </span>
                  }
                  className="system-settings-org-card"
                  extra={
                    <Tooltip title="新增建设性质">
                      <Button
                        type="text"
                        size="small"
                        shape="circle"
                        icon={<PlusOutlined />}
                        aria-label="新增建设性质"
                        onClick={openAddConstructionNatureModal}
                      />
                    </Tooltip>
                  }
                >
                  {constructionNatures.length === 0 ? (
                    <Empty description="暂无建设性质" />
                  ) : (
                    <div className="system-settings-org-list">
                      {constructionNatures.map((item) => (
                        <Dropdown
                          key={item.id}
                          {...getUnitNatureContextMenu({
                            type: 'constructionNature',
                            id: item.id,
                            name: item.name,
                          })}
                        >
                          <div className="system-settings-org-list__item is-readonly">
                            <div className="system-settings-org-list__title">{item.name}</div>
                          </div>
                        </Dropdown>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </TabPane>

          <TabPane tab="AI配置" key="ai">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              initialValues={{
                provider: 'openai',
                temperature: 0.7,
                maxTokens: 2000,
                topP: 1,
                timeoutMs: 60000,
                maxRetries: 2,
              }}
              style={{ maxWidth: 1200, margin: '0 auto' }}
            >
              <Row gutter={24}>
                <Col xs={24} lg={12}>
                  <Form.Item
                    label="API服务商"
                    name="provider"
                    rules={[{ required: true, message: '请选择API服务商' }]}
                    extra="选择 OpenAI 或 Claude。不同服务商支持的参数略有差异。"
                  >
                    <Select
                      placeholder="请选择API服务商"
                      options={PROVIDER_OPTIONS}
                      onChange={handleProviderChange}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="模型"
                    name="model"
                    rules={[{ required: true, message: '请输入模型名称' }]}
                    extra={
                      selectedProvider === 'anthropic'
                        ? '填写模型 ID，例如 claude-3-5-sonnet-20241022。'
                        : '填写模型 ID，例如 gpt-4o。'
                    }
                  >
                    <Input placeholder="请输入模型名称" />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="API Key"
                    name="apiKey"
                    rules={[{ required: true, message: '请输入API Key' }]}
                    extra={
                      selectedProvider === 'anthropic'
                        ? '用于服务端调用 Claude。常见以 sk-ant- 开头。'
                        : '用于服务端调用 OpenAI。常见以 sk- 或 sk-proj- 开头。'
                    }
                  >
                    <Input.Password placeholder="请输入API Key" />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="API Base URL（可选）"
                    name="baseUrl"
                    extra={
                      selectedProvider === 'anthropic'
                        ? '留空使用官方默认：https://api.anthropic.com。'
                        : '留空使用官方默认：https://api.openai.com/v1（OpenAI 兼容网关通常以 /v1 结尾）。'
                    }
                  >
                    <Input placeholder={baseUrlPlaceholder} />
                  </Form.Item>
                </Col>

                {selectedProvider === 'openai' && (
                  <>
                    <Col xs={24} lg={12}>
                      <Form.Item
                        label="OpenAI Organization（可选）"
                        name="openaiOrganization"
                        preserve={false}
                        extra="仅在账号需要指定 Organization 时填写，例如 org_xxx。"
                      >
                        <Input placeholder="例如: org_..." />
                      </Form.Item>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Form.Item
                        label="OpenAI Project（可选）"
                        name="openaiProject"
                        preserve={false}
                        extra="仅在需要指定 Project 归属/计费时填写，例如 proj_xxx。"
                      >
                        <Input placeholder="例如: proj_..." />
                      </Form.Item>
                    </Col>
                  </>
                )}

                {selectedProvider === 'anthropic' && (
                  <>
                    <Col xs={24} lg={12}>
                      <Form.Item
                        label="Anthropic-Version（可选）"
                        name="anthropicVersion"
                        preserve={false}
                        extra="HTTP Header：anthropic-version。留空则使用 SDK 默认版本。"
                      >
                        <Input placeholder="例如: 2023-06-01" />
                      </Form.Item>
                    </Col>

                    <Col xs={24} lg={12}>
                      <Form.Item
                        label="Top K（可选）"
                        name="topK"
                        preserve={false}
                        extra="仅 Claude 支持。留空使用默认；一般无需配置。"
                      >
                        <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="例如: 40" />
                      </Form.Item>
                    </Col>
                  </>
                )}

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="Temperature（可选）"
                    name="temperature"
                    extra="采样温度，越大越发散。常用 0 到 1。"
                  >
                    <InputNumber
                      min={0}
                      max={2}
                      step={0.1}
                      precision={2}
                      style={{ width: '100%' }}
                      placeholder="0.7"
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="Top P（可选）"
                    name="topP"
                    extra="核采样参数。1 表示不限制；一般只需和 Temperature 二选一微调。"
                  >
                    <InputNumber
                      min={0}
                      max={1}
                      step={0.01}
                      precision={3}
                      style={{ width: '100%' }}
                      placeholder="1"
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="Max Tokens（可选）"
                    name="maxTokens"
                    extra="限制单次回复最大 token 数，过大可能增加费用/延迟。"
                  >
                    <InputNumber min={1} step={100} style={{ width: '100%' }} placeholder="2000" />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="Timeout (ms)（可选）"
                    name="timeoutMs"
                    extra="单次请求超时（毫秒）。网络较慢时可适当调大。"
                  >
                    <InputNumber min={1} step={1000} style={{ width: '100%' }} placeholder="60000" />
                  </Form.Item>
                </Col>

                <Col xs={24} lg={12}>
                  <Form.Item
                    label="Max Retries（可选）"
                    name="maxRetries"
                    extra="请求失败时自动重试次数（网络错误/5xx 等）。"
                  >
                    <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="2" />
                  </Form.Item>
                </Col>

                <Col span={24}>
                  <Form.Item>
                    <Space>
                      <Button
                        type="primary"
                        htmlType="submit"
                        icon={<SaveOutlined />}
                        loading={saveLoading}
                      >
                        保存配置
                      </Button>
                      <Button onClick={() => form.resetFields()}>
                        重置
                      </Button>
                    </Space>
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </TabPane>

          <TabPane tab="单位管理和权限配置" key="org">
            <div className="system-settings-org-root">
              <div className="system-settings-org-grid">
                <div className="system-settings-org-col">
                  <Card
                    size="small"
                    title={
                      <span>
                        单位性质
                        <span className="system-settings-org-card__count">{`${displayedUnitNatures.length}个`}</span>
                      </span>
                    }
                    className="system-settings-org-card"
                    extra={
                      <Tooltip title="选择单位性质">
                        <Button
                          type="text"
                          size="small"
                          shape="circle"
                          icon={<PlusOutlined />}
                          aria-label="选择单位性质"
                          onClick={openSelectOrgUnitNatureModal}
                        />
                      </Tooltip>
                    }
                  >
                    <div className="system-settings-org-list">
                      {displayedUnitNatures.map((item) => {
                        const content = (
                          <div
                            className={`system-settings-org-list__item ${
                              item.id === selectedUnitNatureId ? 'is-active' : ''
                            }`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedUnitNatureId(item.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                setSelectedUnitNatureId(item.id);
                              }
                            }}
                          >
                            <div className="system-settings-org-list__title">{item.name}</div>
                          </div>
                        );

                        if (item.id === UNASSIGNED_UNIT_NATURE_ID) {
                          return <div key={item.id}>{content}</div>;
                        }

                        return (
                          <Dropdown
                            key={item.id}
                            {...getOrgUnitNatureContextMenuProps({
                              type: 'unitNature',
                              id: item.id,
                              name: item.name,
                              scope: 'org',
                            })}
                          >
                            {content}
                          </Dropdown>
                        );
                      })}
                    </div>
                  </Card>
                </div>

                <div className="system-settings-org-col">
                  <Card
                    size="small"
                    title={
                      <span>
                        单位
                        <span className="system-settings-org-card__count">{`${currentUnits.length}个`}</span>
                      </span>
                    }
                    className="system-settings-org-card"
                    extra={
                      <Tooltip title="新增单位">
                        <Button
                          type="text"
                          size="small"
                          shape="circle"
                          icon={<PlusOutlined />}
                          aria-label="新增单位"
                          onClick={openAddUnitModal}
                        />
                      </Tooltip>
                    }
                  >
                    {currentUnits.length === 0 ? (
                      <Empty description="暂无单位" />
                    ) : (
                      <div className="system-settings-org-list">
                        {currentUnits.map((item) => {
                          const unitNode = (
                            <div
                              className={`system-settings-org-list__item ${
                                item.id === selectedUnitId ? 'is-active' : ''
                              }`}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedUnitId(item.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  setSelectedUnitId(item.id);
                                }
                              }}
                            >
                              <div className="system-settings-org-list__title">{item.name}</div>
                            </div>
                          );

                          return (
                            <Dropdown
                              key={item.id}
                              {...getUnitContextMenuProps({
                                type: 'unit',
                                id: item.id,
                                name: item.name,
                              })}
                            >
                              {unitNode}
                            </Dropdown>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </div>

                <div className="system-settings-org-col">
                  <Card
                    size="small"
                    title={
                      <span>
                        部门
                        <span className="system-settings-org-card__count">{`${currentDepartments.length}个`}</span>
                      </span>
                    }
                    className="system-settings-org-card"
                    extra={
                      <Tooltip title="新增部门">
                        <span>
                          <Button
                            type="text"
                            size="small"
                            shape="circle"
                            icon={<PlusOutlined />}
                            aria-label="新增部门"
                            onClick={openAddDepartmentModal}
                            disabled={!selectedUnitId}
                          />
                        </span>
                      </Tooltip>
                    }
                  >
                    {currentDepartments.length === 0 ? (
                      <Empty description="暂无部门" />
                    ) : (
                      <div className="system-settings-org-list">
                        {currentDepartments.map((item) => (
                          <Dropdown
                            key={item.id}
                            {...getDepartmentContextMenuProps({
                              type: 'department',
                              id: item.id,
                              name: item.name,
                            })}
                          >
                            <div
                              className={`system-settings-org-list__item ${
                                item.id === selectedDepartmentId ? 'is-active' : ''
                              }`}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedDepartmentId(item.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  setSelectedDepartmentId(item.id);
                                }
                              }}
                            >
                              <div className="system-settings-org-list__title">{item.name}</div>
                            </div>
                          </Dropdown>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

                <div className="system-settings-org-col">
                  <Card
                    size="small"
                    title={
                      <span>
                        职位
                        <span className="system-settings-org-card__count">{`${currentPositions.length}个`}</span>
                      </span>
                    }
                    className="system-settings-org-card"
                    extra={
                      <Tooltip title="新增职位">
                        <span>
                          <Button
                            type="text"
                            size="small"
                            shape="circle"
                            icon={<PlusOutlined />}
                            aria-label="新增职位"
                            onClick={openAddPositionModal}
                            disabled={!selectedDepartmentId}
                          />
                        </span>
                      </Tooltip>
                    }
                  >
                    {currentPositions.length === 0 ? (
                      <Empty description="暂无职位" />
                    ) : (
                      <div className="system-settings-org-list">
                        {currentPositions.map((item) => (
                          <Dropdown
                            key={item.id}
                            {...getPositionContextMenuProps({
                              type: 'position',
                              id: item.id,
                              name: item.name,
                            })}
                          >
                            <div
                              className={`system-settings-org-list__item ${
                                item.id === selectedPositionId ? 'is-active' : ''
                              }`}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedPositionId(item.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  setSelectedPositionId(item.id);
                                }
                              }}
                            >
                              <div className="system-settings-org-list__title">{item.name}</div>
                            </div>
                          </Dropdown>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

                <div className="system-settings-org-col">
                  <Card
                    size="small"
                    title={
                      <span>
                        人员
                        <span className="system-settings-org-card__count">{`${currentPeople.length}人`}</span>
                      </span>
                    }
                    className="system-settings-org-card"
                  >
                    {currentPeople.length === 0 ? (
                      <Empty description="暂无人员" />
                    ) : (
                      <div className="system-settings-org-list">
                        {currentPeople.map((item) => (
                          <Dropdown
                            key={item.id}
                            {...getPersonContextMenuProps({
                              id: item.id,
                              name: item.name,
                              positionId: item.positionId,
                              isSystemAdmin: item.isSystemAdmin,
                            })}
                          >
                            <div className="system-settings-org-list__item is-readonly">
                              <div className="system-settings-org-list__title">{item.name}</div>
                              {item.isSystemAdmin ? (
                                <div className="system-settings-org-list__sub">系统管理员</div>
                              ) : null}
                            </div>
                          </Dropdown>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            </div>

          </TabPane>

          <TabPane tab="系统日志" key="logs">
            <div className="system-settings-platform-root">
              <Card
                size="small"
                title={
                  <span>
                    系统日志
                    <span className="system-settings-org-card__count">{`${systemLogs.length}条`}</span>
                  </span>
                }
                className="system-settings-org-card"
              >
                <Table<SystemLogItem>
                  rowKey="id"
                  loading={systemLogsLoading}
                  columns={systemLogColumns}
                  dataSource={systemLogs}
                  pagination={{ pageSize: 20, showSizeChanger: false }}
                  scroll={{ x: 1600 }}
                  locale={{ emptyText: '暂无系统日志' }}
                />
              </Card>
            </div>
          </TabPane>

        </ResettableTabs>
        <Modal
          title={unitProjectTarget ? `项目分配：${unitProjectTarget.name}` : '项目分配'}
          open={Boolean(unitProjectTarget)}
          centered
          width="min(1200px, 92vw)"
          okText="保存"
          cancelText="取消"
          onOk={() => void handleSaveUnitProjectAssignments()}
          onCancel={closeUnitProjectModal}
          confirmLoading={unitProjectSubmitting}
        >
          {unitProjectLoading ? (
            <div className="system-settings-selection-loading">加载中...</div>
          ) : projects.length === 0 ? (
            <Empty description="暂无项目" />
          ) : (
            <>
              <div className="system-settings-selection-grid">
                {projects.map((item) => {
                  const selected = unitProjectIds.includes(item.id);
                  const meta = [item.projectTypeName, item.constructionNatureName, item.manager]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <div
                      key={item.id}
                      className={`system-settings-selection-card ${selected ? 'is-selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setUnitProjectIds((prev) =>
                          prev.includes(item.id) ? prev.filter((projectId) => projectId !== item.id) : [...prev, item.id],
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setUnitProjectIds((prev) =>
                            prev.includes(item.id)
                              ? prev.filter((projectId) => projectId !== item.id)
                              : [...prev, item.id],
                          );
                        }
                      }}
                    >
                      <div className="system-settings-selection-card__title">{item.name}</div>
                      <div className="system-settings-selection-card__meta">{meta || '点击选择项目'}</div>
                    </div>
                  );
                })}
              </div>
              <div className="system-settings-modal-hint">单位只能查看已分配的项目。</div>
            </>
          )}
        </Modal>
        <Modal
          title={departmentBusinessTarget ? `业务范围：${departmentBusinessTarget.name}` : '业务范围'}
          open={Boolean(departmentBusinessTarget)}
          centered
          width="min(960px, 92vw)"
          okText="保存"
          cancelText="取消"
          onOk={() => void handleSaveDepartmentBusinessDomains()}
          onCancel={closeDepartmentBusinessModal}
          confirmLoading={departmentBusinessSubmitting}
        >
          {departmentBusinessLoading ? (
            <div className="system-settings-selection-loading">加载中...</div>
          ) : businessDomains.length === 0 ? (
            <Empty description="暂无业务范围" />
          ) : (
            <>
              <div className="system-settings-selection-grid is-compact">
                {businessDomains.map((item) => {
                  const selected = departmentBusinessDomainIds.includes(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`system-settings-selection-card ${selected ? 'is-selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setDepartmentBusinessDomainIds((prev) =>
                          prev.includes(item.id) ? prev.filter((domainId) => domainId !== item.id) : [...prev, item.id],
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setDepartmentBusinessDomainIds((prev) =>
                            prev.includes(item.id)
                              ? prev.filter((domainId) => domainId !== item.id)
                              : [...prev, item.id],
                          );
                        }
                      }}
                    >
                      <div className="system-settings-selection-card__title">{item.name}</div>
                      <div className="system-settings-selection-card__meta">{item.code}</div>
                    </div>
                  );
                })}
              </div>
              <div className="system-settings-modal-hint">部门只负责定义可开展的业务范围。</div>
            </>
          )}
        </Modal>
        <Modal
          title={positionBusinessTarget ? `业务权限：${positionBusinessTarget.name}` : '业务权限'}
          open={Boolean(positionBusinessTarget)}
          centered
          width="min(1080px, 92vw)"
          okText="保存"
          cancelText="取消"
          onOk={() => void handleSavePositionBusinessPermissions()}
          onCancel={closePositionBusinessModal}
          confirmLoading={positionBusinessSubmitting}
        >
          {positionBusinessLoading ? (
            <div className="system-settings-selection-loading">加载中...</div>
          ) : positionBusinessPermissions.length === 0 ? (
            <Empty description="请先在所属部门中配置业务范围" />
          ) : (
            <>
              <div className="system-settings-permission-list">
                {positionBusinessPermissions.map((item) => (
                  <div key={item.businessDomainId} className="system-settings-permission-card">
                    <div className="system-settings-permission-card__header">
                      <div className="system-settings-permission-card__title">{item.name}</div>
                      <div className="system-settings-permission-card__meta">{item.code}</div>
                    </div>
                    <div className="system-settings-permission-switches">
                      {[
                        { key: 'canView', label: '查看' },
                        { key: 'canCreate', label: '新增' },
                        { key: 'canEdit', label: '编辑' },
                        { key: 'canDelete', label: '删除' },
                        { key: 'canUpload', label: '上传' },
                      ].map((field) => (
                        <div key={field.key} className="system-settings-permission-switches__item">
                          <span>{field.label}</span>
                          <Switch
                            checked={item[field.key as keyof PositionBusinessPermissionItem] as boolean}
                            onChange={(checked) =>
                              handlePositionPermissionChange(
                                item.businessDomainId,
                                field.key as 'canView' | 'canCreate' | 'canEdit' | 'canDelete' | 'canUpload',
                                checked,
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="system-settings-modal-hint">职位权限只在所属部门已开放的业务范围内生效。</div>
            </>
          )}
        </Modal>
        <Modal
          title={systemAdminTarget ? `系统管理员：${systemAdminTarget.name}` : '系统管理员'}
          open={Boolean(systemAdminTarget)}
          centered
          okText="保存"
          cancelText="取消"
          onOk={() => void handleSaveSystemAdmin()}
          onCancel={closeSystemAdminModal}
          confirmLoading={systemAdminSubmitting}
        >
          <Form layout="vertical">
            <div className="system-settings-modal-path">
              系统管理员拥有全部业务权限，以及平台配置、系统配置、系统日志等系统级权限。
            </div>
            <Form.Item label="系统管理员">
              <Switch checked={systemAdminValue} onChange={setSystemAdminValue} />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          title="新增单位"
          open={addUnitModalOpen}
          centered
          okText="保存"
          cancelText="取消"
          onOk={handleAddUnit}
          onCancel={() => setAddUnitModalOpen(false)}
          okButtonProps={{ disabled: !addUnitName.trim() }}
        >
          <Form layout="vertical">
            <Form.Item label="单位名称" required>
              <Input
                value={addUnitName}
                placeholder="请输入单位名称"
                onChange={(event) => setAddUnitName(event.target.value)}
                onPressEnter={handleAddUnit}
              />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          title="新增部门"
          open={addDepartmentModalOpen}
          centered
          okText="保存"
          cancelText="取消"
          onOk={handleAddDepartment}
          onCancel={() => setAddDepartmentModalOpen(false)}
          okButtonProps={{ disabled: !addDepartmentName.trim() }}
        >
          <Form layout="vertical">
            <div className="system-settings-modal-path">
              当前挂载路径：{currentUnitNatureName} / {currentUnitName}
            </div>
            <Form.Item label="部门名称" required>
              <Input
                autoFocus
                value={addDepartmentName}
                placeholder="请输入部门名称"
                onChange={(event) => setAddDepartmentName(event.target.value)}
                onPressEnter={handleAddDepartment}
              />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          title="新增职位"
          open={addPositionModalOpen}
          centered
          okText="保存"
          cancelText="取消"
          onOk={handleAddPosition}
          onCancel={() => setAddPositionModalOpen(false)}
          okButtonProps={{ disabled: !addPositionName.trim() }}
        >
          <Form layout="vertical">
            <div className="system-settings-modal-path">
              当前挂载路径：{currentUnitNatureName} / {currentUnitName} / {currentDepartmentName}
            </div>
            <Form.Item label="职位名称" required>
              <Input
                autoFocus
                value={addPositionName}
                placeholder="请输入职位名称"
                onChange={(event) => setAddPositionName(event.target.value)}
                onPressEnter={handleAddPosition}
              />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          title={moveTarget ? `移动人员：${moveTarget.name}` : '移动人员'}
          open={Boolean(moveTarget)}
          centered
          width="min(1200px, 92vw)"
          okText="确定"
          cancelText="取消"
          onOk={() => void handleMovePerson()}
          onCancel={closeMoveModal}
          confirmLoading={moveSubmitting}
          okButtonProps={{ disabled: !moveUnitId || !moveDepartmentId || !movePositionId }}
        >
          <div className="system-settings-move-grid">
            <div className="system-settings-move-col">
              <div className="system-settings-move-col__title">单位</div>
              {units.length === 0 ? (
                <Empty description="暂无单位" />
              ) : (
                <div className="system-settings-org-list">
                  {units.map((item) => (
                    <div
                      key={item.id}
                      className={`system-settings-org-list__item ${
                        item.id === moveUnitId ? 'is-active' : ''
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setMoveUnitId(item.id);
                        setMoveDepartmentId(0);
                        setMovePositionId(0);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setMoveUnitId(item.id);
                          setMoveDepartmentId(0);
                          setMovePositionId(0);
                        }
                      }}
                    >
                      <div className="system-settings-org-list__title">{item.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="system-settings-move-col">
              <div className="system-settings-move-col__title">部门</div>
              {moveDepartments.length === 0 ? (
                <Empty description="请选择单位" />
              ) : (
                <div className="system-settings-org-list">
                  {moveDepartments.map((item) => (
                    <div
                      key={item.id}
                      className={`system-settings-org-list__item ${
                        item.id === moveDepartmentId ? 'is-active' : ''
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setMoveDepartmentId(item.id);
                        setMovePositionId(0);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setMoveDepartmentId(item.id);
                          setMovePositionId(0);
                        }
                      }}
                    >
                      <div className="system-settings-org-list__title">{item.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="system-settings-move-col">
              <div className="system-settings-move-col__title">职位</div>
              {movePositions.length === 0 ? (
                <Empty description="请选择部门" />
              ) : (
                <div className="system-settings-org-list">
                  {movePositions.map((item) => (
                    <div
                      key={item.id}
                      className={`system-settings-org-list__item ${
                        item.id === movePositionId ? 'is-active' : ''
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setMovePositionId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setMovePositionId(item.id);
                        }
                      }}
                    >
                      <div className="system-settings-org-list__title">{item.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
        <Modal
          title={renameTarget ? `重命名${orgTypeLabelMap[renameTarget.type]}` : '重命名'}
          open={Boolean(renameTarget)}
          centered
          okText="保存"
          cancelText="取消"
          onOk={() => void handleRename()}
          onCancel={closeRenameModal}
          confirmLoading={renameSubmitting}
          okButtonProps={{ disabled: !renameValue.trim() }}
        >
          <Form layout="vertical">
            <Form.Item label={renameTarget ? `${orgTypeLabelMap[renameTarget.type]}名称` : '名称'} required>
              <Input
                autoFocus
                value={renameValue}
                placeholder={renameTarget ? `请输入${orgTypeLabelMap[renameTarget.type]}名称` : '请输入名称'}
                onChange={(event) => setRenameValue(event.target.value)}
                onPressEnter={() => void handleRename()}
              />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          title="新增单位性质"
          open={addUnitNatureModalOpen}
          centered
          okText="保存"
          cancelText="取消"
          onOk={handleAddUnitNature}
          onCancel={() => setAddUnitNatureModalOpen(false)}
          okButtonProps={{ disabled: !addUnitNatureName.trim() }}
        >
          <Form layout="vertical">
            <Form.Item label="单位性质名称" required>
              <Input
                autoFocus
                value={addUnitNatureName}
                placeholder="请输入单位性质名称"
                onChange={(event) => setAddUnitNatureName(event.target.value)}
                onPressEnter={handleAddUnitNature}
              />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          title="新增项目类型"
          open={addProjectTypeModalOpen}
          centered
          okText="保存"
          cancelText="取消"
          onOk={handleAddProjectType}
          onCancel={() => setAddProjectTypeModalOpen(false)}
          okButtonProps={{ disabled: !addProjectTypeName.trim() }}
        >
          <Form layout="vertical">
            <Form.Item label="项目类型名称" required>
              <Input
                autoFocus
                value={addProjectTypeName}
                placeholder="请输入项目类型名称"
                onChange={(event) => setAddProjectTypeName(event.target.value)}
                onPressEnter={handleAddProjectType}
              />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          title="新增建设性质"
          open={addConstructionNatureModalOpen}
          centered
          okText="保存"
          cancelText="取消"
          onOk={handleAddConstructionNature}
          onCancel={() => setAddConstructionNatureModalOpen(false)}
          okButtonProps={{ disabled: !addConstructionNatureName.trim() }}
        >
          <Form layout="vertical">
            <Form.Item label="建设性质名称" required>
              <Input
                autoFocus
                value={addConstructionNatureName}
                placeholder="请输入建设性质名称"
                onChange={(event) => setAddConstructionNatureName(event.target.value)}
                onPressEnter={handleAddConstructionNature}
              />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          title="选择单位性质"
          open={selectOrgUnitNatureModalOpen}
          centered
          width="min(1440px, 92vw)"
          className="system-settings-unit-nature-picker-modal"
          okText="确定"
          cancelText="取消"
          onOk={handleSelectOrgUnitNature}
          onCancel={() => {
            setSelectOrgUnitNatureModalOpen(false);
            setSelectOrgUnitNatureIds([]);
          }}
          okButtonProps={{ disabled: selectOrgUnitNatureIds.length === 0 }}
        >
          {unitNatures.length === 0 ? (
            <Empty description="暂无单位性质" />
          ) : (
            <div className="system-settings-unit-nature-picker">
              {unitNatures.map((item) => {
                const alreadyEnabled = item.orgEnabled === true;
                const selected = selectOrgUnitNatureIds.includes(item.id);

                return (
                  <div
                    key={item.id}
                    className={`system-settings-unit-nature-picker__item ${
                      selected ? 'is-selected' : ''
                    } ${alreadyEnabled ? 'is-disabled' : ''}`}
                    role="button"
                    tabIndex={alreadyEnabled ? -1 : 0}
                    onClick={() => handleToggleOrgUnitNatureSelection(item.id, alreadyEnabled)}
                    onKeyDown={(event) => {
                      if (alreadyEnabled) {
                        return;
                      }

                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleToggleOrgUnitNatureSelection(item.id, alreadyEnabled);
                      }
                    }}
                  >
                    <div className="system-settings-unit-nature-picker__title">{item.name}</div>
                    <div className="system-settings-unit-nature-picker__meta">
                      {alreadyEnabled ? '已添加' : selected ? '已选择' : '点击选择'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      </Card>
    </div>
  );
}

