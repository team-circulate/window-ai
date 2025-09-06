import Anthropic from "@anthropic-ai/sdk";
import { WindowState, WindowAction, AIRequest, AIResponse } from "./types";

export class ClaudeService {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
  }

  async analyzeWindowState(
    currentState: WindowState,
    userIntent: string
  ): Promise<AIResponse> {
    const systemPrompt = `You are a window management AI assistant. Your role is to analyze the current window layout and suggest optimal arrangements based on user intent.

You will receive:
1. Current window state with window IDs, app names, titles, and positions
2. Display information
3. User's desired outcome

CRITICAL RULES FOR WINDOW IDs:
- Each window has a unique ID in the format "appName-windowTitle"
- You MUST use the exact window ID provided in the window list
- For targetWindow: use a single window ID string
- For targetWindows: use an array of window ID strings
- NEVER use just the window title - always use the full ID

You should respond with structured JSON containing window actions to execute.

Available action types:
- move: Move a window to specific coordinates (requires targetWindow)
- resize: Change window dimensions (requires targetWindow)
- minimize: Minimize a window (requires targetWindow)
- maximize: Maximize a window to full screen (requires targetWindow)
- focus: Bring a window to front (requires targetWindow)
- arrange: Apply a layout pattern to multiple windows (requires targetWindows array)
  - Patterns: tile-left, tile-right, tile-grid, cascade, center
- close: Close a window (requires targetWindow)

Consider:
- User's workflow and app relationships
- Screen real estate optimization
- Maintaining visibility of important windows
- Ergonomic positioning (frequently used apps more accessible)`;

    // アイコンデータを除外してコンパクトな状態を作成
    const compactState = {
      windows: currentState.windows.map(w => ({
        id: w.id,
        appName: w.appName,
        title: w.title ? w.title.substring(0, 50) : 'Untitled', // タイトルを短縮
        bounds: w.bounds,
        isMinimized: w.isMinimized,
        isFocused: w.isFocused,
        isVisible: w.isVisible
        // appIconは除外
      })),
      displays: currentState.displays,
      activeApp: currentState.activeApp
    };

    const userMessage = `Current Window State:
Windows: ${compactState.windows.length} windows
Active App: ${compactState.activeApp}
Displays: ${compactState.displays.length} display(s)

Window List (with IDs):
${compactState.windows.map(w => 
  `- ID: "${w.id}" | App: ${w.appName} | Title: ${w.title} | Size: ${w.bounds.width}x${w.bounds.height} at ${w.bounds.x},${w.bounds.y}`
).join('\n')}

User Intent: ${userIntent}

IMPORTANT: When creating window actions, you MUST use the exact window ID from the list above (the value after "ID:").
The window ID format is "appName-windowTitle" and must be used exactly as shown.

Please analyze and provide window management actions.`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
        tools: [
          {
            name: "window_actions",
            description: "Provide window management actions",
            input_schema: {
              type: "object",
              properties: {
                actions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: [
                          "move",
                          "resize",
                          "minimize",
                          "maximize",
                          "focus",
                          "arrange",
                          "close",
                        ],
                      },
                      targetWindow: {
                        type: "string",
                        description: "Window ID for single window actions",
                      },
                      targetWindows: {
                        type: "array",
                        items: { type: "string" },
                        description: "Window IDs for multi-window actions",
                      },
                      parameters: {
                        type: "object",
                        properties: {
                          position: {
                            type: "object",
                            properties: {
                              x: { type: "number" },
                              y: { type: "number" },
                            },
                          },
                          size: {
                            type: "object",
                            properties: {
                              width: { type: "number" },
                              height: { type: "number" },
                            },
                          },
                          arrangement: {
                            type: "string",
                            enum: [
                              "tile-left",
                              "tile-right",
                              "tile-grid",
                              "cascade",
                              "center",
                            ],
                          },
                          display: { type: "string" },
                        },
                      },
                      reasoning: { type: "string" },
                    },
                    required: ["type", "reasoning"],
                  },
                },
                explanation: {
                  type: "string",
                  description:
                    "Overall explanation of the window management strategy",
                },
                confidence: {
                  type: "number",
                  minimum: 0,
                  maximum: 1,
                  description: "Confidence level in the suggested actions",
                },
              },
              required: ["actions", "explanation", "confidence"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "window_actions" },
      });

      // Extract the tool use response
      const toolUse = response.content.find(
        (content: any): content is Anthropic.Messages.ToolUseBlock =>
          content.type === "tool_use" && content.name === "window_actions"
      );

      if (toolUse && typeof toolUse.input === "object") {
        const input = toolUse.input as any;
        return {
          actions: input.actions || [],
          explanation: input.explanation || "No explanation provided",
          confidence: input.confidence || 0.5,
        };
      }

      // Fallback response
      return {
        actions: [],
        explanation: "Unable to generate window actions",
        confidence: 0,
      };
    } catch (error) {
      console.error("Claude API error:", error);
      throw error;
    }
  }

  /**
   * 通知の分析を実行
   */
  async analyzeNotification(notificationData: {
    title: string;
    body: string;
    appName?: string;
    timestamp: number;
  }): Promise<{
    category: string;
    importance: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    reasoning: string;
  }> {
    const systemPrompt = `あなたは通知分析AIです。与えられた通知を分析して、カテゴリと重要度を判定してください。

カテゴリの選択肢：
- system: システム関連（アップデート、エラー、設定変更など）
- communication: コミュニケーション（メール、メッセージ、通話など）
- productivity: 生産性（タスク、リマインダー、カレンダーなど）
- entertainment: エンターテイメント（ゲーム、音楽、動画など）
- security: セキュリティ（ログイン、認証、警告など）
- news: ニュース・情報（天気、ニュース、アラートなど）
- other: その他

重要度の基準：
- critical: 即座に対応が必要（セキュリティ警告、システムエラーなど）
- high: 重要だが緊急ではない（重要なメッセージ、タスク期限など）
- medium: 一般的な重要度（通常の通知）
- low: 低い重要度（マーケティング、広告など）

必ず以下のJSON形式で回答してください：
{"category":"カテゴリ","importance":"重要度","confidence":0.8,"reasoning":"判定理由"}`;

    const userMessage = `通知タイトル: ${notificationData.title}
通知内容: ${notificationData.body}
アプリ名: ${notificationData.appName || '不明'}
タイムスタンプ: ${new Date(notificationData.timestamp).toLocaleString()}

この通知を分析してください。`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const text = content.text;
        
        // JSON形式の応答を抽出
        const jsonMatch = text.match(/\{[^{}]*"category"[^{}]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            category: parsed.category || 'other',
            importance: parsed.importance || 'medium',
            confidence: parsed.confidence || 0.5,
            reasoning: parsed.reasoning || '分析完了'
          };
        }
      }

      // フォールバック
      return {
        category: 'other',
        importance: 'medium',
        confidence: 0.0,
        reasoning: 'JSON形式の応答を取得できませんでした'
      };
    } catch (error) {
      console.error('Claude API error in notification analysis:', error);
      throw error;
    }
  }

  async suggestLayout(currentState: WindowState): Promise<AIResponse> {
    const suggestions = this.analyzeLayout(currentState);

    return {
      actions: suggestions,
      explanation: "Optimized layout based on current window configuration",
      confidence: 0.8,
    };
  }

  private analyzeLayout(state: WindowState): WindowAction[] {
    const actions: WindowAction[] = [];
    const primaryDisplay =
      state.displays.find((d) => d.isPrimary) || state.displays[0];

    if (!primaryDisplay) return actions;

    // Simple heuristic-based layout suggestions
    const visibleWindows = state.windows.filter(
      (w) => w.isVisible && !w.isMinimized
    );

    if (visibleWindows.length === 2) {
      // Side-by-side for two windows
      actions.push({
        type: "arrange",
        targetWindows: visibleWindows.map((w) => w.id),
        parameters: {
          arrangement: "tile-left",
        },
        reasoning: "Two windows work well in split-screen configuration",
      });
    } else if (visibleWindows.length <= 4) {
      // Grid for 3-4 windows
      actions.push({
        type: "arrange",
        targetWindows: visibleWindows.map((w) => w.id),
        parameters: {
          arrangement: "tile-grid",
        },
        reasoning: "Grid layout provides equal visibility for multiple windows",
      });
    } else {
      // Cascade for many windows
      actions.push({
        type: "arrange",
        targetWindows: visibleWindows.map((w) => w.id),
        parameters: {
          arrangement: "cascade",
        },
        reasoning: "Cascade arrangement helps manage many windows",
      });
    }

    return actions;
  }
}
