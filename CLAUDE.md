# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Window AI Manager - An Electron-based macOS application for AI-powered window management and system monitoring using Claude API.

## Development Commands

```bash
# Install dependencies
npm install

# Development mode (TypeScript watch + Electron)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Production build and run
npm start
```

## Architecture

### Core Components

**Main Process (`src/main.ts`)**
- Electron main process entry point
- Manages IPC communication between main and renderer
- Handles system permissions (Accessibility, Screen Recording)
- Initializes WindowManager and ClaudeService

**Window Manager (`src/windowManager.ts`)**
- Interfaces with macOS system via JXA (JavaScript for Automation)
- Handles window operations: move, resize, minimize, maximize, focus
- Monitors system resources (CPU, memory)
- Tracks process information and correlates with windows

**Claude Service (`src/claudeService.ts`)**
- Integrates with Anthropic's Claude API
- Processes natural language window management requests
- Generates AI explanations for system processes

**Frontend (`public/index.html`, `public/renderer.js`)**
- UI for displaying window states and system metrics
- Handles user input for AI commands
- Real-time updates via IPC communication

### Type System (`src/types.ts`)

Key interfaces:
- `WindowInfo`: Window properties including bounds, state, and resource usage
- `WindowAction`: Defines available window operations
- `CpuInfo`, `ProcessInfo`: System monitoring data structures
- `AIRequest`, `AIResponse`: Claude API communication format

## Environment Setup

Required `.env` file:
```
CLAUDE_API_KEY=your_api_key_here
```

## macOS Permissions

The app requires:
- **Accessibility**: For window manipulation
- **Screen Recording**: For window information retrieval

These are requested on first launch via `systemPreferences.isTrustedAccessibilityClient()`

## Build Output

TypeScript compiles to `dist/` directory:
- `src/*.ts` → `dist/*.js`
- Electron loads `dist/main.js` as entry point

## Key Dependencies

- `electron`: Desktop application framework
- `@anthropic-ai/sdk`: Claude API integration
- `@jxa/run`: macOS automation via JavaScript
- `dotenv`: Environment variable management

## Important Notes

- No test framework currently configured
- No linting tools set up
- Frontend uses vanilla JavaScript (not TypeScript)
- System monitoring uses native Node.js `os` and `child_process` modules
- Window operations use JXA scripts executed via osascript