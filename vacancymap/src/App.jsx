import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, LayersControl, ZoomControl, GeoJSON, useMap } from 'react-leaflet';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Map Update Component
const MapUpdater = ({ geoJsonData, style, onEachFeature }) => {
  const map = useMap();
  
  useEffect(() => {
    if (geoJsonData) {
      map.fitBounds(L.geoJSON(geoJsonData).getBounds());
    }
  }, [geoJsonData, map]);

  if (!geoJsonData) return null;
  
  return <GeoJSON data={geoJsonData} style={style} onEachFeature={onEachFeature} />;
};

const HousingStats = () => {
  const [selectedState, setSelectedState] = useState('');
  const [selectedCounty, setSelectedCounty] = useState('');
  const [geoLevel, setGeoLevel] = useState('state');
  const [states, setStates] = useState([]);
  const [counties, setCounties] = useState([]);
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [vacancyData, setVacancyData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stateStats, setStateStats] = useState(null);
  const [countyStats, setCountyStats] = useState(null);

  const baseUrl = 'https://api.census.gov/data/2022/acs/acs5';
  const tigerUrl = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
  
  const variables = {
    totalHousing: 'B25002_001E',
    vacant: 'B25002_003E',
  };

  // Color function for vacancy rates
  const getColor = (rate) => {
    return rate >= 25 ? '#a50f15' :
           rate >= 20 ? '#de2d26' :
           rate >= 15 ? '#fb6a4a' :
           rate >= 10 ? '#fcae91' :
           rate >= 7  ? '#fee5d9' :
           rate >= 5  ? '#edf8e9' :
           rate >= 3  ? '#bae4b3' :
           rate >= 1  ? '#74c476' :
                       '#238b45';
  };

  // Load states on component mount
  useEffect(() => {
    const loadStates = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${baseUrl}?get=NAME&for=state:*`);
        const data = await response.json();
        const statesData = data.slice(1).map(([name, id]) => ({ name, id }));
        setStates(statesData);
      } catch (err) {
        setError('Failed to load states');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadStates();
  }, []);

  // Load counties when state is selected
  const loadCounties = useCallback(async (stateId) => {
    if (!stateId) return;
    
    try {
      setLoading(true);
      const response = await fetch(
        `${baseUrl}?get=NAME&for=county:*&in=state:${stateId}`
      );
      const data = await response.json();
      const countiesData = data.slice(1).map(([name, , id]) => ({
        name: name.split(',')[0],
        id
      }));
      setCounties(countiesData);
    } catch (err) {
      setError('Failed to load counties');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch GeoJSON data
  const fetchGeoJSON = useCallback(async (level, stateId, countyId) => {
    try {
      let url;
      const params = new URLSearchParams({
        outFields: '*',
        f: 'geojson',
        where: `STATE='${stateId}'${countyId ? ` AND COUNTY='${countyId}'` : ''}`
      });

      switch (level) {
        case 'state':
          url = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';
          return fetch(url).then(res => res.json());
        case 'county':
          url = `${tigerUrl}/State_County/MapServer/0/query?${params}`;
          break;
        case 'tract':
          url = `${tigerUrl}/Tracts_Blocks/MapServer/2/query?${params}`;
          break;
        case 'block':
          url = `${tigerUrl}/Tracts_Blocks/MapServer/1/query?${params}`;
          break;
        default:
          throw new Error('Invalid geography level');
      }

      const response = await fetch(url);
      return await response.json();
    } catch (err) {
      throw new Error(`Failed to fetch GeoJSON: ${err.message}`);
    }
  }, []);

  // Fetch vacancy data
  const fetchVacancyData = useCallback(async (level, stateId, countyId) => {
    try {
      const params = new URLSearchParams({
        get: `NAME,${Object.values(variables).join(',')}`,
        for: `${level}:*`
      });

      if (level !== 'state') {
        params.append('in', `state:${stateId}`);
        if ((level === 'tract' || level === 'block') && countyId) {
          params.append('in', `county:${countyId}`);
        }
      }

      const response = await fetch(`${baseUrl}?${params}`);
      const [headers, ...rows] = await response.json();

      return rows.map(row => {
        const totalHousing = parseInt(row[headers.indexOf(variables.totalHousing)]) || 0;
        const vacant = parseInt(row[headers.indexOf(variables.vacant)]) || 0;
        const vacancyRate = totalHousing > 0 ? ((vacant / totalHousing) * 100).toFixed(1) : '0.0';

        return {
          name: row[0],
          geoid: row[row.length - 1],
          totalHousing,
          vacant,
          vacancyRate
        };
      });
    } catch (err) {
      throw new Error(`Failed to fetch vacancy data: ${err.message}`);
    }
  }, []);

  // Update map when selections change
  const updateMap = useCallback(async () => {
    if (!selectedState) return;

    try {
      setLoading(true);
      setError(null);

      const [geoData, vacData] = await Promise.all([
        fetchGeoJSON(geoLevel, selectedState, selectedCounty),
        fetchVacancyData(geoLevel, selectedState, selectedCounty)
      ]);

      setGeoJsonData(geoData);
      setVacancyData(vacData);
    } catch (err) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedState, selectedCounty, geoLevel, fetchGeoJSON, fetchVacancyData]);

  useEffect(() => {
    updateMap();
  }, [updateMap]);

  // Style function for GeoJSON
  const style = (feature) => {
    const data = vacancyData.find(d => d.geoid === feature.properties.GEOID);
    const rate = data ? parseFloat(data.vacancyRate) : 0;
    
    return {
      fillColor: getColor(rate),
      weight: 1,
      opacity: 1,
      color: 'white',
      fillOpacity: 0.7
    };
  };

  // Popup content for features
  const createPopupContent = (data) => {
    if (!data) return '';
    
    const occupiedUnits = data.totalHousing - data.vacant;
    const occupancyRate = (100 - parseFloat(data.vacancyRate)).toFixed(1);

    return `
      <div class="p-4">
        <h3 class="text-lg font-bold mb-2">${data.name}</h3>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <div class="text-sm font-medium">Vacancy Rate</div>
            <div class="text-xl font-bold">${data.vacancyRate}%</div>
          </div>
          <div>
            <div class="text-sm font-medium">Total Units</div>
            <div class="text-xl font-bold">${data.totalHousing.toLocaleString()}</div>
          </div>
        </div>
      </div>
    `;
  };

  // Handle feature interactions
  const onEachFeature = (feature, layer) => {
    const data = vacancyData.find(d => d.geoid === feature.properties.GEOID);
    
    if (data) {
      layer.bindPopup(createPopupContent(data));
    }

    layer.on({
      mouseover: (e) => {
        const layer = e.target;
        layer.setStyle({
          weight: 2,
          color: '#666',
          fillOpacity: 0.9
        });
      },
      mouseout: (e) => {
        const layer = e.target;
        layer.setStyle(style(feature));
      }
    });
  };

  // Update the state selection handler
  const handleStateSelect = async (e) => {
    const stateId = e.target.value;
    setSelectedState(stateId);
    setSelectedCounty('');
    
    if (stateId) {
      try {
        setLoading(true);
        // Fetch state-level data
        const response = await fetch(
          `${baseUrl}?get=NAME,${Object.values(variables).join(',')}&for=state:${stateId}`
        );
        const data = await response.json();
        const [headers, stateRow] = data;
        
        // Calculate state statistics
        const totalHousing = parseInt(stateRow[headers.indexOf(variables.totalHousing)]) || 0;
        const vacant = parseInt(stateRow[headers.indexOf(variables.vacant)]) || 0;
        const vacancyRate = totalHousing > 0 ? ((vacant / totalHousing) * 100).toFixed(1) : '0.0';
        
        setStateStats({
          name: stateRow[0],
          totalHousing,
          vacant,
          occupied: totalHousing - vacant,
          vacancyRate
        });

        // Load counties for the selected state
        await loadCounties(stateId);
      } catch (err) {
        setError('Failed to load state statistics');
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else {
      setStateStats(null);
    }
  };

  // Update the county selection handler
  const handleCountySelect = async (e) => {
    const countyId = e.target.value;
    setSelectedCounty(countyId);
    
    if (countyId && selectedState) {
      try {
        setLoading(true);
        const response = await fetch(
          `${baseUrl}?get=NAME,${Object.values(variables).join(',')}&for=county:${countyId}&in=state:${selectedState}`
        );
        const data = await response.json();
        const [headers, countyRow] = data;
        
        // Calculate county statistics
        const totalHousing = parseInt(countyRow[headers.indexOf(variables.totalHousing)]) || 0;
        const vacant = parseInt(countyRow[headers.indexOf(variables.vacant)]) || 0;
        const vacancyRate = totalHousing > 0 ? ((vacant / totalHousing) * 100).toFixed(1) : '0.0';
        
        setCountyStats({
          name: countyRow[0].split(',')[0],
          totalHousing,
          vacant,
          occupied: totalHousing - vacant,
          vacancyRate
        });
      } catch (err) {
        setError('Failed to load county statistics');
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else {
      setCountyStats(null);
    }
  };

  // Add this component for displaying statistics
  const StatisticsDisplay = ({ stats, title }) => {
    if (!stats) return null;

    return (
      <div className="mt-4 mb-6">
        <h3 className="text-lg font-medium mb-4">Statistics for {stats.name}</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500">Vacancy Rate</div>
            <div className="text-2xl font-bold">{stats.vacancyRate}%</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500">Total Housing Units</div>
            <div className="text-2xl font-bold">{stats.totalHousing.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500">Vacant Units</div>
            <div className="text-2xl font-bold">{stats.vacant.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500">Occupied Units</div>
            <div className="text-2xl font-bold">{stats.occupied.toLocaleString()}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container py-4">
      <div className="card">
        <div className="card-header">
          <h5 className="card-title mb-0">Housing Vacancy Rates (2022)</h5>
        </div>
        <div className="card-body">
          {error && (
            <div className="alert alert-danger alert-dismissible fade show" role="alert">
              <strong>Error:</strong> {error}
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => setError(null)}
                aria-label="Close"
              ></button>
            </div>
          )}
          
          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <label className="form-label">State</label>
              <select 
                className="form-select"
                value={selectedState}
                onChange={handleStateSelect}
                disabled={loading}
              >
                <option value="">Select State</option>
                {states.map(state => (
                  <option key={state.id} value={state.id}>{state.name}</option>
                ))}
              </select>
            </div>
            
            <div className="col-md-4">
              <label className="form-label">County</label>
              <select 
                className="form-select"
                value={selectedCounty}
                onChange={handleCountySelect}
                disabled={!selectedState || loading}
              >
                <option value="">Select County</option>
                {counties.map(county => (
                  <option key={county.id} value={county.id}>{county.name}</option>
                ))}
              </select>
            </div>
            
            <div className="col-md-4">
              <label className="form-label">Geography Level</label>
              <select 
                className="form-select"
                value={geoLevel}
                onChange={(e) => setGeoLevel(e.target.value)}
                disabled={loading}
              >
                <option value="state">State</option>
                <option value="county">County</option>
                <option value="tract">Census Tract</option>
                <option value="block">Block Group</option>
              </select>
            </div>
          </div>

          <div className="position-relative border rounded" style={{ height: "500px" }}>
            {loading && (
              <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-white bg-opacity-75" style={{ zIndex: 1000 }}>
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            )}
            
            <MapContainer 
              center={[37.8, -96]} 
              zoom={4} 
              className="h-100 w-100"
              zoomControl={false}
            >
              <ZoomControl position="topright" />
              
              <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="OpenStreetMap">
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
                  />
                </LayersControl.BaseLayer>
                
                <LayersControl.BaseLayer name="Satellite">
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution='Tiles &copy; Esri'
                  />
                </LayersControl.BaseLayer>
              </LayersControl>

              <MapUpdater 
                geoJsonData={geoJsonData} 
                style={style} 
                onEachFeature={onEachFeature}
              />
            </MapContainer>
          </div>

          <div className="mt-3">
            <small className="text-muted d-block mb-2">Vacancy Rate</small>
            <div className="d-flex align-items-center gap-2">
              <span className="small">Low</span>
              <div className="flex-grow-1 rounded" style={{ height: "8px", background: "linear-gradient(to right, #238b45, #fee5d9, #a50f15)" }}></div>
              <span className="small">High</span>
            </div>
          </div>

          {/* Display Statistics */}
          {stateStats && <StatisticsDisplay stats={stateStats} title="State" />}
          {countyStats && <StatisticsDisplay stats={countyStats} title="County" />}

          {vacancyData.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-4">Top 5 Areas by Vacancy Rate</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Area
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vacancy Rate
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Units
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vacant Units
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {[...vacancyData]
                      .sort((a, b) => parseFloat(b.vacancyRate) - parseFloat(a.vacancyRate))
                      .slice(0, 5)
                      .map((area, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {area.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                            {area.vacancyRate}%
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                            {area.totalHousing.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                            {area.vacant.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HousingStats;