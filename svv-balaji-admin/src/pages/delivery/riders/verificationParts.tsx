import { CheckOutlined, CloseOutlined, FilePdfOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Card, Col, Descriptions, Empty, Form, Image, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import {
  deliveryApi, type DepositEntryType, type DepositMethod, type DepositStatus, type DocState, type RiderDocItem, type RiderDocUpload,
} from '@shared/api/delivery';
import { useCan } from '@shared/auth/useCan';
import { useDeliveryMutation, useRiderDeposit, useRiderVerification } from '@shared/hooks/useDelivery';
import { inr } from './riderParts';

/** Rider onboarding pieces: document / PCC review, the verification checklist and the security deposit ledger. */

export const DOC_STATE: Record<DocState, { label: string; color: string }> = {
  NOT_UPLOADED: { label: 'Not uploaded', color: 'default' },
  PENDING: { label: 'Pending review', color: 'gold' },
  APPROVED: { label: 'Approved', color: 'green' },
  REJECTED: { label: 'Rejected', color: 'red' },
  EXPIRED: { label: 'Expired', color: 'volcano' },
};
export const UPLOAD_STATUS: Record<RiderDocUpload['status'], { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'gold' }, APPROVED: { label: 'Approved', color: 'green' }, REJECTED: { label: 'Rejected', color: 'red' },
};
export const DEPOSIT_STATUS: Record<DepositStatus, { label: string; color: string }> = {
  NOT_REQUIRED: { label: 'Not required', color: 'default' },
  NOT_PAID: { label: 'Not paid', color: 'red' },
  PARTIALLY_PAID: { label: 'Partly paid', color: 'gold' },
  PAID: { label: 'Paid', color: 'green' },
};
const ENTRY: Record<DepositEntryType, { label: string; color: string }> = {
  PAYMENT: { label: 'Payment received', color: 'green' }, REFUND: { label: 'Refunded', color: 'blue' },
  FORFEIT: { label: 'Kept (forfeit)', color: 'volcano' }, ADJUSTMENT: { label: 'Adjustment', color: 'purple' },
};
const METHOD: Record<DepositMethod, string> = {
  CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank transfer', ONLINE: 'Online (rider app)', EARNINGS_DEDUCTION: 'Deducted from earnings', OTHER: 'Other',
};
const fmt = (d: string | null | undefined) => (d ? dayjs(d).format('D MMM YYYY') : '—');

export function VerificationTag({ verified, toReview }: { verified?: boolean; toReview?: number }) {
  return (
    <Space size={4} wrap>
      <Tag icon={verified ? <SafetyCertificateOutlined /> : undefined} color={verified ? 'green' : 'orange'}>{verified ? 'Verified' : 'Not verified'}</Tag>
      {toReview ? <Tag color="gold">{toReview} to review</Tag> : null}
    </Space>
  );
}

/** Photos open in a preview carousel; PDFs open in a new tab. */
export function DocFiles({ urls, size = 96 }: { urls: string[]; size?: number }) {
  const pdf = (u: string) => /\.pdf($|\?)/i.test(u);
  return (
    <Space wrap size={8}>
      <Image.PreviewGroup>
        {urls.filter((u) => !pdf(u)).map((u) => <Image key={u} src={u} width={size} height={size} style={{ objectFit: 'cover', borderRadius: 8 }} />)}
      </Image.PreviewGroup>
      {urls.filter(pdf).map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" style={{ width: size, height: size, borderRadius: 8, border: '1px solid #f0f0f0', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <span><FilePdfOutlined style={{ fontSize: 28, color: '#cf1322' }} /><div style={{ fontSize: 12 }}>PDF {i + 1}</div></span>
        </a>
      ))}
    </Space>
  );
}

/** Approve (with an optional staff note) or reject (with a reason the rider sees). */
export function useDocumentReview() {
  const { message, modal } = AntApp.useApp();
  const approve = useDeliveryMutation(({ id, note }: { id: string; note?: string }) => deliveryApi.approveDocument(id, note));
  const reject = useDeliveryMutation(({ id, reason, note }: { id: string; reason: string; note?: string }) => deliveryApi.rejectDocument(id, { reason, note }));
  return {
    approve: (doc: { id: string }, name: string, riderName?: string) => {
      let note = '';
      modal.confirm({
        title: `Approve ${name}${riderName ? ` for ${riderName}` : ''}?`,
        icon: <CheckOutlined style={{ color: '#52c41a' }} />,
        content: (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary">Only approve after checking the document is genuine, readable and belongs to this rider.</Typography.Text>
            <Input.TextArea rows={2} maxLength={300} placeholder="Note on the check made (staff only, optional)" onChange={(e) => (note = e.target.value)} />
          </Space>
        ),
        okText: 'Approve',
        onOk: async () => {
          try {
            await approve.mutateAsync({ id: doc.id, note: note.trim() || undefined });
            message.success(`${name} approved`);
          } catch (e) {
            message.error(apiErrorMessage(e));
            throw e;
          }
        },
      });
    },
    reject: (doc: { id: string; status?: string }, name: string, riderName?: string) => {
      let reason = '';
      let note = '';
      const revoking = doc.status === 'APPROVED';
      modal.confirm({
        title: `${revoking ? 'Withdraw approval of' : 'Reject'} ${name}${riderName ? ` for ${riderName}` : ''}?`,
        content: (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              The rider sees the reason and is asked to upload it again.{revoking ? ' They stop getting orders until a new copy is approved.' : ''}
            </Typography.Text>
            <Input.TextArea rows={2} maxLength={300} placeholder="Reason, e.g. Photo is blurred - name not readable" onChange={(e) => (reason = e.target.value)} />
            <Input.TextArea rows={1} maxLength={300} placeholder="Internal note (optional)" onChange={(e) => (note = e.target.value)} />
          </Space>
        ),
        okText: revoking ? 'Withdraw approval' : 'Reject',
        okButtonProps: { danger: true },
        onOk: async () => {
          if (reason.trim().length < 3) {
            message.error('Give the rider a reason');
            throw new Error('reason');
          }
          try {
            await reject.mutateAsync({ id: doc.id, reason: reason.trim(), note: note.trim() || undefined });
            message.success(revoking ? 'Approval withdrawn' : `${name} rejected - the rider has been asked to upload again`);
          } catch (e) {
            message.error(apiErrorMessage(e));
            throw e;
          }
        },
      });
    },
  };
}

function UploadDetails({ u }: { u: RiderDocUpload }) {
  return (
    <Descriptions size="small" column={1} style={{ marginTop: 10 }} items={[
      ...(u.documentNumber ? [{ key: 'n', label: 'Number', children: u.documentNumber }] : []),
      ...(u.issuedBy ? [{ key: 'b', label: 'Issued by', children: u.issuedBy }] : []),
      ...(u.issuedOn ? [{ key: 'i', label: 'Issued on', children: fmt(u.issuedOn) }] : []),
      ...(u.expiresOn ? [{ key: 'e', label: 'Valid till', children: fmt(u.expiresOn) }] : []),
      { key: 'u', label: 'Uploaded', children: dayjs(u.uploadedAt).format('D MMM YYYY, h:mm A') },
      ...(u.reviewedAt ? [{ key: 'r', label: 'Reviewed', children: `${dayjs(u.reviewedAt).format('D MMM YYYY')}${u.reviewedBy ? ` by ${u.reviewedBy}` : ''}` }] : []),
      ...(u.reviewNote ? [{ key: 'rn', label: 'Staff note', children: u.reviewNote }] : []),
    ]} />
  );
}

/** One document type on the rider: status, the files, and the review buttons. */
function DocumentCard({ item, riderName }: { item: RiderDocItem; riderName: string }) {
  const canVerify = useCan('RIDERS_VERIFY');
  const review = useDocumentReview();
  const st = DOC_STATE[item.state];
  const cur = item.current;
  return (
    <Card size="small" className="page-card" style={{ height: '100%' }}
      title={<Space size={6} wrap><span>{item.type.name}</span>{item.mandatory ? null : <Tag>Optional</Tag>}</Space>}
      extra={<Tag color={st.color}>{st.label}</Tag>}>
      {!cur ? <Typography.Text type="secondary">Not uploaded yet.</Typography.Text> : (
        <>
          <DocFiles urls={cur.fileUrls} />
          <UploadDetails u={cur} />
          {cur.status === 'REJECTED' && cur.rejectionReason ? <Alert type="error" showIcon style={{ marginTop: 8 }} message={`Rejected: ${cur.rejectionReason}`} /> : null}
          {item.approvedInForce ? (
            <Alert type="info" showIcon style={{ marginTop: 8 }}
              message={`An earlier copy approved on ${fmt(item.approvedInForce.reviewedAt)} stays valid${item.approvedInForce.expiresOn ? ` till ${fmt(item.approvedInForce.expiresOn)}` : ''} until this one is reviewed.`} />
          ) : null}
          {item.satisfied && item.validUntil ? <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>Approval counts until {dayjs(item.validUntil).subtract(1, 'minute').format('D MMM YYYY')}.</Typography.Text> : null}
          {canVerify ? (
            <Space style={{ marginTop: 12 }}>
              {cur.status === 'PENDING' ? <Button type="primary" icon={<CheckOutlined />} onClick={() => review.approve(cur, item.type.name, riderName)}>Approve</Button> : null}
              {cur.status !== 'REJECTED' ? (
                <Button danger icon={<CloseOutlined />} onClick={() => review.reject(cur, item.type.name, riderName)}>{cur.status === 'APPROVED' ? 'Withdraw approval' : 'Reject'}</Button>
              ) : null}
            </Space>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Rider detail → Verification: the checklist, every document incl. the PCC, and the audit trail. */
export function VerificationPanel({ riderId, riderName }: { riderId: string; riderName: string }) {
  const v = useRiderVerification(riderId);
  if (v.isLoading) return <Card loading className="page-card" />;
  if (!v.data) return <Empty description={apiErrorMessage(v.error)} />;
  const data = v.data;
  const docs = data.documents.filter((d) => d.type.code !== 'PCC');
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {data.eligible ? (
        <Alert type="success" showIcon message="Verification complete"
          description={`Every mandatory document, the Police Clearance Certificate${data.deposit.required ? ' and the security deposit' : ''} are cleared.${data.verifiedUntil ? ` Lapses on ${dayjs(data.verifiedUntil).subtract(1, 'minute').format('D MMM YYYY')} unless renewed.` : ''}`} />
      ) : (
        <Alert type="warning" showIcon message={`Not verified - ${data.status === 'ACTIVE' ? 'gets no orders' : 'cannot be approved'} until these are done`}
          description={<ul style={{ margin: 0, paddingLeft: 18 }}>{data.missing.map((m) => <li key={m}>{m}</li>)}</ul>} />
      )}
      <Typography.Title level={5} style={{ margin: 0 }}>Documents</Typography.Title>
      <Row gutter={[16, 16]}>
        {docs.map((d) => <Col key={d.type.id} xs={24} md={12} xl={8}><DocumentCard item={d} riderName={riderName} /></Col>)}
      </Row>
      {data.pcc ? (
        <>
          <Typography.Title level={5} style={{ margin: 0 }}>Police Clearance Certificate</Typography.Title>
          <Row gutter={[16, 16]}><Col xs={24} md={12} xl={8}><DocumentCard item={data.pcc} riderName={riderName} /></Col></Row>
        </>
      ) : null}
      <Typography.Title level={5} style={{ margin: 0 }}>Upload history</Typography.Title>
      <Table size="small" rowKey="id" dataSource={data.history} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: <Empty description="Nothing uploaded yet" /> }}
        columns={[
          { title: 'Uploaded', dataIndex: 'uploadedAt', render: (d: string) => dayjs(d).format('D MMM YYYY, h:mm A') },
          { title: 'Document', key: 't', render: (_, h) => h.type.name },
          { title: 'Status', key: 's', render: (_, h) => <Space size={4}><Tag color={UPLOAD_STATUS[h.status].color}>{UPLOAD_STATUS[h.status].label}</Tag>{h.supersededAt ? <Tag>Replaced</Tag> : null}</Space> },
          { title: 'Reviewed', key: 'r', render: (_, h) => (h.reviewedAt ? `${fmt(h.reviewedAt)}${h.reviewedBy ? ` · ${h.reviewedBy}` : ''}` : '—') },
          { title: 'Reason / note', key: 'n', render: (_, h) => [h.rejectionReason, h.reviewNote].filter(Boolean).join(' · ') || '—' },
          { title: 'Files', key: 'f', render: (_, h) => <DocFiles urls={h.fileUrls} size={40} /> },
        ]} />
    </Space>
  );
}

/** Rider detail → Security deposit: required / paid / pending, the ledger, and recording money in or out. */
export function DepositPanel({ riderId }: { riderId: string }) {
  const q = useRiderDeposit(riderId);
  const canRecord = useCan('RIDER_DEPOSIT_RECORD');
  const [recording, setRecording] = useState(false);
  const dep = q.data;
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" className="page-card" loading={q.isLoading}>
        {dep ? (
          <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
            <Space size={32} wrap>
              <div><div className="page-field-label">Status</div><Tag color={DEPOSIT_STATUS[dep.status].color} style={{ marginTop: 6 }}>{DEPOSIT_STATUS[dep.status].label}</Tag></div>
              <div><div className="page-field-label">Required</div><div className="page-stat-value">{inr(dep.requiredAmount)}</div></div>
              <div><div className="page-field-label">Paid</div><div className="page-stat-value">{inr(dep.paid)}</div></div>
              <div><div className="page-field-label">Pending</div><div className="page-stat-value" style={{ color: dep.pending > 0 ? '#d46b08' : undefined }}>{inr(dep.pending)}</div></div>
            </Space>
            {canRecord ? <Button type="primary" onClick={() => setRecording(true)}>Record entry</Button> : null}
          </Space>
        ) : null}
        {dep && !dep.required ? <Typography.Text type="secondary" style={{ display: 'block', marginTop: 10 }}>No deposit is required at the moment (Super Admin sets this in Delivery Settings → Rider onboarding).</Typography.Text> : null}
      </Card>
      <Table size="small" rowKey="id" loading={q.isLoading} dataSource={dep?.entries ?? []} pagination={{ pageSize: 15, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description="No deposit recorded yet" /> }}
        columns={[
          { title: 'When', dataIndex: 'createdAt', render: (d: string) => dayjs(d).format('D MMM YYYY, h:mm A') },
          { title: 'What', dataIndex: 'type', render: (t: DepositEntryType) => <Tag color={ENTRY[t].color}>{ENTRY[t].label}</Tag> },
          { title: 'Method', dataIndex: 'method', render: (m: DepositMethod | null) => (m ? METHOD[m] : '—') },
          { title: 'Reference', dataIndex: 'reference', render: (v) => v ?? '—' },
          { title: 'Note', dataIndex: 'note', render: (v) => v ?? '—' },
          { title: 'Recorded by', key: 'b', render: (_, e) => e.recordedBy ?? (e.online ? 'Rider app' : '—') },
          { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v: number) => <Typography.Text strong type={v < 0 ? 'danger' : 'success'}>{v < 0 ? '−' : '+'}{inr(Math.abs(v))}</Typography.Text> },
        ]} />
      <RecordDepositModal riderId={recording ? riderId : null} pending={dep?.pending ?? 0} paid={dep?.paid ?? 0} onClose={() => setRecording(false)} />
    </Space>
  );
}

function RecordDepositModal({ riderId, pending, paid, onClose }: { riderId: string | null; pending: number; paid: number; onClose: () => void }) {
  const [form] = Form.useForm<{ type: DepositEntryType; amount: number; direction?: 'add' | 'deduct'; method?: DepositMethod; reference?: string; note?: string }>();
  const type = Form.useWatch('type', form);
  const { message } = AntApp.useApp();
  const m = useDeliveryMutation((b: Parameters<typeof deliveryApi.recordDeposit>[1]) => deliveryApi.recordDeposit(riderId!, b));
  return (
    <Modal open={Boolean(riderId)} title="Security deposit entry" okText="Record" confirmLoading={m.isPending} destroyOnHidden onCancel={onClose}
      onOk={async () => {
        const v = await form.validateFields();
        try {
          await m.mutateAsync({
            type: v.type, amount: v.type === 'ADJUSTMENT' && v.direction === 'deduct' ? -v.amount : v.amount,
            method: v.type === 'PAYMENT' || v.type === 'REFUND' ? v.method : undefined, reference: v.reference?.trim() || undefined, note: v.note?.trim() || undefined,
          });
          message.success('Recorded');
          onClose();
        } catch (e) {
          message.error(apiErrorMessage(e));
        }
      }}>
      <Typography.Paragraph type="secondary">On deposit now {inr(paid)}{pending > 0 ? ` · ${inr(pending)} still pending` : ''}.</Typography.Paragraph>
      <Form form={form} layout="vertical" preserve={false} initialValues={{ type: 'PAYMENT', amount: pending > 0 ? pending : undefined, method: 'CASH', direction: 'add' }}>
        <Form.Item name="type" label="Entry">
          <Select options={[
            { value: 'PAYMENT', label: 'Payment received from the rider' },
            { value: 'REFUND', label: 'Refund to the rider (e.g. leaving)' },
            { value: 'FORFEIT', label: 'Keep part of it (loss / damage)' },
            { value: 'ADJUSTMENT', label: 'Correction' },
          ]} />
        </Form.Item>
        {type === 'ADJUSTMENT' ? (
          <Form.Item name="direction" label="Direction"><Select options={[{ value: 'add', label: 'Increase what is on deposit' }, { value: 'deduct', label: 'Decrease what is on deposit' }]} /></Form.Item>
        ) : null}
        <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter an amount' }]}>
          <InputNumber prefix="₹" min={0.01} max={type === 'REFUND' || type === 'FORFEIT' ? paid : undefined} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        {type === 'PAYMENT' || type === 'REFUND' ? (
          <Form.Item name="method" label="How">
            <Select options={(['CASH', 'UPI', 'BANK_TRANSFER', 'EARNINGS_DEDUCTION', 'OTHER'] as DepositMethod[]).map((k) => ({ value: k, label: METHOD[k] }))} />
          </Form.Item>
        ) : null}
        <Form.Item name="reference" label="Reference" extra="Receipt, UTR or slip number"><Input maxLength={80} /></Form.Item>
        <Form.Item name="note" label="Note" rules={type && type !== 'PAYMENT' ? [{ required: true, min: 3, message: 'Say why (the rider sees this)' }] : []}>
          <Input.TextArea rows={2} maxLength={300} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
