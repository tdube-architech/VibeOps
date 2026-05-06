import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewProjectWizard } from './NewProjectWizard';

export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" /> New project
      </Button>
      <NewProjectWizard open={open} onOpenChange={setOpen} />
    </>
  );
}
