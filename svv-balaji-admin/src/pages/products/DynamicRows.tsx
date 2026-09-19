import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Form, Space, Tooltip } from 'antd';
import type { FormListFieldData, FormListProps } from 'antd/es/form/FormList';
import type { NamePath } from 'antd/es/form/interface';
import type { ReactNode } from 'react';

/**
 * One repeatable section of the product form - highlights, specifications,
 * FAQs, offers. Every one of them is "a list the operator adds to, removes
 * from and reorders", so that behaviour lives here once instead of being
 * re-implemented four times with four slightly different bugs.
 *
 * Array position is the display order the storefront uses, which is why the
 * up/down arrows exist: reordering here IS reordering on the product page.
 */
export function DynamicRows({
  name,
  addLabel,
  emptyText,
  newRow,
  max,
  rules,
  children,
}: {
  name: NamePath;
  addLabel: string;
  emptyText: string;
  /** The value a freshly added row starts with - '' for a plain string list, an object for a structured one. */
  newRow: unknown;
  max?: number;
  /** List-level rules (e.g. "no duplicate SKUs"), reported beneath the list. */
  rules?: FormListProps['rules'];
  children: (field: FormListFieldData, index: number) => ReactNode;
}) {
  return (
    <Form.List name={name} rules={rules}>
      {(fields, { add, remove, move }, { errors }) => (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {fields.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} style={{ margin: '4px 0' }} />
          ) : null}

          {fields.map((field, index) => (
            <div
              key={field.key}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '10px 12px',
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                background: '#fafafa',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>{children(field, index)}</div>

              <Space size={0} style={{ flexShrink: 0 }}>
                <Tooltip title="Move up">
                  <Button
                    type="text"
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  />
                </Tooltip>
                <Tooltip title="Move down">
                  <Button
                    type="text"
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                  />
                </Tooltip>
                <Tooltip title="Remove">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                </Tooltip>
              </Space>
            </div>
          ))}

          <Form.ErrorList errors={errors} />

          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => add(newRow)}
            disabled={max !== undefined && fields.length >= max}
            block
          >
            {addLabel}
          </Button>
        </Space>
      )}
    </Form.List>
  );
}
