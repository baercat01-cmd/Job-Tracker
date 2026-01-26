import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Settings, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { VehicleManagement } from '@/components/fleet/VehicleManagement';
import { FleetSettings } from '@/components/fleet/FleetSettings';

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  location_tags: any[];
}

interface FleetDashboardProps {
  hideHeader?: boolean;
}

export function FleetDashboard({ hideHeader = false }: FleetDashboardProps) {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error loading companies:', error);
      toast.error('Failed to load companies');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    // Logout handled by main app
    setShowSettings(false);
    setSelectedCompany(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Settings view
  if (showSettings) {
    return (
      <div className={hideHeader ? '' : 'min-h-screen bg-slate-50'}>
        {!hideHeader && (
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-3 py-2 border-b-4 border-yellow-600">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(false)}
                className="text-white hover:text-yellow-400"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </Button>
              <h1 className="text-lg font-bold">Fleet Settings</h1>
              <div className="w-20" /> {/* Spacer */}
            </div>
          </div>
        )}
        <FleetSettings onClose={() => setShowSettings(false)} onLogout={handleLogout} />
      </div>
    );
  }

  // Vehicle management view
  if (selectedCompany) {
    return (
      <VehicleManagement
        company={selectedCompany}
        onBack={() => setSelectedCompany(null)}
        onOpenSettings={() => setShowSettings(true)}
      />
    );
  }

  // Company selection view
  return (
    <div className={hideHeader ? '' : 'min-h-screen bg-gradient-to-br from-slate-100 to-slate-200'}>
      {/* Header */}
      {!hideHeader && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-3 py-2 border-b-4 border-yellow-600 shadow-lg">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Fleet Management</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">Welcome, {profile?.username}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(true)}
                className="text-white hover:text-yellow-400"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Company Selection */}
      <div className="p-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-800">Select Company</h2>
            <p className="text-sm text-slate-600">Choose a company to manage its fleet</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {companies.map((company) => (
              <Card
                key={company.id}
                className="cursor-pointer hover:shadow-xl transition-all border-2 border-slate-300 hover:border-yellow-600"
                onClick={() => setSelectedCompany(company)}
              >
                <CardHeader className="bg-gradient-to-r from-slate-800 to-slate-700 border-b-2 border-slate-600">
                  <CardTitle className="flex items-center gap-3 text-white">
                    {company.logo_url ? (
                      <img src={company.logo_url} alt={company.name} className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 bg-yellow-600 rounded-lg flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-black" />
                      </div>
                    )}
                    <span>{company.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <Button
                    variant="outline"
                    className="w-full border-2 border-slate-300 hover:border-yellow-600 hover:bg-yellow-50 font-semibold"
                  >
                    Manage Fleet
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
