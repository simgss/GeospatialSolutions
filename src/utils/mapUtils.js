// Add these utility functions to mapUtils.js
export const esriToGeoJSON = (esriData) => {
  if (!esriData || !esriData.features) {
    throw new Error('Invalid ESRI JSON data');
  }

  return {
    type: 'FeatureCollection',
    features: esriData.features.map(feature => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: feature.geometry.rings || feature.geometry.coordinates
      },
      properties: {
        ...feature.attributes,
        id: feature.attributes.GEOID || 
            `${feature.attributes.STATE || ''}${feature.attributes.COUNTY || ''}${feature.attributes.TRACT || ''}`
      }
    }))
  };
};