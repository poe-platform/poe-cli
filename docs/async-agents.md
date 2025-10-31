# Async Agent Spawning

## Overview

Long-running tools (like `spawn_git_worktree`) execute asynchronously by default. Users can continue chatting while agents work in the background. Results are automatically injected into the conversation when complete.

## Usage

### Inspect Running Tasks

In interactive mode, use `/tasks` commands:

```bash
/tasks                    # List all tasks
/tasks <task-id>          # Show task details with latest progress
/tasks <task-id> --logs   # Show full task logs
/tasks <task-id> --follow # Stream live progress updates
/tasks <task-id> --kill   # Kill running task
```

### Task Details Output

When running `/tasks <task-id>`, you'll see:

```
Task: task_123
Tool: spawn_git_worktree
Status: running
Started: 2024-01-30 22:00:00
Duration: 35s

Latest Progress:
  [22:00:30] Agent completed, merging changes...
  [22:00:32] Resolving conflicts...
  [22:00:35] Merge successful

Args:
  agent: codex
  prompt: fix authentication bug
```

## Flow

1. User sends message
2. Tool call detected (e.g., `spawn_git_worktree`)
3. Task registered, spawned as detached child process
4. Tool returns: "Started background task {id}"
5. User continues chatting (can exit, task keeps running)
6. On next message: completed tasks auto-injected as system messages
7. LLM evaluates results and responds










Assistant: [Streaming live updates...]
[22:10:20] Implementing binary search optimization...
[22:10:25] Adding caching layer...
[22:10:30] Running performance tests...
[22:10:35] Tests passing, 3x performance improvement
[22:10:40] Merging changes...
[22:10:45] ✅ Complete

[User presses Ctrl+C to stop following]
```

## Technical Flow

1. **Task Spawn**:
   - LLM calls `spawn_git_worktree` tool
   - `DefaultToolExecutor.executeAsync()` creates task in registry
   - Detached child process spawned via `spawn()` with `detached: true`
   - Child writes PID to task file immediately
   - Parent returns task ID to LLM instantly

2. **Background Execution**:
   - Child process runs independently
   - Writes progress to `.progress.jsonl` file
   - Updates task JSON file on completion
   - Parent's file watcher detects changes

3. **Result Injection**:
   - On next user message, `PoeChatService.sendMessage()` checks registry
   - Completed tasks retrieved from registry
   - Results injected as system messages before user message
   - LLM processes both user message and task results together

4. **Session Persistence**:
   - Tasks stored in `~/.poe-setup/tasks/<id>.json`
   - Survive CLI restarts
   - Registry loads persisted tasks on init
   - Completed tasks auto-injected when user returns
```
Assistant: 
Task: task_1706652200000_12347_ghi789
Tool: spawn_git_worktree
Status: running
Started: 2024-01-30 22:10:00
Duration: 15s

Latest Progress:
  [22:10:05] Creating worktree...
  [22:10:08] Worktree created at /tmp/worktree_ghi789
  [22:10:10] Running codex agent...
  [22:10:15] Agent analyzing search algorithm...

Args:
  agent: codex
  prompt: optimize the search algorithm

User: "/tasks task_1706652200000_12347_ghi789 --follow"
Assistant: Started background task task_1706652200000_12347_ghi789.

User: "/tasks task_1706652200000_12347_ghi789"
Assistant: [System message auto-injected]
          ✅ Task task_1706652100000_12346_def456 finished
          
          Database layer refactored successfully. Migrated from direct SQL to repository 
          pattern, added connection pooling, and improved error handling. All tests passing.
          Changes merged to main branch.
          
          Hello! The database refactoring you started earlier is complete and merged.

```

### Scenario 3: Check Progress While Running

```
User: "Start a worktree to optimize the search algorithm"
[CLI starts, registry loads persisted tasks]

User: "Hi, what's the status?"
Assistant: Started background task task_1706652100000_12346_def456.
          The refactoring will take a while. Feel free to exit - the task will keep running.

[User exits CLI with Ctrl+C]
[Task continues running in background as detached process]

[2 hours later, user returns]

User: "poe interactive"
Assistant: [System message auto-injected]
          ✅ Task task_1706652000000_12345_abc123 finished
          
          Worktree created successfully. Agent fixed the authentication bug by updating 
          the token validation logic in src/auth.ts. Changes have been merged to main branch.
          
          You're welcome! Also, great news - the authentication bug fix is complete and merged.

```

### Scenario 2: Exit and Return Later

```
User: "Create a worktree to refactor the database layer"
Assistant: Let me check that for you... [continues normal conversation]

[30 seconds later, task completes in background]

User: "Thanks for the info"
Assistant: Started background task task_1706652000000_12345_abc123. 
          The agent is working on it now. You can continue chatting or check progress with /tasks task_1706652000000_12345_abc123

User: "What's the status of my other PR?"
Assistant: I'll create a worktree and spawn an agent to fix that.
[Tool: spawn_git_worktree called]
## User Flow Examples

### Scenario 1: Start Task and Continue Chatting

```
User: "Create a worktree and fix the authentication bug"

## Process Management

Tasks run as **detached child processes** with their own process group. This means:
- Tasks continue running even if the main CLI exits
- Tasks can be killed independently via `/tasks <id> --kill`
- Process IDs are stored in task metadata for management

### Communication via File Watching

Since tasks run as separate processes, communication happens through file system watching:

1. **Task State**: `~/.poe-setup/tasks/<task-id>.json` (updated by child process)
2. **Progress Updates**: `~/.poe-setup/tasks/<task-id>.progress.jsonl` (streamed updates)
3. **Logs**: `~/.poe-setup/logs/tasks/<task-id>.log` (written by child process)
4. **File Watcher**: Parent watches task directory for changes using `fs.watch()`

When a task updates:
- Child process appends to progress file (JSONL format)
- Parent's file watcher detects change
- Progress updates queued for display via `/tasks <id>` or auto-injection
- No polling needed - event-driven via `fs.watch()`

### Progress Streaming

Tasks can stream interim results:

```jsonl
{"type":"progress","message":"Creating worktree...","timestamp":1706652001000}
{"type":"progress","message":"Running agent...","timestamp":1706652005000}
{"type":"progress","message":"Agent completed, merging...","timestamp":1706652030000}
{"type":"complete","result":"Success","timestamp":1706652035000}
```

Users can view live progress:
```bash
/tasks task_123 --follow   # Stream progress updates in real-time
```

## Task Storage

Tasks are persisted to: `~/.poe-setup/tasks/<task-id>.json`

This allows tasks to survive across sessions and be queried later.

Example task file:
```json
{
  "id": "task_123",
  "toolName": "spawn_git_worktree",
  "args": { "agent": "codex", "prompt": "fix bug" },
  "status": "completed",
  "startTime": 1706652000000,
  "endTime": 1706652035000,
  "result": "Worktree created and merged successfully",
  "logFile": "~/.poe-setup/logs/tasks/task_123.log"
}
```

## Task Logging

Tasks write logs to: `~/.poe-setup/logs/tasks/<task-id>.log`

**Log Rotation**:
- Max log size: 10MB per file
- Keep last 3 rotated logs: `<task-id>.log.1`, `<task-id>.log.2`, `<task-id>.log.3`
- Automatic rotation when size limit reached
- Old logs auto-deleted after 7 days

Format:
```
[2024-01-30T22:00:00.000Z] TASK_START task_123 spawn_git_worktree
[2024-01-30T22:00:35.000Z] TASK_COMPLETE task_123 success
```

## Cleanup & Memory Management

**Automatic Task Cleanup**:
- Completed tasks auto-archived after 24 hours (runs on registry init)
- Archived to: `~/.poe-setup/tasks/archive/<task-id>.json`
- Archives auto-deleted after 30 days
- Cleanup runs automatically on each registry initialization

**File Watcher Cleanup**:
- Watchers properly disposed when registry is destroyed
- No orphaned file handles
- Cleanup on process exit via `process.on('exit')`
- All callbacks cleared on dispose

**Memory Limits**:
- Max 100 tasks in memory at once
- Older completed tasks evicted first (LRU)
- Task files remain on disk for querying
- Progress files cleaned up with task archival

## Implementation

### Task Registry

```typescript
interface AgentTask {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed' | 'killed';
  startTime: number;
  endTime?: number;
  result?: string;
  error?: string;
  logFile: string;
  progressFile: string;  // JSONL file for streaming updates
  pid?: number;  // Process ID for management
}

interface ProgressUpdate {
  type: 'progress' | 'complete' | 'error';
  message?: string;
  result?: string;
  error?: string;
  timestamp: number;
}

class AgentTaskRegistry {
  private watcher?: FSWatcher;
  private completionCallbacks: Array<(task: AgentTask) => void> = [];
  private progressCallbacks: Array<(taskId: string, update: ProgressUpdate) => void> = [];
  private tasks: Map<string, AgentTask> = new Map();
  private pendingCallbacks: Map<string, NodeJS.Timeout> = new Map();
  
  constructor(private tasksDir: string) {
    this.startWatching();
    this.init(); // Run cleanup on init
  }
  
  registerTask(task: Omit<AgentTask, 'status' | 'startTime' | 'id'>): string;
  updateTask(id: string, updates: Partial<AgentTask>): void;
  getTask(id: string): AgentTask | undefined;
  getAllTasks(): AgentTask[];
  getRunningTasks(): AgentTask[];
  killTask(id: string): void;
  
  // Event-driven notifications
  onTaskComplete(callback: (task: AgentTask) => void): void {
    this.completionCallbacks.push(callback);
  }
  
  onTaskProgress(callback: (taskId: string, update: ProgressUpdate) => void): void {
    this.progressCallbacks.push(callback);
  }
  
  // File watching with debouncing to prevent race conditions
  private startWatching(): void {
    this.watcher = fs.watch(this.tasksDir, (eventType, filename) => {
      if (eventType === 'change' && filename) {
        // Debounce callbacks to prevent race conditions
        const key = filename;
        if (this.pendingCallbacks.has(key)) {
          clearTimeout(this.pendingCallbacks.get(key)!);
        }
        
        const timeout = setTimeout(() => {
          this.handleFileChange(filename);
          this.pendingCallbacks.delete(key);
        }, 100); // 100ms debounce
        
        this.pendingCallbacks.set(key, timeout);
      }
    });
  }
  
  private handleFileChange(filename: string): void {
    // Task completion
    if (filename.endsWith('.json') && !filename.includes('archive')) {
      const task = this.loadTask(filename.replace('.json', ''));
      if (task && (task.status === 'completed' || task.status === 'failed')) {
        this.completionCallbacks.forEach(cb => cb(task));
      }
    }
    // Progress updates
    if (filename.endsWith('.progress.jsonl')) {
      const taskId = filename.replace('.progress.jsonl', '');
      const update = this.readLatestProgress(taskId);
      if (update) {
        this.progressCallbacks.forEach(cb => cb(taskId, update));
      }
    }
  }
  
  private readLatestProgress(taskId: string): ProgressUpdate | undefined {
    // Read last line of JSONL file
    const progressFile = path.join(this.tasksDir, `${taskId}.progress.jsonl`);
    const lines = fs.readFileSync(progressFile, 'utf8').trim().split('\n');
    const lastLine = lines[lines.length - 1];
    return lastLine ? JSON.parse(lastLine) : undefined;
  }
  
  dispose(): void {
    this.watcher?.close();
    
    // Clear all pending debounce timeouts
    for (const timeout of this.pendingCallbacks.values()) {
      clearTimeout(timeout);
    }
    this.pendingCallbacks.clear();
    
    this.completionCallbacks = [];
    this.progressCallbacks = [];
    this.tasks.clear();
  }
  
  // Automatic cleanup on init (not during active session)
  private async init(): Promise<void> {
    await this.cleanupOldTasks();
    await this.cleanupOldArchives();
    await this.cleanupOldLogs();
  }
  
  private async cleanupOldTasks(): Promise<void> {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    const tasks = this.getAllTasks();
    
    for (const task of tasks) {
      // Only cleanup completed/failed tasks, never running ones
      if (task.endTime && task.endTime < cutoff &&
          (task.status === 'completed' || task.status === 'failed')) {
        await this.archiveTask(task.id);
      }
    }
  }
  
  private async cleanupOldArchives(): Promise<void> {
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days
    const archiveDir = path.join(this.tasksDir, 'archive');
    
    if (!fs.existsSync(archiveDir)) return;
    
    const files = await fs.promises.readdir(archiveDir);
    for (const file of files) {
      const filePath = path.join(archiveDir, file);
      const stats = await fs.promises.stat(filePath);
      if (stats.mtimeMs < cutoff) {
        await fs.promises.unlink(filePath);
      }
    }
  }
  
  private async cleanupOldLogs(): Promise<void> {
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    const logsDir = path.join(os.homedir(), '.poe-setup/logs/tasks');
    
    if (!fs.existsSync(logsDir)) return;
    
    const files = await fs.promises.readdir(logsDir);
    for (const file of files) {
      if (!file.match(/\.log\.\d+$/)) continue; // Only rotated logs
      
      const filePath = path.join(logsDir, file);
      const stats = await fs.promises.stat(filePath);
      if (stats.mtimeMs < cutoff) {
        await fs.promises.unlink(filePath);
      }
    }
  }
  
  private async archiveTask(taskId: string): Promise<void> {
    const task = this.getTask(taskId);
    if (!task) return;
    
    const archiveDir = path.join(this.tasksDir, 'archive');
    await fs.promises.mkdir(archiveDir, { recursive: true });
    
    // Move task file
    const taskFile = path.join(this.tasksDir, `${taskId}.json`);
    const archiveFile = path.join(archiveDir, `${taskId}.json`);
    await fs.promises.rename(taskFile, archiveFile);
    
    // Remove progress file
    const progressFile = path.join(this.tasksDir, `${taskId}.progress.jsonl`);
    if (fs.existsSync(progressFile)) {
      await fs.promises.unlink(progressFile);
    }
    
    // Remove from memory
    this.tasks.delete(taskId);
  }
  
  // Task ID generation with collision prevention
  private generateTaskId(): string {
    return `task_${Date.now()}_${process.pid}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Persistence
  private saveTask(task: AgentTask): void {
    const taskFile = path.join(this.tasksDir, `${task.id}.json`);
    fs.writeFileSync(taskFile, JSON.stringify(task, null, 2));
  }
  
  private loadTask(id: string): AgentTask | undefined {
    try {
      const taskFile = path.join(this.tasksDir, `${id}.json`);
      const content = fs.readFileSync(taskFile, 'utf8');
      return JSON.parse(content);
    } catch {
      return undefined;
    }
  }
  
  private loadAllTasks(): AgentTask[] {
    try {
      const files = fs.readdirSync(this.tasksDir);
      return files
        .filter(f => f.endsWith('.json') && !f.includes('archive'))
        .map(f => this.loadTask(f.replace('.json', '')))
        .filter((t): t is AgentTask => t !== undefined);
    } catch {
      return [];
    }
  }
}
```

### Tool Executor

```typescript
class DefaultToolExecutor {
  private shouldRunAsync(toolName: string): boolean {
    return ['spawn_git_worktree'].includes(toolName);
  }

  private async executeAsync(name: string, args: Record<string, unknown>): Promise<string> {
    const taskId = this.taskRegistry.registerTask({ toolName: name, args });
    this.executeInBackground(taskId, name, args);
    return `Started background task ${taskId}`;
  }
  
  private async executeInBackground(taskId: string, name: string, args: Record<string, unknown>): Promise<void> {
    // Spawn detached process that runs task-runner.js
    const child = spawn(process.execPath, [
      path.join(__dirname, 'task-runner.js'),
      taskId,
      name,
      JSON.stringify(args)
    ], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore']  // Fully detached
    });
    
    child.unref();  // Allow parent to exit
    
    // Store PID for management
    this.taskRegistry.updateTask(taskId, { pid: child.pid });
  }
}

// task-runner.js - Standalone script for running tasks
async function runTask(taskId: string, toolName: string, args: Record<string, unknown>) {
  const tasksDir = path.join(os.homedir(), '.poe-setup/tasks');
  const registry = new AgentTaskRegistry(tasksDir);
  const logger = createTaskLogger(taskId);
  const progressFile = path.join(tasksDir, `${taskId}.progress.jsonl`);
  
  // Helper to write progress updates
  const writeProgress = (update: ProgressUpdate) => {
    fs.appendFileSync(progressFile, JSON.stringify(update) + '\n');
  };
  
  try {
    logger.info(`Starting ${toolName}`);
    writeProgress({ type: 'progress', message: `Starting ${toolName}`, timestamp: Date.now() });
    
    // Execute the actual tool with progress callbacks
    const result = await executeToolSync(toolName, args, logger, (message: string) => {
      writeProgress({ type: 'progress', message, timestamp: Date.now() });
    });
    
    // Update task file with result
    registry.updateTask(taskId, {
      status: 'completed',
      result,
      endTime: Date.now()
    });
    
    writeProgress({ type: 'complete', result, timestamp: Date.now() });
    logger.info('Task completed');
  } catch (error) {
    registry.updateTask(taskId, {
      status: 'failed',
      error: error.message,
      endTime: Date.now()
    });
    
    writeProgress({ type: 'error', error: error.message, timestamp: Date.now() });
    logger.error(`Task failed: ${error.message}`);
  }
}
}
```

### Chat Service

```typescript
class PoeChatService {
  async sendMessage(userMessage: string, tools?: Tool[]): Promise<ChatMessage> {
    // Inject completed task results
    const completed = this.taskRegistry?.getCompletedTasks() || [];
    for (const task of completed) {
      const emoji = task.status === 'completed' ? '✅' : '❌';
      this.conversationHistory.push({
        role: 'system',
        content: `${emoji} Task ${task.id} finished\n\n${task.result || task.error}`
      });
    }
    this.taskRegistry?.clearCompleted();
    
    // Process message
    this.conversationHistory.push({ role: 'user', content: userMessage });
    // ...
  }
}
```

## Files

### New
- `src/services/agent-task-registry.ts` - Task tracking with auto-cleanup
- `src/services/task-logger.ts` - Rotating task logger
- `src/services/task-runner.ts` - Standalone task executor
- `src/cli/interactive-tasks.ts` - `/tasks` handler

### Modified
- `src/services/tools.ts` - Async execution
- `src/services/chat.ts` - Result injection
- `src/services/agent-session.ts` - Registry wiring with disposal
- `src/cli/interactive-command-runner.ts` - Add `/tasks`
- `src/cli/program.ts` - Register cleanup on exit

## Cleanup Implementation

```typescript
// src/services/task-logger.ts
class RotatingTaskLogger {
  private maxSize = 10 * 1024 * 1024; // 10MB
  private maxBackups = 3;
  
  log(message: string): void {
    this.checkRotation();
    fs.appendFileSync(this.logFile, `${message}\n`);
  }
  
  private checkRotation(): void {
    const stats = fs.statSync(this.logFile);
    if (stats.size >= this.maxSize) {
      this.rotate();
    }
  }
  
  private rotate(): void {
    // Rotate existing backups
    for (let i = this.maxBackups - 1; i >= 1; i--) {
      const old = `${this.logFile}.${i}`;
      const newer = `${this.logFile}.${i + 1}`;
      if (fs.existsSync(old)) {
        if (i === this.maxBackups - 1) {
          fs.unlinkSync(old); // Delete oldest
        } else {
          fs.renameSync(old, newer);
        }
      }
    }
    // Rotate current log
    fs.renameSync(this.logFile, `${this.logFile}.1`);
  }
}

// src/cli/program.ts - Cleanup on exit
process.on('exit', () => {
  if (taskRegistry) {
    taskRegistry.dispose();
  }
});

process.on('SIGINT', () => {
  if (taskRegistry) {
    taskRegistry.dispose();
  }
  process.exit(0);
});
```