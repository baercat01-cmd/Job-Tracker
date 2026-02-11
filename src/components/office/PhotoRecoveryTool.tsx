import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Image as ImageIcon, AlertTriangle, Link2, Search } from 'lucide-react';
import { toast } from 'sonner';

interface OrphanedPhoto {
  id: string;
  material_id: string;
  photo_url: string;
  uploaded_by: string;
  timestamp: string;
  uploaded_by_name: string | null;
}

interface MaterialItem {
  id: string;
  material_name: string;
  sheet_id: string;
  category: string;
  sheets: {
    sheet_name: string;
  };
}

interface PhotoRecoveryToolProps {
  jobId: string;
}

export function PhotoRecoveryTool({ jobId }: PhotoRecoveryToolProps) {
  const [orphanedPhotos, setOrphanedPhotos] = useState<OrphanedPhoto[]>([]);
  const [materialItems, setMaterialItems] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<OrphanedPhoto | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMaterialItem, setSelectedMaterialItem] = useState<string>('');
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    loadOrphanedPhotos();
    loadMaterialItems();
  }, [jobId]);

  async function loadOrphanedPhotos() {
    try {
      setLoading(true);
      
      // Get orphaned photos - photos where the original material was deleted
      const { data, error } = await supabase
        .from('material_photos')
        .select(`
          id,
          material_id,
          photo_url,
          uploaded_by,
          timestamp,
          user_profiles:uploaded_by(username)
        `);

      if (error) throw error;

      // Filter for photos that don't have a corresponding material
      const orphaned: OrphanedPhoto[] = [];
      for (const photo of data || []) {
        const { data: materialExists } = await supabase
          .from('materials')
          .select('id')
          .eq('id', photo.material_id)
          .maybeSingle();

        if (!materialExists) {
          orphaned.push({
            ...photo,
            uploaded_by_name: (photo.user_profiles as any)?.username || null,
          });
        }
      }

      setOrphanedPhotos(orphaned);
    } catch (error: any) {
      console.error('Error loading orphaned photos:', error);
      toast.error('Failed to load orphaned photos');
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterialItems() {
    try {
      // Get working workbook
      const { data: workbookData } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', jobId)
        .eq('status', 'working')
        .maybeSingle();

      if (!workbookData) return;

      // Get all sheets
      const { data: sheetsData } = await supabase
        .from('material_sheets')
        .select('id, sheet_name')
        .eq('workbook_id', workbookData.id);

      if (!sheetsData) return;

      const sheetIds = sheetsData.map(s => s.id);

      // Get all material items
      const { data: itemsData } = await supabase
        .from('material_items')
        .select('id, material_name, sheet_id, category')
        .in('sheet_id', sheetIds)
        .order('material_name');

      if (!itemsData) return;

      const items = itemsData.map(item => {
        const sheet = sheetsData.find(s => s.id === item.sheet_id);
        return {
          ...item,
          sheets: { sheet_name: sheet?.sheet_name || 'Unknown' },
        };
      });

      setMaterialItems(items);
    } catch (error: any) {
      console.error('Error loading material items:', error);
    }
  }

  function openLinkDialog(photo: OrphanedPhoto) {
    setSelectedPhoto(photo);
    setSelectedMaterialItem('');
    setSearchTerm('');
    setShowLinkDialog(true);
  }

  async function linkPhotoToMaterial() {
    if (!selectedPhoto || !selectedMaterialItem) {
      toast.error('Please select a material');
      return;
    }

    setLinking(true);

    try {
      // Insert into material_item_photos
      const { error: insertError } = await supabase
        .from('material_item_photos')
        .insert({
          material_item_id: selectedMaterialItem,
          photo_url: selectedPhoto.photo_url,
          uploaded_by: selectedPhoto.uploaded_by,
          timestamp: selectedPhoto.timestamp,
          caption: `Recovered crew photo from ${selectedPhoto.uploaded_by_name || 'Unknown'}`,
        });

      if (insertError) throw insertError;

      // Delete from old material_photos table
      const { error: deleteError } = await supabase
        .from('material_photos')
        .delete()
        .eq('id', selectedPhoto.id);

      if (deleteError) throw deleteError;

      toast.success('Photo linked successfully');
      setShowLinkDialog(false);
      loadOrphanedPhotos();
    } catch (error: any) {
      console.error('Error linking photo:', error);
      toast.error('Failed to link photo');
    } finally {
      setLinking(false);
    }
  }

  const filteredMaterials = materialItems.filter(item =>
    searchTerm === '' ||
    item.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Scanning for orphaned photos...</p>
      </div>
    );
  }

  return (
    <>
      <Card className="border-2 border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="w-5 h-5" />
            Photo Recovery Tool
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Found {orphanedPhotos.length} orphaned photo{orphanedPhotos.length !== 1 ? 's' : ''} from deleted materials
          </p>
        </CardHeader>
        <CardContent>
          {orphanedPhotos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No orphaned photos found</p>
              <p className="text-xs mt-1">All photos are properly linked</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {orphanedPhotos.map(photo => (
                <div key={photo.id} className="border-2 rounded-lg overflow-hidden bg-white">
                  <div className="relative aspect-square">
                    <img
                      src={photo.photo_url}
                      alt="Orphaned photo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2 space-y-2">
                    <div className="text-xs text-muted-foreground">
                      <div>By: {photo.uploaded_by_name || 'Unknown'}</div>
                      <div>{new Date(photo.timestamp).toLocaleDateString()}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => openLinkDialog(photo)}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      <Link2 className="w-3 h-3 mr-1" />
                      Link to Material
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link Photo Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Photo to Material</DialogTitle>
          </DialogHeader>

          {selectedPhoto && (
            <div className="space-y-4">
              {/* Photo Preview */}
              <div className="border rounded-lg p-3 bg-slate-50">
                <div className="aspect-video bg-white rounded overflow-hidden mb-2">
                  <img
                    src={selectedPhoto.photo_url}
                    alt="Selected photo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  Uploaded by: {selectedPhoto.uploaded_by_name || 'Unknown'} on{' '}
                  {new Date(selectedPhoto.timestamp).toLocaleDateString()}
                </div>
              </div>

              {/* Search Materials */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Material in Workbook</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search materials..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Materials List */}
              <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                {filteredMaterials.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No materials found
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredMaterials.map(item => (
                      <div
                        key={item.id}
                        className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                          selectedMaterialItem === item.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                        }`}
                        onClick={() => setSelectedMaterialItem(item.id)}
                      >
                        <div className="font-medium text-sm">{item.material_name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {item.sheets.sheet_name}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{item.category}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={linkPhotoToMaterial}
                  disabled={linking || !selectedMaterialItem}
                  className="flex-1"
                >
                  {linking ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <Link2 className="w-4 h-4 mr-2" />
                      Link Photo
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowLinkDialog(false)}
                  disabled={linking}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
