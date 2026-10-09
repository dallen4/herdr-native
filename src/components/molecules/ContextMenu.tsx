import { Dropdown, type MenuProps } from 'antd';
import type { ReactNode } from 'react';

export interface MenuItem {
  key: string;
  label: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Render a divider before this item. */
  divider?: boolean;
}

/** Right-click menu around any element. */
export function ContextMenu({
  items,
  children,
}: {
  items: MenuItem[];
  children: ReactNode;
}) {
  const menu: MenuProps = {
    items: items.flatMap((item) => [
      ...(item.divider ? [{ type: 'divider' as const }] : []),
      {
        key: item.key,
        label: item.label,
        danger: item.danger,
        disabled: item.disabled,
      },
    ]),
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation();
      items.find((i) => i.key === key)?.onClick?.();
    },
  };
  return (
    <Dropdown menu={menu} trigger={['contextMenu']}>
      {/* Dropdown needs a single element that accepts a ref */}
      <div style={{ minWidth: 0 }}>{children}</div>
    </Dropdown>
  );
}

export const copyText = (text: string) =>
  navigator.clipboard?.writeText(text).catch(() => {});
