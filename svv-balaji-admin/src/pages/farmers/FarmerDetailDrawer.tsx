import { Alert, Descriptions, Drawer, Empty, Space, Spin, Table, Tabs, Tag, Typography } from 'antd';
import { FarmerPerformancePanel } from './FarmerPerformancePanel';
import { apiErrorMessage } from '../../api/client';
import type {
  FarmerAgreementSummary,
  FarmerFieldVisitSummary,
  FarmerSeedDistributionSummary,
  FarmerVerificationLog,
} from '../../api/types';
import { useFarmer } from '../../hooks/useFarmers';
import { EM_DASH, formatDate } from '../../utils/format';
import { FarmerCodeCell, FarmerStatusTag } from './farmerStatus';

interface FarmerDetailDrawerProps {
  farmerId: string | null;
  onClose: () => void;
}

const dash = <Typography.Text type="secondary">{EM_DASH}</Typography.Text>;

const VERIFICATION_COLOURS: Record<FarmerVerificationLog['action'], string> = {
  APPROVED: 'green',
  REJECTED: 'red',
  DOCUMENTS_REQUESTED: 'gold',
};

/**
 * The farmer profile.
 *
 * `GET /farmers/:id` returns the verification trail, agreements, seed
 * distributions and field visits alongside the record itself, so this is one
 * request rather than five - and it is the closest thing the panel has to a
 * complete picture of a farmer relationship.
 */
export function FarmerDetailDrawer({ farmerId, onClose }: FarmerDetailDrawerProps) {
  const farmer = useFarmer(farmerId ?? undefined);
  const data = farmer.data;

  return (
    <Drawer
      open={Boolean(farmerId)}
      onClose={onClose}
      width={720}
      title={
        data ? (
          <Space>
            <span>{data.fullName}</span>
            <FarmerStatusTag status={data.status} />
          </Space>
        ) : (
          'Farmer'
        )
      }
    >
      {farmer.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : farmer.error ? (
        <Alert type="error" showIcon message={apiErrorMessage(farmer.error)} />
      ) : data ? (
        <Tabs
          items={[
            {
              key: 'profile',
              label: 'Profile',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Descriptions bordered column={2} size="small" title="Identity">
                    <Descriptions.Item label="Traceability code" span={2}>
                      <FarmerCodeCell code={data.farmerCode} />
                    </Descriptions.Item>
                    <Descriptions.Item label="Mobile">{data.mobile}</Descriptions.Item>
                    <Descriptions.Item label="Branch">
                      {data.branch?.name ?? dash}
                    </Descriptions.Item>
                    <Descriptions.Item label="Aadhaar">
                      {data.aadhaarNumber ?? dash}
                    </Descriptions.Item>
                    <Descriptions.Item label="PAN">{data.panNumber ?? dash}</Descriptions.Item>
                    <Descriptions.Item label="Registered" span={2}>
                      {formatDate(data.createdAt)}
                    </Descriptions.Item>
                  </Descriptions>

                  <Descriptions bordered column={2} size="small" title="Farm">
                    <Descriptions.Item label="Village">{data.village}</Descriptions.Item>
                    <Descriptions.Item label="District">{data.district}</Descriptions.Item>
                    <Descriptions.Item label="State">{data.state}</Descriptions.Item>
                    <Descriptions.Item label="Coordinates">
                      {data.gpsLocation ?? dash}
                    </Descriptions.Item>
                    <Descriptions.Item label="Size (acres)">
                      {data.farmSizeAcres ?? dash}
                    </Descriptions.Item>
                    <Descriptions.Item label="Land type">{data.landType ?? dash}</Descriptions.Item>
                    <Descriptions.Item label="Irrigation">
                      {data.irrigationType ?? dash}
                    </Descriptions.Item>
                    <Descriptions.Item label="Crops">{data.cropDetails ?? dash}</Descriptions.Item>
                    <Descriptions.Item label="Address" span={2}>
                      {data.address ?? dash}
                    </Descriptions.Item>
                  </Descriptions>

                  <Descriptions bordered column={2} size="small" title="Bank">
                    <Descriptions.Item label="Account holder">
                      {data.bankAccountName ?? dash}
                    </Descriptions.Item>
                    <Descriptions.Item label="Bank">{data.bankName ?? dash}</Descriptions.Item>
                    <Descriptions.Item label="Account number">
                      {data.bankAccountNo ?? dash}
                    </Descriptions.Item>
                    <Descriptions.Item label="IFSC">{data.ifscCode ?? dash}</Descriptions.Item>
                  </Descriptions>
                </Space>
              ),
            },
            {
              key: 'performance',
              label: 'Performance',
              children: farmerId ? <FarmerPerformancePanel farmerId={farmerId} /> : null,
            },
            {
              key: 'verification',
              label: `Verification (${data.verificationLogs.length})`,
              children: (
                <Table<FarmerVerificationLog>
                  size="small"
                  rowKey="id"
                  dataSource={data.verificationLogs}
                  pagination={false}
                  locale={{ emptyText: <Empty description="No verification activity yet" /> }}
                  columns={[
                    {
                      title: 'Action',
                      dataIndex: 'action',
                      render: (action: FarmerVerificationLog['action']) => (
                        <Tag color={VERIFICATION_COLOURS[action]}>{action.replace('_', ' ')}</Tag>
                      ),
                    },
                    { title: 'Remarks', dataIndex: 'remarks', render: (v: string | null) => v ?? '—' },
                    { title: 'When', dataIndex: 'createdAt', render: formatDate, width: 140 },
                  ]}
                />
              ),
            },
            {
              key: 'agreements',
              label: `Agreements (${data.agreements.length})`,
              children: (
                <Table<FarmerAgreementSummary>
                  size="small"
                  rowKey="id"
                  dataSource={data.agreements}
                  pagination={false}
                  locale={{ emptyText: <Empty description="No agreements" /> }}
                  columns={[
                    { title: 'Crop', dataIndex: 'cropName' },
                    { title: 'Variety', dataIndex: 'variety', render: (v: string | null) => v ?? '—' },
                    { title: 'Expected qty', dataIndex: 'expectedQuantity' },
                    { title: 'Rate', dataIndex: 'purchaseRate' },
                    { title: 'Agreed', dataIndex: 'agreementDate', render: formatDate },
                    { title: 'Status', dataIndex: 'status', render: (s: string) => <Tag>{s}</Tag> },
                  ]}
                />
              ),
            },
            {
              key: 'seed',
              label: `Seed (${data.seedDistributions.length})`,
              children: (
                <Table<FarmerSeedDistributionSummary>
                  size="small"
                  rowKey="id"
                  dataSource={data.seedDistributions}
                  pagination={false}
                  locale={{ emptyText: <Empty description="No seed distributed" /> }}
                  columns={[
                    { title: 'Seed', dataIndex: 'seedName' },
                    { title: 'Variety', dataIndex: 'seedVariety', render: (v: string | null) => v ?? '—' },
                    {
                      title: 'Quantity',
                      key: 'quantity',
                      render: (_, row) => `${row.quantity} ${row.unit}`,
                    },
                    { title: 'Date', dataIndex: 'distributionDate', render: formatDate },
                  ]}
                />
              ),
            },
            {
              key: 'visits',
              label: `Field visits (${data.fieldVisits.length})`,
              children: (
                <Table<FarmerFieldVisitSummary>
                  size="small"
                  rowKey="id"
                  dataSource={data.fieldVisits}
                  pagination={false}
                  locale={{ emptyText: <Empty description="No field visits recorded" /> }}
                  columns={[
                    { title: 'Date', dataIndex: 'visitDate', render: formatDate, width: 130 },
                    { title: 'Crop', dataIndex: 'cropName', render: (v: string | null) => v ?? '—' },
                    { title: 'Stage', dataIndex: 'cropGrowthStage', render: (v: string | null) => v ?? '—' },
                    { title: 'Health', dataIndex: 'cropHealth', render: (v: string | null) => v ?? '—' },
                    {
                      title: 'Predicted yield',
                      dataIndex: 'yieldPredictionQty',
                      render: (v: string | null) => v ?? '—',
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      ) : null}
    </Drawer>
  );
}
