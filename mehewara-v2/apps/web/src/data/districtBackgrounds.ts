import { GalleryPhoto } from '../types';

export interface DistrictInfo {
  id: string;          // slug e.g. "galle", "colombo"
  name: string;        // English name e.g. "Galle"
  nameSi: string;      // Sinhala name e.g. "ගාල්ල"
  province: string;    // Province e.g. "Southern"
  folder: string;      // Folder path e.g. "/backgrounds/galle/"
}

export const SRI_LANKA_DISTRICTS: DistrictInfo[] = [
  // Western Province
  { id: 'colombo', name: 'Colombo', nameSi: 'කොළඹ', province: 'Western', folder: '/backgrounds/colombo/' },
  { id: 'gampaha', name: 'Gampaha', nameSi: 'ගම්පහ', province: 'Western', folder: '/backgrounds/gampaha/' },
  { id: 'kalutara', name: 'Kalutara', nameSi: 'කළුතර', province: 'Western', folder: '/backgrounds/kalutara/' },

  // Central Province
  { id: 'kandy', name: 'Kandy', nameSi: 'මහනුවර', province: 'Central', folder: '/backgrounds/kandy/' },
  { id: 'matale', name: 'Matale', nameSi: 'මාතලේ', province: 'Central', folder: '/backgrounds/matale/' },
  { id: 'nuwara-eliya', name: 'Nuwara Eliya', nameSi: 'නුවරඑළිය', province: 'Central', folder: '/backgrounds/nuwara-eliya/' },

  // Southern Province
  { id: 'galle', name: 'Galle', nameSi: 'ගාල්ල', province: 'Southern', folder: '/backgrounds/galle/' },
  { id: 'matara', name: 'Matara', nameSi: 'මාතර', province: 'Southern', folder: '/backgrounds/matara/' },
  { id: 'hambantota', name: 'Hambantota', nameSi: 'හම්බන්තොට', province: 'Southern', folder: '/backgrounds/hambantota/' },

  // Northern Province
  { id: 'jaffna', name: 'Jaffna', nameSi: 'යාපනය', province: 'Northern', folder: '/backgrounds/jaffna/' },
  { id: 'kilinochchi', name: 'Kilinochchi', nameSi: 'කිලිනොච්චිය', province: 'Northern', folder: '/backgrounds/kilinochchi/' },
  { id: 'mannar', name: 'Mannar', nameSi: 'මන්නාරම', province: 'Northern', folder: '/backgrounds/mannar/' },
  { id: 'vavuniya', name: 'Vavuniya', nameSi: 'වවුනියාව', province: 'Northern', folder: '/backgrounds/vavuniya/' },
  { id: 'mullaitivu', name: 'Mullaitivu', nameSi: 'මුලතිව්', province: 'Northern', folder: '/backgrounds/mullaitivu/' },

  // Eastern Province
  { id: 'batticaloa', name: 'Batticaloa', nameSi: 'මඩකලපුව', province: 'Eastern', folder: '/backgrounds/batticaloa/' },
  { id: 'ampara', name: 'Ampara', nameSi: 'අම්පාර', province: 'Eastern', folder: '/backgrounds/ampara/' },
  { id: 'trincomalee', name: 'Trincomalee', nameSi: 'ත්‍රිකුණාමලය', province: 'Eastern', folder: '/backgrounds/trincomalee/' },

  // North Western Province
  { id: 'kurunegala', name: 'Kurunegala', nameSi: 'කුරුණෑගල', province: 'North Western', folder: '/backgrounds/kurunegala/' },
  { id: 'puttalam', name: 'Puttalam', nameSi: 'පුත්තලම', province: 'North Western', folder: '/backgrounds/puttalam/' },

  // North Central Province
  { id: 'anuradhapura', name: 'Anuradhapura', nameSi: 'අනුරාධපුරය', province: 'North Central', folder: '/backgrounds/anuradhapura/' },
  { id: 'polonnaruwa', name: 'Polonnaruwa', nameSi: 'පොළොන්නරුව', province: 'North Central', folder: '/backgrounds/polonnaruwa/' },

  // Uva Province
  { id: 'badulla', name: 'Badulla', nameSi: 'බදුල්ල', province: 'Uva', folder: '/backgrounds/badulla/' },
  { id: 'monaragala', name: 'Monaragala', nameSi: 'මොණරාගල', province: 'Uva', folder: '/backgrounds/monaragala/' },

  // Sabaragamuwa Province
  { id: 'ratnapura', name: 'Ratnapura', nameSi: 'රත්නපුර', province: 'Sabaragamuwa', folder: '/backgrounds/ratnapura/' },
  { id: 'kegalle', name: 'Kegalle', nameSi: 'කෑගල්ල', province: 'Sabaragamuwa', folder: '/backgrounds/kegalle/' },
];

export const DISTRICT_MAP = new Map<string, DistrictInfo>(
  SRI_LANKA_DISTRICTS.map((d) => [d.id, d])
);

export function getDistrictInfo(query?: string | null): DistrictInfo | undefined {
  if (!query) return undefined;
  const q = query.trim().toLowerCase();
  // Exact id match
  if (DISTRICT_MAP.has(q)) return DISTRICT_MAP.get(q);

  // Search by name / nameSi
  return SRI_LANKA_DISTRICTS.find(
    (d) =>
      d.id === q ||
      d.name.toLowerCase() === q ||
      d.nameSi === query.trim() ||
      q.includes(d.id) ||
      d.name.toLowerCase().includes(q)
  );
}

/**
 * Static baseline background photos organized in district folders.
 */
export const DEFAULT_DISTRICT_BACKGROUNDS: GalleryPhoto[] = [];

/**
 * Extracts or infers the district from a photo's district field, object key, or description.
 */
export function inferPhotoDistrict(photo: GalleryPhoto): string | undefined {
  if (photo.district) {
    const info = getDistrictInfo(photo.district);
    return info ? info.id : photo.district.toLowerCase();
  }

  // Check if imageHex contains a district folder path (e.g. /backgrounds/galle/ or gallery/galle/)
  const path = photo.imageHex || '';
  for (const d of SRI_LANKA_DISTRICTS) {
    if (
      path.includes(`/backgrounds/${d.id}/`) ||
      path.includes(`gallery/${d.id}/`) ||
      path.includes(`/${d.id}/`)
    ) {
      return d.id;
    }
  }

  // Check description or title for district tags (e.g. [district:galle] or mentions)
  const text = `${photo.title || ''} ${photo.description || ''}`.toLowerCase();
  const tagMatch = text.match(/\[district:\s*([a-z0-9-]+)\]/i);
  if (tagMatch) {
    const found = getDistrictInfo(tagMatch[1]);
    if (found) return found.id;
  }

  for (const d of SRI_LANKA_DISTRICTS) {
    if (text.includes(d.name.toLowerCase()) || text.includes(d.nameSi)) {
      return d.id;
    }
  }

  return undefined;
}

/**
 * Groups photos into district folders.
 */
export interface DistrictFolderGroup {
  district: DistrictInfo | null;
  districtId: string;
  districtName: string;
  districtNameSi: string;
  photos: GalleryPhoto[];
}

export function groupPhotosByDistrictFolder(photos: GalleryPhoto[]): DistrictFolderGroup[] {
  const map = new Map<string, GalleryPhoto[]>();

  for (const photo of photos) {
    const districtId = inferPhotoDistrict(photo) || 'other';
    const list = map.get(districtId) || [];
    list.push({
      ...photo,
      district: districtId !== 'other' ? districtId : undefined,
    });
    map.set(districtId, list);
  }

  const groups: DistrictFolderGroup[] = [];

  // Add districts in canonical order if they have photos
  for (const d of SRI_LANKA_DISTRICTS) {
    if (map.has(d.id)) {
      groups.push({
        district: d,
        districtId: d.id,
        districtName: d.name,
        districtNameSi: d.nameSi,
        photos: map.get(d.id)!,
      });
      map.delete(d.id);
    }
  }

  // Any remaining photos without a known district
  if (map.has('other') && map.get('other')!.length > 0) {
    groups.push({
      district: null,
      districtId: 'other',
      districtName: 'General / Other',
      districtNameSi: 'වෙනත්',
      photos: map.get('other')!,
    });
  }

  return groups;
}
