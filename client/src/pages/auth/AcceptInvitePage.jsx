import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircleAlert, Loader2, MessagesSquare, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Where an invited staff member lands from the link they were sent
// (/invite/<token>). They choose a name and password; the account is created
// with the role and organisation fixed in the invitation.
export default function AcceptInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = name.trim() && password.length >= 8 && confirm === password && !loading;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(''); setLoading(true);
    try {
      await api.post('/api/auth/accept-invite', { token, name: name.trim(), password });
      toast.success('Account created. You can sign in now.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'This invitation could not be accepted.');
    } finally { setLoading(false); }
  }

  return (
    <div className='flex min-h-svh items-center justify-center bg-background px-4 py-8'>
      <div className='w-full max-w-sm'>
        <div className='mb-4 flex items-center justify-center gap-2'>
          <div className='flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
            <MessagesSquare className='size-4' />
          </div>
          <h1 className='text-xl font-medium'>Chat Manager</h1>
        </div>
        <Card className='gap-4'>
          <CardHeader>
            <CardTitle className='text-lg tracking-tight'>Join your team</CardTitle>
            <CardDescription>You've been invited. Choose your name and a password to create your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='grid gap-3'>
              {error && (
                <Alert variant='destructive'>
                  <CircleAlert />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className='grid gap-2'>
                <Label htmlFor='invite-name'>Your name</Label>
                <Input id='invite-name' autoComplete='name' value={name} onChange={e => setName(e.target.value)} required autoFocus />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='invite-password'>Password</Label>
                <Input id='invite-password' type='password' autoComplete='new-password' value={password}
                  onChange={e => setPassword(e.target.value)} required aria-invalid={tooShort || undefined} />
                {tooShort && <p className='text-xs text-bad'>Use at least 8 characters.</p>}
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='invite-confirm'>Confirm password</Label>
                <Input id='invite-confirm' type='password' autoComplete='new-password' value={confirm}
                  onChange={e => setConfirm(e.target.value)} required aria-invalid={mismatch || undefined} />
                {mismatch && <p className='text-xs text-bad'>The passwords don't match.</p>}
              </div>
              <Button type='submit' className='mt-2' disabled={!canSubmit}>
                {loading ? <Loader2 className='animate-spin' /> : <UserPlus />}
                {loading ? 'Creating account…' : 'Create account'}
              </Button>
              <p className='text-center text-sm text-muted-foreground'>
                Already have an account? <Link to='/login' className='text-link underline-offset-4 hover:underline'>Sign in</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
