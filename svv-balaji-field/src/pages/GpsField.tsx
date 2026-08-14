import { AimOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Input, Space, Tooltip, Typography } from 'antd';
import { useState } from 'react';

/**
 * A "lat,lng" input with a Use my location button.
 *
 * Two things worth knowing before this confuses somebody:
 *
 *   1. **Geolocation only works on HTTPS or localhost.** Opening the panel on a
 *      phone at http://192.168.x.x — which is exactly how you would test this —
 *      gives no permission prompt and a silent failure. So the button says why
 *      rather than doing nothing, and typing coordinates by hand always works.
 *
 *   2. **Accuracy is reported, not hidden.** A phone indoors returns a position
 *      derived from wifi that can be a kilometre out, with no visible difference
 *      from a good GPS fix. Since this coordinate ends up on a consumer-facing
 *      trace page as "where your food was grown", a 1km error matters, and the
 *      executive is the only person who can judge whether to retake it.
 */
export function GpsField({
  value,
  onChange,
  disabled,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  // window.isSecureContext is true on https and on localhost, which is exactly
  // the condition the geolocation API itself uses.
  const secure = typeof window !== 'undefined' && window.isSecureContext;

  const capture = () => {
    if (!supported) {
      setError('This browser cannot report a location.');
      return;
    }
    if (!secure) {
      setError(
        'Location needs HTTPS. Over a plain IP address the browser refuses silently — type the ' +
          'coordinates in, or open the panel over https.',
      );
      return;
    }

    setBusy(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy: metres } = position.coords;
        onChange(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        setAccuracy(Math.round(metres));
        setBusy(false);
      },
      (failure) => {
        setBusy(false);
        setError(
          failure.code === failure.PERMISSION_DENIED
            ? 'Location permission was refused. Allow it in the browser settings, or type the coordinates in.'
            : failure.code === failure.TIMEOUT
              ? 'Timed out looking for a signal. Standing outside usually fixes it.'
              : 'Could not get a location.',
        );
      },
      // A long timeout on purpose: a first fix outdoors on a cheap handset can
      // take 20 seconds, and failing at 5 would train people not to use it.
      { enableHighAccuracy: true, timeout: 25_000, maximumAge: 0 },
    );
  };

  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="19.076000, 72.877700"
          disabled={disabled}
          inputMode="decimal"
        />
        <Tooltip title={secure ? 'Read the phone GPS' : 'Needs HTTPS'}>
          <Button icon={<AimOutlined />} onClick={capture} loading={busy} disabled={disabled}>
            Here
          </Button>
        </Tooltip>
      </Space.Compact>

      {accuracy !== null ? (
        <Typography.Text type={accuracy > 50 ? 'warning' : 'success'} style={{ fontSize: 12 }}>
          {accuracy > 50 ? <WarningOutlined /> : null} Accurate to about {accuracy} m
          {accuracy > 50
            ? ' — that is a wifi-derived position, not GPS. Step outside and take it again if this plot needs to be findable.'
            : '.'}
        </Typography.Text>
      ) : null}

      {error ? (
        <Typography.Text type="danger" style={{ fontSize: 12 }}>
          {error}
        </Typography.Text>
      ) : null}
    </Space>
  );
}
