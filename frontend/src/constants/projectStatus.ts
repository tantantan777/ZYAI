export const PROJECT_STATUS_OPTIONS = [
  '前期规划阶段',
  '项目立项阶段',
  '可研阶段',
  '项目批复阶段',
  '勘察设计阶段',
  '施工图审查阶段',
  '招投标阶段',
  '报检阶段',
  '开工准备阶段',
  '在建阶段',
  '停工阶段',
  '复工阶段',
  '竣工阶段',
  '专项验收阶段',
  '竣工备案阶段',
  '完工交付阶段',
  '项目取消/终止阶段',
  '项目转让移交阶段',
  '竣工结算审计阶段',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_OPTIONS)[number];
