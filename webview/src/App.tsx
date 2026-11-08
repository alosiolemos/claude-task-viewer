import React, { useState, useEffect } from 'react';
import 'reactflow/dist/style.css';
import './App.css';
import { CanvasWorkflow } from './components/CanvasWorkflow';
import { StageInspector } from './components/StageInspector';
import { generateDemoWorkflow } from './data/demoWorkflow';
import { WorkflowRun, Stage } from './types/workflow';

const getVscodeApi = () => {
  try {
    return (window as any).acquireVsCodeApi?.();
  } catch (e) {
    return undefined;
  }
};

function App() {
  const [executions, setExecutions] = useState<WorkflowRun[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);

  const currentExecution = executions.find((e) => e.id === currentId);

  useEffect(() => {
    const vscodeApi = getVscodeApi();
    let timeoutId: NodeJS.Timeout;

    const handleMessage = (event: any) => {
      const { command, workflow } = event.data;

      if (command === 'workflow-loaded' && workflow?.stages) {
        // Nova execução: adiciona ao histórico
        setExecutions((prev) => [workflow, ...prev]);
        setCurrentId(workflow.id);
        setSelectedStage(null);
        setLoading(false);
      } else if (command === 'workflow-updated' && workflow?.stages) {
        // Atualiza execução atual (mesma ID, novos stages)
        setExecutions((prev) =>
          prev.map((e) => (e.id === workflow.id ? workflow : e))
        );
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
      } else {
        const demo = generateDemoWorkflow();
        setExecutions([demo]);
        setCurrentId(demo.id);
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    loadWorkflow();

    return () => {
      window.removeEventListener('message', handleMessage);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [loading]);

  if (loading && executions.length === 0) {
    return (
      <div className="App loading-screen">
        <div className="loading-spinner">⏳ Carregando workflow...</div>
      </div>
    );
  }

  if (!currentExecution) {
    return (
      <div className="App error-screen">
        <div className="error-message">❌ Nenhuma execução disponível</div>
      </div>
    );
  }

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
            <h3>Execuções</h3>
            <div className="history-list">
              {executions.map((exec) => (
                <button
                  key={exec.id}
                  className={`history-item ${exec.id === currentId ? 'active' : ''}`}
                  onClick={() => {
                    setCurrentId(exec.id);
                    setSelectedStage(null);
                  }}
                  title={exec.workflow.description}
                >
                  <span className="exec-time">
                    {new Date(exec.createdAt).toLocaleTimeString('pt-BR')}
                  </span>
                  <span className="exec-badge">
                    {exec.captureSource === 'demo' ? '🎬' : '🔴'}
                  </span>
                  <span className="exec-count">{exec.stages.length}°</span>
                </button>
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
