import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props { children: React.ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Render error:', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6">
        <Card>
          <CardHeader><CardTitle>Something went wrong</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <pre className="rounded-md border border-border bg-card/40 p-3 text-xs">{this.state.error.message}</pre>
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}
