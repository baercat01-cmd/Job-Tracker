import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, Save, Info } from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY = 'trim_calculator_lf_price';

export function TrimPricingCalculator() {
  // Persistent LF price
  const [sheetLFPrice, setSheetLFPrice] = useState<string>('');
  const [tempLFPrice, setTempLFPrice] = useState<string>('');
  
  // Calculation inputs
  const [widthInches, setWidthInches] = useState<string>('');
  const [numberOfBends, setNumberOfBends] = useState<string>('');
  
  // Results
  const [baseCostPerLF, setBaseCostPerLF] = useState(0);
  const [totalInches, setTotalInches] = useState(0);
  const [totalLinealFeet, setTotalLinealFeet] = useState(0);
  const [totalPrice, setTotalPrice] = useState(0);
  const [piecesNeeded, setPiecesNeeded] = useState(0);

  // Load saved LF price on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setSheetLFPrice(saved);
      setTempLFPrice(saved);
    }
  }, []);

  // Save LF price to localStorage
  function saveLFPrice() {
    const price = parseFloat(tempLFPrice);
    if (!price || price <= 0) {
      toast.error('Please enter a valid price per LF');
      return;
    }
    localStorage.setItem(STORAGE_KEY, tempLFPrice);
    setSheetLFPrice(tempLFPrice);
    toast.success('LF price saved successfully');
  }

  // Calculate trim pricing
  useEffect(() => {
    const lfPrice = parseFloat(sheetLFPrice);
    const inches = parseFloat(widthInches);
    const bends = parseInt(numberOfBends);

    if (!lfPrice || lfPrice <= 0) {
      resetResults();
      return;
    }

    // Base cost per LF = sheet LF price × 32%
    const baseCost = lfPrice * 0.32;
    setBaseCostPerLF(baseCost);

    if (!inches || inches <= 0 || !bends || bends <= 0) {
      setTotalInches(0);
      setTotalLinealFeet(0);
      setTotalPrice(0);
      setPiecesNeeded(0);
      return;
    }

    // Total inches = number of bends × width in inches
    const totalInchesCalc = bends * inches;
    setTotalInches(totalInchesCalc);

    // Convert to lineal feet
    const totalLF = totalInchesCalc / 12;
    setTotalLinealFeet(totalLF);

    // Calculate price
    const price = totalLF * baseCost;
    setTotalPrice(price);

    // Calculate number of 10' pieces needed
    const pieces = Math.ceil(totalLF / 10);
    setPiecesNeeded(pieces);
  }, [sheetLFPrice, widthInches, numberOfBends]);

  function resetResults() {
    setBaseCostPerLF(0);
    setTotalInches(0);
    setTotalLinealFeet(0);
    setTotalPrice(0);
    setPiecesNeeded(0);
  }

  function clearCalculation() {
    setWidthInches('');
    setNumberOfBends('');
    resetResults();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Calculator className="w-8 h-8 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold">Trim Pricing Calculator</h2>
          <p className="text-sm text-muted-foreground">
            Calculate pricing for custom trim work (42" sheet width, 10' piece length)
          </p>
        </div>
      </div>

      {/* LF Price Configuration */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Info className="w-5 h-5" />
            Sheet Price Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-white p-4 rounded-lg border">
            <Label htmlFor="lf-price" className="text-base font-semibold">
              Lineal Foot Price (42" wide sheet) *
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Enter the cost per lineal foot for a 42" wide sheet. This value will be saved.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="lf-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempLFPrice}
                  onChange={(e) => setTempLFPrice(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-12 text-lg"
                />
              </div>
              <Button
                onClick={saveLFPrice}
                className="h-12 px-6"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Price
              </Button>
            </div>
            {sheetLFPrice && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-green-900">Current Saved Price:</span>
                  <span className="text-lg font-bold text-green-700">${parseFloat(sheetLFPrice).toFixed(2)} / LF</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-green-200">
                  <span className="text-sm font-medium text-green-900">Base Cost per LF (×32%):</span>
                  <span className="text-lg font-bold text-green-700">${baseCostPerLF.toFixed(2)} / LF</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Calculator */}
      <Card className="border-2 border-purple-200 bg-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <Calculator className="w-5 h-5" />
            Trim Calculation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!sheetLFPrice ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
              <p className="text-yellow-900 font-semibold">
                Please save a sheet LF price above to start calculating
              </p>
            </div>
          ) : (
            <>
              {/* Input Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="width-inches" className="text-base font-semibold">
                    Width Cut (inches) *
                  </Label>
                  <Input
                    id="width-inches"
                    type="number"
                    min="0"
                    step="0.125"
                    value={widthInches}
                    onChange={(e) => setWidthInches(e.target.value)}
                    placeholder="0"
                    className="h-12 text-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="num-bends" className="text-base font-semibold">
                    Number of Bends *
                  </Label>
                  <Input
                    id="num-bends"
                    type="number"
                    min="0"
                    step="1"
                    value={numberOfBends}
                    onChange={(e) => setNumberOfBends(e.target.value)}
                    placeholder="0"
                    className="h-12 text-lg"
                  />
                </div>
              </div>

              {/* Formula Display */}
              <div className="bg-white p-4 rounded-lg border">
                <h4 className="font-semibold text-sm text-muted-foreground mb-2">CALCULATION:</h4>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-mono">Total Inches = {numberOfBends || '0'} bends × {widthInches || '0'}" = {totalInches.toFixed(2)}"</span>
                  </p>
                  <p>
                    <span className="font-mono">Lineal Feet = {totalInches.toFixed(2)}" ÷ 12 = {totalLinealFeet.toFixed(2)} LF</span>
                  </p>
                  <p>
                    <span className="font-mono">Price = {totalLinealFeet.toFixed(2)} LF × ${baseCostPerLF.toFixed(2)}/LF = ${totalPrice.toFixed(2)}</span>
                  </p>
                </div>
              </div>

              {/* Results Display */}
              {(widthInches && numberOfBends) && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-4 rounded-lg border-2 border-blue-300">
                      <div className="text-sm text-muted-foreground mb-1">Total Inches</div>
                      <div className="text-2xl font-bold text-blue-700">{totalInches.toFixed(2)}"</div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border-2 border-blue-300">
                      <div className="text-sm text-muted-foreground mb-1">Lineal Feet</div>
                      <div className="text-2xl font-bold text-blue-700">{totalLinealFeet.toFixed(2)} LF</div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border-2 border-purple-300">
                      <div className="text-sm text-muted-foreground mb-1">10' Pieces Needed</div>
                      <div className="text-2xl font-bold text-purple-700">{piecesNeeded}</div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border-2 border-green-400">
                      <div className="text-sm text-green-700 mb-1 font-semibold">TOTAL PRICE</div>
                      <div className="text-3xl font-bold text-green-700">${totalPrice.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Additional Details */}
                  <div className="bg-slate-50 p-4 rounded-lg border">
                    <h4 className="font-semibold text-sm text-slate-700 mb-2">Details:</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sheet LF Price:</span>
                        <span className="font-semibold">${parseFloat(sheetLFPrice).toFixed(2)}/LF</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Base Cost (32%):</span>
                        <span className="font-semibold">${baseCostPerLF.toFixed(2)}/LF</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Width per Bend:</span>
                        <span className="font-semibold">{widthInches}"</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Number of Bends:</span>
                        <span className="font-semibold">{numberOfBends}</span>
                      </div>
                      <div className="flex justify-between col-span-2 pt-2 border-t">
                        <span className="text-muted-foreground">Price per Bend:</span>
                        <span className="font-semibold">
                          ${numberOfBends > 0 ? (totalPrice / parseInt(numberOfBends)).toFixed(2) : '0.00'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Clear Button */}
                  <Button
                    onClick={clearCalculation}
                    variant="outline"
                    className="w-full h-12"
                  >
                    Clear Calculation
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm text-blue-900">
              <p className="font-semibold">How it works:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Base cost per LF = Sheet LF price × 32% (industry standard markup)</li>
                <li>Total inches = Number of bends × Width cut per bend</li>
                <li>Converted to lineal feet for pricing (÷ 12)</li>
                <li>Standard pieces are 10 feet long</li>
                <li>Final price = Total LF × Base cost per LF</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
