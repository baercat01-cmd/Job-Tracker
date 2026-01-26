import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useFleetAuth } from '@/stores/fleetAuthStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Wrench, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AddMaintenanceDialog } from './AddMaintenanceDialog';

interface MaintenanceLog {
  id: string;
  type: string;
  status: string;
  title: string;
  date: string;
  mileage_hours: number | null;
  description: string | null;
  part_cost: number | null;
  service_checklist: any[];
  created_at: string;
}

interface MaintenanceTabProps {
  vehicleId: string;
  vehicleType: string;
}

export function MaintenanceTab({ vehicleId, vehicleType }: MaintenanceTabProps) {
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [vehicleId]);

  async function loadLogs() {
    try {
      const { data, error } = await supabase
        .from('maintenance_logs')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('date', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading logs:', error);
      toast.error('Failed to load maintenance logs');
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    }
  }

  function getTypeColor(type: string): string {
    return type === 'service' ? 'bg-blue-500' : 'bg-orange-500';
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="w-8 h-8 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-600">Loading maintenance logs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">Maintenance History</h3>
        <Button
          onClick={() => setShowAddDialog(true)}
          size="sm"
          className="bg-yellow-600 hover:bg-yellow-700 text-black"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Log
        </Button>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No maintenance logs</p>
            <p className="text-sm text-slate-500 mb-4">Start tracking service and repairs</p>
            <Button
              onClick={() => setShowAddDialog(true)}
              variant="outline"
              className="border-2 border-yellow-600 text-yellow-700 hover:bg-yellow-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add First Log
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <Card key={log.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${getTypeColor(log.type)}`} />
                      <CardTitle className="text-base">{log.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span>{new Date(log.date).toLocaleDateString()}</span>
                      {log.mileage_hours && (
                        <>
                          <span>•</span>
                          <span>
                            {log.mileage_hours.toLocaleString()}
                            {vehicleType === 'heavy_equipment' ? ' hrs' : ' mi'}
                          </span>
                        </>
                      )}
                      {log.part_cost && (
                        <>
                          <span>•</span>
                          <span className="font-medium">${log.part_cost.toLocaleString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge className={`border-2 ${getStatusColor(log.status)}`}>
                    {log.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>
              {(log.description || (log.service_checklist && log.service_checklist.length > 0)) && (
                <CardContent className="pt-0">
                  {log.description && (
                    <p className="text-sm text-slate-600 mb-2">{log.description}</p>
                  )}
                  {log.service_checklist && log.service_checklist.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-700">Checklist:</p>
                      {log.service_checklist.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${item.completed ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
                            {item.completed && <span className="text-white text-xs">✓</span>}
                          </div>
                          <span className={item.completed ? 'line-through text-slate-500' : ''}>
                            {item.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <AddMaintenanceDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        vehicleId={vehicleId}
        vehicleType={vehicleType}
        onSuccess={() => {
          setShowAddDialog(false);
          loadLogs();
        }}
      />
    </div>
  );
}
