
// Simplified Field Requests View Component
// This shows in MaterialsList.tsx when showFieldRequestsOnly is true

const STATUS_OPTIONS_FOR_FIELD = [
  { value: 'needed', label: 'Needed', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'not_ordered', label: 'Not Ordered', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'ordered', label: 'Ordered', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'at_shop', label: 'At Shop', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'ready_to_pull', label: 'Pull from Shop', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'at_job', label: 'At Job', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'installed', label: 'Installed', color: 'bg-slate-800 text-white border-slate-800' },
  { value: 'missing', label: 'Missing', color: 'bg-red-100 text-red-700 border-red-300' },
];

// Replace the complex category/group view with this simple list:
// The JSX fragment needs to be wrapped in a component or returned from a function.
// Assuming this snippet is part of a larger functional component.
// For the sake of fixing the "Expression expected" error, I'm wrapping it in a React Fragment.
// In a real application, this would typically be inside a `return()` statement of a functional component.
<>
  {showFieldRequestsOnly ? (
    /* Simplified Field Requests View - Clean List */
    <Card className="border-2 border-orange-200">
      <CardHeader className="pb-3 bg-orange-50">
        <CardTitle className="text-base font-semibold text-orange-900">
          My Material Requests ({filteredCategories.reduce((sum, cat) => sum + cat.materials.length, 0)})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {filteredCategories.flatMap(category => 
            category.materials.map(material => (
              <div
                key={material.id}
                className="p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="space-y-3">
                  {/* Material Info */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap mb-2">
                        <h4 className="font-semibold text-base">{cleanMaterialValue(material.name)}</h4>
                        {material.length && (
                          <span className="text-sm text-muted-foreground">
                            {cleanMaterialValue(material.length)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-sm font-semibold">
                          Qty: {material.quantity}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  {/* Status Selector - Quick Access */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={material.status}
                      onValueChange={(newStatus) => handleMaterialStatusChange(material, newStatus as Material['status'])}
                    >
                      <SelectTrigger className={`w-full h-11 font-semibold border-2 ${getStatusConfig(material.status).bgClass}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS_FOR_FIELD.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className={`inline-flex items-center px-3 py-1.5 rounded font-semibold ${opt.color}`}>
                              {opt.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  ) : (
    // ... existing full category view
    // Placeholder for the existing full category view, assuming it's also JSX
    // This is needed to make the ternary operator syntactically correct outside of a return statement.
    // If this entire block is meant to be the body of a functional component,
    // this would be part of its return statement.
    null 
  )}
</>
