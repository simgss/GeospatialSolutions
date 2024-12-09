// Create this new file for static ZIP code ranges
export const stateZipCodes = {
  '01': { // Alabama
    ranges: ['35000-36999'],
    name: 'Alabama'
  },
  '02': { // Alaska
    ranges: ['99500-99999'],
    name: 'Alaska'
  },
  '04': { // Arizona
    ranges: ['85000-86999'],
    name: 'Arizona'
  },
  '05': { // Arkansas
    ranges: ['71600-72999'],
    name: 'Arkansas'
  },
  '06': { // California
    ranges: ['90000-96699'],
    name: 'California'
  },
  '08': { // Colorado
    ranges: ['80000-81999'],
    name: 'Colorado'
  },
  '09': { // Connecticut
    ranges: ['06000-06999'],
    name: 'Connecticut'
  },
  '10': { // Delaware
    ranges: ['19700-19999'],
    name: 'Delaware'
  },
  '11': { // DC
    ranges: ['20000-20099', '20200-20599'],
    name: 'District of Columbia'
  },
  '12': { // Florida
    ranges: ['32000-34999'],
    name: 'Florida'
  }
};

export function getZipCodeRanges(stateId) {
  const state = stateZipCodes[stateId];
  return state ? state.ranges : [];
} 