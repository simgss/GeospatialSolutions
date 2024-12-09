import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import { getZipCodeRanges } from './utils/zipCodes';
import MapComponent from './components/MapComponent';

// Add Leaflet default marker icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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

  const mapRef = useRef();
  const mapInstance = useRef(null);
  const vectorLayer = useRef(null);
  const popupOverlay = useRef(null);

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
      if (loading) return; // Prevent multiple simultaneous loads
      
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`${baseUrl}?get=NAME&for=state:*`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const statesData = data.slice(1).map(([name, id]) => ({
          name: name.trim(),
          id: id.padStart(2, '0')
        })).sort((a, b) => a.name.localeCompare(b.name));

        setStates(statesData);
      } catch (err) {
        console.error('Failed to load states:', err);
        setError(`Failed to load states: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadStates();
  }, []); // Empty dependency array since this should only run once

  // Load counties when state is selected
  const loadCounties = useCallback(async (stateId) => {
    if (!stateId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Ensure stateId is properly formatted
      const formattedStateId = stateId.padStart(2, '0');
      
      const response = await fetch(
        `${baseUrl}?get=NAME&for=county:*&in=state:${formattedStateId}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Ensure we have data and skip the header row
      if (!data || data.length < 2) {
        throw new Error('Invalid county data received');
      }
      
      // Map the county data, handling the format [NAME, STATE, COUNTY]
      const countiesData = data.slice(1).map(row => ({
        name: row[0].split(',')[0].trim(), // Remove state name from county name
        id: row[2].padStart(3, '0'),       // Ensure county ID is properly formatted
        stateId: row[1].padStart(2, '0')   // Ensure state ID is properly formatted
      })).sort((a, b) => a.name.localeCompare(b.name));
      
      setCounties(countiesData);
    } catch (err) {
      console.error('Failed to load counties:', err);
      setError(`Failed to load counties: ${err.message}`);
      setCounties([]); // Reset counties on error
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  // Fetch GeoJSON data
  const fetchGeoJSON = useCallback(async (level, stateId, countyId) => {
    try {
      let url;
      const params = new URLSearchParams({
        outFields: '*',
        f: 'json',
        outSR: '4326',
        returnGeometry: 'true'
      });

      switch (level) {
        case 'state':
          url = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';
          const stateResponse = await fetch(url);
          const stateData = await stateResponse.json();
          if (stateId) {
            stateData.features = stateData.features.filter(
              feature => feature.properties.id === stateId
            );
          }
          return stateData;
        
        case 'county':
          url = `${tigerUrl}/State_County/MapServer/0/query`;
          params.set('where', `STATE='${stateId}'`);
          if (countyId) {
            params.set('where', `STATE='${stateId}' AND COUNTY='${countyId}'`);
          }
          break;
        
        case 'tract':
          url = `${tigerUrl}/Tracts_Blocks/MapServer/2/query`;
          params.set('where', `STATE='${stateId}' AND COUNTY='${countyId}'`);
          break;
        
        default:
          throw new Error('Invalid geography level');
      }

      console.log('Fetching GeoJSON:', `${url}?${params}`);
      const response = await fetch(`${url}?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('GeoJSON fetch error:', err);
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

      if (!geoData || !geoData.features) {
        throw new Error('Invalid GeoJSON data received');
      }

      setGeoJsonData(geoData);
      setVacancyData(vacData);
    } catch (err) {
      console.error('Error updating map:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedState, selectedCounty, geoLevel, fetchGeoJSON, fetchVacancyData]);

  useEffect(() => {
    updateMap();
  }, [updateMap]);

  // Style function for GeoJSON
  const style = (feature) => {
    const data = vacancyData.find(d => 
      d.geoid === (feature.properties.GEOID || feature.properties.id)
    );
    const rate = data ? parseFloat(data.vacancyRate) : 0;
    
    return {
      fillColor: getColor(rate),
      weight: 1,
      opacity: 1,
      color: '#666',
      dashArray: '',
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
    const data = vacancyData.find(d => 
      d.geoid === (feature.properties.GEOID || feature.properties.id)
    );
    
    if (data) {
      layer.bindPopup(createPopupContent(data));
    }

    layer.on({
      mouseover: (e) => {
        const layer = e.target;
        layer.setStyle({
          weight: 2,
          color: '#666',
          dashArray: '',
          fillOpacity: 0.9
        });
        layer.bringToFront();
      },
      mouseout: (e) => {
        const layer = e.target;
        layer.setStyle(style(feature));
      }
    });
  };

  // Update the state selection handler
  const handleStateSelect = useCallback(async (e) => {
    const stateId = e.target.value;
    
    // Reset related state
    setSelectedCounty('');
    setCounties([]);
    setStateStats(null);
    setCountyStats(null);
    setError(null);
    setGeoJsonData(null);
    setVacancyData([]);
    
    if (!stateId) {
      setSelectedState('');
      return;
    }
    
    try {
      setLoading(true);
      setSelectedState(stateId);
      setGeoLevel('state'); // Reset to state level when state changes
      
      // Load counties first
      await loadCounties(stateId);
      
      // Then load state statistics and map data
      const [statsResponse, geoResponse] = await Promise.all([
        fetch(`${baseUrl}?get=NAME,${Object.values(variables).join(',')}&for=state:${stateId}`),
        fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
      ]);
      
      if (!statsResponse.ok) {
        throw new Error(`Failed to load state data: ${statsResponse.status}`);
      }
      
      const [statsData, geoData] = await Promise.all([
        statsResponse.json(),
        geoResponse.json()
      ]);
      
      if (!statsData || statsData.length < 2) {
        throw new Error('Invalid state data received');
      }
      
      const [headers, stateRow] = statsData;
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

      // Filter and set GeoJSON data for the selected state
      const filteredGeoData = {
        type: 'FeatureCollection',
        features: geoData.features.filter(feature => feature.properties.id === stateId)
      };
      setGeoJsonData(filteredGeoData);
      
      setVacancyData([{
        name: stateRow[0],
        geoid: stateId,
        totalHousing,
        vacant,
        vacancyRate
      }]);
      
    } catch (err) {
      console.error('Failed to load state data:', err);
      setError(`Failed to load state data: ${err.message}`);
      setSelectedState('');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, variables, loadCounties]);

  // Update the county selection handler
  const handleCountySelect = useCallback(async (e) => {
    const countyId = e.target.value;
    if (loading) return;
    
    setSelectedCounty(countyId);
    setCountyStats(null);
    setGeoLevel('county');
    
    if (!countyId || !selectedState) return;

    try {
      setLoading(true);
      setError(null);

      // Format IDs properly
      const formattedStateId = selectedState.padStart(2, '0');
      const formattedCountyId = countyId.padStart(3, '0');

      // Fetch county statistics
      const statsUrl = `${baseUrl}?get=NAME,${Object.values(variables).join(',')}&for=county:${formattedCountyId}&in=state:${formattedStateId}`;
      const geoUrl = `${tigerUrl}/arcgis/rest/services/Census2020/State_County/MapServer/1/query`;
      const geoParams = new URLSearchParams({
        where: `STATEFP='${formattedStateId}' AND COUNTYFP='${formattedCountyId}'`,
        outFields: 'STATEFP,COUNTYFP,NAME,GEOID',
        f: 'json',
        outSR: '4326',
        returnGeometry: 'true',
        spatialRel: 'esriSpatialRelIntersects'
      });

      console.log('Fetching county data:', { statsUrl, geoUrl: `${geoUrl}?${geoParams}` });

      const [statsResponse, geoResponse] = await Promise.all([
        fetch(statsUrl),
        fetch(`${geoUrl}?${geoParams}`)
      ]);

      if (!statsResponse.ok || !geoResponse.ok) {
        throw new Error('Failed to fetch county data');
      }

      const [statsData, geoData] = await Promise.all([
        statsResponse.json(),
        geoResponse.json()
      ]);

      // Validate responses
      if (!statsData || !Array.isArray(statsData) || statsData.length < 2) {
        console.error('Invalid stats data:', statsData);
        throw new Error('Invalid statistics data received');
      }

      if (!geoData || !geoData.features || !geoData.features.length) {
        console.error('Invalid geo data:', geoData);
        throw new Error('Invalid geometry data received');
      }

      // Process statistics data
      const [headers, countyRow] = statsData;
      const totalHousing = parseInt(countyRow[headers.indexOf(variables.totalHousing)]) || 0;
      const vacant = parseInt(countyRow[headers.indexOf(variables.vacant)]) || 0;
      const vacancyRate = totalHousing > 0 ? ((vacant / totalHousing) * 100).toFixed(1) : '0.0';

      // Update county statistics
      setCountyStats({
        name: countyRow[0].split(',')[0],
        totalHousing,
        vacant,
        occupied: totalHousing - vacant,
        vacancyRate
      });

      // Update map with county geometry
      const geojsonData = {
        type: 'FeatureCollection',
        features: geoData.features.map(feature => ({
          type: 'Feature',
          geometry: {
            type: feature.geometry.type === 'esriGeometryPolygon' ? 'Polygon' : feature.geometry.type,
            coordinates: feature.geometry.rings || feature.geometry.coordinates
          },
          properties: {
            ...feature.attributes,
            GEOID: `${formattedStateId}${formattedCountyId}`
          }
        }))
      };

      setGeoJsonData(geojsonData);
      setVacancyData([{
        name: countyRow[0].split(',')[0],
        geoid: `${formattedStateId}${formattedCountyId}`,
        totalHousing,
        vacant,
        vacancyRate
      }]);

    } catch (err) {
      console.error('Failed to load county data:', err);
      setError(`Failed to load county data: ${err.message}`);
      setCountyStats(null);
      setGeoJsonData(null);
      setVacancyData([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, tigerUrl, variables, selectedState, loading]);

  // Update the StatisticsDisplay component
  const StatisticsDisplay = ({ stats, title }) => {
    if (!stats) return null;

    return (
      <div className="card mb-3">
        <div className="card-header">
          <h6 className="mb-0">{title} Statistics: {stats.name}</h6>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <div className="stat-box">
                <div className="stat-label">Vacancy Rate</div>
                <div className="stat-value text-primary">{stats.vacancyRate}%</div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="stat-box">
                <div className="stat-label">Total Housing Units</div>
                <div className="stat-value">{stats.totalHousing.toLocaleString()}</div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="stat-box">
                <div className="stat-label">Vacant Units</div>
                <div className="stat-value text-warning">{stats.vacant.toLocaleString()}</div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="stat-box">
                <div className="stat-label">Occupied Units</div>
                <div className="stat-value text-success">{stats.occupied.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Add a legend component
  const Legend = () => {
    return (
      <div className="legend" style={{ position: 'absolute', bottom: '20px', right: '20px', background: 'white', padding: '10px', borderRadius: '5px', zIndex: 1000 }}>
        <div style={{ marginBottom: '5px' }}><strong>Vacancy Rate</strong></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
          <div style={{ width: '20px', height: '20px', background: '#a50f15' }}></div>
          <span>≥ 25%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
          <div style={{ width: '20px', height: '20px', background: '#de2d26' }}></div>
          <span>20-25%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
          <div style={{ width: '20px', height: '20px', background: '#fb6a4a' }}></div>
          <span>15-20%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
          <div style={{ width: '20px', height: '20px', background: '#fcae91' }}></div>
          <span>10-15%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
          <div style={{ width: '20px', height: '20px', background: '#fee5d9' }}></div>
          <span>7-10%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
          <div style={{ width: '20px', height: '20px', background: '#edf8e9' }}></div>
          <span>5-7%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
          <div style={{ width: '20px', height: '20px', background: '#bae4b3' }}></div>
          <span>3-5%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
          <div style={{ width: '20px', height: '20px', background: '#74c476' }}></div>
          <span>1-3%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '20px', height: '20px', background: '#238b45' }}></div>
          <span>0.5-1%</span>
        </div>
      </div>
    );
  };

  // Update the handleGeoLevelChange function
  const handleGeoLevelChange = useCallback(async (e) => {
    const newLevel = e.target.value;
    
    // Don't allow tract level without county selected
    if (newLevel === 'tract' && !selectedCounty) {
      setError('Please select a county first');
      return;
    }
    
    setGeoLevel(newLevel);
    
    try {
      setLoading(true);
      setError(null);
      
      // Fetch new data based on the selected geography level
      const [geoData, vacData] = await Promise.all([
        fetchGeoJSON(newLevel, selectedState, selectedCounty),
        fetchVacancyData(newLevel, selectedState, selectedCounty)
      ]);
      
      setGeoJsonData(geoData);
      setVacancyData(vacData);
    } catch (err) {
      console.error('Failed to update geography level:', err);
      setError(`Failed to update geography level: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedState, selectedCounty, fetchGeoJSON, fetchVacancyData]);

  return (
    <div className="container-fluid p-3">
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
                disabled={loading}
              >
                <option value="">Select County</option>
                {counties.map(county => (
                  <option key={county.id} value={county.id}>
                    {county.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="col-md-4">
              <label className="form-label">Geography Level</label>
              <select 
                className="form-select"
                value={geoLevel}
                onChange={handleGeoLevelChange}
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
            
            <MapComponent
              geoJsonData={geoJsonData}
              style={style}
              onEachFeature={onEachFeature}
            />
            
            <Legend />
          </div>

          <div className="mt-3">
            <small className="text-muted d-block mb-2">Vacancy Rate</small>
            <div className="d-flex align-items-center gap-2">
              <span className="small">Low</span>
              <div className="flex-grow-1 rounded" style={{ height: "8px", background: "linear-gradient(to right, #238b45, #fee5d9, #a50f15)" }}></div>
              <span className="small">High</span>
            </div>
          </div>

          <div className="mt-4">
            {stateStats && (
              <StatisticsDisplay 
                stats={stateStats} 
                title="State"
              />
            )}
            {countyStats && (
              <StatisticsDisplay 
                stats={countyStats} 
                title="County"
              />
            )}
          </div>

          {/* Enhanced Table with Area Statistics */}
          {vacancyData.length > 0 && (
            <div className="mt-4">
              <h3 className="card-title h5 mb-3">Area Statistics</h3>
              <div className="table-container">
                <table className="table table-hover">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th>Area</th>
                      <th className="text-end">Vacancy Rate</th>
                      <th className="text-end">Total Units</th>
                      <th className="text-end">Vacant Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...vacancyData]
                      .sort((a, b) => parseFloat(b.vacancyRate) - parseFloat(a.vacancyRate))
                      .slice(0, 10) // Limit to 10 rows
                      .map((area, index) => (
                        <tr key={index}>
                          <td>{area.name}</td>
                          <td className="text-end">{area.vacancyRate}%</td>
                          <td className="text-end">{area.totalHousing.toLocaleString()}</td>
                          <td className="text-end">{area.vacant.toLocaleString()}</td>
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