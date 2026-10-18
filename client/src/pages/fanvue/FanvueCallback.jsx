import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleAlert, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { Button } from '@/components/ui/button';

/**
 * Where Fanvue sends the creator back after she approves access (the address
 * listed on the app's Authentication tab on Fanvue). Hands the one-time code to
 * the server, then returns to Settings → Fanvue.
 */
// Fanvue's answer, from the address it sent us back to.
function readAnswer() {
  const q = new URLSearchParams(window.location.search);
  const denied = q.get('error');
  return {
    code: q.get('code'), state: q.get('state'),
    error: denied ? (denied === 'access_denied' ? 'Access wasn’t approved on Fanvue.' : `Fanvue said: ${q.get('error_description') || denied}`) : null,
  };
}

export default function FanvueCallback() {
  const navigate = useNavigate();
  const [answer] = useState(readAnswer);
  const [error, setError] = useState(answer.error);
  const sent = useRef(false);            // the code works once: never send it twice

  useEffect(() => {
    if (sent.current || answer.error) return;
    sent.current = true;
    api.post('/api/fanvue/callback', { code: answer.code, state: answer.state })
      .then(({ data }) => {
        toast.success(`Connected @${data.account.handle}. Copying the chats in…`);
        navigate('/settings?tab=fanvue', { replace: true });
      })
      .catch(e => setError(e?.response?.data?.error || 'Could not finish the Fanvue connection.'));
  }, [answer, navigate]);

  return (
    <div className='mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center'>
      {error ? (
        <>
          <CircleAlert className='size-8 text-warn' />
          <p className='font-medium'>The Fanvue connection didn’t finish</p>
          <p className='text-sm text-muted-foreground'>{error}</p>
          <Button variant='outline' onClick={() => navigate('/settings?tab=fanvue', { replace: true })}>Back to Settings</Button>
        </>
      ) : (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='size-4 animate-spin' />Finishing the Fanvue connection…</p>
      )}
    </div>
  );
}
