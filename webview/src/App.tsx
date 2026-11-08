import React, { useState, useEffect } from 'react';
import 'reactflow/dist/style.css';
import './App.css';
import { CanvasWorkflow } from './components/CanvasWorkflow';
import { StageInspector } from './components/StageInspector';
import { generateDemoWorkflow } from './data/demoWorkflow';
import { WorkflowRun, Stage } from './types/workflow';

// Inicializar VSCode API se disponível
const getVscodeApi = () => {
  try {
    const vscodeApi = (window as any).acquireVsCodeApi?.();
    return vscodeApi;
  } catch (e) {
    return undefined;
  }
};

function App() {
  const [workflowRun, setWorkflowRun] = useState<WorkflowRun | null>(null);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'demo' | 'real'>('demo');

  useEffect(() => {
    const vscodeApi = getVscodeApi();
    let timeoutId: NodeJS.Timeout;

    const handleMessage = (event: any) => {
      const { command, workflow } = event.data;

      if (command === 'workflow-loaded' && workflow?.stages?.length > 0) {
        setWorkflowRun(workflow);
        setSource(workflow.captureSource === 'real' ? 'real' : 'demo');
        setLoading(false);
      } else if (command === 'workflow-updated' && workflow?.stages?.length > 0) {
        setWorkflowRun(workflow);
        setSource(workflow.captureSource === 'real' ? 'real' : 'demo');
      }
    };

    const loadWorkflow = () => {
      if (vscodeApi) {
        vscodeApi.postMessage({ command: 'load-workflow' });
        // Fallback para demo se não houver resposta em 2s
        timeoutId = setTimeout(() => {
          if (loading) {
            setWorkflowRun(generateDemoWorkflow());
            setSource('demo');
            setLoading(false);
          }
        }, 2000);
      } else {
        // Sem VSCode API, usar demo imediatamente
        setWorkflowRun(generateDemoWorkflow());
        setSource('demo');
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

  if (loading) {
    return (
      <div className="App loading-screen">
        <div className="loading-spinner">⏳ Carregando workflow...</div>
      </div>
    );
  }

  if (!workflowRun) {
    return (
      <div className="App error-screen">
        <div className="error-message">❌ Nenhum workflow disponível</div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <div>
            <h1>📊 {workflowRun.workflow.name}</h1>
            <p>{workflowRun.workflow.description}</p>
          </div>
          <div className="header-meta">
            <span className={`badge ${workflowRun.captureSource}`}>
              {workflowRun.captureSource === 'demo' ? '🎬 DEMO' : '🔴 REAL'}
            </span>
            <span className="meta-text">
              {workflowRun.stages.length} etapas • {workflowRun.stages.reduce((a, s) => a + s.actions.length, 0)} ações
            </span>
          </div>
        </div>
      </header>

      <main className="App-main">
        <div className="canvas-wrapper">
          <CanvasWorkflow
            stages={workflowRun.stages}
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
