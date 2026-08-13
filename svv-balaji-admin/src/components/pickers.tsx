import { Select } from 'antd';
import type { CSSProperties } from 'react';
import { useBranches } from '../hooks/useBranches';
import { useFarmers } from '../hooks/useFarmers';
import { useWarehouses } from '../hooks/useWarehouses';

interface PickerProps {
  value?: string;
  onChange?: (value: string | undefined) => void;
  placeholder?: string;
  allowClear?: boolean;
  style?: CSSProperties;
  disabled?: boolean;
}

/**
 * Branch picker.
 *
 * `value`/`onChange` are left implicit so antd's Form.Item can inject them -
 * the same component then works both inside a form and as a standalone filter.
 */
export function BranchSelect({ placeholder = 'Select a branch', ...props }: PickerProps) {
  // Active branches only - a deactivated branch must not be selectable on a new
  // record. The branch master screen is the one place that lists all of them.
  const branches = useBranches(true);

  return (
    <Select
      {...props}
      showSearch
      optionFilterProp="label"
      placeholder={branches.isLoading ? 'Loading…' : placeholder}
      loading={branches.isLoading}
      options={(branches.data?.data ?? []).map((branch) => ({
        value: branch.id,
        label: `${branch.name} — ${branch.location}`,
      }))}
      style={{ width: '100%', ...props.style }}
    />
  );
}

interface FarmerSelectProps extends PickerProps {
  /**
   * Restrict to approved farmers. Use this anywhere the record only makes sense
   * against a traceable farmer. Left off for agreements, which are signed
   * pre-season and can legitimately precede approval.
   */
  approvedOnly?: boolean;
}

/**
 * Farmer picker.
 *
 * The label always carries the traceability code, or "pending approval" where
 * there is none - two farmers in a district often share a name, and the code is
 * the only thing that actually distinguishes them.
 *
 * Note this fetches the whole farmer list. That is a consequence of the API not
 * paginating yet (A-12); once it does, this becomes a server-side search on
 * `?fullName=` rather than a client-side filter.
 */
export function FarmerSelect({
  approvedOnly = false,
  placeholder = 'Select a farmer',
  ...props
}: FarmerSelectProps) {
  const farmers = useFarmers(approvedOnly ? { status: 'ACTIVE' } : {});

  // An approved farmer always holds a code, but filter on it explicitly rather
  // than trusting status alone - the code is what the traceability chain
  // actually hangs on, and the server checks both.
  const rows = (farmers.data?.data ?? []).filter(
    (farmer) => !approvedOnly || Boolean(farmer.farmerCode),
  );

  return (
    <Select
      {...props}
      showSearch
      optionFilterProp="label"
      placeholder={farmers.isLoading ? 'Loading…' : placeholder}
      loading={farmers.isLoading}
      notFoundContent={
        approvedOnly && !farmers.isLoading && rows.length === 0
          ? 'No approved farmers yet — approve one first'
          : undefined
      }
      options={rows.map((farmer) => ({
        value: farmer.id,
        label: `${farmer.fullName} — ${farmer.farmerCode ?? 'pending approval'} · ${farmer.village}`,
      }))}
      style={{ width: '100%', ...props.style }}
    />
  );
}

/** Warehouse picker. Only active warehouses are returned by the API. */
export function WarehouseSelect({ placeholder = 'Select a warehouse', ...props }: PickerProps) {
  const warehouses = useWarehouses();

  return (
    <Select
      {...props}
      showSearch
      optionFilterProp="label"
      placeholder={warehouses.isLoading ? 'Loading…' : placeholder}
      loading={warehouses.isLoading}
      options={(warehouses.data?.data ?? []).map((warehouse) => ({
        value: warehouse.id,
        label: `${warehouse.name} — ${warehouse.location}`,
      }))}
      style={{ width: '100%', ...props.style }}
    />
  );
}
