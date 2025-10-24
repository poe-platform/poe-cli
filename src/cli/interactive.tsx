import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import path from "node:path";

interface InteractiveCliProps {
  onExit: () => void;
  onCommand: (input: string) => Promise<string>;
  onSetToolCallHandler?: (handler: (toolName: string, args: Record<string, unknown>, result?: string, error?: string) => void) => void;
  cwd: string;
  fs: { readdir: (path: string) => Promise<string[]>; stat: (path: string) => Promise<{ isDirectory: () => boolean }> };
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ToolCallDisplay {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  error?: string;
  completed: boolean;
}

export const InteractiveCli: React.FC<InteractiveCliProps> = ({
  onExit,
  onCommand,
  onSetToolCallHandler,
  cwd,
  fs
}) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: "Welcome to Poe Code\n\nAn interactive CLI for chatting with AI models using the Poe API.\n\nType 'help' for available commands.\nType '/model' to view or switch models.\nOr just start chatting - the model can use tools to help you!"
    }
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCallDisplay[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerFiles, setFilePickerFiles] = useState<string[]>([]);
  const [filePickerIndex, setFilePickerIndex] = useState(0);
  const [inputBeforeAt, setInputBeforeAt] = useState("");
  const [fileSearchQuery, setFileSearchQuery] = useState("");

  // Set up tool call handler
  React.useEffect(() => {
    if (onSetToolCallHandler) {
      onSetToolCallHandler((toolName: string, args: Record<string, unknown>, result?: string, error?: string) => {
        const id = `${toolName}-${Date.now()}`;

        if (!result && !error) {
          // Tool call started
          setToolCalls((prev) => [
            ...prev,
            {
              id,
              toolName,
              args,
              completed: false
            }
          ]);
        } else {
          // Tool call completed
          setToolCalls((prev) =>
            prev.map((tc) =>
              tc.toolName === toolName && !tc.completed
                ? { ...tc, result, error, completed: true }
                : tc
            )
          );
        }
      });
    }
  }, [onSetToolCallHandler]);

  // Load files for picker when @ is typed
  useEffect(() => {
    if (showFilePicker) {
      const loadFiles = async () => {
        try {
          const files = await getFilesRecursive(cwd, "");
          const filtered = fileSearchQuery
            ? files.filter(f => f.toLowerCase().includes(fileSearchQuery.toLowerCase()))
            : files;
          setFilePickerFiles(filtered.slice(0, 50)); // Limit to 50 files
          setFilePickerIndex(0);
        } catch (error) {
          console.error("Failed to load files:", error);
          setFilePickerFiles([]);
        }
      };
      void loadFiles();
    }
  }, [showFilePicker, fileSearchQuery, cwd]);

  const getFilesRecursive = async (dir: string, prefix: string): Promise<string[]> => {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        // Skip hidden files and node_modules
        if (entry.startsWith(".") || entry === "node_modules") continue;
        
        const fullPath = path.join(dir, entry);
        const relativePath = prefix ? path.join(prefix, entry) : entry;
        
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            const subFiles = await getFilesRecursive(fullPath, relativePath);
            files.push(...subFiles);
          } else {
            files.push(relativePath);
          }
        } catch {
          // Skip files we can't stat
        }
      }
    } catch {
      // Skip directories we can't read
    }
    return files;
  };

  useInput((inputChar, key) => {
    if ((key.ctrl && inputChar === "c") || (key.ctrl && inputChar === "d")) {
      exit();
      onExit();
      return;
    }

    // Ctrl+A: Move to start (clear input to simulate)
    if (key.ctrl && inputChar === "a") {
      // Note: ink-text-input doesn't support cursor positioning,
      // so we can't truly move to start. User can use Home key instead.
      return;
    }

    // Ctrl+K: Delete from cursor to end (clear input)
    if (key.ctrl && inputChar === "k") {
      setInput("");
      if (showFilePicker) {
        setShowFilePicker(false);
        setFileSearchQuery("");
      }
      return;
    }

    // Handle file picker navigation
    if (showFilePicker) {
      if (key.upArrow && filePickerIndex > 0) {
        setFilePickerIndex(filePickerIndex - 1);
        return;
      } else if (key.downArrow && filePickerIndex < filePickerFiles.length - 1) {
        setFilePickerIndex(filePickerIndex + 1);
        return;
      } else if (key.return && filePickerFiles.length > 0) {
        // Select file
        const selectedFile = filePickerFiles[filePickerIndex];
        setInput(`${inputBeforeAt}@${selectedFile} `);
        setShowFilePicker(false);
        setFileSearchQuery("");
        return;
      } else if (key.escape) {
        // Cancel file picker
        setShowFilePicker(false);
        setFileSearchQuery("");
        setInput(inputBeforeAt);
        return;
      }
    }
  });

  const handleInputChange = (value: string) => {
    setInput(value);

    // Check if @ was just typed
    if (value.endsWith("@") && !showFilePicker) {
      setShowFilePicker(true);
      setInputBeforeAt(value.slice(0, -1));
      setFileSearchQuery("");
    } else if (showFilePicker) {
      // Update search query if in file picker mode
      const atIndex = value.lastIndexOf("@");
      if (atIndex !== -1) {
        setFileSearchQuery(value.slice(atIndex + 1));
      } else {
        // @ was deleted, exit file picker
        setShowFilePicker(false);
        setFileSearchQuery("");
      }
    }
  };

  const handleSubmit = async (value: string) => {
    if (!value.trim() || isProcessing) return;

    // Don't submit if file picker is open - the useInput handler will handle selection
    if (showFilePicker) {
      return;
    }

    const trimmedInput = value.trim();

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: trimmedInput }]);
    setInput("");

    // Check for exit command
    if (trimmedInput.toLowerCase() === "exit" || trimmedInput.toLowerCase() === "quit") {
      exit();
      onExit();
      return;
    }

    setIsProcessing(true);
    setToolCalls([]);

    try {
      const response = await onCommand(trimmedInput);
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ]);
    } finally {
      setIsProcessing(false);
      // Clear tool calls after a moment so user can see them
      setTimeout(() => setToolCalls([]), 1000);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Message history */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, idx) => (
          <Box key={`msg-${idx}-${msg.role}`} flexDirection="column" marginBottom={1}>
            {msg.role === "system" && (
              <Box flexDirection="column">
                <Text bold color="cyan">
                  {msg.content}
                </Text>
              </Box>
            )}
            {msg.role === "user" && (
              <Box flexDirection="column">
                <Text color="green">You:</Text>
                <Text>{msg.content}</Text>
              </Box>
            )}
            {msg.role === "assistant" && (
              <Box flexDirection="column">
                <Text color="blue">Poe Code:</Text>
                <Text>{msg.content}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {/* Tool calls display */}
      {toolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {toolCalls.map((toolCall) => (
            <Box key={toolCall.id} flexDirection="column" marginY={0}>
              <Box>
                <Text color="cyan">⏺ </Text>
                <Text color="cyan" bold>
                  {formatToolName(toolCall.toolName)}
                </Text>
                <Text color="gray">(</Text>
                <Text color="yellow">{formatToolArgs(toolCall.args)}</Text>
                <Text color="gray">)</Text>
              </Box>
              {toolCall.completed && (
                <Box marginLeft={2}>
                  <Text color="cyan">⎿ </Text>
                  {toolCall.error ? (
                    <Text color="red">Error: {toolCall.error}</Text>
                  ) : (
                    <Text color="green">{formatToolResult(toolCall.result || "")}</Text>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Processing indicator */}
      {isProcessing && toolCalls.length === 0 && (
        <Box marginBottom={1}>
          <Text color="yellow">Processing...</Text>
        </Box>
      )}

      {/* File picker */}
      {showFilePicker && filePickerFiles.length > 0 && (
        <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="cyan" padding={1}>
          <Text bold color="cyan">Select a file (↑/↓ to navigate, Enter to select, Esc to cancel):</Text>
          <Box flexDirection="column" marginTop={1}>
            {filePickerFiles.slice(Math.max(0, filePickerIndex - 5), filePickerIndex + 5).map((file, idx) => {
              const actualIndex = Math.max(0, filePickerIndex - 5) + idx;
              const isSelected = actualIndex === filePickerIndex;
              return (
                <Box key={file}>
                  <Text color={isSelected ? "green" : "white"} bold={isSelected}>
                    {isSelected ? "> " : "  "}{file}
                  </Text>
                </Box>
              );
            })}
          </Box>
          {filePickerFiles.length > 10 && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {Math.min(10, filePickerFiles.length)} of {filePickerFiles.length} files
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Input prompt */}
      {!isProcessing && (
        <Box>
          <Text color="green">&gt; </Text>
          <TextInput
            value={input}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            placeholder="Type a command... (use @ to select files)"
          />
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          Press Ctrl+C or Ctrl+D to exit | Type 'help' for commands
        </Text>
      </Box>
    </Box>
  );
};

// Helper functions for formatting tool calls
function formatToolName(toolName: string): string {
  // Remove mcp_ prefix for display
  if (toolName.startsWith("mcp_")) {
    const parts = toolName.substring(4).split("_");
    const serverName = parts[0];
    const actualToolName = parts.slice(1).join("_");
    return `${actualToolName} [${serverName}]`;
  }

  // Convert snake_case to PascalCase
  return toolName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function formatToolArgs(args: Record<string, unknown>): string {
  // Format arguments for display
  const entries = Object.entries(args);
  if (entries.length === 0) return "";

  if (entries.length === 1) {
    const [key, value] = entries[0];
    if (typeof value === "string") {
      // Truncate long strings
      const str = value.length > 50 ? value.substring(0, 47) + "..." : value;
      return str;
    }
    return String(value);
  }

  // Multiple args - show count
  return `${entries.length} args`;
}

function formatToolResult(result: string): string {
  // Format result for display
  if (!result) return "Done";

  // Try to parse as JSON and get a summary
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      return `${parsed.length} items`;
    }
    if (typeof parsed === "object") {
      const keys = Object.keys(parsed);
      return `${keys.length} properties`;
    }
  } catch {
    // Not JSON, check length
  }

  // Count lines
  const lines = result.split("\n");
  if (lines.length > 1) {
    return `${lines.length} lines`;
  }

  // Single line - truncate if needed
  const chars = result.length;
  if (chars > 50) {
    return `${chars} characters`;
  }

  return result;
}
