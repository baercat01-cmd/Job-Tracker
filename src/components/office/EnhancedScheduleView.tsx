import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, ListTodo } from 'lucide-react';
import { SubcontractorScheduling } from './SubcontractorScheduling';
import { AllJobsTaskManagement } from './AllJobsTaskManagement';

export function EnhancedScheduleView() {
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
          <SubcontractorScheduling />
        </TabsContent>
      </Tabs>
    </div>
  );
}
