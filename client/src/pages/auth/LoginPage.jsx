import { useState } from 'react';
import { Loader2, LogIn, MessagesSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Calm, neutral brand mark shown above the sign-in card.
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

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try { await signIn(email, password); toast.success('Welcome back!'); }
    catch (err) { toast.error(err.message || 'Login failed'); }
    finally { setLoading(false); }
  }

  return (
    <div className='flex min-h-svh items-center justify-center bg-background px-4 py-8'>
      <div className='w-full max-w-sm'>
        <AuthBrand />
        <Card className='gap-4'>
          <CardHeader>
            <CardTitle className='text-lg tracking-tight'>Sign in</CardTitle>
            <CardDescription>Enter your email and password to sign in to your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='grid gap-3'>
              <div className='grid gap-2'>
                <Label htmlFor='login-email'>Email</Label>
                <Input id='login-email' type='email' autoComplete='email' value={email}
                  onChange={e => setEmail(e.target.value)} required placeholder='you@example.com' />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='login-password'>Password</Label>
                <Input id='login-password' type='password' autoComplete='current-password' value={password}
                  onChange={e => setPassword(e.target.value)} required placeholder='********' />
              </div>
              <Button type='submit' className='mt-2' disabled={loading}>
                {loading ? <Loader2 className='animate-spin' /> : <LogIn />}
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
