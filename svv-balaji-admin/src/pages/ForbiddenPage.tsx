import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '../auth/types';
import { useAuth } from '../auth/useAuth';

export function ForbiddenPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <Result
      status="403"
      title="403"
      subTitle={
        user
          ? `Your role (${ROLE_LABELS[user.role]}) does not have access to that screen.`
          : 'You do not have access to that screen.'
      }
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          Back to dashboard
        </Button>
      }
    />
  );
}
