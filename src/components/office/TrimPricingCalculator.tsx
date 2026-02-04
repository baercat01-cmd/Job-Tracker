import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calculator, Settings, Info, X } from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY_LF_COST = 'trim_calculator_lf_cost';
const STORAGE_KEY_BEND_PRICE = 'trim_calculator_bend_price';
const STORAGE_KEY_MARKUP_PERCENT = 'trim_calculator_markup_percent';

export function TrimPricingCalculator() {
  // Persistent settings
  const [sheetLFCost, setSheetLFCost] = useState<string>('');
  const [pricePerBend, setPricePerBend] = useState<string>('');
  const [markupPercent, setMarkupPercent] = useState<string>('32');
  
  // Calculation inputs
  const [widthInches, setWidthInches] = useState<string>('');
  const [numberOfBends, setNumberOfBends] = useState<string>('');
  
  // Results
  const [materialPrice, setMaterialPrice] = useState(0);
  const [bendPrice, setBendPrice] = useState(0);
  const [totalPrice, setTotalPrice] = useState(0);
  const [totalLinealFeet, setTotalLinealFeet] = useState(0);
  
  // Dialog states
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [tempLFCost, setTempLFCost] = useState('');
  const [tempBendPrice, setTempBendPrice] = useState('');
  const [tempMarkupPercent, setTempMarkupPercent] = useState('32');

  // Load saved values on mount
  useEffect(() => {
    const savedLFCost = localStorage.getItem(STORAGE_KEY_LF_COST);
    const savedBendPrice = localStorage.getItem(STORAGE_KEY_BEND_PRICE);
    const savedMarkupPercent = localStorage.getItem(STORAGE_KEY_MARKUP_PERCENT);
    
    if (savedLFCost) {
      setSheetLFCost(savedLFCost);
      setTempLFCost(savedLFCost);
    }
    if (savedBendPrice) {
      setPricePerBend(savedBendPrice);
      setTempBendPrice(savedBendPrice);
    }
    if (savedMarkupPercent) {
      setMarkupPercent(savedMarkupPercent);
      setTempMarkupPercent(savedMarkupPercent);
    } else {
      // Default to 32% if not set
      setMarkupPercent('32');
      setTempMarkupPercent('32');
    }
  }, []);

  // Save settings to localStorage
  function saveSettings() {
    const lfCost = parseFloat(tempLFCost);
    const bendPrice = parseFloat(tempBendPrice);
    const markup = parseFloat(tempMarkupPercent);
    
    if (!lfCost || lfCost <= 0) {
      toast.error('Please enter a valid sheet cost per LF');
      return;
    }
    if (!bendPrice || bendPrice <= 0) {
      toast.error('Please enter a valid price per bend');
      return;
    }
    if (markup < 0) {
      toast.error('Please enter a valid markup percentage (0 or higher)');
      return;
    }
    
    localStorage.setItem(STORAGE_KEY_LF_COST, tempLFCost);
    localStorage.setItem(STORAGE_KEY_BEND_PRICE, tempBendPrice);
    localStorage.setItem(STORAGE_KEY_MARKUP_PERCENT, tempMarkupPercent);
    setSheetLFCost(tempLFCost);
    setPricePerBend(tempBendPrice);
    setMarkupPercent(tempMarkupPercent);
    setShowSettings(false);
    toast.success('Settings saved successfully');
  }

  // Calculate trim pricing
  useEffect(() => {
    const lfCost = parseFloat(sheetLFCost);
    const bendPriceVal = parseFloat(pricePerBend);
    const markup = parseFloat(markupPercent);
    const inches = parseFloat(widthInches);
    const bends = parseInt(numberOfBends);

    if (!lfCost || lfCost <= 0 || !bendPriceVal || bendPriceVal <= 0 || markup < 0) {
      setMaterialPrice(0);
      setBendPrice(0);
      setTotalPrice(0);
      setTotalLinealFeet(0);
      return;
    }

    if (!inches || inches <= 0 || !bends || bends <= 0) {
      setMaterialPrice(0);
      setBendPrice(0);
      setTotalPrice(0);
      setTotalLinealFeet(0);
      return;
    }

    // Total inches = number of bends × width in inches
    const totalInches = bends * inches;
    
    // Convert to lineal feet
    const totalLF = totalInches / 12;
    setTotalLinealFeet(totalLF);

    // Selling price per LF = sheet LF COST × (1 + markup%)
    const markupMultiplier = 1 + (markup / 100);
    const sellingPricePerLF = lfCost * markupMultiplier;
    
    // Material price = total LF × selling price per LF
    const matPrice = totalLF * sellingPricePerLF;
    setMaterialPrice(matPrice);
    
    // Bend price = number of bends × price per bend
    const bPrice = bends * bendPriceVal;
    setBendPrice(bPrice);
    
    // Total price = material + bends
    setTotalPrice(matPrice + bPrice);
  }, [sheetLFCost, pricePerBend, markupPercent, widthInches, numberOfBends]);

  function clearCalculation() {
    setWidthInches('');
    setNumberOfBends('');
  }

  const hasSettings = sheetLFCost && pricePerBend && markupPercent;

  return (
    <>
      {/* Main Compact Calculator */}
      <Card className="border-2 border-green-800 bg-gradient-to-br from-slate-900 to-black max-w-2xl mx-auto">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-yellow-500">
              <Calculator className="w-6 h-6" />
              Trim Pricing Calculator
            </CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowInfo(true)}
                size="sm"
                variant="ghost"
                className="text-yellow-500 hover:text-yellow-400 hover:bg-green-900/20"
              >
                <Info className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => {
                  setTempLFCost(sheetLFCost);
                  setTempBendPrice(pricePerBend);
                  setTempMarkupPercent(markupPercent);
                  setShowSettings(true);
                }}
                size="sm"
                variant="ghost"
                className="text-yellow-500 hover:text-yellow-400 hover:bg-green-900/20"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasSettings ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center">
              <p className="text-yellow-500 font-semibold">
                Please configure settings first
              </p>
              <Button
                onClick={() => {
                  setTempLFCost(sheetLFCost);
                  setTempBendPrice(pricePerBend);
                  setTempMarkupPercent(markupPercent);
                  setShowSettings(true);
                }}
                className="mt-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              >
                <Settings className="w-4 h-4 mr-2" />
                Open Settings
              </Button>
            </div>
          ) : (
            <>
              {/* Input Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="width-inches" className="text-sm font-semibold text-white">
                    Width (inches)
                  </Label>
                  <Input
                    id="width-inches"
                    type="number"
                    min="0"
                    step="0.125"
                    value={widthInches}
                    onChange={(e) => setWidthInches(e.target.value)}
                    placeholder="0"
                    className="h-11 text-base bg-white border-green-800"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="num-bends" className="text-sm font-semibold text-white">
                    Number of Bends
                  </Label>
                  <Input
                    id="num-bends"
                    type="number"
                    min="0"
                    step="1"
                    value={numberOfBends}
                    onChange={(e) => setNumberOfBends(e.target.value)}
                    placeholder="0"
                    className="h-11 text-base bg-white border-green-800"
                  />
                </div>
              </div>

              {/* Results */}
              {widthInches && numberOfBends && totalPrice > 0 && (
                <div className="space-y-3 pt-2 border-t border-green-800">
                  <div className="bg-yellow-500/10 border-2 border-yellow-500 rounded-lg p-4">
                    <div className="text-sm text-yellow-500 mb-1 font-semibold">TOTAL PRICE</div>
                    <div className="text-4xl font-bold text-yellow-500">${totalPrice.toFixed(2)}</div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="bg-green-900/30 border border-green-800 rounded p-2">
                      <div className="text-white/60">Material</div>
                      <div className="text-white font-bold">${materialPrice.toFixed(2)}</div>
                    </div>
                    <div className="bg-green-900/30 border border-green-800 rounded p-2">
                      <div className="text-white/60">Bends</div>
                      <div className="text-white font-bold">${bendPrice.toFixed(2)}</div>
                    </div>
                    <div className="bg-green-900/30 border border-green-800 rounded p-2">
                      <div className="text-white/60">Total LF</div>
                      <div className="text-white font-bold">{totalLinealFeet.toFixed(2)}</div>
                    </div>
                  </div>

                  <Button
                    onClick={clearCalculation}
                    variant="outline"
                    className="w-full border-green-800 text-white hover:bg-green-900/20"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-2 border-green-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <Settings className="w-5 h-5" />
              Calculator Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lf-cost" className="text-sm font-semibold text-white">
                Sheet Cost per LF (42" wide) *
              </Label>
              <p className="text-xs text-white/60">
                Enter your COST per lineal foot (before markup). Your markup percentage will be applied automatically.
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="lf-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempLFCost}
                  onChange={(e) => setTempLFCost(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-11 text-base bg-white border-green-800"
                />
              </div>
              {tempLFCost && tempMarkupPercent && (
                <p className="text-xs text-green-500 font-semibold">
                  Selling price: ${(parseFloat(tempLFCost) * (1 + parseFloat(tempMarkupPercent) / 100)).toFixed(2)}/LF (with {tempMarkupPercent}% markup)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="markup-percent" className="text-sm font-semibold text-white">
                Markup Percentage *
              </Label>
              <p className="text-xs text-white/60">
                Enter your markup percentage on material cost (e.g., 32 for 32%).
              </p>
              <div className="relative">
                <Input
                  id="markup-percent"
                  type="number"
                  min="0"
                  step="0.1"
                  value={tempMarkupPercent}
                  onChange={(e) => setTempMarkupPercent(e.target.value)}
                  placeholder="32"
                  className="pr-8 h-11 text-base bg-white border-green-800"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bend-price" className="text-sm font-semibold text-white">
                Price per Bend *
              </Label>
              <p className="text-xs text-white/60">
                Enter the charge per bend (labor + overhead).
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="bend-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempBendPrice}
                  onChange={(e) => setTempBendPrice(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-11 text-base bg-white border-green-800"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={saveSettings}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              >
                Save Settings
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSettings(false)}
                className="border-green-800 text-white hover:bg-green-900/20"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="sm:max-w-lg bg-slate-900 border-2 border-green-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <Info className="w-5 h-5" />
              How It Works
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-white">
            <div className="space-y-2">
              <h4 className="font-semibold text-yellow-500">Calculation Formula:</h4>
              <div className="space-y-1 text-sm bg-black/30 p-3 rounded border border-green-800/50 font-mono">
                <p>1. Total Inches = Bends × Width</p>
                <p>2. Total LF = Total Inches ÷ 12</p>
                <p>3. Selling Price/LF = Cost/LF × (1 + Markup%/100)</p>
                <p>4. Material Price = Total LF × Selling Price/LF</p>
                <p>5. Bend Price = Bends × Price/Bend</p>
                <p>6. Total = Material + Bend Price</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-yellow-500">Key Details:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-white/80">
                <li>Sheet width: 42 inches</li>
                <li>Standard pieces: 10 feet long</li>
                <li>Configurable markup percentage on material cost</li>
                <li>Separate charge for labor (bending)</li>
                <li>Price calculated by cutting 10' strips to specified width × number of bends</li>
              </ul>
            </div>

            <Button
              onClick={() => setShowInfo(false)}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
            >
              Got It
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
