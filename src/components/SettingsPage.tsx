import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Eye, EyeOff, Loader2, CheckCircle, Key, CircleCheck, Download, Trash2, RefreshCw, WifiOff, HardDrive, Activity } from 'lucide-react';
import { getSettings, updateSettings, SettingItem, getSystemStatus, SystemStatus } from '../api/settings';
import { fetchOllamaModels, pullOllamaModel, deleteOllamaModel, OllamaModel } from '../api/meetings';
import { Button, IconButton, Segmented, cx } from './ds';

interface SettingsPageProps {
  onBack: () => void;
}

type SettingsTab = 'ollama' | 'api';

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function Stat({ ok, label, detail, optional }: { ok: boolean; label: string; detail?: string; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={cx('w-2 h-2 rounded-full flex-shrink-0', ok ? 'bg-success' : optional ? 'bg-ink-faint' : 'bg-danger')} />
      <span className="text-ink font-medium flex-shrink-0">{label}</span>
      {detail && <span className="text-ink-faint ml-auto truncate">{detail}</span>}
    </div>
  );
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ollama');
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Ollama state
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');
  const [ollamaError, setOllamaError] = useState('');
  const [ollamaLoading, setOllamaLoading] = useState(true);
  const [pullModelName, setPullModelName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState<string | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadOllamaModels();
    getSystemStatus().then(setSysStatus).catch(() => setSysStatus(null));
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
      const vals: Record<string, string> = {};
      data.forEach(s => { vals[s.key] = ''; });
      setValues(vals);
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadOllamaModels = async () => {
    setOllamaLoading(true);
    try {
      const data = await fetchOllamaModels();
      setOllamaModels(data.models);
      setOllamaConnected(data.connected);
      setOllamaBaseUrl(data.base_url);
      setOllamaError(data.error || '');
    } catch (e) {
      setOllamaConnected(false);
      setOllamaError(String(e));
    } finally {
      setOllamaLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const toUpdate: Record<string, string> = {};
      Object.entries(values).forEach(([key, val]) => {
        if (val) toUpdate[key] = val;
      });
      if (Object.keys(toUpdate).length > 0) {
        await updateSettings(toUpdate);
      }
      setSaved(true);
      await loadSettings();
      if (toUpdate['OLLAMA_BASE_URL']) {
        await loadOllamaModels();
      }
      setValues(prev => {
        const cleared = { ...prev };
        Object.keys(cleared).forEach(k => { cleared[k] = ''; });
        return cleared;
      });
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Failed to save settings:', e);
      alert(`저장 실패: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePullModel = async () => {
    if (!pullModelName.trim()) return;
    setPulling(true);
    setPullStatus(null);
    try {
      const result = await pullOllamaModel(pullModelName.trim());
      if (result.status === 'success') {
        setPullStatus('success');
        setPullModelName('');
        await loadOllamaModels();
      } else {
        setPullStatus(result.message || '다운로드 실패');
      }
    } catch (e: any) {
      setPullStatus(e.message || '다운로드 실패');
    } finally {
      setPulling(false);
      setTimeout(() => setPullStatus(null), 5000);
    }
  };

  const handleDeleteModel = async (name: string) => {
    if (!window.confirm(`"${name}" 모델을 삭제하시겠습니까?`)) return;
    setDeletingModel(name);
    try {
      const result = await deleteOllamaModel(name);
      if (result.status === 'success') {
        await loadOllamaModels();
      } else {
        alert(`삭제 실패: ${result.message}`);
      }
    } catch (e: any) {
      alert(`삭제 실패: ${e.message}`);
    } finally {
      setDeletingModel(null);
    }
  };

  const toggleVisibility = (key: string) => {
    setVisible(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Group settings preserving order
  const groups: Record<string, SettingItem[]> = {};
  settings.forEach(s => {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  });

  const hasChanges = Object.values(values).some(v => v !== '');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-7">
      {/* Context header */}
      <div className="flex items-center gap-3 mb-6">
        <IconButton onClick={onBack} title="뒤로가기">
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <h1 className="text-[22px] font-semibold text-ink">설정</h1>
      </div>

      {/* System status — 배포/온보딩용 한눈 점검 */}
      {sysStatus && (
        <div className="mb-6 bg-surface border border-line rounded-card shadow-card p-5">
          <h2 className="text-sm font-semibold text-ink mb-3.5 flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" /> 시스템 상태
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 text-[13px]">
            <Stat ok={sysStatus.llm.ready} label="회의록 LLM"
              detail={sysStatus.llm.ollama.ok ? `Ollama · ${sysStatus.llm.ollama.models.length}개 모델` : sysStatus.llm.openai ? 'OpenAI' : '미설정'} />
            <Stat ok={sysStatus.gpu} label="GPU" detail={sysStatus.gpu ? '사용 가능' : '없음(CPU)'} optional={!sysStatus.gpu} />
            <Stat ok={sysStatus.stt.whisper.ok} label="Whisper STT" detail={sysStatus.stt.whisper.ok ? (sysStatus.stt.whisper.gpu ? 'GPU' : 'CPU') : '미설치'} />
            <Stat ok={sysStatus.stt.riva.ok} label="Riva STT" detail={sysStatus.stt.riva.ok ? '연결됨' : '미연결'} optional={!sysStatus.stt.riva.ok} />
            <Stat ok={sysStatus.keys.huggingface} label="HF 토큰 (화자분리)" detail={sysStatus.keys.huggingface ? '설정됨' : '없음'} optional={!sysStatus.keys.huggingface} />
            <Stat ok={sysStatus.keys.openai} label="OpenAI 키" detail={sysStatus.keys.openai ? '설정됨' : '없음'} optional={!sysStatus.keys.openai} />
          </div>
        </div>
      )}

      {/* Tabs */}
      <Segmented<SettingsTab>
        className="mb-6 w-full flex"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          {
            value: 'ollama',
            label: (
              <span className="flex items-center justify-center gap-2">
                <HardDrive className="w-4 h-4" />
                Ollama 모델 관리
              </span>
            ),
          },
          {
            value: 'api',
            label: (
              <span className="flex items-center justify-center gap-2">
                <Key className="w-4 h-4" />
                API 키 설정
              </span>
            ),
          },
        ]}
      />

      {/* Tab Content */}
      {activeTab === 'ollama' ? (
        /* ─── Ollama Tab ─── */
        <div className="space-y-6">
          {/* Connection status bar */}
          <div className="flex items-center justify-between px-5 py-3 bg-surface border border-line rounded-card shadow-card">
            <div className="flex items-center gap-3">
              {ollamaConnected ? (
                <div className="w-2.5 h-2.5 rounded-full bg-success pulse-dot" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-danger" />
              )}
              <div>
                <span className="text-sm font-medium text-ink">
                  {ollamaConnected ? 'Ollama 연결됨' : 'Ollama 연결 안 됨'}
                </span>
                {ollamaBaseUrl && (
                  <span className="text-xs text-ink-faint font-mono ml-2">{ollamaBaseUrl}</span>
                )}
              </div>
            </div>
            <IconButton
              onClick={loadOllamaModels}
              disabled={ollamaLoading}
              title="새로고침"
            >
              <RefreshCw className={cx('w-4 h-4', ollamaLoading && 'animate-spin')} />
            </IconButton>
          </div>

          {!ollamaConnected ? (
            <div className="bg-surface border border-line rounded-card shadow-card p-10 text-center">
              <WifiOff className="w-12 h-12 text-ink-faint mx-auto mb-4" />
              <p className="text-ink font-medium mb-1">Ollama 서버에 연결할 수 없습니다</p>
              <p className="text-sm text-ink-faint mb-4">
                호스트에서 Ollama가 실행 중인지 확인하세요
              </p>
              {ollamaError && (
                <div className="inline-block px-3 py-1.5 bg-danger-subtle border border-line rounded-control">
                  <p className="text-xs text-danger font-mono break-all">{ollamaError}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Pull new model */}
              <div className="bg-surface border border-line rounded-card shadow-card p-6">
                <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                  <Download className="w-4 h-4 text-accent" />
                  새 모델 다운로드
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pullModelName}
                    onChange={(e) => setPullModelName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePullModel()}
                    placeholder="모델명 (예: llama3.1, gemma2, mistral)"
                    className="flex-1 h-9 px-3 rounded-control bg-surface border border-line-strong text-sm text-ink focus-ring focus:border-accent disabled:opacity-50"
                    disabled={pulling}
                  />
                  <Button
                    variant="primary"
                    onClick={handlePullModel}
                    disabled={pulling || !pullModelName.trim()}
                  >
                    {pulling ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {pulling ? '다운로드 중...' : '다운로드'}
                  </Button>
                </div>
                {pullStatus && (
                  <p className={cx('mt-2 text-xs', pullStatus === 'success' ? 'text-success' : 'text-danger')}>
                    {pullStatus === 'success' ? '다운로드 완료!' : pullStatus}
                  </p>
                )}
                <p className="mt-2 text-xs text-ink-faint">
                  Ollama 모델 허브에서 사용 가능한 모델을 다운로드합니다. 용량이 큰 모델은 시간이 오래 걸릴 수 있습니다.
                </p>
              </div>

              {/* Installed models */}
              <div className="bg-surface border border-line rounded-card shadow-card overflow-hidden">
                <div className="px-6 py-4 border-b border-line">
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-accent" />
                    설치된 모델
                    <span className="text-xs font-normal text-ink-faint bg-subtle px-2 py-0.5 rounded-full font-mono tabular">
                      {ollamaModels.length}개
                    </span>
                  </h3>
                </div>
                {ollamaModels.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-sm text-ink-faint">설치된 모델이 없습니다</p>
                    <p className="text-xs text-ink-faint mt-1">위에서 모델을 다운로드하세요</p>
                  </div>
                ) : (
                  <div className="divide-y divide-line border-line">
                    {ollamaModels.map((model) => (
                      <div
                        key={model.name}
                        className="flex items-center justify-between px-6 py-4 hover:bg-subtle transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-ink">{model.name}</span>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-ink-faint font-mono tabular">{formatSize(model.size)}</span>
                            <span className="text-xs text-ink-faint font-mono">{model.digest}</span>
                          </div>
                        </div>
                        <IconButton
                          onClick={() => handleDeleteModel(model.name)}
                          disabled={deletingModel === model.name}
                          className="flex-shrink-0 hover:text-danger"
                          title="삭제"
                        >
                          {deletingModel === model.name ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* ─── API Keys Tab ─── */
        <div className="space-y-6">
          {/* Save button bar */}
          <div className="flex items-center justify-between px-5 py-3 bg-surface border border-line rounded-card shadow-card">
            <p className="text-sm text-ink-soft">사용하려는 엔진의 설정만 입력하면 됩니다</p>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : saved ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saved ? '저장됨' : '저장'}
            </Button>
          </div>

          {Object.entries(groups).map(([groupName, items]) => (
            <div key={groupName} className="bg-surface border border-line rounded-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-line">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                    <Key className="w-4 h-4 text-accent" />
                    {groupName}
                  </h3>
                  {items.every(s => s.has_value) && (
                    <span className="flex items-center gap-1 text-xs text-success bg-success-subtle px-2 py-0.5 rounded-full">
                      <CircleCheck className="w-3 h-3" />
                      설정됨
                    </span>
                  )}
                </div>
              </div>
              <div className="p-6 space-y-5">
                {items.map((setting) => (
                  <div key={setting.key}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <label className="text-sm font-medium text-ink-soft">
                        {setting.label}
                      </label>
                      {setting.has_value && (
                        <CheckCircle className="w-3.5 h-3.5 text-success" />
                      )}
                    </div>
                    <div className="flex-1 relative">
                      <input
                        type={setting.secret && !visible[setting.key] ? 'password' : 'text'}
                        value={values[setting.key] || ''}
                        onChange={(e) => handleChange(setting.key, e.target.value)}
                        placeholder={setting.has_value ? setting.masked_value : (setting.hint || '입력하세요')}
                        className="w-full h-9 px-3 pr-10 rounded-control bg-surface border border-line-strong font-mono text-sm text-ink focus-ring focus:border-accent"
                      />
                      {setting.secret && (
                        <button
                          type="button"
                          onClick={() => toggleVisibility(setting.key)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors focus-ring rounded-control"
                        >
                          {visible[setting.key] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                    {setting.hint && (
                      <p className="mt-1 text-xs text-ink-faint">{setting.hint}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="p-4 bg-info-subtle border border-line rounded-card">
            <p className="text-sm text-ink-soft">
              설정값은 서버 DB에 저장됩니다. 새 값을 입력하면 기존 값이 덮어씌워집니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
