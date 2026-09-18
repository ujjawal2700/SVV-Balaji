import { PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Space } from 'antd';
import { FileUploadField } from '@shared/components/FileUploadField';

/**
 * `Product.images` is a string array, one URL per photo - FileUploadField only
 * knows a single URL, so this renders one slot per existing image plus an
 * "Add photo" affordance, and reduces back down to a plain string[] for the
 * form. Antd's Form.Item clones this with `value`/`onChange` the same way it
 * would any single-value control.
 */
export function ProductImagesField({
  value = [],
  onChange,
}: {
  value?: string[];
  onChange?: (urls: string[]) => void;
}) {
  const setAt = (index: number, url: string | undefined) => {
    const next = [...value];
    if (url) next[index] = url;
    else next.splice(index, 1);
    onChange?.(next);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      {value.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No photos yet" style={{ margin: '8px 0' }} />
      ) : (
        value.map((url, index) => (
          // Slots are positional (this array has no stable id per photo), so
          // the index is the correct key here, not a shortcut around one.
          <FileUploadField key={index} folder="products" value={url} onChange={(next) => setAt(index, next)} />
        ))
      )}

      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => onChange?.([...value, ''])}
        disabled={value.some((url) => !url)}
        block
      >
        Add photo
      </Button>
    </Space>
  );
}
