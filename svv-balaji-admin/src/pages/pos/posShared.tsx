import { CreditCardOutlined, DollarOutlined, QrcodeOutlined } from '@ant-design/icons';
import { Select, Tag } from 'antd';
import type { SelectProps } from 'antd';
import { useEffect } from 'react';
import { invoicesApi } from '@shared/api/invoices';
import { PAYMENT_MODE_LABEL, type PosPaymentMode, type PosSale } from '@shared/api/pos';
import { usePosOutlets } from '@shared/hooks/usePos';
import { printTaxInvoice } from '@shared/utils/taxInvoicePrint';
import { downloadPosReceipt } from '../../utils/invoiceGenerator';

const LAST_OUTLET_KEY = 'svv_pos_last_outlet';

/** The store this browser last used - a per-terminal convenience only, never the source of any data. */
export function rememberedOutlet(): string | undefined {
  try {
    return localStorage.getItem(LAST_OUTLET_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function remember(id: string | undefined) {
  try {
    if (id) localStorage.setItem(LAST_OUTLET_KEY, id);
  } catch {
    // private mode / blocked storage: the picker still works, it just does not remember
  }
}

/**
 * Active company stores from the database. With `autoSelect` it picks the
 * remembered store (or the only one) so a terminal opens ready to bill.
 */
export function OutletPicker({
  value,
  onChange,
  allowAll,
  autoSelect,
  ...rest
}: { value?: string; onChange: (id: string | undefined) => void; allowAll?: boolean; autoSelect?: boolean } & Omit<SelectProps, 'value' | 'onChange' | 'options'>) {
  const outlets = usePosOutlets();
  const list = outlets.data ?? [];

  useEffect(() => {
    if (!autoSelect || value || list.length === 0) return;
    const last = rememberedOutlet();
    const pick = list.find((o) => o.id === last) ?? (list.length === 1 ? list[0] : undefined);
    if (pick) onChange(pick.id);
  }, [autoSelect, value, list, onChange]);

  return (
    <Select
      showSearch
      optionFilterProp="label"
      loading={outlets.isLoading}
      placeholder={list.length === 0 && !outlets.isLoading ? 'No stores yet - register one on Outlets' : allowAll ? 'All stores' : 'Choose a store'}
      allowClear={allowAll}
      value={value}
      onChange={(v) => {
        remember(v);
        onChange(v);
      }}
      options={list.map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }))}
      style={{ width: 280 }}
      {...rest}
    />
  );
}

const MODE_STYLE: Record<PosPaymentMode, { color: string; icon: JSX.Element }> = {
  CASH: { color: 'green', icon: <DollarOutlined /> },
  UPI: { color: 'cyan', icon: <QrcodeOutlined /> },
  CARD: { color: 'purple', icon: <CreditCardOutlined /> },
};

export function PaymentTag({ mode }: { mode: PosPaymentMode }) {
  return <Tag color={MODE_STYLE[mode].color} icon={MODE_STYLE[mode].icon} style={{ margin: 0 }}>{PAYMENT_MODE_LABEL[mode]}</Tag>;
}

/**
 * Print what the customer should get: the GST tax invoice when one was issued
 * (normal case), otherwise a plain receipt that says it is not a tax invoice.
 * Returns false when the browser blocked the pop-up.
 */
export async function printSale(sale: PosSale): Promise<boolean> {
  if (sale.invoice) {
    const inv = await invoicesApi.get(sale.invoice.id);
    return printTaxInvoice(inv);
  }
  return downloadPosReceipt(sale);
}
