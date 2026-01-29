import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Users, ListTodo, UserPlus, Calendar, Plus } from 'lucide-react';
import { SubcontractorScheduling } from './SubcontractorScheduling';
import { AllJobsTaskManagement } from './AllJobsTaskManagement';
import { SubcontractorManagement } from './SubcontractorManagement';

export function EnhancedScheduleView() {
  const [subcontractorView, setSubcontractorView] = useState<'list' | 'schedule'>('schedule');
  const [activeTab, setActiveTab] = useState('tasks');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-black to-slate-900 text-white rounded-lg p-4 shadow-lg border-2 border-yellow-500">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Master Schedule</h2>
          <p className="text-yellow-400">Manage tasks and subcontractor work</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'tasks' && (
            <Button onClick={() => setShowCreateDialog(true)} className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold shadow-lg border-2 border-yellow-400">
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </Button>
          )}
          {activeTab === 'subcontractors' && (
            <Button 
              onClick={() => setSubcontractorView('list')} 
              variant="outline"
              className="bg-white hover:bg-slate-100 text-black font-semibold border-2 border-yellow-500"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Manage Subcontractors
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="tasks" className="w-full" onValueChange={setActiveTab}>
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
          <AllJobsTaskManagement 
            showCreateDialog={showCreateDialog}
            onCloseCreateDialog={() => setShowCreateDialog(false)}
          />
        </TabsContent>

        <TabsContent value="subcontractors" className="mt-4">
          {/* Conditional rendering based on view */}
          {subcontractorView === 'list' ? (
            <SubcontractorManagement />
          ) : (
            <SubcontractorScheduling />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
