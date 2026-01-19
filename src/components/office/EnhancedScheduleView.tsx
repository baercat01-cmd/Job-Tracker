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
      <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-black to-slate-900 text-white rounded-lg p-4 shadow-lg border-2 border-yellow-500">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Master Schedule</h2>
          <p className="text-yellow-400">Manage tasks and subcontractor work</p>
        </div>
      </div>

      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-black border-2 border-yellow-500 rounded-none shadow-lg">
          <TabsTrigger value="tasks" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
            <ListTodo className="w-4 h-4 mr-2" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="subcontractors" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
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
            <div className="space-y-2 border-b-2 border-yellow-500/30 pb-4">
              <Button
                variant={subcontractorView === 'schedule' ? 'default' : 'outline'}
                onClick={() => setSubcontractorView('schedule')}
                className={subcontractorView === 'schedule' ? "w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold shadow-lg border-2 border-yellow-400" : "w-full border-2 border-green-800 text-green-900 hover:bg-green-50"}
              >
                <Calendar className="w-4 h-4 mr-2" />
                Schedule Work
              </Button>
              <Button
                variant={subcontractorView === 'list' ? 'secondary' : 'ghost'}
                onClick={() => setSubcontractorView('list')}
                size="sm"
                className={subcontractorView === 'list' ? "w-full bg-black text-white hover:bg-slate-900 border-2 border-yellow-500" : "w-full text-slate-700 hover:text-black hover:bg-slate-100"}
              >
                <UserPlus className="w-3 h-3 mr-2" />
                Manage Subcontractors
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
