import { LogOut } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth, signOut } from './useAuth';

export function AccountCard() {
  const { state } = useAuth();
  const user = state?.user;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          {user ? <>Signed in as <span className="font-medium">{user.email ?? user.id}</span></> : 'Not signed in.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase text-muted-foreground">Plan</span>
          <Badge variant="secondary">Free</Badge>
        </div>
        {user && (
          <Button variant="outline" onClick={() => { void signOut(); }}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
