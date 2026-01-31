import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Package } from 'lucide-react';
import { MaterialsCatalogImport } from '@/components/office/MaterialsCatalogImport';
import { MaterialsCatalogBrowser } from '@/components/office/MaterialsCatalogBrowser';

export function MaterialsCatalogPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Tabs defaultValue="browser" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="browser">
            <Package className="w-4 h-4 mr-2" />
            Browse Materials
          </TabsTrigger>
          <TabsTrigger value="import">
            <Upload className="w-4 h-4 mr-2" />
            Import/Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browser" className="mt-6">
          <MaterialsCatalogBrowser />
        </TabsContent>

        <TabsContent value="import" className="mt-6">
          <MaterialsCatalogImport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
