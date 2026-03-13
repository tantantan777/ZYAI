import { Modal } from 'antd';
import type { ModalFuncProps } from 'antd';

type ConfirmDialogOptions = Omit<ModalFuncProps, 'centered' | 'okText' | 'cancelText'> & {
  centered?: boolean;
  okText?: string;
  cancelText?: string;
};

type DeleteDialogOptions = Omit<ConfirmDialogOptions, 'title' | 'content' | 'okText'> & {
  entityLabel: string;
  entityName?: string;
  content?: ModalFuncProps['content'];
  okText?: string;
};

type ActionDialogOptions = Omit<ConfirmDialogOptions, 'title'> & {
  actionLabel: string;
};

export function openConfirmDialog(options: ConfirmDialogOptions) {
  return Modal.confirm({
    centered: true,
    okText: '确认',
    cancelText: '取消',
    ...options,
  });
}

export function openDeleteDialog({
  entityLabel,
  entityName,
  content,
  okText = '删除',
  okButtonProps,
  ...rest
}: DeleteDialogOptions) {
  return openConfirmDialog({
    title: `确认删除${entityLabel}`,
    content: content ?? (entityName ? `删除后不可恢复。是否继续删除“${entityName}”？` : '删除后不可恢复。是否继续？'),
    okText,
    okButtonProps: {
      danger: true,
      ...okButtonProps,
    },
    ...rest,
  });
}

export function openActionConfirmDialog({ actionLabel, ...rest }: ActionDialogOptions) {
  return openConfirmDialog({
    title: `确认${actionLabel}`,
    ...rest,
  });
}
