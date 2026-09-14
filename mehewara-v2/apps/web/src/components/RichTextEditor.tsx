import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../ThemeContext';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

const mathSymbols = ['°', 'θ', 'π', 'μ', 'Ω', 'α', 'β', 'γ', 'Δ', 'λ', 'ρ', 'σ', 'τ', 'ω', 'Σ', 'Φ', 'Ψ', '±', '×', '÷', '≈', '≠', '≤', '≥', '∞', '∫', '√', '∝'];

// ── KaTeX equation dialog ────────────────────────────────────────────────────
const EquationDialog = ({
  onInsert,
  onClose,
}: {
  onInsert: (html: string) => void;
  onClose: () => void;
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [latex, setLatex] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!latex.trim()) { setPreview(''); setError(''); return; }
    try {
      const rendered = katex.renderToString(latex, { throwOnError: true, displayMode: false, strict: false });
      setPreview(rendered);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Invalid LaTeX');
      setPreview('');
    }
  }, [latex]);

  const handleInsert = () => {
    if (!latex.trim() || error) return;
    // Wrap in a styled span so it renders inline wherever pasted
    const html = `<span class="mhw-eq" data-latex="${latex.replace(/"/g, '&quot;')}">${preview}</span>`;
    onInsert(html);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className={`w-full max-w-md ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border rounded-2xl p-5 shadow-2xl space-y-4`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <span className="text-sky-400 font-mono text-base">∑</span> Insert Equation (LaTeX)
          </h3>
          <button type="button" onClick={onClose} className={`${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'} text-lg leading-none cursor-pointer`}>×</button>
        </div>

        <div>
          <label className={`block text-xs mb-1.5 font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>LaTeX Expression</label>
          <input
            ref={inputRef}
            type="text"
            value={latex}
            onChange={e => setLatex(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleInsert(); } if (e.key === 'Escape') onClose(); }}
            placeholder="e.g.  \frac{1}{2}mv^2  or  E=mc^2"
            className={`w-full ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} border focus:border-sky-500 rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all`}
          />
        </div>

        {/* Quick-insert templates */}
        <div className="flex flex-wrap gap-1.5">
          {[
            ['Fraction', '\\frac{a}{b}'],
            ['Power', 'x^{n}'],
            ['Root', '\\sqrt{x}'],
            ['Sum', '\\sum_{i=1}^{n}'],
            ['Integral', '\\int_{a}^{b}'],
            ['Greek μ', '\\mu'],
            ['Greek λ', '\\lambda'],
            ['Greek Δ', '\\Delta'],
          ].map(([label, tmpl]) => (
            <button
              key={label}
              type="button"
              onClick={() => setLatex(prev => prev + tmpl)}
              className={`px-2 py-0.5 text-[10px] ${isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'} border rounded-lg cursor-pointer transition-colors font-mono`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className={`min-h-[48px] p-3 border rounded-xl flex items-center justify-center ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          {error ? (
            <span className="text-red-400 text-xs font-mono">{error}</span>
          ) : preview ? (
            <span className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`} dangerouslySetInnerHTML={{ __html: preview }} />
          ) : (
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Preview appears here…</span>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!latex.trim() || !!error}
            className="px-5 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
          >
            Insert Equation →
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Toolbar ──────────────────────────────────────────────────────────────────
const MenuBar = ({
  editor,
  onOpenEqDialog,
}: {
  editor: Editor | null;
  onOpenEqDialog: () => void;
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  if (!editor) return null;

  const insertSymbol = (symbol: string) => {
    editor.chain().focus().insertContent(symbol).run();
  };

  return (
    <div className={`flex flex-wrap gap-1 p-2 border-b rounded-t-md ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-100'}`}>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('bold') ? 'bg-sky-500 text-white' : (isDark ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-200 text-slate-700')}`}
        title="Bold"
      >
        <b>B</b>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('italic') ? 'bg-sky-500 text-white' : (isDark ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-200 text-slate-700')}`}
        title="Italic"
      >
        <i>I</i>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('subscript') ? 'bg-sky-500 text-white' : (isDark ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-200 text-slate-700')}`}
        title="Subscript"
      >
        X<sub>2</sub>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('superscript') ? 'bg-sky-500 text-white' : (isDark ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-200 text-slate-700')}`}
        title="Superscript"
      >
        X<sup>2</sup>
      </button>

      {/* Equation button */}
      <button
        type="button"
        onClick={onOpenEqDialog}
        className="px-2 py-1 text-sm rounded hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/30 hover:border-sky-500/50 font-mono font-bold transition-all"
        title="Insert LaTeX equation"
      >
        ∑ Eq
      </button>

      <div className={`w-px h-6 mx-1 self-center ${isDark ? 'bg-slate-600' : 'bg-slate-300'}`} />

      {mathSymbols.map((sym, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => insertSymbol(sym)}
          className={`px-2 py-1 text-sm rounded transition-colors ${isDark ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-200 text-slate-700'}`}
          title={`Insert ${sym}`}
        >
          {sym}
        </button>
      ))}
    </div>
  );
};

// ── Main editor ──────────────────────────────────────────────────────────────
export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, minHeight }) => {
  const [showEqDialog, setShowEqDialog] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  // Track whether the last change came from the parent (external reset) or from user typing
  const isExternalUpdate = useRef(false);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleImageUpload = async (file: File) => {
    try {
      const { compressImageToBlob } = await import('../utils/mediaUpload');
      const blob = await compressImageToBlob(file, 800, 0.62);
      
      const fileExt = 'webp'; // Since compressImageToBlob returns webp
      const fileName = `editor-${Date.now()}.${fileExt}`;
      const { uploadToB2 } = await import('../apiClient');
      const publicUrl = await uploadToB2(new File([blob], fileName, { type: 'image/webp' }), 'study/diagrams');
      return publicUrl;
    } catch (e) {
      console.error('Image compression or upload failed:', e);
      return null;
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Subscript,
      Superscript,
      Image.configure({
        inline: true,
        allowBase64: true, // Allow existing base64 images to render, but intercept new pastes
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Type your question here...',
        emptyEditorClass: `cursor-text before:content-[attr(data-placeholder)] ${isDark ? 'before:text-slate-400' : 'before:text-slate-500'} before:float-left before:pointer-events-none`,
      }),
    ],
    content: value,
    editorProps: {
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        for (const item of items) {
          if (item.type.indexOf('image') === 0) {
            const file = item.getAsFile();
            if (file) {
              handleImageUpload(file).then(url => {
                if (url) {
                  const { schema } = view.state;
                  const node = schema.nodes.image.create({ src: url });
                  const tr = view.state.tr.replaceSelectionWith(node);
                  view.dispatch(tr);
                }
              });
              return true; // prevent default base64 paste
            }
          }
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.indexOf('image') === 0) {
            event.preventDefault();
            handleImageUpload(file).then(url => {
              if (url) {
                const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                if (coordinates) {
                  const { schema } = view.state;
                  const node = schema.nodes.image.create({ src: url });
                  const tr = view.state.tr.insert(coordinates.pos, node);
                  view.dispatch(tr);
                }
              }
            });
            return true;
          }
        }
        return false;
      },
      attributes: {
        class: `prose ${isDark ? 'prose-invert bg-slate-800 text-slate-100' : 'bg-white text-slate-900'} max-w-none p-3 outline-none focus:ring-2 focus:ring-sky-500/50 rounded-b-md`,
        style: minHeight ? `min-height: ${minHeight}` : 'min-height: 96px',
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!isExternalUpdate.current) {
        onChangeRef.current(ed.getHTML());
      }
    },
  });

  // Sync external value → editor only when it's a real reset (empty string or programmatic change)
  useEffect(() => {
    if (!editor) return;
    const editorHtml = editor.getHTML();
    // Only sync if value is meaningfully different (not just <p></p> vs '')
    const normalize = (s: string) => s.replace(/<p><\/p>/g, '').trim();
    if (normalize(value) !== normalize(editorHtml)) {
      isExternalUpdate.current = true;
      editor.commands.setContent(value || '');
      // Reset flag after the update cycle
      requestAnimationFrame(() => { isExternalUpdate.current = false; });
    }
  }, [value, editor]);

  const handleInsertEquation = (html: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(html).run();
    // After inserting, sync the html to parent
    onChange(editor.getHTML());
  };

  return (
    <>
      {showEqDialog && (
        <EquationDialog
          onInsert={handleInsertEquation}
          onClose={() => setShowEqDialog(false)}
        />
      )}
      <div className={`border rounded-md shadow-sm focus-within:ring-2 focus-within:ring-sky-500 focus-within:border-transparent transition-all ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
        <MenuBar editor={editor} onOpenEqDialog={() => setShowEqDialog(true)} />
        <EditorContent editor={editor} />
      </div>
    </>
  );
};

export default RichTextEditor;