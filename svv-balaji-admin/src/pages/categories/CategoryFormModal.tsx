import { App as AntApp, AutoComplete, Form, Input, InputNumber, Modal, Radio, Select, Space, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type { Category, CreateCategoryInput } from '../../api/types';
import { FileUploadField } from '../../components/FileUploadField';
import { useCategories, useCreateCategory, useUpdateCategory } from '@shared/hooks/useCategories';
import { maxLength, required } from '../../validation/rules';
import { MOCK_CATEGORIES } from './MainCategoriesPage';
import { LOYALTY_ELIGIBILITY_LABELS, type LoyaltyEligibility } from '@shared/api/loyalty';

const { Text } = Typography;

export function CategoryFormModal({
  open,
  category,
  defaultParentId,
  onClose,
}: {
  open: boolean;
  category?: Category | null;
  /** Pre-fill parentId if adding a sub-category directly from a parent row */
  defaultParentId?: string | null;
  onClose: () => void;
}) {
  const [form] = Form.useForm<CreateCategoryInput>();
  const { message } = AntApp.useApp();
  const categories = useCategories(true);
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();

  const [categoryType, setCategoryType] = useState<'main' | 'sub'>('main');
  const isEdit = Boolean(category);

  // Available parent options (cannot select self or children)
  const rawCategories = categories.data?.data ?? [];
  const allCategories = rawCategories.length > 0 ? rawCategories : MOCK_CATEGORIES;
  const parentOptions = allCategories
    .filter((c) => !c.parentId && c.id !== category?.id)
    .map((c) => ({ value: c.id, label: c.name }));

  useEffect(() => {
    if (!open) return;
    if (category) {
      const isSub = Boolean(category.parentId);
      setCategoryType(isSub ? 'sub' : 'main');
      form.setFieldsValue({
        name: category.name || '',
        slug: category.slug || '',
        description: category.description || '',
        imageUrl: category.imageUrl || '',
        parentId: category.parentId || undefined,
        loyaltyEligibility: category.loyaltyEligibility ?? 'INHERIT',
        displayOrder: category.displayOrder ?? 0,
      });
    } else {
      form.resetFields();
      if (defaultParentId) {
        setCategoryType('sub');
        form.setFieldValue('parentId', defaultParentId);
      } else {
        setCategoryType('main');
        form.setFieldValue('parentId', undefined);
      }
    }
  }, [open, category, defaultParentId, form]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    if (!isEdit && name) {
      const derivedSlug = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      form.setFieldValue('slug', derivedSlug);
    }
  };

  const handleTypeChange = (type: 'main' | 'sub') => {
    setCategoryType(type);
    if (type === 'main') {
      form.setFieldValue('parentId', undefined);
    } else if (parentOptions.length > 0 && !form.getFieldValue('parentId')) {
      form.setFieldValue('parentId', parentOptions[0].value);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: CreateCategoryInput = {
        ...values,
        parentId: categoryType === 'sub' ? values.parentId : undefined,
      };

      if (category) {
        const updated = await updateCategory.mutateAsync({ id: category.id, input: payload });
        message.success(`Category "${updated.name}" updated successfully`);
      } else {
        const created = await createCategory.mutateAsync(payload);
        message.success(
          `${categoryType === 'sub' ? 'Sub-category' : 'Main category'} "${created.name}" created successfully`,
        );
      }
      onClose();
    } catch (error) {
      message.error(apiErrorMessage(error, `Could not ${isEdit ? 'update' : 'create'} category`));
    }
  };

  return (
    <Modal
      open={open}
      title={
        isEdit
          ? `Edit ${category?.parentId ? 'Sub-Category' : 'Main Category'}: ${category?.name}`
          : categoryType === 'sub'
          ? 'Add New Sub-Category'
          : 'Add New Main Category'
      }
      okText={isEdit ? 'Save Changes' : 'Create Category'}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={createCategory.isPending || updateCategory.isPending}
      width={560}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        initialValues={{ displayOrder: 0, loyaltyEligibility: 'INHERIT' }}
      >
        {!isEdit && (
          <Form.Item label="Category Classification">
            <Radio.Group
              value={categoryType}
              onChange={(e) => handleTypeChange(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="main">Top-Level Category (Parent)</Radio.Button>
              <Radio.Button value="sub">Sub-Category (Child)</Radio.Button>
            </Radio.Group>
          </Form.Item>
        )}

        {categoryType === 'sub' && (
          <Form.Item
            name="parentId"
            label="Parent Category"
            rules={[required('Parent Category')]}
            extra="Assign this sub-category under a primary storefront parent category."
          >
            <Select
              placeholder="Select Parent Category"
              options={parentOptions}
              loading={categories.isLoading}
            />
          </Form.Item>
        )}

        <Form.Item
          name="name"
          label={categoryType === 'sub' ? 'Sub-Category Name' : 'Main Category Name'}
          rules={[required('Name'), maxLength(120)]}
        >
          <Input
            placeholder={categoryType === 'sub' ? 'e.g., Multigrain Flours' : 'e.g., Organic Flours'}
            onChange={handleNameChange}
          />
        </Form.Item>

        <Form.Item
          name="slug"
          label="Storefront URL Slug"
          extra="Used in the browser URL (e.g. /category/multigrain-flours)."
        >
          <Input placeholder="multigrain-flours" prefix="/" />
        </Form.Item>

        <Form.Item name="description" label="Description / Summary">
          <Input.TextArea
            rows={3}
            maxLength={1000}
            showCount
            placeholder="Brief summary for storefront shoppers..."
          />
        </Form.Item>

        <Form.Item name="imageUrl" label="Category Image Icon">
          <FileUploadField folder="categories" hint="Recommended ratio 1:1 square image." />
        </Form.Item>

        <Form.Item
          name="loyaltyEligibility"
          label="Loyalty rewards"
          extra="Default for every product in this category. Inherit follows the parent category, then the program default. A product can override it."
        >
          <Select
            options={(Object.keys(LOYALTY_ELIGIBILITY_LABELS) as LoyaltyEligibility[]).map((value) => ({
              value,
              label: LOYALTY_ELIGIBILITY_LABELS[value],
            }))}
          />
        </Form.Item>

        <Form.Item
          name="displayOrder"
          label="Display Sorting Order"
          extra="Lower numbers appear first on menu and storefront navigation."
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
