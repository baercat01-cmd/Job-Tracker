import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Users, ListTodo, UserPlus, Calendar } from 'lucide-react';
import { SubcontractorScheduling } from './SubcontractorScheduling';
import { AllJobsTaskManagement } from './AllJobsTaskManagement';
import { SubcontractorManagement } from './SubcontractorManagement';

export function EnhancedScheduleView() {
  const [subcontractorView, setSubcontractorView] = useState<'list' | 'schedule'>('schedule');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-green-900 tracking-tight">Master Schedule</h2>
          <p className="text-black">Manage tasks and subcontractor work</p>
        </div>
      </div>

      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-white border-2 border-slate-300 rounded-none">
          <TabsTrigger value="tasks" className="rounded-none data-[state=active]:bg-green-900 data-[state=active]:text-white">
            <ListTodo className="w-4 h-4 mr-2" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="subcontractors" className="rounded-none data-[state=active]:bg-green-900 data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-2" />
            Subcontractors
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          <AllJobsTaskManagement />
        </TabsContent>

        <TabsContent value="subcontractors" className="mt-4">
          <div className="space-y-4">
            {/* Toggle between List and Schedule views */}
            <div className="flex gap-2 border-b pb-2">
              <Button
                variant={subcontractorView === 'list' ? 'default' : 'outline'}
                onClick={() => setSubcontractorView('list')}
                className="flex-1"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Manage Subcontractors
              </Button>
              <Button
                variant={subcontractorView === 'schedule' ? 'default' : 'outline'}
                onClick={() => setSubcontractorView('schedule')}
                className="flex-1"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Schedule Work
              </Button>
            </div>

            {/* Conditional rendering based on view */}
            {subcontractorView === 'list' ? (
              <SubcontractorManagement />
            ) : (
              <SubcontractorScheduling />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
