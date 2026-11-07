import React, { useState } from 'react';
import { Copy, Check, Download, FileCode } from 'lucide-react';

export interface BotFileEntry {
  path: string;
  category: string;
  description: string;
  content: string;
  lines: number;
  bytes: number;
}

interface PythonCodeExplorerProps {
  files: BotFileEntry[];
  loading: boolean;
}

export const PythonCodeExplorer: React.FC<PythonCodeExplorerProps> = ({ files, loading }) => {
  const [selectedPath, setSelectedPath] = useState<string>('cogs/tickets.py');
  const [copied, setCopied] = useState<boolean>(false);

  const activeFile = files.find((f) => f.path === selectedPath) || files[0];

  const handleCopy = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadSingle = (file: BotFileEntry) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.replace(/\//g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-8 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400">
        Loading Python source files from `/bot/` directory...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
      {/* Left File Tree Sidebar */}
      <aside className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Python Bot Codebase (`/bot/` — {files.length} Files)
          </h2>
          <p className="text-xs text-slate-400 pt-0.5">
            Complete, non-truncated `discord.py 2.x` + `aiosqlite` files ready for Railway.
          </p>
        </div>

        <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSelectedPath(f.path)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between gap-2 ${
                activeFile?.path === f.path
                  ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30'
                  : 'text-slate-300 hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2 truncate font-mono">
                <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">bot/{f.path}</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0">
                {f.lines}L
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Right Code Viewer */}
      <section className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-4">
        {activeFile ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="text-sm font-mono font-semibold text-white">
                  bot/{activeFile.path}
                </div>
                <div className="text-xs text-slate-400 pt-0.5">
                  {activeFile.category} · {activeFile.description} · {activeFile.lines} lines
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Code'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSingle(activeFile)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </button>
              </div>
            </div>

            <pre className="p-4 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-slate-200 overflow-x-auto max-h-[520px] leading-relaxed">
              {activeFile.content}
            </pre>
          </>
        ) : null}
      </section>
    </div>
  );
};
