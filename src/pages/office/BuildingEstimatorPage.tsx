import { useNavigate, useSearchParams } from 'react-router-dom';
import BuildingEstimator3D from '@/components/office/BuildingEstimator3D';

export function BuildingEstimatorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const quoteId = searchParams.get('quoteId') || undefined;
  const width = parseFloat(searchParams.get('width') || '35');
  const length = parseFloat(searchParams.get('length') || '56');
  const height = parseFloat(searchParams.get('height') || '14');
  const pitch = parseFloat(searchParams.get('pitch') || '4');

  const handleSave = (estimateData: any) => {
    console.log('Estimate saved:', estimateData);
    // Navigate back to quote or dashboard after save
    if (quoteId) {
      navigate(`/office/quotes?id=${quoteId}`);
    } else {
      navigate('/office');
    }
  };

  return (
    <BuildingEstimator3D
      quoteId={quoteId}
      initialWidth={width}
      initialLength={length}
      initialHeight={height}
      initialPitch={pitch}
      onSave={handleSave}
    />
  );
}
