import { AutoComplete, Button, Col, Drawer, Form, Row, Select } from 'antd';
import { FARMER_STATUSES, type Farmer, type FarmerStatus } from '@shared/api/types';
import { FARMER_STATUS_LABELS } from './farmerStatus';

/** FRD 7.4 search filters beyond the name search. Every one is applied server-side. */
export interface FarmerFilters {
  crop?: string;
  district?: string;
  state?: string;
  status?: FarmerStatus;
  /** 0-100. Unrated farmers are excluded by the server. */
  minRating?: number;
}

export const EMPTY_FILTERS: FarmerFilters = {};

export const RATING_OPTIONS = [
  { value: 80, label: '★ 80 and above' },
  { value: 60, label: '★ 60 and above' },
  { value: 40, label: '★ 40 and above' },
  { value: 0, label: 'Any rated farmer' },
];

export function countActiveFilters(f: FarmerFilters): number {
  return [f.crop, f.district, f.state, f.status, f.minRating].filter((v) => v !== undefined && v !== '').length;
}

export function activeFilterChips(f: FarmerFilters): Array<{ key: keyof FarmerFilters; label: string }> {
  const chips: Array<{ key: keyof FarmerFilters; label: string }> = [];
  if (f.crop) chips.push({ key: 'crop', label: `Crop: ${f.crop}` });
  if (f.district) chips.push({ key: 'district', label: `District: ${f.district}` });
  if (f.state) chips.push({ key: 'state', label: `State: ${f.state}` });
  if (f.status) chips.push({ key: 'status', label: `Status: ${FARMER_STATUS_LABELS[f.status]}` });
  if (f.minRating !== undefined) {
    chips.push({ key: 'minRating', label: f.minRating === 0 ? 'Rated farmers' : `Rating ≥ ${f.minRating}` });
  }
  return chips;
}

/** Distinct, sorted suggestions from the loaded farmers. Free text is still allowed. */
function distinct(values: Array<string | null | undefined>): Array<{ value: string }> {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const v = raw?.trim();
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return Array.from(seen.values())
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value }));
}

export function FarmerFilterFields({
  value,
  onChange,
  farmers,
  inline = false,
}: {
  value: FarmerFilters;
  onChange: (next: FarmerFilters) => void;
  farmers: Farmer[];
  inline?: boolean;
}) {
  const set = <K extends keyof FarmerFilters>(key: K, v: FarmerFilters[K]) =>
    onChange({ ...value, [key]: v === '' || v === null ? undefined : v });

  const crops = distinct(farmers.flatMap((f) => (f.cropDetails ?? '').split(',')));
  const districts = distinct(farmers.map((f) => f.district));
  const states = distinct(farmers.map((f) => f.state));
  const span = inline ? { xs: 24, sm: 12, md: 8, lg: 5 } : { xs: 24 };
  const filterOption = (input: string, option?: { value: string }) =>
    (option?.value ?? '').toLowerCase().includes(input.toLowerCase());

  const fields = (
    <Row gutter={[12, inline ? 8 : 0]} align="bottom">
      <Col {...span}>
        <Form.Item label="Crop" style={{ marginBottom: inline ? 0 : 16 }}>
          <AutoComplete
            allowClear
            value={value.crop}
            options={crops}
            filterOption={filterOption}
            onChange={(v) => set('crop', v || undefined)}
            placeholder="e.g. Wheat"
          />
        </Form.Item>
      </Col>
      <Col {...span}>
        <Form.Item label="District" style={{ marginBottom: inline ? 0 : 16 }}>
          <AutoComplete
            allowClear
            value={value.district}
            options={districts}
            filterOption={filterOption}
            onChange={(v) => set('district', v || undefined)}
            placeholder="Any district"
          />
        </Form.Item>
      </Col>
      <Col {...span}>
        <Form.Item label="State" style={{ marginBottom: inline ? 0 : 16 }}>
          <AutoComplete
            allowClear
            value={value.state}
            options={states}
            filterOption={filterOption}
            onChange={(v) => set('state', v || undefined)}
            placeholder="Any state"
          />
        </Form.Item>
      </Col>
      <Col {...span}>
        <Form.Item label="Status" style={{ marginBottom: inline ? 0 : 16 }}>
          <Select<FarmerStatus>
            allowClear
            value={value.status}
            onChange={(v) => set('status', v)}
            placeholder="Any status"
            options={FARMER_STATUSES.map((s) => ({ value: s, label: FARMER_STATUS_LABELS[s] }))}
          />
        </Form.Item>
      </Col>
      <Col {...(inline ? { xs: 24, sm: 12, md: 8, lg: 4 } : { xs: 24 })}>
        <Form.Item label="Quality rating" style={{ marginBottom: inline ? 0 : 16 }}>
          <Select<number>
            allowClear
            value={value.minRating}
            onChange={(v) => set('minRating', v)}
            placeholder="Any rating"
            options={RATING_OPTIONS}
          />
        </Form.Item>
      </Col>
    </Row>
  );
  // Desktop renders this bare above the list; the phone drawer supplies its own Form.
  return inline ? <Form layout="vertical">{fields}</Form> : fields;
}

/** Phone: the same fields in a bottom sheet behind a "Filters" button. */
export function FarmerFilterDrawer({
  open,
  onClose,
  value,
  onChange,
  farmers,
}: {
  open: boolean;
  onClose: () => void;
  value: FarmerFilters;
  onChange: (next: FarmerFilters) => void;
  farmers: Farmer[];
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      height="auto"
      title="Filter farmers / suppliers"
      styles={{ body: { paddingBottom: 8 } }}
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <Button block onClick={() => onChange(EMPTY_FILTERS)}>
            Clear
          </Button>
          <Button block type="primary" onClick={onClose}>
            Show results
          </Button>
        </div>
      }
    >
      <Form layout="vertical">
        <FarmerFilterFields value={value} onChange={onChange} farmers={farmers} />
      </Form>
    </Drawer>
  );
}
