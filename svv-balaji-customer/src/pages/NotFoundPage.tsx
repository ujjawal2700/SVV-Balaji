import { Button, Result } from 'antd';
import { Link } from 'react-router-dom';

/**
 * A real 404, unlike the field app which redirects home.
 *
 * That app has five destinations and every user has been trained on it, so a bad
 * URL there is a stale bookmark. This one is public, indexed, and reached from
 * printed packaging — a mistyped batch number or an old campaign link is normal,
 * and silently redirecting to the home page tells the person nothing about why
 * what they scanned did not work.
 */
export function NotFoundPage() {
  return (
    <div className="store-container store-container--narrow">
      <Result
        status="404"
        title="Page not found"
        subTitle="That link may be out of date. If you scanned a pack, check the batch number printed beside the QR code."
        extra={
          <Link to="/">
            <Button type="primary">Go to the shop</Button>
          </Link>
        }
      />
    </div>
  );
}
