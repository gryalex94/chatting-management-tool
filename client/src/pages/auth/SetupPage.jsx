import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, MessagesSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Calm, neutral brand mark shown above the card (same as the sign-in page).
function AuthBrand() {
  return (
    <div className='mb-4 flex items-center justify-center gap-2'>
      <div className='flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
        <MessagesSquare className='size-4' />
      </div>
      <h1 className='text-xl font-medium'>Chat Manager</h1>
    </div>
  );
}

// Public sign-up is closed on the server unless ALLOW_SIGNUP=true; this page
// only succeeds when it has been deliberately switched on.
export default function SetupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', orgName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError('');
    try { await api.post('/api/auth/setup', form); toast.success('Organisation created!'); navigate('/login'); }
    catch (err) {
      const msg = err.response?.data?.error || 'Setup failed';
      setError(msg);
      toast.error(msg);
    }
    finally { setLoading(false); }
  }

  return (
    <div className='flex min-h-svh items-center justify-center bg-background px-4 py-8'>
      <div className='w-full max-w-sm'>
        <AuthBrand />
        <Card className='gap-4'>
          <CardHeader>
            <CardTitle className='text-lg tracking-tight'>Set up your organisation</CardTitle>
            <CardDescription>Create your organisation and its first admin account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='grid gap-3'>
              {error && (
                <Alert variant='destructive'>
                  <AlertCircle />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className='grid gap-2'>
                <Label htmlFor='setup-org'>Organisation name</Label>
                <Input id='setup-org' value={form.orgName} onChange={e => u('orgName', e.target.value)} required placeholder='e.g. RICE-MEDIA' />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='setup-name'>Your name</Label>
                <Input id='setup-name' autoComplete='name' value={form.name} onChange={e => u('name', e.target.value)} required />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='setup-email'>Email</Label>
                <Input id='setup-email' type='email' autoComplete='email' value={form.email} onChange={e => u('email', e.target.value)} required />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='setup-password'>Password</Label>
                <Input id='setup-password' type='password' autoComplete='new-password' value={form.password} onChange={e => u('password', e.target.value)} required minLength={6} />
                <p className='text-xs text-muted-foreground'>At least 6 characters.</p>
              </div>
              <Button type='submit' className='mt-2' disabled={loading}>
                {loading && <Loader2 className='animate-spin' />}
                {loading ? 'Creating…' : 'Create organisation'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
