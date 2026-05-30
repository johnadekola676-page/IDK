import { useState, useEffect } from 'react';
import { GitBranch, Check, ChevronDown, RefreshCw } from 'lucide-react';
import { getConfig, updateRepo } from '../services/api';

export default function RepoPage() {
  const [config, setConfig] = useState(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showBranches, setShowBranches] = useState(false);

  const commonBranches = ['main', 'master', 'develop', 'staging', 'production'];

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await getConfig();
      setConfig(data);
      setRepoUrl(data.repoUrl || '');
      setBranch(data.branch || 'main');
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRepo = async (e) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    try {
      setUpdating(true);
      await updateRepo(repoUrl, branch);
      await loadConfig();
    } catch (error) {
      console.error('Failed to update repo:', error);
      alert('Failed to update repository');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-secondary">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-text-primary mb-2">Repository Settings</h1>
          <p className="text-text-secondary">Configure the repository for AI agent operations</p>
        </div>

        {/* Current Repo Info */}
        {config?.repoUrl && (
          <div className="mb-6 p-6 bg-surface border border-border rounded-xl">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <GitBranch className="w-6 h-6 text-accent" />
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">Current Repository</h3>
                  <p className="text-sm text-text-secondary mt-1">{config.repoUrl}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-success/10 border border-success/30 rounded-full">
                <div className="w-2 h-2 bg-success rounded-full" />
                <span className="text-sm text-success">Active</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <span>Branch:</span>
              <code className="px-2 py-1 bg-background rounded text-accent font-mono">
                {config.branch || 'main'}
              </code>
            </div>
          </div>
        )}

        {/* Update Form */}
        <form onSubmit={handleUpdateRepo} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Repository URL
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/username/repo.git"
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="text-xs text-text-secondary mt-2">
              Enter the Git repository URL (HTTPS or SSH)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Branch
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowBranches(!showBranches)}
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <span className="text-text-primary font-mono">{branch}</span>
                <ChevronDown className={`w-5 h-5 text-text-secondary transition-transform ${showBranches ? 'rotate-180' : ''}`} />
              </button>

              {showBranches && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                  {commonBranches.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        setBranch(b);
                        setShowBranches(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-background transition-colors flex items-center justify-between"
                    >
                      <span className="text-text-primary font-mono">{b}</span>
                      {branch === b && <Check className="w-4 h-4 text-accent" />}
                    </button>
                  ))}
                  <div className="border-t border-border px-4 py-2">
                    <input
                      type="text"
                      placeholder="Custom branch name"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setBranch(e.target.value);
                          setShowBranches(false);
                        }
                      }}
                      className="w-full px-3 py-2 bg-background border border-border rounded text-text-primary placeholder-text-secondary text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-2">
              Select or enter the branch to work with
            </p>
          </div>

          <button
            type="submit"
            disabled={!repoUrl.trim() || updating}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white rounded-lg hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Update Repository
              </>
            )}
          </button>
        </form>

        {/* Info Card */}
        <div className="mt-8 p-6 bg-warning/10 border border-warning/30 rounded-xl">
          <h3 className="text-lg font-semibold text-warning mb-2">Important Notes</h3>
          <ul className="space-y-2 text-sm text-text-primary">
            <li className="flex items-start gap-2">
              <span className="text-warning mt-0.5">•</span>
              <span>The repository will be cloned to the agent's workspace</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-warning mt-0.5">•</span>
              <span>Make sure the repository is accessible (public or with credentials configured)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-warning mt-0.5">•</span>
              <span>All agent operations will be performed on the specified branch</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-warning mt-0.5">•</span>
              <span>Changes will be committed and pushed back to the repository</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
