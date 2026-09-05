import { PlusOutlined, QrcodeOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Col, Input, Rate, Row, Select, Space, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import {
  FARMER_STATUSES,
  SETTABLE_FARMER_STATUSES,
  type Farmer,
  type FarmerQuery,
  type FarmerStatus,
  type SettableFarmerStatus,
} from '../../api/types';
import { useCan } from '../../auth/useCan';
import { Can } from '../../components/Can';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { RowActions } from '../../components/RowActions';
import { useBranches } from '../../hooks/useBranches';
import { useDeleteFarmer, useFarmers, useSetFarmerStatus } from '../../hooks/useFarmers';
import { FarmerCodesModal } from './FarmerCodesModal';
import { FarmerDetailDrawer } from './FarmerDetailDrawer';
import { FarmerFormModal } from './FarmerFormModal';
import { FARMER_STATUS_LABELS, FarmerCodeCell, FarmerStatusTag } from './farmerStatus';
import { VerifyFarmerModal } from './VerifyFarmerModal';
import farmerIcon from '../../assets/farmer-icon.png';
import { formatDate } from '../../utils/format';

export function FarmersPage() {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState<FarmerQuery>({});
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editing, setEditing] = useState<Farmer | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<Farmer | null>(null);
  const [showingCodes, setShowingCodes] = useState<Farmer | null>(null);

  const farmers = useFarmers(query);
  const branches = useBranches(true);
  const setStatus = useSetFarmerStatus();
  const remove = useDeleteFarmer();

  const openEdit = (farmer: Farmer) => {
    setEditing(farmer);
    setRegisterOpen(true);
  };

  const closeForm = () => {
    setRegisterOpen(false);
    setEditing(null);
  };

  const canApprove = useCan('FARMER_APPROVE');
  const canSetStatus = useCan('FARMER_SET_STATUS');
  const canDelete = useCan('FARMER_DELETE');

  const handleStatusChange = async (farmer: Farmer, status: SettableFarmerStatus) => {
    try {
      await setStatus.mutateAsync({ id: farmer.id, status });
      message.success(`${farmer.fullName} is now ${FARMER_STATUS_LABELS[status]}`);
    } catch (error) {
      // The server refuses ACTIVE without a farmerCode, among other things -
      // its message explains why far better than a generic failure would.
      message.error(apiErrorMessage(error, 'Could not change the status'));
    }
  };

  // Built inline rather than memoised: the cells close over the permission
  // flags and the pending state, and a memo here needed a dependency
  // suppression to stay correct. Rebuilding a column array is not the cost.
  const columns: ColumnsType<Farmer> = [
      {
        title: 'Traceability code',
        dataIndex: 'farmerCode',
        key: 'farmerCode',
        width: 180,
        render: (code: string | null) => <FarmerCodeCell code={code} />,
      },
      {
        title: 'Farmer / Supplier',
        dataIndex: 'fullName',
        key: 'fullName',
        render: (name: string, farmer) => (
          <Space direction="vertical" size={0}>
            <Typography.Link onClick={() => setDetailId(farmer.id)}>{name}</Typography.Link>
            <Typography.Text type="secondary">{farmer.mobile}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Location',
        key: 'location',
        render: (_, farmer) => (
          <Space direction="vertical" size={0}>
            <span>{farmer.village}</span>
            <Typography.Text type="secondary">
              {farmer.district}, {farmer.state}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Branch',
        key: 'branch',
        render: (_, farmer) => farmer.branch?.name ?? '—',
      },
      {
        /**
         * FRD 7.6. Sortable and filterable because 7.4 lists Quality Rating as
         * a search filter — which is the whole reason the score is stored on
         * the farmer rather than computed on read.
         */
        title: 'Rating',
        dataIndex: 'qualityRating',
        key: 'qualityRating',
        width: 130,
        align: 'right',
        sorter: (a, b) => Number(a.qualityRating ?? -1) - Number(b.qualityRating ?? -1),
        render: (value: string | null) => {
          if (value === null) {
            // Not zero. A farmer who has never supplied has not been measured.
            return (
              <Tooltip title="No procurement history yet — nothing to score from">
                <Typography.Text type="secondary">Unrated</Typography.Text>
              </Tooltip>
            );
          }
          const score = Number(value);
          const colour = score >= 80 ? '#389e0d' : score >= 50 ? '#d48806' : '#cf1322';
          return (
            <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
              <Typography.Text strong style={{ color: colour }}>
                {score.toFixed(1)}
              </Typography.Text>
              <Rate
                disabled
                allowHalf
                value={Math.round((score / 20) * 2) / 2}
                style={{ fontSize: 10 }}
              />
            </Space>
          );
        },
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 180,
        render: (status: FarmerStatus, farmer) =>
          canSetStatus && status !== 'PENDING_VERIFICATION' ? (
            <Select<SettableFarmerStatus>
              size="small"
              value={status as SettableFarmerStatus}
              style={{ width: 150 }}
              loading={setStatus.isPending}
              onChange={(next) => void handleStatusChange(farmer, next)}
              options={SETTABLE_FARMER_STATUSES.map((value) => ({
                value,
                label: FARMER_STATUS_LABELS[value],
                // The API rejects ACTIVE without a code; disable rather than
                // let the user discover that through an error toast.
                disabled: value === 'ACTIVE' && !farmer.farmerCode,
              }))}
            />
          ) : (
            <FarmerStatusTag status={status} />
          ),
      },
      {
        title: 'Added by',
        key: 'createdBy',
        width: 170,
        sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        render: (_, farmer) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {farmer.createdBy?.fullName ?? '—'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {formatDate(farmer.createdAt)}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 320,
        fixed: 'right',
        render: (_, farmer) => (
          <Space size={4}>
            <Button size="small" onClick={() => setDetailId(farmer.id)}>
              View
            </Button>

            <Can do="FARMER_APPROVE">
              <Tooltip
                title={
                  farmer.status === 'PENDING_VERIFICATION'
                    ? 'Approve, reject or request documents'
                    : 'Record another verification decision'
                }
              >
                <Button
                  size="small"
                  type={farmer.status === 'PENDING_VERIFICATION' ? 'primary' : 'default'}
                  icon={<SafetyCertificateOutlined />}
                  onClick={() => setVerifying(farmer)}
                >
                  Verify
                </Button>
              </Tooltip>
            </Can>

            <Tooltip
              title={farmer.farmerCode ? 'QR and barcode' : 'Issued once the farmer is approved'}
            >
              <Button
                size="small"
                icon={<QrcodeOutlined />}
                disabled={!farmer.farmerCode}
                onClick={() => setShowingCodes(farmer)}
              />
            </Tooltip>

            <RowActions
              entity="farmer"
              label={farmer.fullName}
              can="FARMER_EDIT"
              onEdit={() => openEdit(farmer)}
              onDelete={canDelete ? () => remove.mutateAsync(farmer.id) : undefined}
              // An approved farmer holds a traceability code that is never
              // reissued, so the server refuses outright. Saying so on the
              // disabled item is better than letting them find out from a 400.
              deleteBlockedReason={
                farmer.farmerCode
                  ? `${farmer.farmerCode} has been issued — set the status to Inactive or Blacklisted instead`
                  : undefined
              }
            />
          </Space>
        ),
      },
  ];

  const pendingCount = (farmers.data?.data ?? []).filter(
    (farmer) => farmer.status === 'PENDING_VERIFICATION',
  ).length;

  const toolbar = (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <Input.Search
          allowClear
          placeholder="Search by name"
          onSearch={(value) => setQuery((q) => ({ ...q, fullName: value || undefined }))}
        />
      </Col>
      <Col xs={12} md={4}>
        <Input
          allowClear
          placeholder="Village"
          onChange={(event) =>
            setQuery((q) => ({ ...q, village: event.target.value || undefined }))
          }
        />
      </Col>
      <Col xs={12} md={4}>
        <Input
          allowClear
          placeholder="District"
          onChange={(event) =>
            setQuery((q) => ({ ...q, district: event.target.value || undefined }))
          }
        />
      </Col>
      <Col xs={12} md={4}>
        <Select
          allowClear
          style={{ width: '100%' }}
          placeholder="Branch"
          loading={branches.isLoading}
          onChange={(value?: string) => setQuery((q) => ({ ...q, branchId: value }))}
          options={(branches.data?.data ?? []).map((branch) => ({
            value: branch.id,
            label: branch.name,
          }))}
        />
      </Col>
      <Col xs={12} md={4}>
        <Select<FarmerStatus>
          allowClear
          style={{ width: '100%' }}
          placeholder="Status"
          onChange={(value?: FarmerStatus) => setQuery((q) => ({ ...q, status: value }))}
          options={FARMER_STATUSES.map((value) => ({
            value,
            label: FARMER_STATUS_LABELS[value],
          }))}
        />
      </Col>
      {/* FRD 7.4 lists eight filters. Crop and Quality Rating are the last two. */}
      <Col xs={12} md={4}>
        <Input
          allowClear
          placeholder="Crop"
          onChange={(event) => setQuery((q) => ({ ...q, crop: event.target.value || undefined }))}
        />
      </Col>
      <Col xs={12} md={4}>
        <Select<number>
          allowClear
          style={{ width: '100%' }}
          placeholder="Min. rating"
          onChange={(value?: number) => setQuery((q) => ({ ...q, minRating: value }))}
          options={[
            { value: 80, label: 'Rated 80+' },
            { value: 60, label: 'Rated 60+' },
            { value: 40, label: 'Rated 40+' },
          ]}
        />
      </Col>
    </Row>
  );

  return (
    <Card>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <img
              src={farmerIcon}
              alt="Farmer Icon"
              style={{
                width: 32,
                height: 32,
                objectFit: 'contain',
                verticalAlign: 'middle',
              }}
            />
            Farmers / Suppliers
          </span>
        }
        subtitle={
          pendingCount > 0 && canApprove
            ? `${pendingCount} awaiting verification. Approval issues the traceability code that the whole farm-to-fork chain hangs on.`
            : 'Registry, verification and traceability codes (FRD Sections 7–8).'
        }
        actions={
          <Can do="FARMER_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterOpen(true)}>
              Register farmer / supplier
            </Button>
          </Can>
        }
      />

      <DataTable<Farmer>
        rows={farmers.data?.data}
        columns={columns}
        rowKey="id"
        isLoading={farmers.isLoading}
        isFetching={farmers.isFetching}
        error={farmers.error}
        onRetry={() => void farmers.refetch()}
        toolbar={toolbar}
        emptyText="No farmers / suppliers match these filters"
      />

      <FarmerFormModal open={registerOpen} farmer={editing} onClose={closeForm} />
      <FarmerDetailDrawer farmerId={detailId} onClose={() => setDetailId(null)} />
      <VerifyFarmerModal farmer={verifying} onClose={() => setVerifying(null)} />
      <FarmerCodesModal farmer={showingCodes} onClose={() => setShowingCodes(null)} />
    </Card>
  );
}
