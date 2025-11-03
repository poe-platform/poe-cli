import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import path from "node:path";
import { findLastUserIndex } from "@poe/shared-utils";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

interface InteractiveCliProps {
  onExit: () => void;
  onCommand: (
    input: string,
    options?: { signal?: AbortSignal; onChunk?: (chunk: string) => void }
  ) => Promise<string>;
  onSetToolCallHandler?: (handler: (toolName: string, args: Record<string, unknown>, result?: string, error?: string) => void) => void;
  cwd: string;
  fs: { readdir: (path: string) => Promise<string[]>; stat: (path: string) => Promise<{ isDirectory: () => boolean }> };
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
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
      content: "Welcome to Poe Code\n\nAn interactive CLI for chatting with AI models using the Poe API.\n\nType '/help' for available commands.\nType '/model' to view or switch models.\nType '/strategy' to configure model selection strategies.\nOr just start chatting - the model can use tools to help you!"
    }
  ]);
  const [input, setInput] = useState("");
  const [isResponding, setIsResponding] = useState(false);
  const [partialResponse, setPartialResponse] = useState<string | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [toolCalls, setToolCalls] = useState<ToolCallDisplay[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerFiles, setFilePickerFiles] = useState<string[]>([]);
  const [filePickerIndex, setFilePickerIndex] = useState(0);
  const [inputBeforeAt, setInputBeforeAt] = useState("");
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const lastUserIndex = React.useMemo(() => findLastUserIndex(messages), [messages]);

  useEffect(() => {
    if (!isResponding) {
      setSpinnerFrame(0);
      return;
    }
    const timer = setInterval(() => {
      setSpinnerFrame((frame) => (frame + 1) % SPINNER_FRAMES.length);
    }, 120);
    return () => {
      clearInterval(timer);
    };
  }, [isResponding]);

  const trimmedPreview = (partialResponse ?? "").trim();
  const displayPreview = trimmedPreview.length > 0
    ? `${trimmedPreview.slice(0, 80)}${trimmedPreview.length > 80 ? "..." : ""}`
    : "Waiting for assistant...";

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
    if (isResponding && key.ctrl && inputChar === "x") {
      abortControllerRef.current?.abort();
      return;
    }

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
    if (!value.trim() || isResponding) return;

    // Don't submit if file picker is open - the useInput handler will handle selection
    if (showFilePicker) {
      return;
    }

    const trimmedInput = value.trim();

    // Clear previous tool calls when starting a new message
    setToolCalls([]);

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: trimmedInput }]);
    setInput("");

    // Check for exit command
    if (trimmedInput.toLowerCase() === "exit" || trimmedInput.toLowerCase() === "quit") {
      exit();
      onExit();
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsResponding(true);
    setPartialResponse(null);

    try {
      const response = await onCommand(trimmedInput, {
        signal: controller.signal,
        onChunk: (chunk) => setPartialResponse(chunk)
      });

      // Parse model name from response if present
      let content = response;
      let model: string | undefined;

      const modelMatch = response.match(/^\[Model: ([^\]]+)\]\n\n/);
      if (modelMatch) {
        model = modelMatch[1];
        content = response.substring(modelMatch[0].length);
      }

      setMessages((prev) => [...prev, { role: "assistant", content, model }]);
      setPartialResponse(null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Response stopped."
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ]);
      }
    } finally {
      abortControllerRef.current = null;
      setIsResponding(false);
      setPartialResponse(null);
      // Don't clear tool calls - keep them visible so user can see what happened
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Message history */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, idx) => {
          const isLatestUser = msg.role === "user" && idx === lastUserIndex;
          return (
            <React.Fragment key={`msg-${idx}-${msg.role}`}>
              <Box flexDirection="column" marginBottom={1}>
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
                    <Text color="blue">{msg.model || "Assistant"}:</Text>
                    <Text>{msg.content}</Text>
                  </Box>
                )}
              </Box>
              {isLatestUser && toolCalls.length > 0 && (
                <Box flexDirection="column" marginBottom={1}>
                  {toolCalls.map((toolCall) => (
                    <Box key={toolCall.id} flexDirection="column" marginY={0}>
                      <Box>
                        <Text color="cyan">⏺ Tool Call: </Text>
                        <Text color="cyan" bold>
                          {toolCall.toolName}
                        </Text>
                      </Box>
                      <Box marginLeft={2} flexDirection="column">
                        <Text color="gray">Arguments:</Text>
                        <Text color="yellow">{JSON.stringify(toolCall.args, null, 2)}</Text>
                      </Box>
                      {toolCall.completed && (
                        <Box marginLeft={2} flexDirection="column" marginTop={1}>
                          <Text color="gray">{toolCall.error ? "Error:" : "Result:"}</Text>
                          {toolCall.error ? (
                            <Text color="red">{toolCall.error}</Text>
                          ) : (
                            <Text color="green">{toolCall.result || "Done"}</Text>
                          )}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </React.Fragment>
          );
        })}
      </Box>

      {/* Processing indicator */}
      {isResponding && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="yellow">{SPINNER_FRAMES[spinnerFrame]} </Text>
            <Text color="yellow">{displayPreview}</Text>
          </Box>
          <Text color="cyan">Press Ctrl+X to stop</Text>
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
      {!isResponding && (
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
