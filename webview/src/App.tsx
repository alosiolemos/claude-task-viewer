import React, { useState, useEffect, useRef } from 'react';
import 'reactflow/dist/style.css';
import './App.css';
import { CanvasWorkflow } from './components/CanvasWorkflow';
import { StageInspector } from './components/StageInspector';
import { generateDemoWorkflow } from './data/demoWorkflow';
import { WorkflowRun, Stage } from './types/workflow';

// Inicializar API uma única vez
let vscodeApi: any = null;
const initializeVscodeApi = () => {
  if (vscodeApi === null) {
    try {
      vscodeApi = (window as any).acquireVsCodeApi?.() || undefined;
    } catch (e) {
      vscodeApi = undefined;
    }
  }
  return vscodeApi;
};

function App() {
  const [executions, setExecutions] = useState<WorkflowRun[]>(() => {
    try {
      const saved = localStorage.getItem('painel-execucao-history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const apiInitialized = useRef(false);

  const currentExecution = executions.find((e) => e.id === currentId);

  // Persistir histórico em localStorage
  useEffect(() => {
    try {
      localStorage.setItem('painel-execucao-history', JSON.stringify(executions));
    } catch {
      // localStorage cheio ou indisponível
    }
  }, [executions]);

  useEffect(() => {
    // Inicializar API apenas uma vez
    if (!apiInitialized.current) {
      initializeVscodeApi();
      apiInitialized.current = true;
    }

    let timeoutId: NodeJS.Timeout;

    const handleMessage = (event: any) => {
      const { command, executions } = event.data;

      if (command === 'workflow-loaded' && executions && Array.isArray(executions)) {
        // Carrega execuções iniciais
        setExecutions(executions);
        if (executions.length > 0) {
          setCurrentId(executions[0].id);
        }
        setSelectedStage(null);
        setLoading(false);
      } else if (command === 'workflow-updated' && executions && Array.isArray(executions)) {
        // Mesclar execuções: atualizar por executionId (não id)
        setExecutions((prev) => {
          const merged = [...prev];
          executions.forEach((exec) => {
            const idx = merged.findIndex((e) => e.executionId === exec.executionId);
            if (idx >= 0) {
              merged[idx] = exec;
            } else {
              merged.unshift(exec);
            }
          });
          return merged;
        });
        if (!currentId && executions.length > 0) {
          setCurrentId(executions[0].id);
        }
      }
    };

    const loadWorkflow = () => {
      if (vscodeApi) {
        vscodeApi.postMessage({ command: 'load-workflow' });
        timeoutId = setTimeout(() => {
          if (loading && executions.length === 0) {
            const demo = generateDemoWorkflow();
            setExecutions([demo]);
            setCurrentId(demo.id);
            setLoading(false);
          }
        }, 2000);
      } else if (loading && executions.length === 0) {
        // Sem VSCode API e sem execuções: usar demo
        const demo = generateDemoWorkflow();
        setExecutions([demo]);
        setCurrentId(demo.id);
        setLoading(false);
      } else {
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    loadWorkflow();

    return () => {
      window.removeEventListener('message', handleMessage);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  if (loading && executions.length === 0) {
    return (
      <div className="App loading-screen">
        <div className="loading-spinner">⏳ Carregando workflow...</div>
      </div>
    );
  }

  const updateExecutionTitle = (execId: string, newTitle: string) => {
    setExecutions((prev) =>
      prev.map((e) => (e.id === execId ? { ...e, title: newTitle } : e))
    );
    setEditingId(null);
    setEditingValue('');
  };

  if (!currentExecution) {
    return (
      <div className="App error-screen">
        <div className="error-message">❌ Nenhuma execução disponível</div>
      </div>
    );
  }

  const formatTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <button
            className="history-toggle"
            onClick={() => setHistoryOpen(!historyOpen)}
            title={historyOpen ? 'Recolher histórico' : 'Abrir histórico'}
          >
            {historyOpen ? '◀' : '▶'} Histórico
          </button>
          <div>
            <h1>📊 {currentExecution.workflow.name}</h1>
            <p>{currentExecution.workflow.description}</p>
          </div>
          <div className="header-meta">
            <span className={`badge ${currentExecution.captureSource}`}>
              {currentExecution.captureSource === 'demo' ? '🎬 DEMO' : '🔴 REAL'}
            </span>
            <span className="meta-text">
              {currentExecution.stages.length} etapas • {currentExecution.stages.reduce((a, s) => a + s.actions.length, 0)} ações
            </span>
          </div>
        </div>
      </header>

      <main className="App-main">
        {historyOpen && (
          <aside className="history-sidebar">
            <h3>Histórico</h3>
            <div className="history-list">
              {executions.map((exec) => (
                <div
                  key={exec.id}
                  className={`history-item ${exec.id === currentId ? 'active' : ''}`}
                  onClick={() => {
                    setCurrentId(exec.id);
                    setSelectedStage(null);
                  }}
                >
                  <div className="item-header">
                    <div className="item-title">
                      {editingId === exec.id ? (
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => {
                            e.stopPropagation();
                            setEditingValue(e.target.value);
                          }}
                          onBlur={(e) => {
                            e.stopPropagation();
                            updateExecutionTitle(exec.id, editingValue || exec.workflow.name);
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              updateExecutionTitle(exec.id, editingValue || exec.workflow.name);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                              setEditingValue('');
                            }
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingId(exec.id);
                            setEditingValue(exec.title || exec.workflow.name);
                          }}
                          title="Duplo clique para renomear"
                        >
                          {exec.title || exec.workflow.name}
                        </span>
                      )}
                    </div>
                    <span className={`item-state state-${exec.state || 'completed'}`}>
                      {exec.state === 'completed' ? '✅' : exec.state === 'failed' ? '❌' : '⏱️'}
                    </span>
                  </div>
                  <div className="item-summary">
                    {exec.summary || `${exec.stages.length} etapas`}
                  </div>
                  <div className="item-time">
                    {formatTime(exec.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="canvas-wrapper">
          <CanvasWorkflow
            stages={currentExecution.stages}
            onStageSelect={setSelectedStage}
          />
        </div>

        {selectedStage && (
          <StageInspector
            stage={selectedStage}
            onClose={() => setSelectedStage(null)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
