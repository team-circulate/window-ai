import Anthropic from "@anthropic-ai/sdk";
import { WindowState, WindowAction, AIRequest, AIResponse } from "./types";

export class ClaudeService {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
  }

  async generateApplicationDescriptions(appNames: string[]): Promise<Array<{name: string, observations: string[]}>> {
    try {
      const prompt = `以下のmacOSアプリケーションについて、それぞれの特徴や用途を2-3個の観察事項として日本語で説明してください。
      
      アプリケーションリスト:
      ${appNames.join(', ')}
      
      以下のJSON形式で返してください:
      [
        {
          "name": "アプリ名",
          "observations": [
            "観察事項1",
            "観察事項2",
            "観察事項3"
          ]
        }
      ]
      
      例:
      [
        {
          "name": "Safari",
          "observations": [
            "Appleが開発したWebブラウザ",
            "macOSに標準搭載されている",
            "プライバシー保護機能が充実している"
          ]
        }
      ]`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          // Extract JSON from response
          const jsonMatch = content.text.match(/\[\s*\{[\s\S]*\}\s*\]/); 
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed;
          }
        } catch (parseError) {
          console.error('Error parsing JSON response:', parseError);
        }
      }

      // Fallback: return apps with default observations
      return appNames.map(name => ({
        name,
        observations: [this.getDefaultObservation(name)]
      }));

    } catch (error) {
      console.error('Error generating app descriptions:', error);
      return appNames.map(name => ({
        name,
        observations: [this.getDefaultObservation(name)]
      }));
    }
  }

  private getDefaultObservation(appName: string): string {
    const defaults: Record<string, string> = {
      'Safari': 'Appleが開発したWebブラウザ',
      'Chrome': 'Googleが開発したWebブラウザ',
      'VSCode': 'Microsoftが開発したコードエディタ',
      'Finder': 'macOSのファイル管理アプリケーション',
      'Terminal': 'コマンドライン操作用のターミナルアプリ',
      'Slack': 'チームコミュニケーション用のメッセージングアプリ'
    };
    return defaults[appName] || `${appName}アプリケーション`;
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

  async analyzeUserProfile(appNames: string[], appDescriptions: Array<{name: string, observations: string[]}>): Promise<{
    userType: string;
    characteristics: string[];
    workStyle: string;
    recommendations: string[];
    confidence: number;
  }> {
    const systemPrompt = `
あなたはユーザーの行動分析エキスパートです。
インストールされているアプリケーションとその特徴から、ユーザーの特性や仕事のスタイルを洞察してください。

以下の観点で分析してください：
1. ユーザータイプ（職業・役割）
2. 特徴・性格（創造的、分析的、コラボレーション重視など）
3. 仕事のスタイル（マルチタスク型、集中型など）
4. 改善提案（効率化のヒント）

「言い当てて驚かせる」のではなく「理解して役立つ」ことを重視してください。
`;

    const userMessage = `
アプリケーション一覧: ${appNames.join(', ')}

アプリケーション詳細:
${JSON.stringify(appDescriptions, null, 2)}
`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1500,
        temperature: 0.4,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [{
          name: "analyze_user_profile",
          description: "Analyze user profile from installed applications",
          input_schema: {
            type: "object",
            properties: {
              userType: {
                type: "string",
                description: "Primary user type or role (e.g., '開発者', 'デザイナー', 'ビジネスパーソン')"
              },
              characteristics: {
                type: "array",
                items: { type: "string" },
                description: "Key characteristics and traits"
              },
              workStyle: {
                type: "string", 
                description: "Working style description"
              },
              recommendations: {
                type: "array",
                items: { type: "string" },
                description: "Actionable recommendations for improvement"
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "Confidence in the analysis"
              }
            },
            required: ["userType", "characteristics", "workStyle", "recommendations", "confidence"]
          }
        }],
        tool_choice: { type: "tool", name: "analyze_user_profile" }
      });

      const toolUse = response.content.find(
        (content): content is any =>
          content.type === "tool_use" && content.name === "analyze_user_profile"
      );

      if (!toolUse) {
        return {
          userType: "一般ユーザー",
          characteristics: ["様々なアプリを活用"],
          workStyle: "バランス型の作業スタイル",
          recommendations: ["より効率的な作業環境の構築を検討してみてください"],
          confidence: 0.3
        };
      }

      return toolUse.input;
    } catch (error) {
      console.error("Error analyzing user profile:", error);
      throw error;
    }
  }

  async generateOptimalLayouts(userProfile: any, appNames: string[]): Promise<{
    layouts: Array<{
      name: string;
      description: string;
      reasoning: string;
      preset: {
        name: string;
        description: string;
        windows: Array<{
          appName: string;
          position: { x: number; y: number };
          size: { width: number; height: number };
        }>;
      };
    }>;
    confidence: number;
  }> {
    const systemPrompt = `
あなたはウィンドウレイアウト最適化のエキスパートです。

ユーザーのプロフィールとアプリケーション一覧から、最適なウィンドウ配置パターンを3つ提案してください。

macOSの標準的なディスプレイサイズ（1440x900）を基準に、実用的な配置を提案してください。

各レイアウトには以下を含めてください：
- 名前（親しみやすい名前）
- 説明（どんな作業に適しているか）
- 理由（なぜこのユーザーに適しているか）
- 具体的な座標とサイズ

ウィンドウのサイズと位置の制約：
- x, y: 0以上
- width: 最小400、最大1440
- height: 最小300、最大900
- ウィンドウ同士の重複は最小限に
`;

    const userMessage = `
ユーザープロフィール:
${JSON.stringify(userProfile, null, 2)}

利用可能なアプリケーション: ${appNames.join(', ')}

メインアプリ（頻繁に使用されそうなもの）を中心に、3つのレイアウトパターンを提案してください。
`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [{
          name: "generate_layouts",
          description: "Generate optimal window layouts",
          input_schema: {
            type: "object",
            properties: {
              layouts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    reasoning: { type: "string" },
                    preset: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        windows: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              appName: { type: "string" },
                              position: {
                                type: "object",
                                properties: {
                                  x: { type: "number" },
                                  y: { type: "number" }
                                }
                              },
                              size: {
                                type: "object",
                                properties: {
                                  width: { type: "number" },
                                  height: { type: "number" }
                                }
                              }
                            },
                            required: ["appName", "position", "size"]
                          }
                        }
                      },
                      required: ["name", "description", "windows"]
                    }
                  },
                  required: ["name", "description", "reasoning", "preset"]
                }
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1
              }
            },
            required: ["layouts", "confidence"]
          }
        }],
        tool_choice: { type: "tool", name: "generate_layouts" }
      });

      const toolUse = response.content.find(
        (content): content is any =>
          content.type === "tool_use" && content.name === "generate_layouts"
      );

      if (!toolUse) {
        return {
          layouts: [],
          confidence: 0
        };
      }

      return toolUse.input;
    } catch (error) {
      console.error("Error generating layouts:", error);
      throw error;
    }
  }

  async suggestAppsForTask(userPrompt: string, applicationGraph: any[]): Promise<{
    highConfidence: string[];
    lowConfidence: string[];
    reasoning: string;
  }> {
    const systemPrompt = `
あなたはユーザーのタスクから必要なアプリケーションを推薦するエキスパートです。

ユーザーのプロンプトと、利用可能なアプリケーションのリストを分析して、
タスクに最適なアプリケーションを提案してください。

アプリケーションは以下の2つのカテゴリーに分類してください：
- highConfidence: タスクに確実に必要と思われるアプリ（デフォルトでチェック済み）
- lowConfidence: あった方が良いかもしれないアプリ（デフォルトでチェックなし）

判断基準：
1. タスクとの直接的な関連性
2. アプリケーションの主要な用途
3. 一般的なワークフローでの組み合わせ
4. アプリケーションの説明（observations）との合致度

返答は構造化されたJSONのみで、説明は不要です。
`;

    const userMessage = `
タスク: ${userPrompt}

利用可能なアプリケーション:
${JSON.stringify(applicationGraph, null, 2)}
`;

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
            name: "suggest_apps",
            description: "Suggest applications for the user's task",
            input_schema: {
              type: "object",
              properties: {
                highConfidence: {
                  type: "array",
                  items: { type: "string" },
                  description: "Apps that are definitely needed for the task",
                },
                lowConfidence: {
                  type: "array",
                  items: { type: "string" },
                  description: "Apps that might be helpful for the task",
                },
                reasoning: {
                  type: "string",
                  description: "Brief explanation of the suggestions",
                },
              },
              required: ["highConfidence", "lowConfidence", "reasoning"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "suggest_apps" },
      });

      const toolUse = response.content.find(
        (content): content is any =>
          content.type === "tool_use" && content.name === "suggest_apps"
      );

      if (!toolUse) {
        console.warn("No tool use in response, using fallback");
        return {
          highConfidence: [],
          lowConfidence: [],
          reasoning: "Could not determine relevant applications",
        };
      }

      return toolUse.input as {
        highConfidence: string[];
        lowConfidence: string[];
        reasoning: string;
      };
    } catch (error) {
      console.error("Error suggesting apps:", error);
      throw error;
    }
  }
}
