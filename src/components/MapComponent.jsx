import React from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// MapUpdater component
const MapUpdater = ({ geoJsonData }) => {
  const map = useMap();
  
  React.useEffect(() => {
    if (geoJsonData && geoJsonData.features && geoJsonData.features.length > 0) {
      try {
        const geoJsonLayer = L.geoJSON(geoJsonData);
        const bounds = geoJsonLayer.getBounds();
        map.fitBounds(bounds, { padding: [50, 50] });
      } catch (err) {
        console.error('Error fitting bounds:', err);
      }
    }
  }, [geoJsonData, map]);

  return null;
};

// MapComponent
const MapComponent = ({ geoJsonData, style, onEachFeature }) => {
  return (
    <MapContainer
      center={[37.8, -96]}
      zoom={4}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
    >
      <ZoomControl position="topright" />
      <LayersControl position="topleft">
        <LayersControl.BaseLayer checked name="OpenStreetMap">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {geoJsonData && geoJsonData.features && (
        <>
          <GeoJSON 
            key={JSON.stringify(geoJsonData)}
            data={geoJsonData}
            style={style}
            onEachFeature={onEachFeature}
          />
          <MapUpdater geoJsonData={geoJsonData} />
        </>
      )}
    </MapContainer>
  );
};

export default MapComponent; 