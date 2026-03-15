import { useEffect, useState } from 'react';
import { Tabs } from 'antd';
import type { TabsProps } from 'antd';

type ResettableTabsProps = TabsProps & {
  initialActiveKey: string;
  resetToken?: string | number | boolean | null | undefined;
};

export default function ResettableTabs({
  initialActiveKey,
  resetToken,
  activeKey,
  onChange,
  ...restProps
}: ResettableTabsProps) {
  const [innerActiveKey, setInnerActiveKey] = useState(initialActiveKey);

  useEffect(() => {
    setInnerActiveKey(initialActiveKey);
  }, [initialActiveKey, resetToken]);

  useEffect(() => {
    if (typeof activeKey === 'string') {
      setInnerActiveKey(activeKey);
    }
  }, [activeKey]);

  return (
    <Tabs
      {...restProps}
      activeKey={innerActiveKey}
      onChange={(key) => {
        setInnerActiveKey(key);
        onChange?.(key);
      }}
    />
  );
}
