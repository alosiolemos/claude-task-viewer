import { Action } from './transcript-reader';

export interface Task {
  id: string;
  title: string;
  actions: Action[];
  createdAt: Date;
  state: 'running' | 'completed' | 'failed';
}

export class TaskManager {
  private currentTaskId: string = '';
  private tasks: Map<string, Task> = new Map();
  private onTasksChanged?: (tasks: Task[]) => void;

  constructor(onTasksChanged?: (tasks: Task[]) => void) {
    this.onTasksChanged = onTasksChanged;
  }

  /**
   * Processa novas ações e as agrupa em tarefas.
   * Se não há tarefa atual, cria uma nova.
   * Se há tarefa atual, adiciona as ações nela.
   */
  addActions(actions: Action[]): void {
    if (!actions.length) return;

    // Se não há tarefa atual, usar a primeira ação como início
    if (!this.currentTaskId) {
      const userAction = actions.find(a => a.type === 'user-input');
      if (userAction) {
        this.startNewTask(userAction.description);
      } else {
        this.startNewTask('Tarefa em progresso');
      }
    }

    // Adicionar ações na tarefa atual
    const task = this.tasks.get(this.currentTaskId);
    if (task) {
      task.actions.push(...actions);
      task.state = this.inferTaskState(task.actions);
      this.notifyChange();
    }
  }

  /**
   * Inicia uma nova tarefa.
   */
  startNewTask(title: string): void {
    const id = 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    this.currentTaskId = id;
    this.tasks.set(id, {
      id,
      title,
      actions: [],
      createdAt: new Date(),
      state: 'running',
    });
    this.notifyChange();
  }

  /**
   * Continua a tarefa atual (não faz nada, apenas marca para continuar).
   */
  continueCurrentTask(): void {
    if (!this.currentTaskId && this.tasks.size > 0) {
      const lastTask = Array.from(this.tasks.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )[0];
      this.currentTaskId = lastTask.id;
      this.notifyChange();
    }
  }

  /**
   * Retorna todas as tarefas.
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Retorna a tarefa atual.
   */
  getCurrentTask(): Task | undefined {
    return this.tasks.get(this.currentTaskId);
  }

  /**
   * Define qual tarefa está selecionada.
   */
  selectTask(taskId: string): void {
    if (this.tasks.has(taskId)) {
      this.currentTaskId = taskId;
      this.notifyChange();
    }
  }

  /**
   * Infere o estado da tarefa baseado nas ações.
   */
  private inferTaskState(actions: Action[]): 'running' | 'completed' | 'failed' {
    if (!actions.length) return 'running';

    const hasError = actions.some(a => a.error || a.type === 'tool-result');
    if (hasError) return 'failed';

    // Se a última ação foi uma resposta ao usuário, tarefa completa
    const lastAction = actions[actions.length - 1];
    if (lastAction?.type === 'user-input') return 'completed';

    return 'running';
  }

  private notifyChange(): void {
    if (this.onTasksChanged) {
      this.onTasksChanged(this.getAllTasks());
    }
  }
}
