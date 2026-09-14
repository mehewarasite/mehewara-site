import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  History,
  Search,
  RefreshCw,
  User,
  Shield,
  PlusCircle,
  Edit3,
  Trash2,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Download,
  Calendar,
  Layers,
  Info
} from 'lucide-react';
import type { AdminThemeClasses } from './types';
import { dbLoadAuditLog, type AuditItem } from '../../api';

interface AuditTabProps {
  theme: AdminThemeClasses;
  showFlash?: (msg: string, isError?: boolean) => void;
}

export default function AuditTab({ theme, showFlash }: AuditTabProps) {
  const { isDark, cardBg, cardBdr, surfaceBg, inputBg, inputBdr, textPrimary, textMuted, textFaint, dividerBdr, subtleBg } = theme;

  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionCategory, setSelectedActionCategory] = useState<string>('all');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fetchLimit, setFetchLimit] = useState<number>(100);

  const loadAudits = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    setLoadError(null);
    try {
      const items = await dbLoadAuditLog(fetchLimit);
      setAudits(items);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Failed to load audit logs';
      setLoadError(msg);
      if (showFlash) showFlash(msg, true);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [fetchLimit, showFlash]);

  useEffect(() => {
    loadAudits();
  }, [loadAudits]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportJson = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredAudits, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `mehewara-audit-log-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      if (showFlash) showFlash('Audit log downloaded successfully!');
    } catch {
      if (showFlash) showFlash('Failed to export audit log', true);
    }
  };

  // Helper for badge formatting
  const getActionMeta = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('delete') || act.includes('remove')) {
      return {
        label: action.replace(/\./g, ' '),
        icon: Trash2,
        badgeClass: isDark ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' : 'bg-rose-50 text-rose-700 border-rose-200',
        dotColor: 'bg-rose-500',
        category: 'delete'
      };
    }
    if (act.includes('upload')) {
      return {
        label: action.replace(/\./g, ' '),
        icon: UploadCloud,
        badgeClass: isDark ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-sky-50 text-sky-700 border-sky-200',
        dotColor: 'bg-sky-500',
        category: 'upload'
      };
    }
    if (act.includes('create') || act.includes('insert')) {
      return {
        label: action.replace(/\./g, ' '),
        icon: PlusCircle,
        badgeClass: isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotColor: 'bg-emerald-500',
        category: 'create'
      };
    }
    return {
      label: action.replace(/\./g, ' '),
      icon: Edit3,
      badgeClass: isDark ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200',
      dotColor: 'bg-amber-500',
      category: 'update'
    };
  };

  const getAuditDetails = (item: AuditItem) => {
    const map = new Map(item.metadata.map(m => [m.key, m.value]));
    const actor = map.get('actorUsername') || item.actorId;
    const fileOrTarget = map.get('objectKey') || map.get('title') || map.get('slug') || map.get('username') || map.get('deletedUsername') || item.entityId || 'N/A';
    return { actor, fileOrTarget, metaMap: map };
  };

  // Metrics overview calculation
  const metrics = useMemo(() => {
    let creates = 0;
    let updates = 0;
    let deletes = 0;
    let uploads = 0;
    const uniqueActors = new Set<string>();

    for (const a of audits) {
      const { actor } = getAuditDetails(a);
      if (actor) uniqueActors.add(actor);
      const act = a.action.toLowerCase();
      if (act.includes('upload')) uploads++;
      else if (act.includes('delete') || act.includes('remove')) deletes++;
      else if (act.includes('create') || act.includes('insert')) creates++;
      else updates++;
    }

    return {
      total: audits.length,
      creates,
      updates,
      deletes,
      uploads,
      actorsCount: uniqueActors.size
    };
  }, [audits]);

  // Distinct entity types for dropdown
  const entityTypes = useMemo(() => {
    const types = new Set<string>();
    audits.forEach(a => {
      if (a.entityType) types.add(a.entityType);
    });
    return Array.from(types).sort();
  }, [audits]);

  // Filtered audits
  const filteredAudits = useMemo(() => {
    return audits.filter(item => {
      const { actor, fileOrTarget, metaMap } = getAuditDetails(item);
      const actionMeta = getActionMeta(item.action);

      // Action category filter
      if (selectedActionCategory !== 'all') {
        if (selectedActionCategory === 'create' && actionMeta.category !== 'create') return false;
        if (selectedActionCategory === 'update' && actionMeta.category !== 'update') return false;
        if (selectedActionCategory === 'delete' && actionMeta.category !== 'delete') return false;
        if (selectedActionCategory === 'upload' && actionMeta.category !== 'upload') return false;
        if (selectedActionCategory === 'user' && item.entityType !== 'admin_user') return false;
      }

      // Entity type filter
      if (selectedEntityType !== 'all' && item.entityType !== selectedEntityType) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const inActor = actor.toLowerCase().includes(query);
        const inAction = item.action.toLowerCase().includes(query);
        const inType = item.entityType.toLowerCase().includes(query);
        const inTarget = fileOrTarget.toLowerCase().includes(query);
        const inEntityId = (item.entityId || '').toLowerCase().includes(query);
        const inMeta = Array.from(metaMap.values()).some(v => v.toLowerCase().includes(query));

        return inActor || inAction || inType || inTarget || inEntityId || inMeta;
      }

      return true;
    });
  }, [audits, searchQuery, selectedActionCategory, selectedEntityType]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-2xl ${isDark ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-indigo-50 border-indigo-200 text-indigo-600'} border shadow-sm`}>
              <History className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-2xl font-black tracking-tight ${textPrimary}`}>Audit Logs &amp; Activity Trail</h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-indigo-100 text-indigo-700'}`}>
                  Live History
                </span>
              </div>
              <p className={`text-xs ${textMuted} mt-0.5`}>
                Complete record of all administrative operations: who created, modified, uploaded, or deleted files and records.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadAudits(true)}
            disabled={isRefreshing || isLoading}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border ${cardBdr} ${cardBg} ${textPrimary} hover:bg-indigo-500/10 transition-all disabled:opacity-50 cursor-pointer text-xs font-bold shadow-sm`}
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : 'text-indigo-500'}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={handleExportJson}
            disabled={filteredAudits.length === 0}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border ${cardBdr} ${cardBg} ${textMuted} hover:${textPrimary} hover:bg-slate-500/10 transition-all disabled:opacity-50 cursor-pointer text-xs font-bold shadow-sm`}
            title="Export filtered logs as JSON"
          >
            <Download className="w-3.5 h-3.5 text-sky-500" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Events */}
        <div className={`p-4 rounded-2xl border ${cardBdr} ${cardBg} flex flex-col justify-between shadow-sm`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${textMuted}`}>Total Events</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className={`text-2xl font-black ${textPrimary} font-display`}>{metrics.total.toLocaleString()}</div>
          <span className={`text-[10px] ${textFaint} mt-1`}>Recorded audit actions</span>
        </div>

        {/* Creates */}
        <div className={`p-4 rounded-2xl border ${isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50/50 border-emerald-200'} flex flex-col justify-between shadow-sm`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Created</span>
            <PlusCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-display">{metrics.creates.toLocaleString()}</div>
          <span className={`text-[10px] ${textFaint} mt-1`}>New resources</span>
        </div>

        {/* Updates */}
        <div className={`p-4 rounded-2xl border ${isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50/50 border-amber-200'} flex flex-col justify-between shadow-sm`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Modified</span>
            <Edit3 className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-display">{metrics.updates.toLocaleString()}</div>
          <span className={`text-[10px] ${textFaint} mt-1`}>Updated entities</span>
        </div>

        {/* Uploads */}
        <div className={`p-4 rounded-2xl border ${isDark ? 'bg-sky-500/5 border-sky-500/20' : 'bg-sky-50/50 border-sky-200'} flex flex-col justify-between shadow-sm`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Media</span>
            <UploadCloud className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-black text-sky-600 dark:text-sky-400 font-display">{metrics.uploads.toLocaleString()}</div>
          <span className={`text-[10px] ${textFaint} mt-1`}>Uploaded B2 files</span>
        </div>

        {/* Deletes */}
        <div className={`p-4 rounded-2xl border ${isDark ? 'bg-rose-500/5 border-rose-500/20' : 'bg-rose-50/50 border-rose-200'} flex flex-col justify-between shadow-sm`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Deleted</span>
            <Trash2 className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-display">{metrics.deletes.toLocaleString()}</div>
          <span className={`text-[10px] ${textFaint} mt-1`}>Removed items</span>
        </div>

        {/* Unique Editors */}
        <div className={`p-4 rounded-2xl border ${cardBdr} ${cardBg} flex flex-col justify-between shadow-sm`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${textMuted}`}>Admins</span>
            <User className="w-4 h-4 text-purple-400" />
          </div>
          <div className={`text-2xl font-black ${textPrimary} font-display`}>{metrics.actorsCount}</div>
          <span className={`text-[10px] ${textFaint} mt-1`}>Active editors</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={`p-4 rounded-2xl border ${cardBdr} ${cardBg} shadow-sm space-y-3`}>
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by admin name, file path, action, title, or ID..."
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold ${textMuted} hover:${textPrimary}`}
              >
                Clear
              </button>
            )}
          </div>

          {/* Entity Type Dropdown */}
          <div className="flex items-center gap-2">
            <select
              value={selectedEntityType}
              onChange={(e) => setSelectedEntityType(e.target.value)}
              className={`px-3 py-2.5 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer`}
            >
              <option value="all">All Resource Types ({entityTypes.length})</option>
              {entityTypes.map(t => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ').toUpperCase()}
                </option>
              ))}
            </select>

            {/* Fetch Limit Selector */}
            <select
              value={fetchLimit}
              onChange={(e) => setFetchLimit(Number(e.target.value))}
              className={`px-3 py-2.5 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer`}
              title="Query limit"
            >
              <option value={50}>Limit: 50</option>
              <option value={100}>Limit: 100</option>
              <option value={200}>Limit: 200</option>
            </select>
          </div>
        </div>

        {/* Action Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 pt-1">
          {[
            { id: 'all', label: 'All Operations', count: audits.length },
            { id: 'create', label: 'Creates', count: metrics.creates },
            { id: 'update', label: 'Updates / Edits', count: metrics.updates },
            { id: 'upload', label: 'Media Uploads', count: metrics.uploads },
            { id: 'delete', label: 'Deletions', count: metrics.deletes },
            { id: 'user', label: 'Admin Accounts', count: audits.filter(a => a.entityType === 'admin_user').length },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedActionCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedActionCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 scale-[1.02]'
                  : `${isDark ? 'bg-slate-900 text-slate-400 hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`
              }`}
            >
              <span>{cat.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedActionCategory === cat.id ? 'bg-white/20 text-white' : (isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600')
              }`}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Audit Feed Table Card */}
      <div className={`rounded-2xl border ${cardBdr} ${cardBg} shadow-sm overflow-hidden`}>
        {loadError && (
          <div className="p-4 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-between">
            <span>Error loading audit logs: {loadError}</span>
            <button onClick={() => loadAudits()} className="underline cursor-pointer">Retry</button>
          </div>
        )}

        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
            <span className={`text-xs font-medium ${textMuted}`}>Loading activity audit records...</span>
          </div>
        ) : filteredAudits.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-4">
            <div className={`w-14 h-14 rounded-2xl ${isDark ? 'bg-slate-900' : 'bg-slate-100'} flex items-center justify-center mb-3`}>
              <Shield className={`w-7 h-7 ${textFaint}`} />
            </div>
            <h3 className={`text-base font-bold ${textPrimary}`}>No Activity Records Found</h3>
            <p className={`text-xs ${textMuted} mt-1 max-w-sm`}>
              {searchQuery || selectedActionCategory !== 'all' || selectedEntityType !== 'all'
                ? 'No audit entries match your current search and filter criteria. Try clearing filters.'
                : 'No administrative edits or file uploads have been logged yet.'}
            </p>
            {(searchQuery || selectedActionCategory !== 'all' || selectedEntityType !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedActionCategory('all');
                  setSelectedEntityType('all');
                }}
                className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/20"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b ${dividerBdr} ${textMuted} text-[11px] font-bold uppercase tracking-wider ${isDark ? 'bg-slate-900/50' : 'bg-slate-50/75'}`}>
                  <th className="py-3 px-4 w-8"></th>
                  <th className="py-3 px-4 whitespace-nowrap">Timestamp</th>
                  <th className="py-3 px-4 whitespace-nowrap">User / Editor</th>
                  <th className="py-3 px-4 whitespace-nowrap">Action</th>
                  <th className="py-3 px-4 whitespace-nowrap">Resource Type</th>
                  <th className="py-3 px-4">File / Target Summary</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${dividerBdr}`}>
                {filteredAudits.map((item) => {
                  const isExpanded = expandedId === item.id;
                  const { actor, fileOrTarget } = getAuditDetails(item);
                  const actionMeta = getActionMeta(item.action);
                  const ActionIcon = actionMeta.icon;

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded
                            ? (isDark ? 'bg-slate-900/80' : 'bg-indigo-50/50')
                            : (isDark ? 'hover:bg-slate-900/40' : 'hover:bg-slate-50')
                        }`}
                      >
                        {/* Expand arrow */}
                        <td className="py-3.5 px-4 text-center">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-indigo-500" />
                          ) : (
                            <ChevronRight className={`w-4 h-4 ${textFaint}`} />
                          )}
                        </td>

                        {/* Timestamp */}
                        <td className={`py-3.5 px-4 font-mono text-[11px] whitespace-nowrap ${textMuted}`}>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {new Date(item.createdAt).toLocaleString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })}
                            </span>
                          </div>
                        </td>

                        {/* Editor / User */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[9px] uppercase ${
                              isDark ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                            }`}>
                              {actor.slice(0, 2)}
                            </div>
                            <span className={`font-bold ${textPrimary}`}>{actor}</span>
                          </div>
                        </td>

                        {/* Action Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${actionMeta.badgeClass}`}>
                            <ActionIcon className="w-3 h-3" />
                            <span>{actionMeta.label}</span>
                          </div>
                        </td>

                        {/* Resource Type */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-slate-900 text-cyan-400 border border-cyan-500/20' : 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                          }`}>
                            {item.entityType}
                          </span>
                        </td>

                        {/* File / Target Summary */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2 max-w-md">
                            <span className={`font-mono text-[11px] font-semibold truncate ${textPrimary}`} title={fileOrTarget}>
                              {fileOrTarget}
                            </span>
                            {item.entityId && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(item.entityId!, `entity-${item.id}`);
                                }}
                                className={`p-1 rounded hover:${subtleBg} ${textFaint} transition-colors`}
                                title="Copy Entity ID"
                              >
                                {copiedId === `entity-${item.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Details Toggle Button */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${
                            isExpanded ? 'text-indigo-400 bg-indigo-500/10' : textMuted
                          }`}>
                            {isExpanded ? 'Close' : 'Inspect'}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Drawer */}
                      {isExpanded && (
                        <tr className={isDark ? 'bg-slate-950/60' : 'bg-slate-50/80'}>
                          <td colSpan={7} className="p-4 sm:p-6 border-b border-indigo-500/20">
                            <div className="space-y-4 max-w-4xl">
                              <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                  <Info className="w-4 h-4 text-indigo-400" />
                                  <span className={`text-xs font-bold ${textPrimary}`}>Detailed Audit Event Inspection</span>
                                </div>
                                <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                                  <span>Log ID: {item.id}</span>
                                  <button
                                    onClick={() => handleCopy(item.id, `log-${item.id}`)}
                                    className="p-1 hover:text-white transition-colors cursor-pointer"
                                    title="Copy Log ID"
                                  >
                                    {copiedId === `log-${item.id}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>

                              {/* Attributes Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                                <div className={`p-3 rounded-xl border ${cardBdr} ${surfaceBg}`}>
                                  <span className={`block text-[10px] font-bold uppercase tracking-wider ${textMuted} mb-1`}>Actor / User</span>
                                  <span className={`font-mono font-bold ${textPrimary}`}>{actor}</span>
                                </div>

                                <div className={`p-3 rounded-xl border ${cardBdr} ${surfaceBg}`}>
                                  <span className={`block text-[10px] font-bold uppercase tracking-wider ${textMuted} mb-1`}>Action</span>
                                  <span className={`font-mono font-bold ${textPrimary}`}>{item.action}</span>
                                </div>

                                <div className={`p-3 rounded-xl border ${cardBdr} ${surfaceBg}`}>
                                  <span className={`block text-[10px] font-bold uppercase tracking-wider ${textMuted} mb-1`}>Resource Type</span>
                                  <span className={`font-mono font-bold ${textPrimary}`}>{item.entityType}</span>
                                </div>

                                <div className={`p-3 rounded-xl border ${cardBdr} ${surfaceBg}`}>
                                  <span className={`block text-[10px] font-bold uppercase tracking-wider ${textMuted} mb-1`}>Entity / Target ID</span>
                                  <span className={`font-mono text-[11px] break-all ${textPrimary}`}>{item.entityId || 'N/A'}</span>
                                </div>

                                <div className={`p-3 rounded-xl border ${cardBdr} ${surfaceBg}`}>
                                  <span className={`block text-[10px] font-bold uppercase tracking-wider ${textMuted} mb-1`}>Request ID</span>
                                  <span className={`font-mono text-[11px] break-all ${textPrimary}`}>{item.requestId || 'N/A'}</span>
                                </div>

                                <div className={`p-3 rounded-xl border ${cardBdr} ${surfaceBg}`}>
                                  <span className={`block text-[10px] font-bold uppercase tracking-wider ${textMuted} mb-1`}>ISO Timestamp</span>
                                  <span className={`font-mono text-[11px] ${textPrimary}`}>{item.createdAt}</span>
                                </div>
                              </div>

                              {/* Metadata Details */}
                              {item.metadata.length > 0 && (
                                <div className={`p-3 rounded-xl border ${cardBdr} ${surfaceBg} space-y-2`}>
                                  <span className={`block text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Associated Metadata &amp; Parameters</span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                                    {item.metadata.map((m, idx) => (
                                      <div key={idx} className={`p-2 rounded-lg ${subtleBg} flex justify-between gap-2`}>
                                        <span className={textMuted}>{m.key}:</span>
                                        <span className={`font-semibold text-right break-all ${textPrimary}`}>{m.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
