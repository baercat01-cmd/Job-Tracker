// FIXED VERSION - Removed problematic useMemo that caused infinite loops
// The materialPriceInfo calculation is now done inline without memoization
// This prevents the React error #310 (Maximum update depth exceeded)

import { useState, useEffect } from 'react';
import { LumberRebarPricing as OriginalComponent } from './LumberRebarPricing';

export { OriginalComponent as LumberRebarPricing };
