import React, { useState, useEffect, useRef as useReactRef, useCallback } from 'react';
import { Trash2, Images, RefreshCw, ChevronUp, ChevronDown, Pin, MapPin, Folder, CloudUpload } from 'lucide-react';
import { GalleryPhoto } from '../../types';
import { adminLoadGallery, dbLoadGallery, dbSaveGalleryPhoto, dbDeleteGalleryPhoto, dbUpdateGalleryPhotoOrder, dbDeleteAllGalleryPhotos, dbBuildPublication, clearPublicManifestCache } from '../../api';
import { hexToDataUrl, createPreviewUrl, GALLERY_ACCEPT } from '../../utils/imageHex';
import { uploadImageToStorage } from '../../utils/mediaUpload';
import { normalizeMediaUrl } from '../../apiClient';
import { idbSet } from '../../utils/storage';
import { SRI_LANKA_DISTRICTS, getDistrictInfo, inferPhotoDistrict } from '../../data/districtBackgrounds';
import type { AdminThemeClasses } from './types';

interface GalleryTabProps {
  theme: AdminThemeClasses;
  showFlash: (message: string, isError?: boolean) => void;
  onGalleryUpdate?: (photos: GalleryPhoto[]) => void;
}

export default function GalleryTab({ theme, showFlash, onGalleryUpdate }: GalleryTabProps) {
  const { isDark, cardBg, cardBdr, inputBg, inputBdr, textPrimary, textMuted, textFaint, subtleBg, subtleBdr } = theme;

  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [galleryUploadFile, setGalleryUploadFile] = useState<File | null>(null);
  const [galleryUploadPreview, setGalleryUploadPreview] = useState<string>('');
  const [galleryUploadTitle, setGalleryUploadTitle] = useState('');
  const [galleryUploadDesc, setGalleryUploadDesc] = useState('');
  const [galleryUploadDistrict, setGalleryUploadDistrict] = useState('galle');
  const [galleryUploadPinned, setGalleryUploadPinned] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryUploadProgress, setGalleryUploadProgress] = useState(0);
  const [adminDistrictFilter, setAdminDistrictFilter] = useState<string>('all');
  const galleryFileInputRef = useReactRef<HTMLInputElement>(null);

  const fetchGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      // Prioritize live D1 database loader for admin panel
      let photos = await adminLoadGallery();
      if (!photos || photos.length === 0) {
        photos = await dbLoadGallery();
      }
      if (photos) {
        setGalleryPhotos(photos);
        idbSet('m_gallery', JSON.stringify(photos));
        onGalleryUpdate?.(photos);
      }
    } catch (err: any) {
      console.error('Failed to load admin gallery:', err);
      const photos = await dbLoadGallery();
      if (photos) setGalleryPhotos(photos);
    } finally {
      setGalleryLoading(false);
    }
  }, [onGalleryUpdate]);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  const triggerPublicationSync = useCallback(async (updatedPhotos: GalleryPhoto[]) => {
    setGalleryPhotos(updatedPhotos);
    idbSet('m_gallery', JSON.stringify(updatedPhotos));
    onGalleryUpdate?.(updatedPhotos);
    clearPublicManifestCache();
    setIsPublishing(true);
    try {
      await dbBuildPublication();
    } catch (pubErr) {
      console.warn('Background publication build warning:', pubErr);
    } finally {
      setIsPublishing(false);
    }
  }, [onGalleryUpdate]);

  const handleGalleryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url, normalizedFile } = await createPreviewUrl(file);
      setGalleryUploadFile(normalizedFile);
      setGalleryUploadPreview(url);
    } catch (err: any) {
      showFlash(err?.message || 'Unsupported image format', true);
      setGalleryUploadFile(null);
      setGalleryUploadPreview('');
      if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
    }
  };

  const handleGalleryUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!galleryUploadFile) {
      showFlash('Please choose a photo.', true);
      return;
    }
    setGalleryUploading(true);
    setGalleryUploadProgress(0);
    try {
      const folder = galleryUploadDistrict ? `gallery/${galleryUploadDistrict}` : 'gallery/items';
      const publicUrl = await uploadImageToStorage(galleryUploadFile, folder);
      const newPhoto: GalleryPhoto = {
        id: crypto.randomUUID(),
        title: galleryUploadTitle.trim() || undefined,
        description: galleryUploadDesc.trim(),
        imageHex: publicUrl,
        mimeType: 'image/webp',
        sortOrder: galleryPhotos.length,
        createdAt: new Date().toISOString(),
        pinned: galleryUploadPinned,
        district: galleryUploadDistrict || undefined,
      };
      const { error } = await dbSaveGalleryPhoto(newPhoto);
      if (error) {
        showFlash(`Upload failed: ${error}`, true);
      } else {
        showFlash('Photo uploaded to storage, saved to server, and published!');
        const updated = [...galleryPhotos, newPhoto];
        await triggerPublicationSync(updated);
        setGalleryUploadFile(null);
        setGalleryUploadPreview('');
        setGalleryUploadTitle('');
        setGalleryUploadDesc('');
        setGalleryUploadDistrict('galle');
        setGalleryUploadPinned(false);
        if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
      }
    } catch (err: any) {
      showFlash(`Error: ${err?.message || 'Upload failed'}`, true);
    } finally {
      setGalleryUploading(false);
      setGalleryUploadProgress(0);
    }
  };

  const handleGalleryTogglePin = async (photo: GalleryPhoto) => {
    const updatedPhoto = { ...photo, pinned: !photo.pinned };
    const updated = galleryPhotos.map(p => p.id === photo.id ? updatedPhoto : p);
    setGalleryPhotos(updated);
    const { error } = await dbSaveGalleryPhoto(updatedPhoto);
    if (error) {
      showFlash(`Failed to update pin: ${error}`, true);
      setGalleryPhotos(galleryPhotos);
    } else {
      await triggerPublicationSync(updated);
    }
  };

  const handleGalleryDelete = async (id: string) => {
    if (!window.confirm('Delete this photo permanently from the gallery?')) return;
    try {
      const { error } = await dbDeleteGalleryPhoto(id);
      if (error) {
        showFlash(`Delete failed: ${error}`, true);
      } else {
        const updated = galleryPhotos.filter(p => p.id !== id);
        await triggerPublicationSync(updated);
        showFlash('Photo deleted from server and publication updated.');
      }
    } catch (err: any) {
      showFlash(`Delete failed: ${err?.message || 'Failed to delete photo'}`, true);
    }
  };

  const handleGalleryMoveUp = async (index: number) => {
    if (index === 0) return;
    const updated = [...galleryPhotos];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    const reordered = updated.map((p, i) => ({ ...p, sortOrder: i }));
    await triggerPublicationSync(reordered);
    await dbUpdateGalleryPhotoOrder(reordered[index - 1].id, index - 1);
    await dbUpdateGalleryPhotoOrder(reordered[index].id, index);
  };

  const handleGalleryMoveDown = async (index: number) => {
    if (index === galleryPhotos.length - 1) return;
    const updated = [...galleryPhotos];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    const reordered = updated.map((p, i) => ({ ...p, sortOrder: i }));
    await triggerPublicationSync(reordered);
    await dbUpdateGalleryPhotoOrder(reordered[index].id, index);
    await dbUpdateGalleryPhotoOrder(reordered[index + 1].id, index + 1);
  };

  const handleGalleryDeleteAll = async () => {
    if (!window.confirm('WARNING: Are you sure you want to delete ALL photos from the gallery? This cannot be undone.')) return;
    setGalleryLoading(true);
    try {
      const { error } = await dbDeleteAllGalleryPhotos();
      if (error) {
        showFlash(`Delete all failed: ${error}`, true);
      } else {
        await triggerPublicationSync([]);
        showFlash('All photos have been deleted from server and publication.');
      }
    } catch (err: any) {
      showFlash(`Delete all failed: ${err?.message || 'Server error'}`, true);
    } finally {
      setGalleryLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

      {/* Upload Form */}
      <div className={`lg:col-span-4 ${cardBg} border ${cardBdr} rounded-2xl p-6 self-start ${isDark ? '' : 'shadow-md'}`}>
        <h2 className={`text-lg font-bold ${textPrimary} mb-4 flex items-center gap-2`}>
          <Images className="w-4 h-4 text-emerald-400" />
          Add New Photo
        </h2>

        <form onSubmit={handleGalleryUpload} className="space-y-4">
          {/* File picker */}
          <div>
            <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>Photo File</label>
            <input
              ref={galleryFileInputRef}
              type="file"
              accept={GALLERY_ACCEPT}
              onChange={handleGalleryFileChange}
              className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors file:mr-3 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:bg-emerald-500/10 file:text-emerald-400 cursor-pointer`}
            />
            <p className={`text-[10px] mt-1 ${textFaint}`}>Supports JPEG, PNG, WebP, HEIC, TIFF, GIF, BMP, AVIF &amp; more. Auto-compressed to max 1200px JPEG.</p>
          </div>

          {/* Preview */}
          {galleryUploadPreview && (
            <div className={`rounded-xl overflow-hidden border ${cardBdr}`}>
              <img src={galleryUploadPreview} alt="Preview" className="w-full max-h-48 object-cover" />
            </div>
          )}

          {/* Title */}
          <div>
            <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>Title (optional)</label>
            <input
              type="text"
              placeholder="e.g. Annual Prize Giving 2025"
              value={galleryUploadTitle}
              onChange={(e) => setGalleryUploadTitle(e.target.value)}
              className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors`}
            />
          </div>

          {/* Description */}
          <div>
            <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>Description (optional)</label>
            <textarea
              placeholder="Short description of this photo..."
              value={galleryUploadDesc}
              onChange={(e) => setGalleryUploadDesc(e.target.value)}
              rows={3}
              className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors resize-none`}
            />
          </div>

          {/* District Folder Selector */}
          <div>
            <label className={`block text-xs font-semibold ${textMuted} mb-1.5 flex items-center gap-1.5`}>
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              District / Location Folder
            </label>
            <select
              value={galleryUploadDistrict}
              onChange={(e) => setGalleryUploadDistrict(e.target.value)}
              className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer`}
            >
              <option value="">-- General / No District --</option>
              {SRI_LANKA_DISTRICTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.nameSi}) — {d.province} Province
                </option>
              ))}
            </select>
            <p className={`text-[10px] mt-1 ${textFaint}`}>
              Photo is categorized into <code className="text-emerald-400 font-mono">gallery/{galleryUploadDistrict || 'items'}/</code> folder in Cloud Storage and grouped by district in the background slideshow.
            </p>
          </div>

          {/* Pinned Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="gallery-pin"
              checked={galleryUploadPinned}
              onChange={(e) => setGalleryUploadPinned(e.target.checked)}
              className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500"
            />
            <label htmlFor="gallery-pin" className={`text-xs font-semibold ${textMuted}`}>Pin photo (show at the top of the gallery)</label>
          </div>

          {/* Progress bar */}
          {galleryUploading && (
            <div className={`rounded-xl overflow-hidden border ${cardBdr} h-2 ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-200 rounded-xl"
                style={{ width: `${galleryUploadProgress}%` }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={galleryUploading || !galleryUploadFile}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold font-sans text-xs tracking-widest transition-all cursor-pointer"
          >
            {galleryUploading ? `Encoding... ${galleryUploadProgress}%` : 'Save Photo to Gallery'}
          </button>
        </form>
      </div>

      {/* Gallery List */}
      <div className="lg:col-span-8 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className={`text-lg font-bold ${textPrimary} flex items-center gap-2`}>
            <Images className="w-4 h-4 text-emerald-400" />
            Gallery Photos
            <span className={`text-xs font-mono ${textFaint} border ${cardBdr} px-2 py-0.5 rounded-lg`}>{galleryPhotos.length}</span>
          </h2>
          <div className="flex items-center gap-2">
            {isPublishing && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl animate-pulse">
                <CloudUpload className="w-3.5 h-3.5 animate-bounce" />
                Publishing to Cloud...
              </span>
            )}
            <button
              onClick={fetchGallery}
              disabled={galleryLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 ${subtleBg} border ${subtleBdr} ${textMuted} hover:text-emerald-400 rounded-xl text-xs font-semibold cursor-pointer transition-colors`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${galleryLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleGalleryDeleteAll}
              disabled={galleryLoading || galleryPhotos.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 rounded-xl text-xs font-semibold transition-colors ${(galleryLoading || galleryPhotos.length === 0) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title="Delete all photos"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete All
            </button>
          </div>
        </div>

        {/* District Filter Pill Bar */}
        {galleryPhotos.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setAdminDistrictFilter('all')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                adminDistrictFilter === 'all'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : `${cardBg} border ${cardBdr} ${textMuted} hover:${textPrimary}`
              }`}
            >
              <Folder className="w-3 h-3" />
              <span>All ({galleryPhotos.length})</span>
            </button>
            {SRI_LANKA_DISTRICTS.map((d) => {
              const count = galleryPhotos.filter((p) => inferPhotoDistrict(p) === d.id).length;
              if (count === 0) return null;
              const isSelected = adminDistrictFilter === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setAdminDistrictFilter(d.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : `${cardBg} border ${cardBdr} ${textMuted} hover:${textPrimary}`
                  }`}
                >
                  <MapPin className="w-3 h-3" />
                  <span>{d.name} ({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {galleryLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className={`rounded-xl overflow-hidden animate-pulse ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
                <div className={`w-full aspect-[4/3] ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <div className="p-2 space-y-1">
                  <div className={`h-3 w-3/4 rounded ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!galleryLoading && galleryPhotos.length === 0 && (
          <div className={`text-center py-16 rounded-2xl border border-dashed ${cardBdr} ${textFaint} text-xs`}>
            <Images className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No photos uploaded yet.</p>
            <p className="mt-1 text-[10px]">Use the form on the left to add your first photo.</p>
          </div>
        )}

        {!galleryLoading && galleryPhotos.length > 0 && (
          <div className="space-y-3">
            {galleryPhotos
              .filter((photo) => adminDistrictFilter === 'all' || inferPhotoDistrict(photo) === adminDistrictFilter)
              .map((photo, index) => {
              const dataUrl = photo.imageHex
                ? (photo.imageHex.startsWith('http') || photo.imageHex.startsWith('data:') || photo.imageHex.startsWith('/api/') || photo.imageHex.startsWith('/')
                    ? normalizeMediaUrl(photo.imageHex)
                    : hexToDataUrl(photo.imageHex, photo.mimeType))
                : '';
              const photoDistrictSlug = inferPhotoDistrict(photo);
              const districtInfo = getDistrictInfo(photoDistrictSlug);

              return (
                <div
                  key={photo.id}
                  className={`flex items-start gap-4 p-3 rounded-2xl border ${cardBdr} ${isDark ? 'bg-slate-900/50' : 'bg-white'} transition-all`}
                >
                  {/* Thumbnail */}
                  <div className="shrink-0 w-20 h-16 rounded-xl overflow-hidden border border-slate-700/30">
                    {dataUrl && (
                      <img src={dataUrl} alt={photo.title || 'Untitled'} className="w-full h-full object-cover" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {photo.pinned && <Pin className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                      <p className={`text-sm font-bold ${textPrimary} truncate`}>{photo.title || 'Untitled'}</p>
                      {districtInfo && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                          <MapPin className="w-2.5 h-2.5" />
                          {districtInfo.name}
                        </span>
                      )}
                    </div>
                    {photo.description && (
                      <p className={`text-xs ${textMuted} mt-0.5 line-clamp-2`}>{photo.description}</p>
                    )}
                    <p className={`text-[10px] font-mono ${textFaint} mt-1`}>
                      #{index + 1} · {photo.mimeType || 'image/webp'} {photo.imageHex.startsWith('http') || photo.imageHex.startsWith('/api/') ? '· Cloud Storage' : photo.imageHex.startsWith('/') ? '· Static District Folder' : `· ${Math.round(photo.imageHex.length / 2048)} KB`}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => handleGalleryMoveUp(index)}
                      disabled={index === 0}
                      className={`p-1.5 rounded-lg border ${cardBdr} ${textMuted} disabled:opacity-20 hover:text-emerald-400 transition-colors cursor-pointer`}
                      title="Move up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleGalleryMoveDown(index)}
                      disabled={index === galleryPhotos.length - 1}
                      className={`p-1.5 rounded-lg border ${cardBdr} ${textMuted} disabled:opacity-20 hover:text-emerald-400 transition-colors cursor-pointer`}
                      title="Move down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleGalleryTogglePin(photo)}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        photo.pinned 
                          ? 'text-sky-500 bg-sky-500/10 border-sky-500/30 hover:bg-sky-500/20' 
                          : `${cardBdr} ${textMuted} hover:text-sky-400`
                      }`}
                      title={photo.pinned ? "Unpin photo" : "Pin photo"}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleGalleryDelete(photo.id)}
                      className="p-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Delete photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
