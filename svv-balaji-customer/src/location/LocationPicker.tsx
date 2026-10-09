import { AimOutlined, EnvironmentOutlined, HomeOutlined, SearchOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Divider, Input, Modal, Spin, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { checkoutApi, type GeoAddress } from '../api/checkout';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { setShopperLocation, type ShopperLocation } from './useShopperLocation';

const newSession = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function fromGeo(g: GeoAddress, source: ShopperLocation['source'], fallbackTitle: string): ShopperLocation {
  const title = g.line2 || g.line1?.split(',')[0] || g.city || fallbackTitle;
  const subtitle = [g.city, g.state, g.pincode].filter(Boolean).join(', ') || g.formatted;
  return { title, subtitle, pincode: g.pincode, latitude: g.latitude, longitude: g.longitude, source };
}

/**
 * "Where are you?" sheet: current location (asks the browser), a saved
 * address, a search, or typed by hand when maps are unavailable.
 */
export function LocationPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = AntApp.useApp();
  const { isLoggedIn } = useCustomerAuth();
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; main: string; secondary: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState({ area: '', city: '', pincode: '' });
  const session = useRef(newSession());

  const addresses = useQuery({ queryKey: ['addresses'], queryFn: checkoutApi.addresses, enabled: open && isLoggedIn });

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSuggestions([]);
    session.current = newSession();
  }, [open]);

  // Debounced place search through our API (the Google key stays server-side).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      checkoutApi
        .placeSuggestions(q, session.current)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const done = (l: ShopperLocation) => {
    setShopperLocation(l);
    message.success(`Location set to ${l.title}`);
    onClose();
  };

  const useCurrent = () => {
    if (!navigator.geolocation) {
      message.warning('Your browser cannot share its location - pick or type it below.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latitude = +pos.coords.latitude.toFixed(6);
        const longitude = +pos.coords.longitude.toFixed(6);
        const g = await checkoutApi.reverseGeocode(latitude, longitude).catch(() => null);
        setLocating(false);
        done(g ? fromGeo({ ...g, latitude, longitude }, 'GPS', 'Current location') : { title: 'Current location', subtitle: null, pincode: null, latitude, longitude, source: 'GPS' });
      },
      (err) => {
        setLocating(false);
        message.warning(err.code === err.PERMISSION_DENIED ? 'Location permission was denied - pick or type it below.' : 'Could not get your location - pick or type it below.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const pickPlace = async (placeId: string, main: string) => {
    setSearching(true);
    const g = await checkoutApi.placeAddress(placeId, session.current).catch(() => null);
    setSearching(false);
    session.current = newSession();
    done(g ? { ...fromGeo(g, 'SEARCH', main), title: main } : { title: main, subtitle: null, pincode: null, latitude: null, longitude: null, source: 'SEARCH' });
  };

  const saveManual = () => {
    const area = manual.area.trim();
    const city = manual.city.trim();
    const pincode = manual.pincode.trim();
    if (!area || !city) {
      message.warning('Enter at least the area and city');
      return;
    }
    if (pincode && !/^\d{6}$/.test(pincode)) {
      message.warning('Pincode must be 6 digits');
      return;
    }
    done({ title: area, subtitle: [city, pincode].filter(Boolean).join(', '), pincode: pincode || null, latitude: null, longitude: null, source: 'MANUAL' });
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} title="Choose your location" width={440} destroyOnClose>
      <Button type="primary" block size="large" icon={<AimOutlined />} loading={locating} onClick={useCurrent}
        style={{ background: '#059669', borderColor: '#059669', fontWeight: 600, borderRadius: 10 }}>
        Use my current location
      </Button>

      <Input
        style={{ marginTop: 12, borderRadius: 10 }}
        size="large"
        allowClear
        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
        suffix={searching ? <Spin size="small" /> : null}
        placeholder="Search area, street or pincode"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {suggestions.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
          {suggestions.map((s) => (
            <button key={s.placeId} type="button" onClick={() => void pickPlace(s.placeId, s.main)}
              style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
              <EnvironmentOutlined style={{ color: '#ea580c', marginTop: 3 }} />
              <span style={{ minWidth: 0 }}>
                <Typography.Text strong style={{ display: 'block', fontSize: 13 }}>{s.main}</Typography.Text>
                {s.secondary ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{s.secondary}</Typography.Text> : null}
              </span>
            </button>
          ))}
        </div>
      )}

      {(addresses.data?.length ?? 0) > 0 && (
        <>
          <Divider plain style={{ fontSize: 12, margin: '16px 0 8px' }}>Saved addresses</Divider>
          {addresses.data!.map((a) => (
            <button key={a.id} type="button"
              onClick={() => done({
                title: a.line2 || a.line1.split(',')[0], subtitle: [a.city, a.state, a.pincode].filter(Boolean).join(', '), pincode: a.pincode,
                latitude: a.latitude ? Number(a.latitude) : null, longitude: a.longitude ? Number(a.longitude) : null, source: 'ADDRESS',
              })}
              style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'left', padding: '10px 4px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
              <HomeOutlined style={{ color: '#059669', marginTop: 3 }} />
              <span style={{ minWidth: 0 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>{a.label}</Typography.Text>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{[a.line1, a.city, a.pincode].filter(Boolean).join(', ')}</Typography.Text>
              </span>
            </button>
          ))}
        </>
      )}

      <Divider plain style={{ fontSize: 12, margin: '16px 0 8px' }}>Or type it</Divider>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Input placeholder="Area / locality" value={manual.area} onChange={(e) => setManual({ ...manual, area: e.target.value })} style={{ gridColumn: '1 / -1' }} maxLength={60} />
        <Input placeholder="City" value={manual.city} onChange={(e) => setManual({ ...manual, city: e.target.value })} maxLength={40} />
        <Input placeholder="Pincode" inputMode="numeric" value={manual.pincode} onChange={(e) => setManual({ ...manual, pincode: e.target.value.replace(/\D/g, '') })} maxLength={6} />
      </div>
      <Button block style={{ marginTop: 10, borderRadius: 10 }} onClick={saveManual}>Save location</Button>
    </Modal>
  );
}
