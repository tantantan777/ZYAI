import { useEffect, useMemo, useState } from 'react';
import { Card, Tabs, Form, Input, Select, Button, Space, InputNumber, Row, Col, Empty, Modal, Tooltip, Dropdown, Switch } from 'antd';
import type { MenuProps } from 'antd';
import { SaveOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../utils/api';
import { openActionConfirmDialog, openDeleteDialog } from '../utils/confirm';
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

interface VisibilitySettings {
  dashboardVisible: boolean;
  aiChatVisible: boolean;
  projectsVisible: boolean;
  userQueryVisible: boolean;
  systemSettingsVisible: boolean;
}

const defaultVisibilitySettings: VisibilitySettings = {
  dashboardVisible: true,
  aiChatVisible: true,
  projectsVisible: true,
  userQueryVisible: true,
  systemSettingsVisible: true,
};

const permissionFieldOptions: Array<{ key: keyof VisibilitySettings; label: string }> = [
  { key: 'dashboardVisible', label: '工作台权限' },
  { key: 'aiChatVisible', label: 'AI对话页面权限' },
  { key: 'projectsVisible', label: '项目管理页面权限' },
  { key: 'userQueryVisible', label: '用户查询页面权限' },
  { key: 'systemSettingsVisible', label: '系统配置页权限' },
];

function normalizeVisibilitySettings(settings?: Partial<VisibilitySettings>): VisibilitySettings {
  return {
    dashboardVisible: settings?.dashboardVisible !== false,
    aiChatVisible: settings?.aiChatVisible !== false,
    projectsVisible: settings?.projectsVisible !== false,
    userQueryVisible: settings?.userQueryVisible !== false,
    systemSettingsVisible: settings?.systemSettingsVisible !== false,
  };
}

interface OrgUnitItem extends VisibilitySettings {
  id: number;
  unitNatureId: number | null;
  name: string;
}

interface OrgUnitNatureItem {
  id: number;
  name: string;
  orgEnabled?: boolean;
}

interface OrgDepartmentItem extends VisibilitySettings {
  id: number;
  unitId: number;
  name: string;
}

interface OrgPositionItem extends VisibilitySettings {
  id: number;
  departmentId: number;
  name: string;
}

interface OrgPersonItem extends VisibilitySettings {
  id: number;
  positionId: number | null;
  name: string;
  email?: string;
  phone?: string;
}

type OrgContextType = 'unitNature' | 'unit' | 'department' | 'position' | 'person';
type PermissionContextType = Exclude<OrgContextType, 'unitNature'>;

type RenameTarget = {
  type: OrgContextType;
  id: number;
  name: string;
  positionId?: number | null;
} & Partial<VisibilitySettings>;

type PermissionTarget = {
  type: PermissionContextType;
  id: number;
  name: string;
  positionId?: number | null;
} & Partial<VisibilitySettings>;

type MovePersonTarget = {
  id: number;
  name: string;
  positionId: number | null;
};

export default function SystemSettings() {
  const [form] = Form.useForm<AIConfigForm>();
  const [saveLoading, setSaveLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('openai');
  const [activeTabKey, setActiveTabKey] = useState('ai');

  const [unitNatures, setUnitNatures] = useState<OrgUnitNatureItem[]>([]);
  const [units, setUnits] = useState<OrgUnitItem[]>([]);
  const [departments, setDepartments] = useState<OrgDepartmentItem[]>([]);
  const [positions, setPositions] = useState<OrgPositionItem[]>([]);
  const [people, setPeople] = useState<OrgPersonItem[]>([]);

  const [selectedUnitNatureId, setSelectedUnitNatureId] = useState<number>(UNASSIGNED_UNIT_NATURE_ID);
  const [selectedUnitId, setSelectedUnitId] = useState<number>(0);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number>(0);
  const [selectedPositionId, setSelectedPositionId] = useState<number>(0);

  const [addUnitNatureModalOpen, setAddUnitNatureModalOpen] = useState(false);
  const [selectOrgUnitNatureModalOpen, setSelectOrgUnitNatureModalOpen] = useState(false);
  const [addUnitModalOpen, setAddUnitModalOpen] = useState(false);
  const [addDepartmentModalOpen, setAddDepartmentModalOpen] = useState(false);
  const [addPositionModalOpen, setAddPositionModalOpen] = useState(false);
  const [addUnitNatureName, setAddUnitNatureName] = useState('');
  const [selectOrgUnitNatureIds, setSelectOrgUnitNatureIds] = useState<number[]>([]);
  const [addUnitName, setAddUnitName] = useState('');
  const [addDepartmentName, setAddDepartmentName] = useState('');
  const [addPositionName, setAddPositionName] = useState('');
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [permissionTarget, setPermissionTarget] = useState<PermissionTarget | null>(null);
  const [permissionValues, setPermissionValues] = useState<VisibilitySettings>(defaultVisibilitySettings);
  const [permissionSubmitting, setPermissionSubmitting] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MovePersonTarget | null>(null);
  const [moveUnitId, setMoveUnitId] = useState<number>(0);
  const [moveDepartmentId, setMoveDepartmentId] = useState<number>(0);
  const [movePositionId, setMovePositionId] = useState<number>(0);
  const [moveSubmitting, setMoveSubmitting] = useState(false);

  const getContextMenuWithPermissionProps = (
    target: PermissionTarget,
  ): { menu: MenuProps; trigger: ['contextMenu'] } => ({
    trigger: ['contextMenu'],
    menu: {
      items: [
        { key: 'rename', label: '\u91cd\u547d\u540d' },
        { key: 'permission', label: '\u6743\u9650' },
        { key: 'delete', label: '\u5220\u9664', danger: true },
      ],
      onClick: ({ key }) => {
        if (key === 'rename') {
          openRenameModal(target);
          return;
        }

        if (key === 'permission') {
          openPermissionModal(target);
          return;
        }

        if (key === 'delete') {
          handleDelete(target);
        }
      },
    },
  });

  const getPersonContextMenuWithPermissionProps = (
    target: PermissionTarget,
  ): { menu: MenuProps; trigger: ['contextMenu'] } => ({
    trigger: ['contextMenu'],
    menu: {
      items: [
        { key: 'move', label: '移动' },
        { key: 'permission', label: '\u6743\u9650' },
        ...(target.positionId
          ? [{ key: 'delete', label: '\u5220\u9664', danger: true }]
          : []),
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

        if (key === 'permission') {
          openPermissionModal(target);
          return;
        }

        if (key === 'delete') {
          handleDelete(target);
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

  useEffect(() => {
    void loadAIConfig();
    void loadOrgStructure();
  }, []);

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
      const nextUnits = (response.data.units ?? []) as OrgUnitItem[];
      const nextDepartments = (response.data.departments ?? []) as OrgDepartmentItem[];
      const nextPositions = (response.data.positions ?? []) as OrgPositionItem[];

      setUnitNatures(nextUnitNatures);
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
    unit: '单位',
    department: '部门',
    position: '职位',
    person: '人员',
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

  const openPermissionModal = (target: PermissionTarget) => {
    setPermissionTarget(target);
    setPermissionValues(normalizeVisibilitySettings(target));
    setPermissionSubmitting(false);
  };

  const closePermissionModal = () => {
    setPermissionTarget(null);
    setPermissionValues(defaultVisibilitySettings);
    setPermissionSubmitting(false);
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

  const applyPermissionUpdate = (target: PermissionTarget, nextVisibility: VisibilitySettings) => {
    if (target.type === 'unit') {
      setUnits((prev) =>
        prev.map((item) =>
          item.id === target.id
            ? {
                ...item,
                ...nextVisibility,
              }
            : item,
        ),
      );
      return;
    }

    if (target.type === 'department') {
      setDepartments((prev) =>
        prev.map((item) =>
          item.id === target.id
            ? {
                ...item,
                ...nextVisibility,
              }
            : item,
        ),
      );
      return;
    }

    if (target.type === 'position') {
      setPositions((prev) =>
        prev.map((item) =>
          item.id === target.id
            ? {
                ...item,
                ...nextVisibility,
              }
            : item,
        ),
      );
      return;
    }

    setPeople((prev) =>
      prev.map((item) =>
        item.id === target.id
          ? {
              ...item,
              ...nextVisibility,
            }
          : item,
      ),
    );
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
      closeRenameModal();
    } catch (error: any) {
      message.error(error.response?.data?.message || `${orgTypeLabelMap[renameTarget.type]}重命名失败，请稍后重试`);
      setRenameSubmitting(false);
    }
  };

  const handleSavePermission = async () => {
    if (!permissionTarget) {
      return;
    }

    setPermissionSubmitting(true);
    try {
      await api.put(`/org/permissions/${permissionTarget.type}/${permissionTarget.id}`, permissionValues);

      applyPermissionUpdate(permissionTarget, permissionValues);
      message.success(`${orgTypeLabelMap[permissionTarget.type]}权限已更新`);
      closePermissionModal();
    } catch (error: any) {
      message.error(error.response?.data?.message || `${orgTypeLabelMap[permissionTarget.type]}权限更新失败，请稍后重试`);
      setPermissionSubmitting(false);
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
          await api.delete(`/org/unit-natures/${target.id}`);
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
        content: '删除后会同时删除该单位性质下的单位、部门、职位，并清空相关人员的组织信息。是否继续？',
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

  const getContextMenuProps = (target: PermissionTarget): { menu: MenuProps; trigger: ['contextMenu'] } =>
    getContextMenuWithPermissionProps(target);

  const getPersonContextMenuProps = (target: PermissionTarget): { menu: MenuProps; trigger: ['contextMenu'] } =>
    getPersonContextMenuWithPermissionProps(target);

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
    } catch (error: any) {
      message.error(error.response?.data?.message || '单位性质添加失败，请稍后重试');
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
    } catch (error: any) {
      message.error(error.response?.data?.message || '职位添加失败，请稍后重试');
    }
  };

  return (
    <div className="system-settings-page-root">
      <Card className="system-settings-card" bordered={false}>
        <Tabs
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
            <Modal
              title={permissionTarget ? `${orgTypeLabelMap[permissionTarget.type]}权限` : '权限'}
              open={Boolean(permissionTarget)}
              centered
              okText="保存"
              cancelText="取消"
              onOk={() => void handleSavePermission()}
              onCancel={closePermissionModal}
              confirmLoading={permissionSubmitting}
            >
              <Form layout="vertical">
                {permissionFieldOptions.map((item) => (
                  <Form.Item key={item.key} label={item.label}>
                    <Switch
                      checked={permissionValues[item.key]}
                      onChange={(checked) =>
                        setPermissionValues((prev) => ({
                          ...prev,
                          [item.key]: checked,
                        }))
                      }
                    />
                  </Form.Item>
                ))}
                <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 12 }}>
                  关闭后，此{permissionTarget ? orgTypeLabelMap[permissionTarget.type] : '对象'}仍可看到页面或菜单，但点击后会提示无权限。
                </div>
              </Form>
            </Modal>
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
                        return (
                          <div
                            key={item.id}
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
                              {...getContextMenuProps({
                                type: 'unit',
                                id: item.id,
                                name: item.name,
                                ...normalizeVisibilitySettings(item),
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
                            {...getContextMenuProps({
                              type: 'department',
                              id: item.id,
                              name: item.name,
                              ...normalizeVisibilitySettings(item),
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
                            {...getContextMenuProps({
                              type: 'position',
                              id: item.id,
                              name: item.name,
                              ...normalizeVisibilitySettings(item),
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
                              type: 'person',
                              id: item.id,
                              name: item.name,
                              positionId: item.positionId,
                              ...normalizeVisibilitySettings(item),
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
            </div>

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
          </TabPane>

        </Tabs>
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

